const form = document.querySelector("#searchForm");
const ipInput = document.querySelector("#ipInput");
const statusPill = document.querySelector("#statusPill");
const mapTitle = document.querySelector("#mapTitle");
const mapNote = document.querySelector("#mapNote");
const summaryTitle = document.querySelector("#summaryTitle");
const summaryText = document.querySelector("#summaryText");
const versionValue = document.querySelector("#versionValue");
const countryValue = document.querySelector("#countryValue");
const networkValue = document.querySelector("#networkValue");
const coordValue = document.querySelector("#coordValue");
const detailList = document.querySelector("#detailList");

const COUNTRY_CENTROIDS = {
  US: { lat: 39.5, lon: -98.35, label: "United States" },
  CN: { lat: 35.86, lon: 104.19, label: "China" },
  HK: { lat: 22.32, lon: 114.17, label: "Hong Kong" },
  AU: { lat: -25.27, lon: 133.77, label: "Australia" },
  JP: { lat: 36.2, lon: 138.25, label: "Japan" },
  KR: { lat: 36.5, lon: 127.8, label: "South Korea" },
  IN: { lat: 20.59, lon: 78.96, label: "India" },
  TH: { lat: 15.87, lon: 100.99, label: "Thailand" },
  MY: { lat: 4.21, lon: 101.98, label: "Malaysia" },
  SG: { lat: 1.35, lon: 103.82, label: "Singapore" },
  GB: { lat: 55.38, lon: -3.44, label: "United Kingdom" },
  DE: { lat: 51.16, lon: 10.45, label: "Germany" },
  FR: { lat: 46.23, lon: 2.21, label: "France" },
  CA: { lat: 56.13, lon: -106.35, label: "Canada" },
  BR: { lat: -14.24, lon: -51.92, label: "Brazil" },
  RU: { lat: 61.52, lon: 105.32, label: "Russia" }
};

const state = {
  provider: "osm",
  map: null,
  marker: null
};

window.addEventListener("error", (event) => {
  if (mapNote) mapNote.textContent = `Map error: ${event.message}`;
});

window.addEventListener("unhandledrejection", (event) => {
  if (mapNote) mapNote.textContent = `Map error: ${event.reason?.message || event.reason}`;
});

initMap();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ip = ipInput.value.trim();
  if (!ip) return;

  setBusy(true);
  try {
    const response = await fetch(`/lookup?ip=${encodeURIComponent(ip)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Lookup failed");
    render(payload);
  } catch (error) {
    renderError(error);
  } finally {
    form.querySelector("button").disabled = false;
  }
});

async function initMap() {
  try {
    const config = await fetch("/map-config").then((response) => response.json());
    if (config.provider === "offline" && config.offlineMapAvailable) {
      state.provider = "offline";
      await initOfflineMap();
    } else if (config.provider === "amap" && config.amapKey) {
      state.provider = "amap";
      await initAmap(config.amapKey);
    } else {
      state.provider = "osm";
      await initOsm();
    }
  } catch (error) {
    mapNote.textContent = `Map failed to load: ${error.message}`;
  }
}

async function initOfflineMap() {
  mapCanvas.innerHTML = `
    <svg class="svg-world-map" viewBox="0 0 4096 4096" aria-label="Offline world map">
      <image href="/static/assets/offline-world.svg" width="4096" height="4096"></image>
      <g id="mapMarker" class="svg-map-marker" visibility="hidden">
        <circle r="58" fill="#2563eb" opacity="0.18"></circle>
        <circle r="34" fill="#2563eb" stroke="#ffffff" stroke-width="12"></circle>
      </g>
    </svg>
  `;
  state.map = mapCanvas.querySelector(".svg-world-map");
  state.marker = mapCanvas.querySelector("#mapMarker");
  const chinaCenter = projectToWorldTile(104.19, 35.86);
  focusSvgMap(chinaCenter.x, chinaCenter.y, 920);
  mapNote.textContent = "Offline map is active. Search an IP to locate it.";
}

async function initAmap(key) {
  await loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`);
  state.map = new AMap.Map("mapCanvas", {
    zoom: 2,
    center: [20, 20],
    viewMode: "2D",
    mapStyle: "amap://styles/normal"
  });
  mapNote.textContent = "Amap is active. Search an IP to locate it.";
}

