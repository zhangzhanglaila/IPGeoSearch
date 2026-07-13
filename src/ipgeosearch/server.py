"""Small dependency-free HTTP API."""

from __future__ import annotations

import argparse
import hmac
import ipaddress
import json
import mimetypes
import os
import random
import re
import socket
import struct
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .service import IPGeoSearch


STATIC_ROOT = Path(__file__).resolve().parent / "static"
HOSTNAME_PATTERN = re.compile(r"^(?=.{1,253}$)(?!-)[A-Za-z0-9.-]+(?<!-)$")
DNS_RECORD_TYPES = {
    "A": 1,
    "AAAA": 28,
    "CNAME": 5,
    "MX": 15,
    "NS": 2,
}
DNS_TYPE_NAMES = {value: key for key, value in DNS_RECORD_TYPES.items()}
DNS_TIMEOUT_SECONDS = 3.0
RDAP_TIMEOUT_SECONDS = 6.0
PROBE_TIMEOUT_SECONDS = 3.0
DNSBL_ZONES = (
    "zen.spamhaus.org",
    "bl.spamcop.net",
    "dnsbl.sorbs.net",
)
PUBLIC_PATHS = {"", "/", "/health", "/auth-config"}


def _encode_dns_name(host: str) -> bytes:
    return b"".join(bytes([len(part.encode("idna"))]) + part.encode("idna") for part in host.split(".")) + b"\x00"


def _read_dns_name(message: bytes, offset: int) -> tuple[str, int]:
    labels: list[str] = []
    jumped = False
    next_offset = offset
    seen_offsets: set[int] = set()

    while True:
        if offset >= len(message):
            raise ValueError("invalid dns name offset")
        length = message[offset]
        if length & 0xC0 == 0xC0:
            if offset + 1 >= len(message):
                raise ValueError("invalid dns name pointer")
            pointer = ((length & 0x3F) << 8) | message[offset + 1]
            if pointer in seen_offsets:
                raise ValueError("recursive dns name pointer")
            seen_offsets.add(pointer)
            if not jumped:
                next_offset = offset + 2
            offset = pointer
            jumped = True
            continue
        if length == 0:
            offset += 1
            if not jumped:
                next_offset = offset
            break

        offset += 1
        label = message[offset : offset + length]
        if len(label) != length:
            raise ValueError("truncated dns name")
        try:
            labels.append(label.decode("idna"))
        except UnicodeError:
            labels.append(label.decode("ascii", errors="replace"))
        offset += length

    return ".".join(labels), next_offset


def _decode_dns_record(message: bytes, record_type: int, rdata_offset: int, rdlength: int) -> str:
    data = message[rdata_offset : rdata_offset + rdlength]
    if record_type == DNS_RECORD_TYPES["A"] and rdlength == 4:
        return str(ipaddress.IPv4Address(data))
    if record_type == DNS_RECORD_TYPES["AAAA"] and rdlength == 16:
        return str(ipaddress.IPv6Address(data))
    if record_type in (DNS_RECORD_TYPES["CNAME"], DNS_RECORD_TYPES["NS"]):
        value, _ = _read_dns_name(message, rdata_offset)
        return value
    if record_type == DNS_RECORD_TYPES["MX"] and rdlength >= 3:
        preference = struct.unpack("!H", data[:2])[0]
        exchange, _ = _read_dns_name(message, rdata_offset + 2)
        return f"{preference} {exchange}"
    return ""


