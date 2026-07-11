const form = document.querySelector("#searchForm");
const ipInput = document.querySelector("#ipInput");
const singleModeButton = document.querySelector("#singleModeButton");
const batchModeButton = document.querySelector("#batchModeButton");
const themeToggleButton = document.querySelector("#themeToggleButton");
const multiTools = document.querySelector("#multiTools");
const batchInput = document.querySelector("#batchInput");
const batchButton = document.querySelector("#batchButton");
const clearBatchButton = document.querySelector("#clearBatchButton");
const copyBatchButton = document.querySelector("#copyBatchButton");
const exportCsvButton = document.querySelector("#exportCsvButton");
const exportJsonButton = document.querySelector("#exportJsonButton");
const batchResults = document.querySelector("#batchResults");
const historyList = document.querySelector("#historyList");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const copyDnsButton = document.querySelector("#copyDnsButton");
const dnsResults = document.querySelector("#dnsResults");
const ipv4Value = document.querySelector("#ipv4Value");
const ipv6Value = document.querySelector("#ipv6Value");
const basicIp = document.querySelector("#basicIp");
const basicLocation = document.querySelector("#basicLocation");
const basicAsn = document.querySelector("#basicAsn");
const basicIsp = document.querySelector("#basicIsp");
const basicIpType = document.querySelector("#basicIpType");
const basicCoords = document.querySelector("#basicCoords");
const basicBroadcast = document.querySelector("#basicBroadcast");
const riskScore = document.querySelector("#riskScore");
const riskNeedle = document.querySelector("#riskNeedle");
const riskSummary = document.querySelector("#riskSummary");
const riskTags = document.querySelector("#riskTags");
const analysisBody = document.querySelector("#analysisBody");
const mapNote = document.querySelector("#mapNote");

const HISTORY_KEY = "ipgeosearch.history";
const THEME_KEY = "ipgeosearch.theme";
const MAX_HISTORY = 8;

const COUNTRY_CENTROIDS = {
  US: { lat: 39.5, lon: -98.35, label: "United States" },
  CN: { lat: 35.86, lon: 104.19, label: "中国" },
  HK: { lat: 22.32, lon: 114.17, label: "中国香港" },
  AU: { lat: -25.27, lon: 133.77, label: "Australia" },
  JP: { lat: 36.2, lon: 138.25, label: "Japan" },
  KR: { lat: 36.5, lon: 127.8, label: "South Korea" },
  IN: { lat: 20.59, lon: 78.96, label: "India" },
  SG: { lat: 1.35, lon: 103.82, label: "Singapore" },
  GB: { lat: 55.38, lon: -3.44, label: "United Kingdom" },
  DE: { lat: 51.16, lon: 10.45, label: "Germany" },
  FR: { lat: 46.23, lon: 2.21, label: "France" },
  CA: { lat: 56.13, lon: -106.35, label: "Canada" },
  BR: { lat: -14.24, lon: -51.92, label: "Brazil" },
  RU: { lat: 61.52, lon: 105.32, label: "Russia" }
};

const state = {
  mode: "single",
  map: null,
  marker: null,
  markerLayer: null,
  chinaCoordinates: new Map(),
  chinaCoordinatesReady: null,
  mapReady: null,
  lastBatchRows: [],
  lastDns: null
};

state.chinaCoordinatesReady = loadChinaCoordinates();
state.mapReady = initMap();
applyTheme(readTheme());
renderAnalysis();
renderHistory();

singleModeButton.addEventListener("click", () => setMode("single"));
batchModeButton.addEventListener("click", () => setMode("batch"));
themeToggleButton.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("theme-dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ip = ipInput.value.trim();
  if (!ip) return;

  const requestMode = state.mode;
  form.querySelector("button").disabled = true;
  mapNote.textContent = "正在查询 IP 信息...";
  try {
    const { payload, data } = await lookupTarget(ip);
    await Promise.all([state.chinaCoordinatesReady, state.mapReady]);
    if (requestMode !== state.mode) return;
    render(payload, data);
    addHistory(data);
  } catch (error) {
    if (requestMode !== state.mode) return;
    renderError(error);
  } finally {
    form.querySelector("button").disabled = false;
  }
});