async function initOsm() {
  loadStyle("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
  await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
  state.map = L.map("mapCanvas", {
    center: [20, 20],
    zoom: 2,
    zoomControl: true,
    worldCopyJump: true
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
  mapNote.textContent = "OpenStreetMap is active. Search an IP to locate it.";
}

function setBusy(isBusy) {
  statusPill.textContent = isBusy ? "Searching" : statusPill.textContent;
  form.querySelector("button").disabled = isBusy;
}

function render(payload) {
  const data = normalize(payload);
  summaryTitle.textContent = payload.ip;
  summaryText.textContent = data.location || "No place found";
  mapTitle.textContent = data.countryName || data.countryCode || "Located result";
  statusPill.textContent = "Done";
  versionValue.textContent = `IPv${payload.ip_version}`;
  countryValue.textContent = data.countryCode || "-";
  networkValue.textContent = data.asn ? `AS${data.asn}` : data.isp || "-";
  coordValue.textContent = data.position ? `${data.position.lat.toFixed(2)}, ${data.position.lon.toFixed(2)}` : "-";
  mapNote.textContent = data.mapLabel || "No coordinates";

  renderDetails([
    ["IP", payload.ip],
    ["Place", data.location || "-"],
    ["ASN", data.asn ? `AS${data.asn}` : "-"],
    ["Carrier", data.networkName || data.isp || "-"]
  ]);

  if (data.position) {
    updateMap(data.position.lat, data.position.lon, payload.ip, data.countryCode);
  }
}

function renderError(error) {
  summaryTitle.textContent = "Lookup failed";
  summaryText.textContent = error.message;
  mapTitle.textContent = "No result";
  statusPill.textContent = "Failed";
  versionValue.textContent = "-";
  countryValue.textContent = "-";
  networkValue.textContent = "-";
  coordValue.textContent = "-";
  mapNote.textContent = error.message;
  renderDetails([
    ["IP", ipInput.value.trim() || "-"],
    ["Place", "-"],
    ["ASN", "-"],
    ["Carrier", "-"]
  ]);
}

function updateMap(lat, lon, label, countryCode = "") {
  if (!state.map) return;

  if (state.provider === "offline") {
    const position = projectToWorldTile(lon, lat);
    state.marker.setAttribute("transform", `translate(${position.x.toFixed(1)} ${position.y.toFixed(1)})`);
    state.marker.setAttribute("visibility", "visible");
    focusSvgMap(position.x, position.y, countryCode === "CN" ? 920 : 1450);
    return;
  }

  if (state.provider === "amap") {
    const position = [lon, lat];
    if (!state.marker) {
      state.marker = new AMap.Marker({ position });
      state.map.add(state.marker);
    } else {
      state.marker.setPosition(position);
    }
    state.marker.setLabel({ content: label, direction: "top" });
    state.map.setZoomAndCenter(5, position);
    return;
  }

  const position = [lat, lon];
  if (!state.marker) {
    state.marker = L.marker(position).addTo(state.map);
  } else {
    state.marker.setLatLng(position);
  }
  state.marker.bindPopup(label).openPopup();
  state.map.setView(position, 5);
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
  const centroid = countryCode ? COUNTRY_CENTROIDS[countryCode] : null;
  const position = coordinates || centroid || null;
  const location = [country, province, city].filter(Boolean).join(" / ");

  return {
    location,
    isp,
    asn: network.asn,
    networkName: network.name,
    countryCode,
    countryName: centroid?.label || country,
    position,
    mapLabel: position
      ? `${countryCode || "IP"} - ${coordinates ? "exact coordinates" : "country-level location"}`
      : "No coordinates"
  };
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
    if (!result.countryCode && row.country_code) {
      result.countryCode = String(row.country_code).toUpperCase();
    }
    if (!result.asn && row.autonomous_system_number) {
      result.asn = String(row.autonomous_system_number);
    }
    if (!result.name && row.autonomous_system_organization) {
      result.name = String(row.autonomous_system_organization);
    }
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

function projectToWorldTile(lon, lat) {
  const boundedLat = Math.max(-85.051129, Math.min(85.051129, lat));
  const x = ((lon + 180) / 360) * 4096;
  const latRad = boundedLat * Math.PI / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (1 - mercator / Math.PI) / 2 * 4096;
  return { x, y };
}

function focusSvgMap(x, y, size = 1450) {
  const minX = Math.max(0, Math.min(4096 - size, x - size / 2));
  const minY = Math.max(0, Math.min(4096 - size, y - size / 2));
  state.map.setAttribute("viewBox", `${minX.toFixed(1)} ${minY.toFixed(1)} ${size} ${size}`);
}

function renderDetails(rows) {
  detailList.innerHTML = rows
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
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
