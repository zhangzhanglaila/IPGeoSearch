const form = document.querySelector("#searchForm");
const ipInput = document.querySelector("#ipInput");
const singleModeButton = document.querySelector("#singleModeButton");
const batchModeButton = document.querySelector("#batchModeButton");
const apiKeyButton = document.querySelector("#apiKeyButton");
const themeToggleButton = document.querySelector("#themeToggleButton");
const multiTools = document.querySelector("#multiTools");
const batchInput = document.querySelector("#batchInput");
const batchButton = document.querySelector("#batchButton");
const batchFileInput = document.querySelector("#batchFileInput");
const batchFilter = document.querySelector("#batchFilter");
const retryFailedButton = document.querySelector("#retryFailedButton");
const heatmapToggleButton = document.querySelector("#heatmapToggleButton");
const lineToggleButton = document.querySelector("#lineToggleButton");
const clearBatchButton = document.querySelector("#clearBatchButton");
const copyBatchButton = document.querySelector("#copyBatchButton");
const exportCsvButton = document.querySelector("#exportCsvButton");
const exportJsonButton = document.querySelector("#exportJsonButton");
const batchResults = document.querySelector("#batchResults");
const batchStats = document.querySelector("#batchStats");
const historyList = document.querySelector("#historyList");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const copyDnsButton = document.querySelector("#copyDnsButton");
const dnsResults = document.querySelector("#dnsResults");
const copyIntelButton = document.querySelector("#copyIntelButton");
const intelResults = document.querySelector("#intelResults");
const ipv4Label = document.querySelector("#ipv4Label");
const ipv6Label = document.querySelector("#ipv6Label");
const ipv4Value = document.querySelector("#ipv4Value");
const ipv6Value = document.querySelector("#ipv6Value");
const basicIp = document.querySelector("#basicIp");
const basicLocation = document.querySelector("#basicLocation");
const basicAsn = document.querySelector("#basicAsn");
const basicIsp = document.querySelector("#basicIsp");
const basicIpType = document.querySelector("#basicIpType");
const basicCoords = document.querySelector("#basicCoords");
const riskScore = document.querySelector("#riskScore");
const riskNeedle = document.querySelector("#riskNeedle");
const riskSummary = document.querySelector("#riskSummary");
const riskTags = document.querySelector("#riskTags");
const analysisBody = document.querySelector("#analysisBody");
const mapNote = document.querySelector("#mapNote");

const HISTORY_KEY = "ipgeosearch.history";
const THEME_KEY = "ipgeosearch.theme";
const API_KEY_STORAGE = "ipgeosearch.apiKey";
const MAX_HISTORY = 8;
const MAP_POPUP_OPTIONS = { autoPan: false, keepInView: false };
const MAP_LABEL_OPTIONS = {
  permanent: true,
  direction: "top",
  offset: [0, -18],
  className: "map-label-tooltip"
};
const MAP_WORLD_COPY_OFFSETS = [-1440, -1080, -720, -360, 0, 360, 720, 1080, 1440];

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
  heatLayer: null,
  chinaCoordinates: new Map(),
  chinaCoordinatesReady: null,
  mapReady: null,
  connectBatchPoints: false,
  showHeatmap: false,
  autoQuery: false,
  lastBatchRows: [],
  lastDns: null,
  lastIntelText: ""
};

state.chinaCoordinatesReady = loadChinaCoordinates();
state.mapReady = initMap();
applyTheme(readTheme());
renderAnalysis();
renderHistory();

singleModeButton.addEventListener("click", () => setMode("single"));
batchModeButton.addEventListener("click", () => setMode("batch"));
apiKeyButton.addEventListener("click", () => {
  const current = localStorage.getItem(API_KEY_STORAGE) || "";
  const next = window.prompt("输入 API Key；留空并确认可清除。", current);
  if (next === null) return;
  if (next.trim()) {
    localStorage.setItem(API_KEY_STORAGE, next.trim());
    mapNote.textContent = "API Key 已保存到当前浏览器。";
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
    mapNote.textContent = "API Key 已清除。";
  }
});
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
  const shouldScrollResult = !state.autoQuery;
  form.querySelector("button").disabled = true;
  mapNote.textContent = "正在查询 IP 信息...";
  try {
    const { payload, data } = await lookupTarget(ip);
    await Promise.all([state.chinaCoordinatesReady, state.mapReady]);
    if (requestMode !== state.mode) return;
    render(payload, data);
    addHistory(data);
    if (shouldScrollResult) scrollResultIntoView();
  } catch (error) {
    if (requestMode !== state.mode) return;
    renderError(error);
    if (shouldScrollResult) scrollResultIntoView();
  } finally {
    form.querySelector("button").disabled = false;
  }
});