batchButton.addEventListener("click", runBatchLookup);

clearBatchButton.addEventListener("click", () => {
  batchInput.value = "";
  state.lastBatchRows = [];
  renderBatchResults([]);
});

copyBatchButton.addEventListener("click", async () => {
  const text = state.lastBatchRows
    .map((row) => [row.input || "-", row.ip || "-", row.location || row.error || "-", row.coords || "-"].join("\t"))
    .join("\n");
  await copyText(text || "暂无批量结果", copyBatchButton);
});

exportCsvButton.addEventListener("click", () => exportBatch("csv"));
exportJsonButton.addEventListener("click", () => exportBatch("json"));

document.querySelectorAll(".copy-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copyTarget}`);
    await copyText(target?.textContent?.trim() || "", button);
  });
});

historyList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-history-action]");
  if (!button) return;
  const target = button.dataset.historyTarget || "";
  if (button.dataset.historyAction === "query") {
    ipInput.value = target;
    form.requestSubmit();
    return;
  }
  if (button.dataset.historyAction === "favorite") {
    toggleHistoryFavorite(target);
    return;
  }
  if (button.dataset.historyAction === "remove") {
    removeHistoryItem(target);
  }
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

copyDnsButton.addEventListener("click", async () => {
  await copyText(formatDnsText(state.lastDns), copyDnsButton);
});

batchResults.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-row-index]");
  if (!button) return;
  const row = state.lastBatchRows[Number(button.dataset.rowIndex)];
  if (!row?.position) return;
  focusBatchRow(row);
});

window.addEventListener("load", () => {
  setMode("single");
  form.requestSubmit();
});

function setMode(mode) {
  const isBatch = mode === "batch";
  state.mode = isBatch ? "batch" : "single";
  form.classList.toggle("is-hidden", isBatch);
  multiTools.classList.toggle("is-hidden", !isBatch);
  singleModeButton.classList.toggle("active", !isBatch);
  batchModeButton.classList.toggle("active", isBatch);
  singleModeButton.setAttribute("aria-selected", String(!isBatch));
  batchModeButton.setAttribute("aria-selected", String(isBatch));
  if (isBatch) {
    window.setTimeout(() => batchInput.focus(), 0);
  } else {
    window.setTimeout(() => ipInput.focus(), 0);
  }
}

function readTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("theme-dark", isDark);
  themeToggleButton.textContent = isDark ? "浅色" : "深色";
  themeToggleButton.setAttribute("aria-pressed", String(isDark));
}

async function lookupTarget(target) {
  const resolved = await resolveTarget(target);
  const lookupPromise = lookupIp(resolved.ip, resolved);
  const dnsPromise = resolved.resolved ? lookupDns(resolved.input).catch((error) => ({ error: error.message })) : Promise.resolve(null);
  const result = await lookupPromise;
  result.data.dns = await dnsPromise;
  return result;
}

