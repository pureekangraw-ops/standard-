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