batchButton.addEventListener("click", runBatchLookup);

batchFilter.addEventListener("change", () => {
  renderCurrentBatchView();
});

batchFileInput.addEventListener("change", async () => {
  const file = batchFileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  addTargetsToBatchInput(parseTargets(text));
  batchFileInput.value = "";
});

retryFailedButton.addEventListener("click", () => {
  const failedTargets = uniqueItems(state.lastBatchRows.filter((row) => row.error).map((row) => row.input).filter(Boolean));
  if (!failedTargets.length) {
    mapNote.textContent = "当前没有失败结果需要重试。";
    return;
  }
  batchInput.value = failedTargets.join("\n");
  runBatchLookup();
});

heatmapToggleButton.addEventListener("click", () => {
  state.showHeatmap = !state.showHeatmap;
  updateHeatmapToggle();
  renderCurrentBatchView();
});

lineToggleButton.addEventListener("click", () => {
  state.connectBatchPoints = !state.connectBatchPoints;
  updateLineToggle();
  const locatedRows = currentBatchRows().filter((row) => row.position);
  if (locatedRows.length) updateMapMany(locatedRows);
  if (state.connectBatchPoints && locatedRows.length < 2) {
    mapNote.textContent = "至少需要两个已定位结果才能连线。";
  }
});