async function lookupIp(ip, resolved = { input: ip, ip, addresses: [ip], resolved: false }) {
  const response = await fetch(`/lookup?ip=${encodeURIComponent(ip)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "查询失败");
  await state.chinaCoordinatesReady;
  const data = normalize(payload);
  data.input = resolved.input;
  data.resolvedIp = resolved.ip;
  data.resolvedAddresses = resolved.addresses;
  data.resolvedFromDomain = resolved.resolved;
  return { payload, data };
}

async function resolveTarget(target) {
  if (isIpAddress(target)) {
    return { input: target, ip: target, addresses: [target], resolved: false };
  }

  const response = await fetch(`/resolve?host=${encodeURIComponent(target)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "域名解析失败");
  const ip = chooseAddress(payload.addresses || []);
  if (!ip) throw new Error("域名没有可查询的 IP");
  return { input: target, ip, addresses: payload.addresses || [ip], resolved: true };
}

async function lookupDns(host) {
  const response = await fetch(`/dns?host=${encodeURIComponent(host)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "DNS 查询失败");
  return payload;
}

async function runBatchLookup() {
  const targets = uniqueItems(batchInput.value.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean)).slice(0, 30);
  if (!targets.length) {
    renderBatchResults([]);
    mapNote.textContent = "请输入要批量查询的 IP。";
    return;
  }

  batchButton.disabled = true;
  mapNote.textContent = `正在批量查询 ${targets.length} 个目标...`;
  renderBatchResults(targets.map((target) => ({ input: target, loading: true })));
  try {
    await Promise.all([state.chinaCoordinatesReady, state.mapReady]);
    const groups = await Promise.all(targets.map(async (target) => {
      try {
        return await lookupTargetRows(target);
      } catch (error) {
        return [{ input: target, ip: "-", error: error.message }];
      }
    }));
    const rows = groups.flat();
    state.lastBatchRows = rows;
    renderBatchResults(rows);
    updateMapMany(rows.filter((row) => row.position));
    rows.filter((row) => !row.error).forEach(addHistory);
    const located = rows.filter((row) => row.position).length;
    mapNote.textContent = `批量查询完成：${targets.length} 个输入，${rows.length} 条结果，${located} 个已定位到地图。`;
    if (located) scrollMapIntoView();
  } finally {
    batchButton.disabled = false;
  }
}

async function lookupTargetRows(target) {
  const resolved = await resolveTarget(target);
  const addresses = resolved.resolved ? uniqueItems(resolved.addresses || [resolved.ip]).filter(isIpAddress) : [resolved.ip];
  if (!addresses.length) throw new Error("域名没有可查询的 IP");
  return Promise.all(addresses.map(async (ip) => {
    const { data } = await lookupIp(ip, {
      input: resolved.input,
      ip,
      addresses,
      resolved: resolved.resolved
    });
    return toBatchRow(target, data);
  }));
}

async function initMap() {
  try {
    loadStyle("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
    await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
    state.map = L.map("mapCanvas", {
      center: [30.65, 114.32],
      zoom: 7,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
      subdomains: ["1", "2", "3", "4"],
      minZoom: 3,
      maxZoom: 18
    }).addTo(state.map);
    state.markerLayer = L.layerGroup().addTo(state.map);
    mapNote.textContent = "查询 IP 后在地图中定位。";
  } catch (error) {
    mapNote.textContent = `地图加载失败：${error.message}`;
  }
}

function render(payload, data) {
  ipv4Value.textContent = payload.ip_version === 4 ? payload.ip : "-";
  ipv6Value.textContent = payload.ip_version === 6 ? payload.ip : "未检测到 IPv6";
  basicIp.textContent = data.resolvedFromDomain ? `${data.input} -> ${payload.ip}` : payload.ip;
  basicLocation.textContent = data.locationDetail || data.location || "-";
  basicAsn.textContent = data.asn ? `ASN${data.asn}` : "-";
  basicIsp.textContent = data.isp || data.networkName || "-";
  basicIpType.textContent = data.ipType || "-";
  basicCoords.textContent = data.position ? `${data.position.lon.toFixed(6)}, ${data.position.lat.toFixed(6)}` : "-";
  basicBroadcast.textContent = "N/A";
  renderRisk(data);
  renderAnalysis(data);
  renderDns(data.dns);

  if (data.position) {
    updateMap(data.position.lat, data.position.lon, mapPopupHtml(data));
    mapNote.textContent = data.mapLabel;
  } else {
    mapNote.textContent = "未找到可用于地图定位的坐标。";
  }
}

function renderError(error) {
  basicIp.textContent = ipInput.value.trim() || "-";
  basicLocation.textContent = error.message;
  basicAsn.textContent = "-";
  basicIsp.textContent = "-";
  basicIpType.textContent = "-";
  basicCoords.textContent = "-";
  renderDns(null);
  mapNote.textContent = error.message;
}

function renderBatchResults(rows) {
  if (!rows.length) {
    batchResults.innerHTML = "";
    return;
  }
  batchResults.innerHTML = rows.map((row, index) => {
    if (row.loading) {
      return `<div class="batch-row"><strong>${escapeHtml(row.input)}</strong><span>查询中...</span><span>-</span></div>`;
    }
    if (row.error) {
      return `<div class="batch-row error"><strong>${escapeHtml(row.input)}</strong><span>${escapeHtml(row.error)}</span><span>-</span></div>`;
    }
    return `
      <div class="batch-row">
        <strong>${escapeHtml(row.inputLabel || row.input)}</strong>
        <span>${escapeHtml(row.location || "-")}</span>
        <span>${escapeHtml(row.coords || "-")}</span>
        <button type="button" data-row-index="${index}" ${row.position ? "" : "disabled"}>定位</button>
      </div>
    `;
  }).join("");
}

function renderHistory() {
  const rows = readHistory();
  if (!rows.length) {
    historyList.innerHTML = `<div class="history-empty">暂无查询历史</div>`;
    return;
  }
  historyList.innerHTML = rows.map((row) => `
    <div class="history-item${row.favorite ? " favorite" : ""}">
      <button type="button" class="history-main" data-history-action="query" data-history-target="${escapeHtml(row.target || row.ip)}">
        <strong>${escapeHtml(row.label || row.ip)}</strong>
        <span>${escapeHtml(row.location || "-")}</span>
        <span>${escapeHtml(row.coords || "-")}</span>
      </button>
      <div class="history-actions">
        <button type="button" data-history-action="favorite" data-history-target="${escapeHtml(row.target || row.ip)}">${row.favorite ? "已收藏" : "收藏"}</button>
        <button type="button" data-history-action="remove" data-history-target="${escapeHtml(row.target || row.ip)}">删除</button>
      </div>
    </div>
  `).join("");
}

function renderDns(payload) {
  state.lastDns = payload;
  if (!payload) {
    dnsResults.innerHTML = `<div class="dns-empty">输入域名后显示 A / AAAA / CNAME / MX / NS 记录。</div>`;
    return;
  }
  if (payload.error) {
    dnsResults.innerHTML = `<div class="dns-empty">${escapeHtml(payload.error)}</div>`;
    return;
  }

  const types = ["A", "AAAA", "CNAME", "MX", "NS"];
  const rows = types.map((type) => {
    const records = payload.records?.[type] || [];
    const values = records.length
      ? records.map((record) => `<span>${escapeHtml(record.value)}${record.ttl ? ` / TTL ${escapeHtml(record.ttl)}` : ""}</span>`).join("")
      : `<span>暂无记录</span>`;
    return `
      <div class="dns-record">
        <strong>${type}</strong>
        <div class="dns-values">${values}</div>
      </div>
    `;
  }).join("");

  dnsResults.innerHTML = rows;
}

function updateMap(lat, lon, label) {
  if (!state.map || !window.L) return;
  state.markerLayer?.clearLayers();
  const position = [lat, lon];
  state.marker = L.marker(position).addTo(state.markerLayer || state.map);
  state.marker.bindPopup(label).openPopup();
  state.map.setView(position, 8);
}

function updateMapMany(rows) {
  if (!state.map || !window.L || !rows.length) return;
  state.markerLayer?.clearLayers();
  const bounds = [];
  for (const row of rows) {
    const position = [row.position.lat, row.position.lon];
    bounds.push(position);
    L.marker(position)
      .addTo(state.markerLayer || state.map)
      .bindPopup(mapPopupHtml(row));
  }
  if (bounds.length === 1) {
    state.map.setView(bounds[0], 8);
  } else {
    state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
  }
}

function focusBatchRow(row) {
  if (!state.map || !window.L || !row.position) return;
  const position = [row.position.lat, row.position.lon];
  state.map.setView(position, 8);
  state.markerLayer?.eachLayer((layer) => {
    const point = layer.getLatLng?.();
    if (!point) return;
    if (Math.abs(point.lat - row.position.lat) < 0.000001 && Math.abs(point.lng - row.position.lon) < 0.000001) {
      layer.openPopup();
    }
  });
  mapNote.textContent = `${row.inputLabel || row.ip} - 已在地图中定位。`;
}

function scrollMapIntoView() {
  document.querySelector(".map-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalize(payload) {
  const locationResult = findResult(payload, "ip2region");
  const tableResult = findResult(payload, "ip-location-db");
  const precisionResult = findResult(payload, "geoip2");
  const region = locationResult?.data?.region || "";
  const parts = region.split("|");
  const country = clean(parts[0]);
  const province = clean(parts[1]);
  const city = clean(parts[2]);
  const isp = clean(parts[3]);
  const codeFromRegion = clean(parts[4]).toUpperCase();
  const network = findNetwork(tableResult?.data);
  const countryCode = network.countryCode || (/^[A-Z]{2}$/.test(codeFromRegion) ? codeFromRegion : "");
  const coordinates = findCoordinates(precisionResult?.data?.record);
  const chinaCoordinate = countryCode === "CN" ? findChinaCoordinate(city, province) : null;
  const centroid = countryCode ? COUNTRY_CENTROIDS[countryCode] : null;
  const position = coordinates || chinaCoordinate || centroid || null;
  const location = [country, province, city].filter(Boolean).join("/");
  const carrier = isp || network.name;
  const locationDetail = [location, carrier].filter(Boolean).join("/");
  const profile = classifyIp({ carrier, isp, networkName: network.name, asn: network.asn });

  return {
    ip: payload.ip,
    location,
    locationDetail,
    isp,
    asn: network.asn,
    networkName: network.name,
    countryCode,
    countryName: centroid?.label || country,
    ipType: profile.type,
    riskScore: profile.score,
    riskTags: profile.tags,
    isServerLike: profile.serverLike,
    isProxyLike: profile.proxyLike,
    isAbuseLike: profile.abuseLike,
    position,
    coords: position ? `${position.lon.toFixed(6)}, ${position.lat.toFixed(6)}` : "",
    mapLabel: position
      ? `${locationDetail || countryCode || "IP"} - ${coordinates ? "精确坐标" : chinaCoordinate ? "城市级坐标" : "国家级坐标"}`
      : "无坐标"
  };
}

function toBatchRow(input, data) {
  const inputLabel = data.resolvedFromDomain ? `${input} -> ${data.resolvedIp}` : input;
  return {
    input,
    inputLabel,
    ip: data.resolvedIp || data.ip,
    location: data.locationDetail || data.location || data.countryName || "-",
    coords: data.coords || "",
    ipType: data.ipType || "",
    riskScore: data.riskScore,
    asn: data.asn || "",
    isp: data.isp || data.networkName || "",
    position: data.position || null,
    addresses: data.resolvedAddresses || []
  };
}

function mapPopupHtml(row) {
  const title = row.inputLabel || (row.resolvedFromDomain ? `${row.input} -> ${row.resolvedIp}` : row.ip) || "IP 位置";
  const ip = row.ip || row.resolvedIp || "";
  const location = row.locationDetail || row.location || row.countryName || "-";
  const type = row.ipType || "-";
  const risk = Number.isFinite(row.riskScore) ? `${row.riskScore}分` : "-";
  const coords = row.coords || (row.position ? `${row.position.lon.toFixed(6)}, ${row.position.lat.toFixed(6)}` : "-");
  return `
    <div class="map-popup">
      <strong>${escapeHtml(title)}</strong>
      <span>IP：${escapeHtml(ip || "-")}</span>
      <span>位置：${escapeHtml(location)}</span>
      <span>类型：${escapeHtml(type)}</span>
      <span>风险：${escapeHtml(risk)}</span>
      <span>坐标：${escapeHtml(coords)}</span>
    </div>
  `;
}

function renderRisk(data = {}) {
  const score = Number.isFinite(data.riskScore) ? data.riskScore : 0;
  riskScore.textContent = `${score}分`;
  riskNeedle.style.left = `${Math.min(98, score)}%`;
  riskSummary.textContent = score <= 20 ? "极低风险 - 安全可信" : score <= 45 ? "中低风险 - 建议复核" : "较高风险 - 重点关注";
  const tags = data.riskTags?.length ? data.riskTags : ["常规网络"];
  riskTags.innerHTML = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
}

function renderAnalysis(data = {}) {
  const ipType = data.ipType || (data.asn ? "商业 IP" : "未知");
  const proxy = data.proxyLike ? "疑似" : "否";
  const server = data.isServerLike ? "是" : "否";
  const abuse = data.abuseLike ? "疑似" : "否";
  const rows = [
    ["local-ip", proxy, server, ipType, abuse],
    ["region-db", proxy, server, ipType, abuse],
    ["geo-check", proxy, server, ipType, abuse]
  ];
  analysisBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row[0])}</td>
      <td>${statusPill(row[1])}</td>
      <td>${statusPill(row[2])}</td>
      <td>${escapeHtml(row[3])}</td>
      <td>${statusPill(row[4])}</td>
    </tr>
  `).join("");
}

function classifyIp(data = {}) {
  const text = `${data.carrier || ""} ${data.isp || ""} ${data.networkName || ""}`.toLowerCase();
  const tags = [];
  let score = 0;
  let type = data.asn ? "商业 IP" : "未知";
  let serverLike = false;
  let proxyLike = false;
  let abuseLike = false;

  if (/cloudflare|akamai|fastly|cdn|edgecast|cachefly/.test(text)) {
    type = "CDN / 边缘网络";
    tags.push("CDN 网络");
    serverLike = true;
    score += 18;
  } else if (/cloud|hosting|host|server|data center|datacenter|colo|amazon|aws|google|microsoft|azure|oracle|digitalocean|linode|ovh|aliyun|alibaba|tencent|huawei/.test(text)) {
    type = "云服务 / 机房 IP";
    tags.push("云服务或机房");
    serverLike = true;
    score += 24;
  } else if (/mobile|cmcc|chinamobile|移动|cellular|wireless/.test(text)) {
    type = "移动网络";
    tags.push("移动网络");
    score += 4;
  } else if (/telecom|unicom|broadband|宽带|电信|联通|cable|fiber|dsl/.test(text)) {
    type = "宽带网络";
    tags.push("宽带网络");
    score += 2;
  }

  if (/vpn|proxy|tor|anonymous|privacy|crawler|scraper/.test(text)) {
    tags.push("疑似代理/VPN");
    proxyLike = true;
    score += 34;
  }

  if (/abuse|spam|blacklist|malware|botnet/.test(text)) {
    tags.push("疑似滥用风险");
    abuseLike = true;
    score += 30;
  }

  if (data.asn) tags.push(`ASN${data.asn}`);
  if (!tags.length) tags.push("常规网络");

  return {
    type,
    score: Math.min(95, score),
    tags: uniqueItems(tags),
    serverLike,
    proxyLike,
    abuseLike
  };
}

function statusPill(value) {
  return `<span class="pill${value === "无" ? " gray" : ""}">${escapeHtml(value)}</span>`;
}

function addHistory(data) {
  const label = data.inputLabel || (data.resolvedFromDomain ? `${data.input} -> ${data.resolvedIp}` : data.ip || data.ipAddress || "");
  const existingRows = readHistory();
  const existing = existingRows.find((item) => (item.target || item.ip) === (data.input || data.ip || data.ipAddress || ""));
  const row = {
    ip: data.resolvedIp || data.ip || data.ipAddress || "",
    target: data.input || data.ip || data.ipAddress || "",
    label,
    location: data.locationDetail || data.location || "-",
    coords: data.coords || "",
    favorite: Boolean(existing?.favorite)
  };
  if (!row.target) return;
  const rows = existingRows.filter((item) => (item.target || item.ip) !== row.target);
  rows.unshift(row);
  writeHistory(rows);
}

function toggleHistoryFavorite(target) {
  const rows = readHistory().map((row) => {
    if ((row.target || row.ip) !== target) return row;
    return { ...row, favorite: !row.favorite };
  });
  writeHistory(rows);
}

function removeHistoryItem(target) {
  writeHistory(readHistory().filter((row) => (row.target || row.ip) !== target));
}

function exportBatch(format) {
  const rows = state.lastBatchRows.filter((row) => !row.loading);
  if (!rows.length) {
    mapNote.textContent = "暂无可导出的批量结果。";
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "json") {
    const payload = rows.map((row) => ({
      input: row.input,
      ip: row.ip,
      location: row.location || "",
      coordinates: row.coords || "",
      error: row.error || ""
    }));
    downloadFile(`ipgeosearch-${timestamp}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    return;
  }

  const header = ["input", "ip", "location", "coordinates", "error"];
  const body = rows.map((row) => [row.input, row.ip, row.location || "", row.coords || "", row.error || ""]);
  const csv = [header, ...body].map((items) => items.map(csvCell).join(",")).join("\n");
  downloadFile(`ipgeosearch-${timestamp}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function readHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(rows) ? sortHistory(rows) : [];
  } catch {
    return [];
  }
}

function writeHistory(rows) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(sortHistory(rows).slice(0, MAX_HISTORY)));
  renderHistory();
}