def _query_dns_server(host: str, record_type: int, dns_server: str) -> list[dict[str, object]]:
    transaction_id = random.randrange(0, 65536)
    header = struct.pack("!HHHHHH", transaction_id, 0x0100, 1, 0, 0, 0)
    question = _encode_dns_name(host) + struct.pack("!HH", record_type, 1)
    packet = header + question

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
        client.settimeout(DNS_TIMEOUT_SECONDS)
        client.sendto(packet, (dns_server, 53))
        response, _ = client.recvfrom(4096)

    if len(response) < 12:
        raise ValueError("dns response too short")

    response_id, flags, question_count, answer_count, _, _ = struct.unpack("!HHHHHH", response[:12])
    if response_id != transaction_id:
        raise ValueError("dns transaction mismatch")
    if flags & 0x000F:
        raise ValueError(f"dns server returned code {flags & 0x000F}")

    offset = 12
    for _ in range(question_count):
        _, offset = _read_dns_name(response, offset)
        offset += 4

    records: list[dict[str, object]] = []
    for _ in range(answer_count):
        _, offset = _read_dns_name(response, offset)
        if offset + 10 > len(response):
            raise ValueError("truncated dns answer")
        answer_type, answer_class, ttl, rdlength = struct.unpack("!HHIH", response[offset : offset + 10])
        offset += 10
        rdata_offset = offset
        offset += rdlength
        record_name = DNS_TYPE_NAMES.get(answer_type)
        if answer_class != 1 or not record_name:
            continue
        value = _decode_dns_record(response, answer_type, rdata_offset, rdlength)
        if value:
            records.append({"type": record_name, "value": value, "ttl": ttl, "source": "dns"})
    return records


def _append_dns_record(records: dict[str, list[dict[str, object]]], record: dict[str, object]) -> None:
    record_type = str(record.get("type", ""))
    value = str(record.get("value", ""))
    if record_type not in records or not value:
        return
    if any(row.get("value") == value for row in records[record_type]):
        return
    records[record_type].append(record)


def _resolve_dns_records(host: str) -> dict[str, object]:
    dns_server = os.getenv("DNS_SERVER", "223.5.5.5")
    records: dict[str, list[dict[str, object]]] = {name: [] for name in DNS_RECORD_TYPES}
    errors: dict[str, str] = {}

    for record_name, record_type in DNS_RECORD_TYPES.items():
        try:
            for record in _query_dns_server(host, record_type, dns_server):
                _append_dns_record(records, record)
        except Exception as exc:
            errors[record_name] = str(exc)

    try:
        rows = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        for row in rows:
            address = row[4][0]
            record_type = "AAAA" if ":" in address else "A"
            _append_dns_record(records, {"type": record_type, "value": address, "ttl": None, "source": "system"})
    except socket.gaierror as exc:
        if not records["A"] and not records["AAAA"]:
            errors["system"] = exc.strerror or str(exc)

    return {
        "host": host,
        "server": dns_server,
        "records": records,
        "errors": errors,
        "addresses": sorted({row["value"] for record_type in ("A", "AAAA") for row in records[record_type]}),
    }


def _parse_ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    return ipaddress.ip_address(value.strip())


def _fetch_json(url: str, timeout: float = RDAP_TIMEOUT_SECONDS) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ip-geo-search/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def _vcard_value(entity: dict[str, object], field_name: str) -> str:
    vcard = entity.get("vcardArray")
    if not isinstance(vcard, list) or len(vcard) < 2 or not isinstance(vcard[1], list):
        return ""
    for item in vcard[1]:
        if isinstance(item, list) and len(item) >= 4 and item[0] == field_name:
            return str(item[3])
    return ""


def _summarize_rdap(payload: dict[str, object]) -> dict[str, object]:
    events: dict[str, str] = {}
    for event in payload.get("events", []):
        if not isinstance(event, dict):
            continue
        action = str(event.get("eventAction", "")).strip()
        date = str(event.get("eventDate", "")).strip()
        if action and date:
            events[action] = date

    entities: list[dict[str, object]] = []
    for entity in payload.get("entities", []):
        if not isinstance(entity, dict):
            continue
        name = _vcard_value(entity, "fn")
        email = _vcard_value(entity, "email")
        roles = entity.get("roles") if isinstance(entity.get("roles"), list) else []
        if name or email or roles:
            entities.append({"name": name, "email": email, "roles": roles})
        if len(entities) >= 6:
            break

    return {
        "handle": payload.get("handle", ""),
        "name": payload.get("name", ""),
        "type": payload.get("type", ""),
        "country": payload.get("country", ""),
        "startAddress": payload.get("startAddress", ""),
        "endAddress": payload.get("endAddress", ""),
        "events": events,
        "entities": entities,
        "rawStatus": payload.get("status", []),
    }