clearBatchButton.addEventListener("click", () => {
  batchInput.value = "";
  state.lastBatchRows = [];
  state.markerLayer?.clearLayers();
  renderBatchStats([]);
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
    if (state.mode === "batch") {
      addTargetToBatchInput(target);
      return;
    }
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

copyIntelButton.addEventListener("click", async () => {
  await copyText(state.lastIntelText, copyIntelButton);
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
  state.autoQuery = true;
  form.requestSubmit();
  state.autoQuery = false;
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
  const result = await lookupIp(resolved.ip, resolved);
  const [dns, intel, rdap, probe] = await Promise.all([
    resolved.resolved ? lookupDns(resolved.input).catch((error) => ({ error: error.message })) : Promise.resolve(null),
    lookupIntel(resolved.ip).catch((error) => ({ error: error.message })),
    lookupRdap(resolved.ip).catch((error) => ({ error: error.message })),
    lookupProbe(resolved.input).catch((error) => ({ error: error.message }))
  ]);
  result.data.dns = dns;
  result.data.intel = intel;
  result.data.rdap = rdap;
  result.data.probe = probe;
  applyIntelRisk(result.data);
  return result;
}

async function lookupIp(ip, resolved = { input: ip, ip, addresses: [ip], resolved: false }) {
  const response = await apiFetch(`/lookup?ip=${encodeURIComponent(ip)}`);
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

  const response = await apiFetch(`/resolve?host=${encodeURIComponent(target)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "域名解析失败");
  const ip = chooseAddress(payload.addresses || []);
  if (!ip) throw new Error("域名没有可查询的 IP");
  return { input: target, ip, addresses: payload.addresses || [ip], resolved: true };
}

async function lookupDns(host) {
  const response = await apiFetch(`/dns?host=${encodeURIComponent(host)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "DNS 查询失败");
  return payload;
}

async function lookupIntel(ip) {
  const response = await apiFetch(`/intel?ip=${encodeURIComponent(ip)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "网络情报查询失败");
  return payload;
}

async function lookupRdap(ip) {
  const response = await apiFetch(`/rdap?ip=${encodeURIComponent(ip)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "RDAP 查询失败");
  return payload;
}

async function lookupProbe(target) {
  const response = await apiFetch(`/probe?target=${encodeURIComponent(target)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "连通性检测失败");
  return payload;
}

function apiFetch(url, options = {}) {
  const apiKey = localStorage.getItem(API_KEY_STORAGE) || "";
  const headers = new Headers(options.headers || {});
  if (apiKey) headers.set("X-API-Key", apiKey);
  return fetch(url, { ...options, headers });
}

async function runBatchLookup() {
  const parsedTargets = parseTargets(batchInput.value);
  const targets = parsedTargets.unique.slice(0, 50);
  if (!targets.length) {
    renderBatchStats([]);
    renderBatchResults([]);
    mapNote.textContent = "请输入要批量查询的 IP。";
    return;
  }

  batchButton.disabled = true;
  mapNote.textContent = `正在批量查询 ${targets.length} 个目标...`;
  renderBatchStats([], parsedTargets);
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
    renderCurrentBatchView(parsedTargets);
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
    loadScript("https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js").catch((error) => {
      console.warn("Leaflet heat failed to load", error);
    });
    state.map = L.map("mapCanvas", {
      center: [30.65, 114.32],
      zoom: 7,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true
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
  ipv4Label.textContent = "查询 IPv4 地址";
  ipv6Label.textContent = "查询 IPv6 地址";
  ipv4Value.textContent = payload.ip_version === 4 ? payload.ip : "-";
  ipv6Value.textContent = payload.ip_version === 6 ? payload.ip : "未检测到 IPv6";
  basicIp.textContent = data.resolvedFromDomain ? `${data.input} -> ${payload.ip}` : payload.ip;
  basicLocation.textContent = data.locationDetail || data.location || "-";
  basicAsn.textContent = data.asn ? `ASN${data.asn}` : "-";
  basicIsp.textContent = data.isp || data.networkName || "-";
  basicIpType.textContent = data.ipType || "-";
  basicCoords.textContent = data.position ? `${data.position.lon.toFixed(6)}, ${data.position.lat.toFixed(6)}` : "-";
  renderRisk(data);
  renderAnalysis(data);
  renderDns(data.dns);
  renderIntel(data);

  if (data.position) {
    updateMap(data.position.lat, data.position.lon, mapPopupHtml(data), mapMarkerLabel(data));
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
  renderIntel(null);
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

function renderBatchStats(rows, parsed = null) {
  if (!batchStats) return;
  if (!rows.length && !parsed) {
    batchStats.innerHTML = "";
    return;
  }
  const totalInput = parsed?.rawCount ?? rows.length;
  const uniqueCount = parsed?.unique?.length ?? uniqueItems(rows.map((row) => row.input)).length;
  const deduped = Math.max(0, totalInput - uniqueCount);
  const located = rows.filter((row) => row.position).length;
  const failed = rows.filter((row) => row.error).length;
  const topLocations = topValues(rows.map((row) => row.location).filter((value) => value && value !== "-")).slice(0, 4);
  batchStats.innerHTML = `
    <span>输入 ${totalInput}</span>
    <span>去重后 ${uniqueCount}</span>
    <span>已定位 ${located}</span>
    <span>失败 ${failed}</span>
    ${deduped ? `<span>已去重 ${deduped}</span>` : ""}
    ${topLocations.length ? `<strong>位置摘要：${topLocations.map((item) => `${escapeHtml(item.value)} ${item.count}`).join(" / ")}</strong>` : ""}
  `;
}

function renderCurrentBatchView(parsed = null) {
  const rows = currentBatchRows();
  renderBatchStats(rows, parsed);
  renderBatchResults(rows);
  const locatedRows = rows.filter((row) => row.position);
  if (locatedRows.length) {
    updateMapMany(locatedRows);
  } else if (state.markerLayer) {
    state.markerLayer.clearLayers();
  }
}

function currentBatchRows() {
  const filter = batchFilter?.value || "all";
  return state.lastBatchRows.filter((row) => {
    if (filter === "located") return Boolean(row.position);
    if (filter === "failed") return Boolean(row.error);
    if (filter === "highRisk") return Number(row.riskScore) >= 45;
    if (filter === "hosting") return /机房|云服务|CDN|边缘/.test(row.ipType || "");
    return true;
  });
}

function updateHeatmapToggle() {
  heatmapToggleButton.classList.toggle("active", state.showHeatmap);
  heatmapToggleButton.textContent = state.showHeatmap ? "隐藏热力图" : "热力图";
  heatmapToggleButton.setAttribute("aria-pressed", String(state.showHeatmap));
}

function parseTargets(text) {
  const raw = text
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return { rawCount: raw.length, unique: uniqueItems(raw) };
}

function addTargetsToBatchInput(targets) {
  const rows = uniqueItems([
    ...parseTargets(batchInput.value).unique,
    ...targets
  ]);
  batchInput.value = rows.join("\n");
  renderBatchStats([], { rawCount: rows.length, unique: rows });
  mapNote.textContent = `已加入 ${targets.length} 个目标，点击“批量定位”开始查询。`;
}

function topValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
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

function renderIntel(data) {
  if (!data) {
    state.lastIntelText = "";
    intelResults.innerHTML = `<div class="intel-empty">查询后显示 RDAP、反向 DNS、DNSBL、代理/VPN/机房判断和端口连通性。</div>`;
    return;
  }

  const intel = data.intel || {};
  const rdap = data.rdap || {};
  const probe = data.probe || {};
  const privacy = intel.privacy || {};
  const flags = privacy.flags || {};
  const rdapInfo = rdap.rdap || {};
  const reverseDns = intel.reverseDns || {};
  const dnsbl = intel.dnsbl || {};
  const probeRows = Array.isArray(probe.results) ? probe.results : [];
  const dnsblMatches = Array.isArray(dnsbl.matches) ? dnsbl.matches : [];
  const rdapEntities = Array.isArray(rdapInfo.entities) ? rdapInfo.entities : [];

  const cards = [
    intelCard("代理/VPN/机房", [
      ["综合判断", privacy.summary || "-"],
      ["风险分", Number.isFinite(privacy.score) ? `${privacy.score}分` : "-"],
      ["标签", (privacy.tags || []).join("、") || "-"],
      ["代理/VPN/Tor", flags.proxy ? "疑似" : "未命中"],
      ["云服务/机房", flags.hosting ? "疑似" : "未命中"],
      ["CDN", flags.cdn ? "疑似" : "未命中"]
    ]),
    intelCard("反向 DNS", [
      ["主机名", reverseDns.hostname || reverseDns.error || "-"],
      ["别名", (reverseDns.aliases || []).join("、") || "-"]
    ]),
    intelCard("DNSBL 黑名单", [
      ["检测状态", dnsbl.checked ? "已检测" : dnsbl.reason || "未检测"],
      ["命中数量", String(dnsblMatches.length)],
      ["命中来源", dnsblMatches.map((item) => item.zone).join("、") || "-"]
    ]),
    intelCard("RDAP / WHOIS", [
      ["机构", rdapInfo.name || rdapInfo.handle || rdap.error || rdap.reason || "-"],
      ["国家", rdapInfo.country || "-"],
      ["地址段", [rdapInfo.startAddress, rdapInfo.endAddress].filter(Boolean).join(" - ") || "-"],
      ["联系人", rdapEntities.map((item) => item.name || item.email).filter(Boolean).join("、") || "-"]
    ]),
    intelCard("连通性检测", probeRows.length
      ? probeRows.map((row) => [`端口 ${row.port}`, row.open ? `开放 / ${row.latencyMs}ms` : `关闭或超时 / ${row.latencyMs}ms`])
      : [["状态", probe.error || "-"]])
  ];

  intelResults.innerHTML = cards.join("");
  state.lastIntelText = formatIntelText(data);
}

function intelCard(title, rows) {
  return `
    <article class="intel-card">
      <strong>${escapeHtml(title)}</strong>
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <b>${escapeHtml(value || "-")}</b>
        </div>
      `).join("")}
    </article>
  `;
}

function applyIntelRisk(data) {
  const privacy = data.intel?.privacy;
  if (!privacy) return;
  if (Number.isFinite(privacy.score)) {
    data.riskScore = Math.max(Number(data.riskScore) || 0, privacy.score);
  }
  data.riskTags = uniqueItems([...(data.riskTags || []), ...(privacy.tags || [])]);
  data.proxyLike = Boolean(data.proxyLike || privacy.flags?.proxy);
  data.isServerLike = Boolean(data.isServerLike || privacy.flags?.hosting || privacy.flags?.cdn);
  data.abuseLike = Boolean(data.abuseLike || privacy.flags?.dnsblListed);
  if (privacy.flags?.hosting) data.ipType = "云服务 / 机房 IP";
  if (privacy.flags?.cdn) data.ipType = "CDN / 边缘网络";
}

function updateMap(lat, lon, popupHtml, label) {
  if (!state.map || !window.L) return;
  state.markerLayer?.clearLayers();
  const position = [lat, lon];
  state.marker = addMapMarkerCopies(lat, lon, popupHtml, label || "IP 位置").primaryMarker;
  state.marker?.openPopup();
  state.map.setView(position, 8, { animate: false });
}

function updateMapMany(rows) {
  if (!state.map || !window.L || !rows.length) return;
  state.markerLayer?.clearLayers();
  const bounds = [];
  const routePoints = [];
  const groups = groupRowsByPosition(rows);
  for (const group of groups) {
    const first = group.rows[0];
    const position = [first.position.lat, first.position.lon];
    bounds.push(position);
    addMapMarkerCopies(first.position.lat, first.position.lon, mapGroupPopupHtml(group.rows), mapGroupMarkerLabel(group.rows));
  }
  for (const row of rows) {
    const position = [row.position.lat, row.position.lon];
    routePoints.push(position);
  }
  if (state.connectBatchPoints && routePoints.length > 1) {
    addRouteLineCopies(routePoints);
  }
  if (state.showHeatmap) {
    addHeatmapLayer(rows);
  }
  if (bounds.length === 1) {
    state.map.setView(bounds[0], 8, { animate: false });
  } else {
    state.map.fitBounds(bounds, { padding: [70, 70], maxZoom: 8, animate: false });
    state.map.panTo(bounds[0], { animate: false });
  }
}

function addHeatmapLayer(rows) {
  const points = rows
    .filter((row) => row.position)
    .map((row) => [row.position.lat, row.position.lon, heatIntensity(row)]);
  if (!points.length || !state.map || !window.L) return;

  if (typeof L.heatLayer === "function") {
    L.heatLayer(points, {
      radius: 34,
      blur: 24,
      minOpacity: 0.28,
      gradient: { 0.2: "#30d5c8", 0.45: "#ffd95a", 0.7: "#ff7ab6", 1: "#ff4f5e" }
    }).addTo(state.markerLayer || state.map);
    return;
  }

  for (const row of rows) {
    if (!row.position) continue;
    L.circleMarker([row.position.lat, row.position.lon], {
      radius: 24 + heatIntensity(row) * 18,
      stroke: false,
      fillColor: "#ff4f9a",
      fillOpacity: 0.22
    }).addTo(state.markerLayer || state.map);
  }
}

function heatIntensity(row) {
  const score = Number(row.riskScore) || 0;
  return Math.max(0.35, Math.min(1, 0.35 + score / 100));
}

function groupRowsByPosition(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.position) continue;
    const key = `${row.position.lat.toFixed(5)},${row.position.lon.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((groupRows) => ({ rows: groupRows }));
}

function addMapMarkerCopies(lat, lon, popupHtml, label) {
  let primaryMarker = null;
  for (const offset of MAP_WORLD_COPY_OFFSETS) {
    const marker = L.marker([lat, lon + offset])
      .addTo(state.markerLayer || state.map)
      .bindPopup(popupHtml, MAP_POPUP_OPTIONS)
      .bindTooltip(escapeHtml(label || "IP 位置"), MAP_LABEL_OPTIONS);
    marker.ipGeoPrimaryLon = lon;
    marker.ipGeoPrimaryLat = lat;
    if (offset === 0) primaryMarker = marker;
  }
  return { primaryMarker };
}

function addRouteLineCopies(routePoints) {
  for (const offset of MAP_WORLD_COPY_OFFSETS) {
    L.polyline(routePoints.map(([lat, lon]) => [lat, lon + offset]), {
      color: "#ff4f9a",
      weight: 4,
      opacity: 0.88,
      dashArray: "10 8"
    }).addTo(state.markerLayer || state.map);
  }
}

function focusBatchRow(row) {
  if (!state.map || !window.L || !row.position) return;
  const position = [row.position.lat, row.position.lon];
  state.map.setView(position, 8, { animate: false });
  state.markerLayer?.eachLayer((layer) => {
    const point = layer.getLatLng?.();
    if (!point) return;
    const primaryLat = layer.ipGeoPrimaryLat ?? point.lat;
    const primaryLon = layer.ipGeoPrimaryLon ?? point.lng;
    if (Math.abs(primaryLat - row.position.lat) < 0.000001 && Math.abs(primaryLon - row.position.lon) < 0.000001) {
      layer.openPopup(point);
    }
  });
  mapNote.textContent = `${row.inputLabel || row.ip} - 已在地图中定位。`;
}

function scrollMapIntoView() {
  document.querySelector(".map-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollResultIntoView() {
  const panel = document.querySelector("#resultPanel");
  if (!panel) return;
  const top = panel.getBoundingClientRect().top + window.scrollY - 76;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

function updateLineToggle() {
  lineToggleButton.classList.toggle("active", state.connectBatchPoints);
  lineToggleButton.textContent = state.connectBatchPoints ? "隐藏连线" : "连线显示";
  lineToggleButton.setAttribute("aria-pressed", String(state.connectBatchPoints));
}

function addTargetToBatchInput(target) {
  if (!target) return;
  addTargetsToBatchInput([target]);
  batchInput.focus();
  mapNote.textContent = `${target} 已加入批量输入框，点击“批量定位”开始查询。`;
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

function mapGroupPopupHtml(rows) {
  if (rows.length === 1) return mapPopupHtml(rows[0]);
  const first = rows[0];
  const location = first.locationDetail || first.location || first.countryName || "-";
  const coords = first.coords || (first.position ? `${first.position.lon.toFixed(6)}, ${first.position.lat.toFixed(6)}` : "-");
  const items = rows.slice(0, 12).map((row) => `<li>${escapeHtml(row.inputLabel || row.ip || row.input || "-")}</li>`).join("");
  const more = rows.length > 12 ? `<li>还有 ${rows.length - 12} 个结果...</li>` : "";
  return `
    <div class="map-popup map-popup-group">
      <strong>${rows.length} 个结果位于此处</strong>
      <span>位置：${escapeHtml(location)}</span>
      <span>坐标：${escapeHtml(coords)}</span>
      <ul>${items}${more}</ul>
    </div>
  `;
}

function mapMarkerLabel(row) {
  return row.inputLabel || (row.resolvedFromDomain ? `${row.input} -> ${row.resolvedIp}` : row.ip) || "IP 位置";
}

function mapGroupMarkerLabel(rows) {
  if (rows.length === 1) return mapMarkerLabel(rows[0]);
  const first = rows[0];
  return `${rows.length} 个结果：${first.location || first.inputLabel || first.ip}`;
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
      ipType: row.ipType || "",
      riskScore: row.riskScore ?? "",
      asn: row.asn || "",
      isp: row.isp || "",
      error: row.error || ""
    }));
    downloadFile(`ipgeosearch-${timestamp}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    return;
  }

  const header = ["input", "ip", "location", "coordinates", "ip_type", "risk_score", "asn", "isp", "error"];
  const body = rows.map((row) => [
    row.input,
    row.ip,
    row.location || "",
    row.coords || "",
    row.ipType || "",
    row.riskScore ?? "",
    row.asn || "",
    row.isp || "",
    row.error || ""
  ]);
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

function formatIntelText(data) {
  if (!data) return "";
  const intel = data.intel || {};
  const privacy = intel.privacy || {};
  const rdap = data.rdap?.rdap || {};
  const reverseDns = intel.reverseDns || {};
  const dnsbl = intel.dnsbl || {};
  const probeRows = data.probe?.results || [];
  return [
    `target: ${data.input || data.ip || "-"}`,
    `ip: ${data.resolvedIp || data.ip || "-"}`,
    `risk: ${privacy.summary || "-"} ${Number.isFinite(privacy.score) ? `${privacy.score}分` : ""}`.trim(),
    `tags: ${(privacy.tags || []).join(", ") || "-"}`,
    `reverse_dns: ${reverseDns.hostname || "-"}`,
    `dnsbl: ${(dnsbl.matches || []).map((item) => item.zone).join(", ") || "no match"}`,
    `rdap: ${rdap.name || rdap.handle || "-"}`,
    `rdap_range: ${[rdap.startAddress, rdap.endAddress].filter(Boolean).join(" - ") || "-"}`,
    `probe: ${probeRows.map((row) => `${row.port}:${row.open ? "open" : "closed"}:${row.latencyMs}ms`).join(", ") || "-"}`
  ].join("\n");
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