function sortHistory(rows) {
  return [...rows].sort((left, right) => Number(Boolean(right.favorite)) - Number(Boolean(left.favorite)));
}

function formatDnsText(payload) {
  if (!payload || payload.error) return "";
  const lines = [`host: ${payload.host}`, `server: ${payload.server || "-"}`];
  for (const type of ["A", "AAAA", "CNAME", "MX", "NS"]) {
    const values = (payload.records?.[type] || []).map((record) => record.value).join(", ") || "-";
    lines.push(`${type}: ${values}`);
  }
  return lines.join("\n");
}

async function copyText(text, button) {
  if (!text || text === "-") return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const oldText = button.textContent;
  button.textContent = "已复制";
  button.classList.add("copied");
  window.setTimeout(() => {
    button.textContent = oldText;
    button.classList.remove("copied");
  }, 1200);
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function isIpAddress(value) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[0-9a-fA-F:]+$/.test(value) && value.includes(":");
}

function chooseAddress(addresses) {
  return addresses.find((address) => /^(\d{1,3}\.){3}\d{1,3}$/.test(address)) || addresses[0] || "";
}

function clean(value) {
  if (!value || value === "0") return "";
  return String(value).trim();
}

function findResult(payload, source) {
  return (payload.results || []).find((result) => result.source === source && result.ok);
}

