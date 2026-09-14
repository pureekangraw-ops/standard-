import { createReturnPacket } from "./go-hub-centre.js";

export const MIMIR_DESTINATION = "destination://mimir";

const PASS = "PASS";
const WAIT = "WAIT";

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function snapshot(value) {
  return freeze(structuredClone(value));
}

function validAccess(access) {
  if (!access || access.destination !== MIMIR_DESTINATION) {
    throw new Error("MIMIR destination access is required");
  }
  const envelope = access.envelope;
  if (!envelope || envelope.workId !== access.workId ||
      envelope.checkpointId !== access.checkpointId ||
      envelope.returnAddress !== access.returnAddress) {
    throw new Error("MIMIR access envelope identity does not match Centre");
  }
  return envelope;
}

function normalizeRecords(value) {
  if (!Array.isArray(value)) throw new Error("MIMIR search must return a records array");
  return value.map(record => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("MIMIR search record must be an object");
    }
    return structuredClone(record);
  });
}

function normalizedSearchResult(value) {
  if (Array.isArray(value)) {
    const records = normalizeRecords(value);
    return {
      status: records.length ? PASS : WAIT,
      waitReason: records.length ? null : "NO_MATCH",
      records,
      route: null,
      evidence: null,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MIMIR search must return records or a catalog result");
  }
  const records = normalizeRecords(value.records);
  const status = String(value.status || "").toUpperCase();
  if (status !== PASS && status !== WAIT) {
    throw new Error("MIMIR catalog result status must be PASS or WAIT");
  }
  if (status === WAIT && !String(value.waitReason || "").trim()) {
    throw new Error("MIMIR WAIT requires an explicit reason");
  }
  return {
    status,
    waitReason: status === WAIT ? String(value.waitReason) : null,
    records,
    route: status === PASS ? String(value.route || "").trim() || null : null,
    evidence: value.evidence == null ? null : structuredClone(value.evidence),
  };
}

function text(value) {
  return Array.isArray(value) ? value.join(" ") : String(value ?? "");
}

function first(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function normalizeCatalogRecord(record) {
  const name = first(record, ["name", "ชื่อ"]);
  return {
    id: String(first(record, ["id", "url"]) || name || ""),
    name: text(name).trim(),
    type: text(first(record, ["type", "ประเภท"])).trim(),
    capability: text(first(record, ["capability", "คุณสมบัติ", "หน้าที่"])).trim(),
    surface: text(first(record, ["surface", "Where / Surface"])).trim(),
    availability: text(first(record, ["availability", "สถานะปัจจุบัน", "สถานะ"])).trim(),
    readiness: text(first(record, ["readiness", "สถานะ"])).trim(),
    permission: text(first(record, ["permission", "Permission"])).trim(),
    callableExposure: text(first(record, [
      "callableExposure",
      "Callable Action / Tool Exposure",
    ])).trim(),
    route: text(first(record, ["route", "Route", "วิธีใช้"])).trim(),
    rating: text(first(record, ["rating", "GO Rating"])).trim(),
    constraints: text(first(record, [
      "constraints",
      "ข้อจำกัด / ข้อควรระวัง",
      "ข้อควรระวัง",
    ])).trim(),
    verifiedAt: first(record, ["verifiedAt", "date:Verified Date:start"]),
    modifiedAt: first(record, ["modifiedAt", "date:Modified Date:start"]),
    source: String(first(record, ["source", "url"]) || ""),
  };
}

function recordText(record) {
  return [
    record.name,
    record.type,
    record.capability,
    record.surface,
    record.route,
    record.constraints,
  ].join(" ").toLowerCase();
}

function queryTerms(query) {
  return [query.task, query.requestedResult, query.lensReference]
    .map(text)
    .join(" ")
    .toLowerCase()
    .split(/[\s/→,:;()[\]{}]+/)
    .map(term => term.trim())
    .filter(term => term.length > 1);
}

function relevance(record, terms) {
  const haystack = recordText(record);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function gate(record) {
  const availability = record.availability.toLowerCase();
  const readiness = record.readiness.toLowerCase();
  const permission = record.permission.toLowerCase();
  const callable = record.callableExposure.toLowerCase();

  if (["blocked", "unavailable", "disconnected", "retired", "not found"].includes(availability)) {
    return { status: WAIT, reason: "UNAVAILABLE" };
  }
  if (readiness === "ใช้ไม่ได้ในแชทนี้") {
    return { status: WAIT, reason: "UNAVAILABLE" };
  }
  if (permission === "blocked") return { status: WAIT, reason: "BLOCKED" };
  if (permission === "requires approval") return { status: WAIT, reason: "NEED_AUTHORITY" };
  if (callable === "missing") return { status: WAIT, reason: "MISSING_CALLABLE_ACTION" };
  if (!record.permission || !record.callableExposure ||
      !record.availability || !record.verifiedAt) {
    return { status: WAIT, reason: "MISSING_DECISION_CRITICAL_FIELD" };
  }
  if (permission !== "allowed" || callable !== "available" ||
      !["active", "available"].includes(availability)) {
    return { status: WAIT, reason: "UNKNOWN" };
  }
  return { status: PASS, reason: null };
}

function numericRating(value) {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : -1;
}

export function createMimirCatalogSearchPort({ readCatalog } = {}) {
  if (typeof readCatalog !== "function") {
    throw new TypeError("MIMIR catalog reader is required");
  }

  return async function searchCatalog(query = {}) {
    const sourceRows = await readCatalog();
    const records = normalizeRecords(sourceRows).map(normalizeCatalogRecord);
    const terms = queryTerms(query);
    const candidates = records
      .map(record => ({ record, score: relevance(record, terms), gate: gate(record) }))
      .filter(candidate => candidate.score > 0);

    if (!candidates.length) {
      return { status: WAIT, waitReason: "NO_MATCH", records: [], route: null };
    }

    const usable = candidates
      .filter(candidate => candidate.gate.status === PASS)
      .sort((a, b) =>
        b.score - a.score ||
        numericRating(b.record.rating) - numericRating(a.record.rating) ||
        a.record.name.localeCompare(b.record.name),
      );

    const selected = usable[0] || candidates.sort((a, b) =>
      b.score - a.score || a.record.name.localeCompare(b.record.name),
    )[0];

    return {
      status: selected.gate.status,
      waitReason: selected.gate.reason,
      records: [selected.record],
      route: selected.gate.status === PASS ? selected.record.route : null,
      evidence: {
        source: selected.record.source,
        verifiedAt: selected.record.verifiedAt,
        modifiedAt: selected.record.modifiedAt,
        gateBeforeRating: true,
      },
    };
  };
}

export function createMimirSearchDestination({ search } = {}) {
  if (typeof search !== "function") throw new TypeError("MIMIR search port is required");

  return Object.freeze({
    id: "mimir-search",
    title: "MIMIR Search",
    status: "ready",

    async accept(access) {
      const envelope = validAccess(access);
      const query = snapshot({
        task: envelope.task,
        requestedResult: envelope.requestedResult,
        lensReference: envelope.lensReference,
      });

      try {
        const result = normalizedSearchResult(await search(query));
        return createReturnPacket(access, {
          kind: "MIMIR_SEARCH_RESULT",
          status: result.status,
          waitReason: result.waitReason,
          records: result.records,
          evidence: result.evidence,
          sourceObserved: true,
          next: result.status === PASS ? "GO_DECIDE" : "GO_REVIEW_WAIT",
          route: result.route,
        });
      } catch (error) {
        return createReturnPacket(access, {
          kind: "MIMIR_SEARCH_RESULT",
          status: WAIT,
          waitReason: "SOURCE_UNAVAILABLE",
          records: [],
          evidence: null,
          sourceObserved: false,
          error: error instanceof Error ? error.message : String(error),
          next: "VERIFY_SOURCE",
          route: null,
        });
      }
    },
  });
}
