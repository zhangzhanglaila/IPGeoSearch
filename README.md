# ip-geo-search

本地 IP 与域名地理位置查询工具，提供动漫风前端、在线地图定位、批量查询、网络情报分析、查询历史与结果导出。

Local IP and domain geolocation search tool with a playful web UI, online maps, batch lookup, network intelligence, history, and export.

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-none-lightgrey)
![Stars](https://img.shields.io/github/stars/zhangzhanglaila/ip-geo-search?style=flat)
![Last commit](https://img.shields.io/github/last-commit/zhangzhanglaila/ip-geo-search)

**Language / 语言:** [简体中文](#简体中文) · [English](#english)

---

## 简体中文

ip-geo-search 是一个本地运行的 IP 与域名地理位置查询工具，内置动漫风 Web 页面、在线地图、批量查询、网络情报分析、查询历史与结果导出，并提供轻量 HTTP 接口与 CLI。

### 功能

| 分类 | 能力 |
| --- | --- |
| 查询 | 默认单个 IP 或域名查询，可切换为批量模式查询多个目标。 |
| 解析 | 查询前先做域名到 IP 解析，批量域名会展开为多条结果。 |
| DNS | 支持 A、AAAA、CNAME、MX、NS 记录查询与反向 DNS 查询。 |
| 归属 | 通过 RDAP / WHOIS 汇总公网 IP 归属与分配信息。 |
| 情报 | DNSBL 黑名单检查，启发式识别代理、VPN、Tor、CDN、托管、移动网络与私有地址，并对 80/443 端口做 TCP 连通探测。 |
| 地图 | 在线单点与多点标注、同坐标聚合、批量筛选、可选热力图与顺序连线、丰富弹窗，以及点击结果定位。 |
| 历史 | 查询历史支持一键重查、收藏、单条删除与全部清空。 |
| 批量 | 支持 TXT/CSV 导入、去重、失败重试与结果统计。 |
| 导出 | 批量结果可导出为 CSV 或 JSON，包含 IP 类型、风险、ASN 与 ISP 字段。 |
| 部署 | 可选 API Key 保护、[Docker](https://www.docker.com/) 部署、轻量 HTTP 接口，以及内置 API 文档面板。 |
| 主题 | 明暗动漫风主题切换。 |

### 快速开始

启动 Web 服务：

```powershell
cd D:\ip\ip-geo-search
python api.py --host 127.0.0.1 --port 8787
```

在浏览器打开：

```text
http://127.0.0.1:8787/
```

命令行查询：

```powershell
python lookup.py 8.8.8.8
python lookup.py 8.8.8.8 --json
```

### 页面用法

1. 打开页面，默认处于 **单个查询** 模式。
2. 输入 IP 或域名，例如 `8.8.8.8` 或 `github.com`。
3. 点击 **立即查询**，查看位置、ASN、ISP、风险评分与地图标注。
4. 点击 **多个查询** 批量查询多个 IP 或域名。
5. 导入 TXT/CSV 文件，或在批量框中粘贴多个目标。
6. 使用结果筛选、热力图与连线展示查看批量地图结果。
7. 使用 **重试失败** 重新查询失败的批量目标。
8. 使用 **导出 CSV** 或 **导出 JSON** 保存批量结果。
9. 若启用了 API Key 保护，点击顶部 **API Key** 按钮，一次性输入密钥。

### 命令行选项

`python lookup.py` 支持以下选项：

| 选项 | 说明 |
| --- | --- |
| `ip` | 要查询的 IP 地址。 |
| `--source` | 指定数据源（`ip2region`、`ip-location-db`、`csv`、`geoip2`），可重复；默认查询全部。 |
| `--csv-db` | 指定 ip-location-db 数据集，可重复。 |
| `--ip2region-cache` | ip2region 缓存策略（`content`、`vector`、`file`），默认 `content`。 |
| `--list-csv` | 列出可用的 CSV 数据集。 |
| `--json` | 以 JSON 格式输出。 |

示例：

```powershell
python lookup.py 8.8.8.8 --source geoip2 --json
```

### HTTP 接口

全部接口由 `python api.py` 提供，基础地址 `http://127.0.0.1:8787`。

| 接口 | 说明 |
| --- | --- |
| `/lookup?ip=8.8.8.8` | 查询 IP 地址。 |
| `/resolve?host=github.com` | 将域名解析为地址。 |
| `/dns?host=github.com` | 查询 DNS 记录。 |
| `/reverse-dns?ip=8.8.8.8` | 反向 DNS 查询。 |
| `/intel?ip=8.8.8.8` | 网络情报汇总。 |
| `/rdap?ip=8.8.8.8` | RDAP / WHOIS 汇总。 |
| `/probe?target=github.com` | TCP 连通探测。 |
| `/datasets` | 列出可用数据集。 |
| `/health` | 健康检查。 |

可选 API Key：

```powershell
$env:IPGEOSEARCH_API_KEY="change-me"
python api.py --host 127.0.0.1 --port 8787
```

启用后，接口请求需携带 `X-API-Key: change-me` 或 `?api_key=change-me`。页面可通过 **API Key** 按钮保存该密钥。

### Docker 部署

构建并运行：

```powershell
docker build -t ip-geo-search .
docker run --rm -p 8787:8787 ip-geo-search
```

带 API Key 保护运行：

```powershell
docker run --rm -p 8787:8787 -e IPGEOSEARCH_API_KEY=change-me ip-geo-search
```

### 查询返回

查询接口会返回 IP、IP 版本和 `results` 数组，每个结果项包含：

| 字段 | 说明 |
| --- | --- |
| `source` | 本地查询模块名称。 |
| `ok` | 查询是否成功。 |
| `data` | 匹配到的位置、网络、ASN 或坐标数据。 |
| `error` | 查询模块无法返回数据时的错误信息。 |

### 环境

本项目以本地 Python 服务运行（需要 Python 3.10 及以上），前端资源由 `src/ipgeosearch/static` 提供。

### 规划

- 可选的桌面端打包构建。
- 集成更多在线情报数据源。

[↑ 返回顶部](#ip-geo-search) · [English](#english)

---

## English

ip-geo-search is a locally-run IP and domain geolocation search tool with a playful anime-style web UI, online maps, batch lookup, network intelligence analysis, query history, and result export, plus a lightweight HTTP API and CLI.

### Features

| Area | Capability |
| --- | --- |
| Lookup | Single IP or domain lookup by default; switchable batch mode for multiple targets. |
| Resolution | Domain-to-IP resolution before geolocation; batch domains expand resolved addresses into result rows. |
| DNS | A / AAAA / CNAME / MX / NS record lookup and reverse DNS lookup. |
| Ownership | RDAP / WHOIS summary for public IP ownership and allocation data. |
| Intelligence | DNSBL blacklist checks; heuristic proxy, VPN, Tor, CDN, hosting, mobile, and private detection; TCP probe on ports 80 and 443. |
| Map | Online single- and multi-point markers, same-coordinate grouping, batch filters, optional heatmap and order lines, rich popups, and click-to-focus. |
| History | Query history with one-click re-query, favorites, item deletion, and clear-all. |
| Batch | TXT/CSV import, duplicate removal, failure retry, and result summary. |
| Export | Export batch results to CSV or JSON with IP type, risk, ASN, and ISP fields. |
| Deployment | Optional API key protection, [Docker](https://www.docker.com/) support, a lightweight HTTP API, and a built-in API docs panel. |
| Theme | Light / dark anime-style theme switch. |

### Quick Start

Start the web service:

```powershell
cd D:\ip\ip-geo-search
python api.py --host 127.0.0.1 --port 8787
```

Open in a browser:

```text
http://127.0.0.1:8787/
```

CLI lookup:

```powershell
python lookup.py 8.8.8.8
python lookup.py 8.8.8.8 --json
```

### Web Usage

1. Open the page and use the default **单个查询** (single) mode.
2. Enter an IP or domain, such as `8.8.8.8` or `github.com`.
3. Click **立即查询** to view location, ASN, ISP, risk score, and map marker.
4. Click **多个查询** to batch query multiple IPs or domains.
5. Import TXT/CSV files or paste multiple targets into the batch box.
6. Use result filters, heatmap, and line display to inspect batch map results.
7. Use **重试失败** to re-run failed batch targets.
8. Use **导出 CSV** or **导出 JSON** to save batch results.
9. If API key protection is enabled, click **API Key** in the top bar and enter the key once.

### CLI Options

`python lookup.py` accepts the following options:

| Option | Description |
| --- | --- |
| `ip` | IP address to query. |
| `--source` | Source to query (`ip2region`, `ip-location-db`, `csv`, `geoip2`). Can be repeated. Defaults to all sources. |
| `--csv-db` | ip-location-db dataset. Can be repeated. |
| `--ip2region-cache` | ip2region cache policy (`content`, `vector`, `file`). Defaults to `content`. |
| `--list-csv` | List available CSV datasets. |
| `--json` | Print JSON output. |

Example:

```powershell
python lookup.py 8.8.8.8 --source geoip2 --json
```

### HTTP API

All endpoints are served by `python api.py`. Base URL: `http://127.0.0.1:8787`.

| Endpoint | Description |
| --- | --- |
| `/lookup?ip=8.8.8.8` | Look up an IP address. |
| `/resolve?host=github.com` | Resolve a domain to addresses. |
| `/dns?host=github.com` | Look up DNS records. |
| `/reverse-dns?ip=8.8.8.8` | Reverse DNS lookup. |
| `/intel?ip=8.8.8.8` | Network intelligence summary. |
| `/rdap?ip=8.8.8.8` | RDAP / WHOIS summary. |
| `/probe?target=github.com` | TCP connectivity probe. |
| `/datasets` | List available datasets. |
| `/health` | Health check. |

Optional API key:

```powershell
$env:IPGEOSEARCH_API_KEY="change-me"
python api.py --host 127.0.0.1 --port 8787
```

When enabled, API requests must include `X-API-Key: change-me` or `?api_key=change-me`. The web page can store the key from the **API Key** button.

### Docker

Build and run:

```powershell
docker build -t ip-geo-search .
docker run --rm -p 8787:8787 ip-geo-search
```

Run with API key protection:

```powershell
docker run --rm -p 8787:8787 -e IPGEOSEARCH_API_KEY=change-me ip-geo-search
```

### Lookup Response

The lookup API returns the queried IP, IP version, and a `results` array. Each item contains:

| Field | Description |
| --- | --- |
| `source` | Local lookup module name. |
| `ok` | Whether the lookup succeeded. |
| `data` | Matched location, network, ASN, or coordinate data. |
| `error` | Error message when a lookup module cannot return data. |

### Environment

The project runs as a local Python service (requires Python 3.10+) and serves the frontend from `src/ipgeosearch/static`.

### Roadmap

- Optional packaged desktop build.
- Larger offline-free intelligence source integrations.

[↑ Back to top](#ip-geo-search) · [简体中文](#简体中文)

---

## Repository / 仓库信息

| Item / 项 | Value / 值 |
| --- | --- |
| Repository / 仓库 | [zhangzhanglaila/ip-geo-search](https://github.com/zhangzhanglaila/ip-geo-search) |
| Language / 语言 | Python (3.10+) |
| Topics / 标签 | `ip-geolocation` · `dns` · `whois` · `rdap` · `network-intelligence` · `docker` · `http-api` |
| License / 许可证 | Not added yet / 暂未添加 |
| Deployment / 部署 | Docker / local service |

![Issues](https://img.shields.io/github/issues/zhangzhanglaila/ip-geo-search)
![Repo size](https://img.shields.io/github/repo-size/zhangzhanglaila/ip-geo-search)

[↑ 返回顶部 / Back to top](#ip-geo-search)
