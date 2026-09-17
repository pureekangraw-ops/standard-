import { createTrafficSummary } from "./go-hub-traffic.js";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function frozenLane(lane = {}) {
  return Object.freeze({
    active: lane?.active == null ? null : Object.freeze(clone(lane.active)),
    queue: Object.freeze(Array.isArray(lane?.queue) ? clone(lane.queue) : []),
  });
}

function laneBlocked(lane = {}) {
  const active = lane?.active;
  if (!active) return false;
  const riskStatus = String(active?.risk?.status || "SAFE").trim().toUpperCase();
  const reasons = Array.isArray(active?.risk?.reasons) ? active.risk.reasons.filter(Boolean) : [];
  return riskStatus !== "SAFE" || reasons.length > 0;
}

export function createFactoryStationMonitor({ state = {}, repository = "", lastUpdate } = {}) {
  const repositoryName = String(repository || "").trim();
  if (!repositoryName) throw new Error("Factory monitor repository is required");
  const repositoryState = state?.repositories?.[repositoryName] || {};
  const assembly = frozenLane(repositoryState.assembly);
  const merge = frozenLane(repositoryState.merge);
  const active = Number(Boolean(assembly.active)) + Number(Boolean(merge.active));
  const queue = assembly.queue.length + merge.queue.length;
  const blocked = laneBlocked(repositoryState.assembly) || laneBlocked(repositoryState.merge);
  const status = blocked ? "ERROR" : (active > 0 || queue > 0 ? "BUSY" : "NORMAL");

  return Object.freeze({
    station: "factory",
    assembly,
    merge,
    traffic: createTrafficSummary({ station: "factory", status, active, queue, blocked, lastUpdate }),
  });
}

function libraryStatus(result = {}) {
  const status = String(result?.status || "").trim().toUpperCase();
  const waitReason = String(result?.waitReason || "").trim().toUpperCase();
  const records = Array.isArray(result?.records) ? result.records : [];
  if (status === "CONFLICT" || waitReason === "CONFLICT") return "CONFLICT";
  if (status === "PASS") return records.length > 0 ? "MATCH" : "NO_MATCH";
  if (waitReason === "NO_MATCH") return "NO_MATCH";
  return "UNKNOWN";
}

export function createLibraryStationMonitor({ query = "", result = {} } = {}) {
  const records = Array.isArray(result?.records) ? result.records : [];
  const status = libraryStatus(result);
  return Object.freeze({
    station: "library",
    query: String(query || ""),
    status,
    matches: records.length,
    conflict: status === "CONFLICT",
    source: result?.evidence == null ? null : clone(result.evidence),
  });
}

export function createLibraryTrafficSummary({ monitor = {}, lastUpdate } = {}) {
  const state = String(monitor?.status || "UNKNOWN").trim().toUpperCase();
  const status = state === "CONFLICT" ? "ERROR" : state === "UNKNOWN" ? "UNKNOWN" : "NORMAL";
  return createTrafficSummary({
    station: "library",
    status,
    active: null,
    queue: null,
    blocked: null,
    lastUpdate,
  });
}

export function createVerificationStationMonitor({ checking = false, report = null } = {}) {
  if (checking) {
    return Object.freeze({ station: "verification", status: "CHECKING", reason: null, evidence: Object.freeze([]) });
  }
  const rawStatus = String(report?.status || "UNKNOWN").trim().toUpperCase();
  const status = new Set(["PASS", "FAIL", "UNKNOWN"]).has(rawStatus) ? rawStatus : "UNKNOWN";
  const evidence = Array.isArray(report?.evidence) ? clone(report.evidence) : [];
  return Object.freeze({
    station: "verification",
    status,
    reason: report?.reason == null ? null : String(report.reason),
    evidence: Object.freeze(evidence),
  });
}

export function createVerificationTrafficSummary({ monitor = {}, lastUpdate } = {}) {
  const state = String(monitor?.status || "UNKNOWN").trim().toUpperCase();
  const status = state === "CHECKING" ? "BUSY" : state === "PASS" ? "NORMAL" : state === "FAIL" ? "ERROR" : "UNKNOWN";
  return createTrafficSummary({
    station: "verification",
    status,
    active: null,
    queue: null,
    blocked: null,
    lastUpdate,
  });
}
