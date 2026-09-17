import { createMimirStructuredRetriever } from "./go-hub-mimir-retriever.js";

const retrieveMemory = createMimirStructuredRetriever({
  coreText: record => [record.topic, record.content].join(" "),
  helperText: record => [record.tags, record.sourceContext].join(" "),
});

function wait(reason) {
  return Object.freeze({ status: "WAIT", waitReason: reason, records: Object.freeze([]), route: null, evidence: null });
}

function normalizeMemoryRecord(record = {}) {
  return Object.freeze({
    id: String(record.id || "").trim(),
    topic: String(record.topic || "").trim(),
    content: String(record.content || "").trim(),
    sourceContext: String(record.sourceContext || "").trim() || null,
    recordedAt: String(record.recordedAt || "").trim() || null,
    tags: String(record.tags || "").trim(),
    collection: "MEMORY",
    canOverrideCurrentCommunication: false,
  });
}

export function createMimirMemorySearchPort({ readMemory } = {}) {
  if (typeof readMemory !== "function") throw new TypeError("MIMIR memory reader is required");

  return async function searchMemory(query = {}) {
    let rows;
    try {
      rows = await readMemory();
    } catch {
      return wait("SOURCE_UNAVAILABLE");
    }
    if (!Array.isArray(rows)) return wait("SOURCE_UNAVAILABLE");
    const records = rows.map(normalizeMemoryRecord);
    const queryText = [query.task, query.requestedResult, query.lensReference]
      .map(value => String(value || ""))
      .join(" ");
    const candidates = retrieveMemory({ records, query: queryText });
    if (!candidates.length) return wait("NO_MATCH");
    const selected = candidates[0].record;
    return Object.freeze({
      status: "PASS",
      waitReason: null,
      records: Object.freeze([selected]),
      route: "memory://context",
      evidence: Object.freeze({
        collection: "MEMORY",
        sourceContext: selected.sourceContext,
        recordedAt: selected.recordedAt,
      }),
    });
  };
}
