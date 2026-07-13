# ip-geo-search / IP 地理搜索

ip-geo-search is a local IP and domain geolocation search tool with a playful web interface, online map display, batch lookup, network intelligence, history, and export support.

ip-geo-search 是一个本地 IP 与域名地理位置查询工具，提供动漫风前端页面、在线地图定位、批量查询、网络情报分析、查询历史和结果导出能力。

## Features / 功能

- Single IP or domain lookup by default.
- Switchable batch lookup mode for multiple IPs and domains.
- Batch domain lookup expands resolved addresses into result rows.
- Domain-to-IP resolution before geolocation lookup.
- DNS record lookup for A, AAAA, CNAME, MX, and NS.
- Reverse DNS lookup.
- RDAP / WHOIS summary for public IP ownership and allocation data.
- DNSBL blacklist checks for IPv4 addresses.
- Heuristic proxy, VPN, Tor, CDN, hosting, mobile network, and private address detection.
- TCP connectivity probe for ports 80 and 443.
- Online map display with single-point and multi-point markers.
- Single and batch marker labels with visible IP/domain information.
- Same-coordinate batch results are grouped into one map marker with a detailed popup.
- Batch map filters for located, failed, high-risk, and hosting/CDN results.
- Optional batch heatmap overlay.
- Optional batch map line display by result order.
- Rich map marker popups with IP, location, type, risk, and coordinates.
- Click a batch result to focus the map on that location.
- Copy IP, location, ASN, ISP, and coordinates.
- IP type classification and heuristic risk labels.
- Query history with one-click re-query, favorites, item deletion, and clear-all support.
- Batch file import from TXT/CSV, duplicate removal, failure retry, and result summary.
- Export batch results to CSV or JSON with IP type, risk, ASN, and ISP fields.
- Light/dark anime-style theme switch.
- Optional API key protection for shared deployments.
- Docker deployment support.
- Lightweight HTTP API for local integration.
- Built-in API documentation panel.

## Quick Start / 快速开始

Start the web service:

```powershell
cd D:\ip\ip-geo-search
python api.py --host 127.0.0.1 --port 8787
```

Open:

```text
http://127.0.0.1:8787/
```

CLI lookup:

```powershell
python lookup.py 8.8.8.8
python lookup.py 8.8.8.8 --json
```

## Web Usage / 页面用法

1. Open the page and use the default **单个查询** mode.
2. Enter an IP or domain, such as `8.8.8.8` or `github.com`.
3. Click **立即查询** to view location, ASN, ISP, risk score, and map marker.
4. Click **多个查询** to batch query multiple IPs or domains.
5. Import TXT/CSV files or paste multiple targets into the batch box.
6. Use result filters, heatmap, and line display to inspect batch map results.
7. Use **重试失败** to re-run failed batch targets.
8. Use **导出 CSV** or **导出 JSON** to save batch results.
9. If API key protection is enabled, click **API Key** in the top bar and enter the key once.

## HTTP API / HTTP 接口

Lookup an IP:

```text
http://127.0.0.1:8787/lookup?ip=8.8.8.8
```

Resolve a domain:

```text
http://127.0.0.1:8787/resolve?host=github.com
```

Lookup DNS records:

```text
http://127.0.0.1:8787/dns?host=github.com
```

Reverse DNS:

```text
http://127.0.0.1:8787/reverse-dns?ip=8.8.8.8
```

Network intelligence:

```text
http://127.0.0.1:8787/intel?ip=8.8.8.8
```

RDAP / WHOIS summary:

```text
http://127.0.0.1:8787/rdap?ip=8.8.8.8
```

TCP connectivity probe:

```text
http://127.0.0.1:8787/probe?target=github.com
```

Health check:

```text
http://127.0.0.1:8787/health
```

Optional API key:

```powershell
$env:IPGEOSEARCH_API_KEY="change-me"
python api.py --host 127.0.0.1 --port 8787
```

When enabled, API requests must include `X-API-Key: change-me` or `?api_key=change-me`. The web page can store the key from the **API Key** button.

## Docker / Docker 部署

Build and run:

```powershell
docker build -t ip-geo-search .
docker run --rm -p 8787:8787 ip-geo-search
```

Run with API key protection:

```powershell
docker run --rm -p 8787:8787 -e IPGEOSEARCH_API_KEY=change-me ip-geo-search
```

## Lookup Response / 查询返回

The lookup API returns the queried IP, IP version, and a `results` array. Each item contains:

- `source`: local lookup module name
- `ok`: whether the lookup succeeded
- `data`: matched location, network, ASN, or coordinate data
- `error`: error message when a lookup module cannot return data

查询接口会返回 IP、IP 版本和 `results` 数组。每个结果项包含查询模块、是否成功、匹配到的位置/网络/ASN/坐标数据，以及错误信息。

## Environment / 环境

The project runs as a local Python service and serves the frontend from `src/ipgeosearch/static`.

```powershell
python api.py --host 127.0.0.1 --port 8787
```

## Roadmap / 规划

- Optional packaged desktop build.
- Larger offline-free intelligence source integrations.

## License / 许可证

This project has not added a license yet.

本项目目前尚未添加许可证。
