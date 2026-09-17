function stationName(value) {
  return String(value || "").trim();
}

function cloneStation(value = {}) {
  return Object.freeze({
    station: stationName(value.station),
    activity: String(value.activity || "UNKNOWN"),
    queue: value.queue == null ? null : Number(value.queue),
    blocker: String(value.blocker || "").trim() || null,
    updatedAt: value.updatedAt == null ? null : String(value.updatedAt),
    freshness: String(value.freshness || "UNKNOWN").toUpperCase(),
  });
}

export function createTrafficDashboard(snapshot = []) {
  if (!Array.isArray(snapshot)) throw new TypeError("Dashboard Traffic snapshot must be an array");
  const stations = Object.freeze(snapshot.map(cloneStation));
  const overview = Object.freeze({
    stations: stations.length,
    current: stations.filter(item => item.freshness === "CURRENT").length,
    stale: stations.filter(item => item.freshness === "STALE").length,
    unknown: stations.filter(item => item.freshness === "UNKNOWN").length,
    blocked: stations.filter(item => item.blocker !== null).length,
  });
  return Object.freeze({ overview, stations });
}

export function getTrafficDashboardStation(dashboard = {}, station = "") {
  const id = stationName(station);
  if (!id || !Array.isArray(dashboard?.stations)) return null;
  return dashboard.stations.find(item => item.station === id) || null;
}
