import { createReturnPacket } from "./go-hub-centre.js";

export const MIMIR_DESTINATION = "destination://mimir";

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
        const records = normalizeRecords(await search(query));
        return createReturnPacket(access, {
          kind: "MIMIR_SEARCH_RESULT",
          status: records.length ? "FOUND" : "WAIT",
          waitReason: records.length ? null : "NO_MATCH",
          records,
          sourceObserved: true,
          next: "GO_APPLY_5W",
          route: null,
        });
      } catch (error) {
        return createReturnPacket(access, {
          kind: "MIMIR_SEARCH_RESULT",
          status: "WAIT",
          waitReason: "SOURCE_UNAVAILABLE",
          records: [],
          sourceObserved: false,
          error: error instanceof Error ? error.message : String(error),
          next: "VERIFY_SOURCE",
          route: null,
        });
      }
    },
  });
}


const FIVE_W_KEYS = Object.freeze(["WHO", "WHY", "WHAT", "WHERE", "WHEN"]);
const FIVE_W_STATES = Object.freeze(["FACT", "INFERENCE", "UNKNOWN", "CONFLICT"]);

function normalizeCoordinate(key, input, availableRecordIds) {
  if (input == null || input === "") {
    return { key, state: "UNKNOWN", value: null, evidenceRecordIds: [] };
  }
  const coordinate = typeof input === "object" && !Array.isArray(input)
    ? input
    : { state: "FACT", value: input };
  const state = String(coordinate.state || "UNKNOWN").toUpperCase();
  if (!FIVE_W_STATES.includes(state)) {
    throw new Error(`${key} state must be FACT, INFERENCE, UNKNOWN, or CONFLICT`);
  }
  const evidenceRecordIds = Array.isArray(coordinate.evidenceRecordIds)
    ? coordinate.evidenceRecordIds.map(String)
    : [];
  if (evidenceRecordIds.some(id => !availableRecordIds.has(id))) {
    throw new Error(`${key} references a record that MIMIR did not return`);
  }
  if ((state === "FACT" || state === "CONFLICT") && evidenceRecordIds.length === 0) {
    throw new Error(`${key} ${state} requires MIMIR record evidence`);
  }
  const value = coordinate.value == null || coordinate.value === ""
    ? null
    : structuredClone(coordinate.value);
  if (state !== "UNKNOWN" && value == null) {
    throw new Error(`${key} ${state} requires a value`);
  }
  return { key, state, value, evidenceRecordIds };
}

export function applyFiveWAfterSearch(returnPacket, input = {}) {
  const payload = returnPacket?.payload;
  if (!payload || payload.kind !== "MIMIR_SEARCH_RESULT") {
    throw new Error("MIMIR search result is required before 5W");
  }
  if (!Array.isArray(payload.records)) {
    throw new Error("MIMIR records must be observed before 5W");
  }
  const availableRecordIds = new Set(
    payload.records.map(record => String(record?.id || "")).filter(Boolean),
  );
  const fiveW = {};
  for (const key of FIVE_W_KEYS) {
    fiveW[key] = normalizeCoordinate(
      key,
      input[key] ?? input[key.toLowerCase()],
      availableRecordIds,
    );
  }
  return snapshot({
    ...returnPacket,
    payload: {
      ...payload,
      fiveW,
      fiveWAppliedAfterSearch: true,
      next: "GO_DECIDE",
    },
  });
}