function findNetwork(data) {
  const result = { countryCode: "", asn: "", name: "" };
  if (!data) return result;

  for (const row of Object.values(data)) {
    if (!row) continue;
    if (!result.countryCode && row.country_code) result.countryCode = String(row.country_code).toUpperCase();
    if (!result.asn && row.autonomous_system_number) result.asn = String(row.autonomous_system_number);
    if (!result.name && row.autonomous_system_organization) result.name = String(row.autonomous_system_organization);
  }
  return result;
}

function findCoordinates(value) {
  if (!value || typeof value !== "object") return null;
  if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
    return { lat: value.latitude, lon: value.longitude };
  }
  for (const item of Object.values(value)) {
    const result = findCoordinates(item);
    if (result) return result;
  }
  return null;
}

async function loadChinaCoordinates() {
  try {
    const response = await fetch("/static/assets/china-coordinates.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    for (const row of rows) {
      const point = { lat: Number(row.lat), lon: Number(row.lon), level: row.level || "" };
      for (const key of chinaNameKeys(row.name)) state.chinaCoordinates.set(key, point);
    }
  } catch (error) {
    console.warn("China coordinates failed to load", error);
  }
}

function findChinaCoordinate(city, province) {
  for (const name of [city, province]) {
    for (const key of chinaNameKeys(name)) {
      const point = state.chinaCoordinates.get(key);
      if (point) return point;
    }
  }
  return null;
}

function chinaNameKeys(value) {
  const name = clean(value);
  if (!name) return [];
  const keys = new Set([name]);
  for (const item of ["北京", "天津", "上海", "重庆"]) {
    if (name === item || name === `${item}市`) {
      keys.add(item);
      keys.add(`${item}市`);
    }
  }
  for (const suffix of ["省", "市", "自治区", "特别行政区", "地区", "盟"]) {
    if (name.endsWith(suffix)) keys.add(name.slice(0, -suffix.length));
  }
  if (!/[省市区盟]$/.test(name)) {
    keys.add(`${name}市`);
    keys.add(`${name}省`);
  }
  return [...keys].filter(Boolean);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Cannot load ${src}`));
    document.head.appendChild(script);
  });
}

function loadStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
