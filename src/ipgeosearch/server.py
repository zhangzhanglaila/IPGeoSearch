"""Small dependency-free HTTP API."""

from __future__ import annotations

import argparse
import ipaddress
import json
import mimetypes
import os
import random
import re
import socket
import struct
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .service import IPGeoSearch


STATIC_ROOT = Path(__file__).resolve().parent / "static"
DEFAULT_OFFLINE_MAP_ROOT = Path("D:/iPhotron-LocalPhotoAlbumManager/src/maps")
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


def _offline_map_root() -> Path:
    return Path(os.getenv("IPGEOSEARCH_OFFLINE_MAP_ROOT", DEFAULT_OFFLINE_MAP_ROOT)).resolve()


def _offline_map_available() -> bool:
    root = _offline_map_root()
    return (root / "style.json").is_file() and (root / "tiles" / "tiles.json").is_file()


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

        if parsed.path == "/offline-map/style.json":
            self._send_offline_map_style()
            return

        if parsed.path == "/offline-map/tiles.json":
            self._send_offline_tiles_json()
            return

        if parsed.path.startswith("/offline-map/tiles/"):
            relative_path = parsed.path.removeprefix("/offline-map/tiles/")
            self._send_offline_tile(relative_path)
            return

        if parsed.path.startswith("/offline-map/fonts/"):
            relative_path = parsed.path.removeprefix("/offline-map/fonts/")
            self._send_offline_font(relative_path)
            return

        if parsed.path == "/health":
            self._send_json({"ok": True})
            return

        if parsed.path == "/datasets":
            self._send_json({"datasets": self.service.available_csv_datasets()})
            return

        if parsed.path == "/resolve":
            self._send_resolve(parse_qs(parsed.query))
            return

        if parsed.path == "/dns":
            self._send_dns(parse_qs(parsed.query))
            return

        if parsed.path == "/map-config":
            amap_key = os.getenv("AMAP_WEB_KEY", "")
            default_provider = "offline" if _offline_map_available() else ("amap" if amap_key else "osm")
            provider = os.getenv("MAP_PROVIDER", default_provider).lower()
            self._send_json(
                {
                    "provider": provider,
                    "amapKey": amap_key,
                    "offlineMapAvailable": _offline_map_available(),
                    "offlineMapMaxZoom": 6,
                }
            )
            return

        if parsed.path != "/lookup":
            self._send_json({"error": "not found"}, status=404)
            return

        query = parse_qs(parsed.query)
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

    def _send_bytes(self, body: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _request_origin(self) -> str:
        host = self.headers.get("Host", f"{self.server.server_address[0]}:{self.server.server_address[1]}")
        return f"http://{host}"

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

    def _send_offline_map_style(self) -> None:
        root = _offline_map_root()
        style_path = root / "style.json"
        if not style_path.is_file():
            self._send_json({"error": "offline map style not found"}, status=404)
            return

        with style_path.open("r", encoding="utf-8") as handle:
            style = json.load(handle)

        origin = self._request_origin()
        style["glyphs"] = f"{origin}/offline-map/fonts/{{fontstack}}/{{range}}.pbf"
        style["sources"]["maplibre"] = {
            "type": "vector",
            "url": f"{origin}/offline-map/tiles.json",
        }
        body = json.dumps(style, ensure_ascii=False).encode("utf-8")
        self._send_bytes(body, "application/json; charset=utf-8")

    def _send_offline_tiles_json(self) -> None:
        root = _offline_map_root()
        tiles_json = root / "tiles" / "tiles.json"
        if not tiles_json.is_file():
            self._send_json({"error": "offline tilejson not found"}, status=404)
            return

        with tiles_json.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        payload["tiles"] = [f"{self._request_origin()}/offline-map/tiles/{{z}}/{{x}}/{{y}}.pbf"]
        payload["scheme"] = "xyz"
        self._send_bytes(json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _send_offline_tile(self, relative_path: str) -> None:
        root = (_offline_map_root() / "tiles").resolve()
        path = root.joinpath(*relative_path.split("/")).resolve()
        if not str(path).startswith(str(root)):
            self._send_json({"error": "not found"}, status=404)
            return
        if not path.is_file() or path.suffix != ".pbf":
            self._send_json({"error": "tile not found"}, status=404)
            return
        self._send_bytes(path.read_bytes(), "application/x-protobuf")

    def _send_offline_font(self, relative_path: str) -> None:
        root = (_offline_map_root() / "font").resolve()
        parts = [unquote(part) for part in relative_path.split("/")]
        path = root.joinpath(*parts).resolve()
        if not str(path).startswith(str(root)):
            self._send_json({"error": "not found"}, status=404)
            return
        if not path.is_file() or path.suffix != ".pbf":
            self._send_json({"error": "font not found"}, status=404)
            return
        self._send_bytes(path.read_bytes(), "application/x-protobuf")


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