def _reverse_dns(ip: str) -> dict[str, object]:
    try:
        hostname, aliases, addresses = socket.gethostbyaddr(ip)
        return {
            "ip": ip,
            "hostname": hostname,
            "aliases": aliases,
            "addresses": addresses,
        }
    except (socket.herror, socket.gaierror, TimeoutError) as exc:
        return {"ip": ip, "hostname": "", "aliases": [], "addresses": [], "error": str(exc)}


def _dnsbl_lookup(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> dict[str, object]:
    if ip.version != 4:
        return {"checked": False, "reason": "DNSBL only supports IPv4 in this app", "matches": [], "errors": {}}
    if not ip.is_global:
        return {"checked": False, "reason": "non-global address", "matches": [], "errors": {}}

    dns_server = os.getenv("DNS_SERVER", "223.5.5.5")
    reversed_ip = ".".join(reversed(str(ip).split(".")))
    matches: list[dict[str, object]] = []
    errors: dict[str, str] = {}
    for zone in DNSBL_ZONES:
        query = f"{reversed_ip}.{zone}"
        try:
            records = _query_dns_server(query, DNS_RECORD_TYPES["A"], dns_server)
            if records:
                matches.append({"zone": zone, "records": records})
        except Exception as exc:
            errors[zone] = str(exc)
    return {"checked": True, "server": dns_server, "matches": matches, "errors": errors}


def _network_text(lookup_payload: dict[str, object]) -> str:
    parts: list[str] = []
    for result in lookup_payload.get("results", []):
        if not isinstance(result, dict):
            continue
        parts.append(json.dumps(result.get("data", {}), ensure_ascii=False))
    return " ".join(parts).lower()


def _privacy_intel(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
    lookup_payload: dict[str, object],
    reverse_payload: dict[str, object],
    dnsbl_payload: dict[str, object],
) -> dict[str, object]:
    text = " ".join([_network_text(lookup_payload), str(reverse_payload.get("hostname", ""))]).lower()
    flags = {
        "private": ip.is_private,
        "loopback": ip.is_loopback,
        "reserved": ip.is_reserved,
        "multicast": ip.is_multicast,
        "global": ip.is_global,
        "hosting": bool(re.search(r"cloud|hosting|host|server|data\s*center|datacenter|colo|aws|amazon|google|azure|microsoft|oracle|digitalocean|linode|ovh|aliyun|alibaba|tencent|huawei", text)),
        "cdn": bool(re.search(r"cloudflare|akamai|fastly|cdn|edgecast|cachefly", text)),
        "mobile": bool(re.search(r"mobile|cellular|wireless|cmcc|chinamobile|移动", text)),
        "proxy": bool(re.search(r"proxy|vpn|tor|anonymous|privacy|crawler|scraper", text)),
        "dnsblListed": bool(dnsbl_payload.get("matches")),
    }

    score = 0
    tags: list[str] = []
    if flags["private"] or flags["loopback"] or flags["reserved"]:
        tags.append("非公网地址")
    if flags["cdn"]:
        score += 18
        tags.append("CDN/边缘网络")
    if flags["hosting"]:
        score += 24
        tags.append("云服务/机房")
    if flags["proxy"]:
        score += 34
        tags.append("疑似代理/VPN/Tor")
    if flags["mobile"]:
        score += 4
        tags.append("移动网络")
    if flags["dnsblListed"]:
        score += 42
        tags.append("命中 DNSBL")
    if ip.is_global and not tags:
        tags.append("公网常规网络")

    return {
        "flags": flags,
        "score": min(98, score),
        "tags": tags,
        "summary": "高关注" if score >= 60 else "建议复核" if score >= 30 else "低风险",
    }


def _probe_target(target: str) -> dict[str, object]:
    parsed = urlparse(target if "://" in target else f"//{target}")
    host = (parsed.hostname or target).strip().strip(".")
    if not host:
        raise ValueError("missing target")
    try:
        _parse_ip(host)
    except ValueError:
        if not HOSTNAME_PATTERN.match(host) or ".." in host:
            raise ValueError("invalid target")

    ports = [443, 80]
    results: list[dict[str, object]] = []
    for port in ports:
        started = time.perf_counter()
        try:
            with socket.create_connection((host, port), timeout=PROBE_TIMEOUT_SECONDS):
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                results.append({"port": port, "open": True, "latencyMs": latency_ms})
        except OSError as exc:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            results.append({"port": port, "open": False, "latencyMs": latency_ms, "error": str(exc)})
    return {"target": target, "host": host, "results": results}


class LookupHandler(BaseHTTPRequestHandler):
    service = IPGeoSearch()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("", "/"):
            self._send_file(STATIC_ROOT / "index.html")
            return

        if parsed.path.startswith("/static/"):
            relative_path = parsed.path.removeprefix("/static/")
            self._send_file(STATIC_ROOT.joinpath(*relative_path.split("/")))
            return

        query = parse_qs(parsed.query)

        if parsed.path == "/auth-config":
            self._send_json({"apiKeyRequired": bool(os.getenv("IPGEOSEARCH_API_KEY", ""))})
            return

        if self._requires_auth(parsed.path) and not self._is_authorized(query):
            self._send_json({"error": "unauthorized"}, status=401)
            return

        if parsed.path == "/health":
            self._send_json({"ok": True})
            return

        if parsed.path == "/datasets":
            self._send_json({"datasets": self.service.available_csv_datasets()})
            return

        if parsed.path == "/resolve":
            self._send_resolve(query)
            return

        if parsed.path == "/dns":
            self._send_dns(query)
            return

        if parsed.path == "/rdap":
            self._send_rdap(query)
            return

        if parsed.path == "/reverse-dns":
            self._send_reverse_dns(query)
            return

        if parsed.path == "/intel":
            self._send_intel(query)
            return

        if parsed.path == "/probe":
            self._send_probe(query)
            return

        if parsed.path != "/lookup":
            self._send_json({"error": "not found"}, status=404)
            return

        ip = query.get("ip", [""])[0]
        if not ip:
            self._send_json({"error": "missing ip query parameter"}, status=400)
            return

        sources = query.get("source") or None
        csv_datasets = query.get("csv_db")
        old_datasets = None
        if csv_datasets:
            old_datasets = self.service.csv_datasets
            self.service.csv_datasets = csv_datasets

        try:
            self._send_json(self.service.lookup(ip, sources=sources))
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=400)
        finally:
            if old_datasets is not None:
                self.service.csv_datasets = old_datasets

    def log_message(self, format: str, *args: object) -> None:
        return

    def _requires_auth(self, path: str) -> bool:
        if not os.getenv("IPGEOSEARCH_API_KEY", ""):
            return False
        return path not in PUBLIC_PATHS and not path.startswith("/static/")

    def _is_authorized(self, query: dict[str, list[str]]) -> bool:
        expected = os.getenv("IPGEOSEARCH_API_KEY", "")
        if not expected:
            return True
        supplied = self.headers.get("X-API-Key", "") or query.get("api_key", [""])[0]
        return hmac.compare_digest(supplied, expected)

    def _send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        try:
            resolved = path.resolve()
            if not str(resolved).startswith(str(STATIC_ROOT.resolve())):
                self._send_json({"error": "not found"}, status=404)
                return
            if not resolved.is_file():
                self._send_json({"error": "not found"}, status=404)
                return

            body = resolved.read_bytes()
            content_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
            if resolved.suffix == ".js":
                content_type = "text/javascript"
            self.send_response(200)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=500)

    def _send_resolve(self, query: dict[str, list[str]]) -> None:
        host = query.get("host", [""])[0].strip().strip(".")
        if not host:
            self._send_json({"error": "missing host query parameter"}, status=400)
            return

        try:
            parsed_ip = ipaddress.ip_address(host)
            self._send_json({"host": host, "addresses": [str(parsed_ip)]})
            return
        except ValueError:
            pass

        if not HOSTNAME_PATTERN.match(host) or ".." in host:
            self._send_json({"error": "invalid hostname"}, status=400)
            return

        try:
            rows = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
            addresses = sorted({row[4][0] for row in rows}, key=lambda value: (":" in value, value))
        except socket.gaierror as exc:
            self._send_json({"error": f"resolve failed: {exc.strerror or exc}"}, status=400)
            return

        if not addresses:
            self._send_json({"error": "no addresses found"}, status=404)
            return

        self._send_json({"host": host, "addresses": addresses})

    def _send_dns(self, query: dict[str, list[str]]) -> None:
        host = query.get("host", [""])[0].strip().strip(".")
        if not host:
            self._send_json({"error": "missing host query parameter"}, status=400)
            return

        try:
            ipaddress.ip_address(host)
            self._send_json({"error": "dns query expects a hostname"}, status=400)
            return
        except ValueError:
            pass

        if not HOSTNAME_PATTERN.match(host) or ".." in host:
            self._send_json({"error": "invalid hostname"}, status=400)
            return

        self._send_json(_resolve_dns_records(host))

    def _send_rdap(self, query: dict[str, list[str]]) -> None:
        ip = query.get("ip", [""])[0]
        if not ip:
            self._send_json({"error": "missing ip query parameter"}, status=400)
            return
        try:
            parsed_ip = _parse_ip(ip)
        except ValueError:
            self._send_json({"error": "invalid ip"}, status=400)
            return

        if not parsed_ip.is_global:
            self._send_json({"ip": str(parsed_ip), "available": False, "reason": "non-global address"})
            return

        try:
            payload = _fetch_json(f"https://rdap.org/ip/{parsed_ip}")
            self._send_json({"ip": str(parsed_ip), "available": True, "rdap": _summarize_rdap(payload)})
        except urllib.error.HTTPError as exc:
            self._send_json({"ip": str(parsed_ip), "available": False, "error": f"rdap http {exc.code}"})
        except Exception as exc:
            self._send_json({"ip": str(parsed_ip), "available": False, "error": str(exc)})

    def _send_reverse_dns(self, query: dict[str, list[str]]) -> None:
        ip = query.get("ip", [""])[0]
        if not ip:
            self._send_json({"error": "missing ip query parameter"}, status=400)
            return
        try:
            parsed_ip = _parse_ip(ip)
        except ValueError:
            self._send_json({"error": "invalid ip"}, status=400)
            return
        self._send_json(_reverse_dns(str(parsed_ip)))

    def _send_intel(self, query: dict[str, list[str]]) -> None:
        ip = query.get("ip", [""])[0]
        if not ip:
            self._send_json({"error": "missing ip query parameter"}, status=400)
            return
        try:
            parsed_ip = _parse_ip(ip)
        except ValueError:
            self._send_json({"error": "invalid ip"}, status=400)
            return

        reverse_payload = _reverse_dns(str(parsed_ip))
        dnsbl_payload = _dnsbl_lookup(parsed_ip)
        try:
            lookup_payload = self.service.lookup(str(parsed_ip))
        except Exception as exc:
            lookup_payload = {"ip": str(parsed_ip), "results": [], "error": str(exc)}

        self._send_json(
            {
                "ip": str(parsed_ip),
                "reverseDns": reverse_payload,
                "dnsbl": dnsbl_payload,
                "privacy": _privacy_intel(parsed_ip, lookup_payload, reverse_payload, dnsbl_payload),
            }
        )

    def _send_probe(self, query: dict[str, list[str]]) -> None:
        target = query.get("target", [""])[0].strip()
        if not target:
            self._send_json({"error": "missing target query parameter"}, status=400)
            return
        try:
            self._send_json(_probe_target(target))
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=400)

def main() -> None:
    parser = argparse.ArgumentParser(description="IPGeoSearch HTTP API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), LookupHandler)
    print(f"listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        LookupHandler.service.close()
        server.server_close()


if __name__ == "__main__":
    main()
