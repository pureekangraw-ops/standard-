function stationName(value) {
  return String(value || "").trim();
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function cloneStation(value = {}) {
  return Object.freeze({
    station: stationName(value.station),
    status: String(value.status || "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
    active: count(value.active),
    queue: count(value.queue),
    blocked: typeof value.blocked === "boolean" ? value.blocked : null,
    lastUpdate: value.lastUpdate == null ? null : String(value.lastUpdate),
  });
}

function sumKnown(stations, field) {
  return stations.reduce((total, station) => total + (station[field] == null ? 0 : station[field]), 0);
}

export function createTrafficDashboard(snapshot = []) {
  if (!Array.isArray(snapshot)) throw new TypeError("Dashboard Traffic snapshot must be an array");
  const stations = Object.freeze(snapshot.map(cloneStation));
  const overview = Object.freeze({
    stations: stations.length,
    active: sumKnown(stations, "active"),
    queued: sumKnown(stations, "queue"),
    blocked: stations.filter(item => item.blocked === true).length,
    stale: stations.filter(item => item.status === "STALE").length,
    unknown: stations.filter(item => item.status === "UNKNOWN").length,
  });
  return Object.freeze({ overview, stations });
}

export function getTrafficDashboardStation(dashboard = {}, station = "") {
  const id = stationName(station);
  if (!id || !Array.isArray(dashboard?.stations)) return null;
  return dashboard.stations.find(item => item.station === id) || null;
}
