import { createMimirStructuredRetriever } from "./go-hub-mimir-retriever.js";

const retrieveExperience = createMimirStructuredRetriever({
  coreText: record => [record.context, record.action, record.finding, record.resolution, record.reusableWhen].join(" "),
  helperText: record => [record.sourceTaskId, record.sourceArtifactDigest].join(" "),
});

function wait(reason) {
  return Object.freeze({ status: "WAIT", waitReason: reason, records: Object.freeze([]), route: null, evidence: null });
}

function normalizeExperienceRecord(record = {}) {
  return Object.freeze({
    id: String(record.id || "").trim(),
    context: String(record.context || "").trim(),
    action: String(record.action || "").trim(),
    finding: String(record.finding || "").trim(),
    resolution: String(record.resolution || "").trim(),
    reusableWhen: String(record.reusableWhen || "").trim(),
    sourceTaskId: String(record.sourceTaskId || "").trim() || null,
    sourceArtifactDigest: String(record.sourceArtifactDigest || "").trim() || null,
    recordedAt: String(record.recordedAt || "").trim() || null,
    status: String(record.status || "RECORDED").trim().toUpperCase(),
    collection: "EXPERIENCE",
    canAutoPromoteToKnowledge: false,
  });
}

export function createMimirExperienceSearchPort({ readExperience } = {}) {
  if (typeof readExperience !== "function") throw new TypeError("MIMIR experience reader is required");

  return async function searchExperience(query = {}) {
    let rows;
    try {
      rows = await readExperience();
    } catch {
      return wait("SOURCE_UNAVAILABLE");
    }
    if (!Array.isArray(rows)) return wait("SOURCE_UNAVAILABLE");
    const records = rows.map(normalizeExperienceRecord);
    const queryText = [query.task, query.requestedResult, query.lensReference]
      .map(value => String(value || ""))
      .join(" ");
    const candidates = retrieveExperience({ records, query: queryText });
    if (!candidates.length) return wait("NO_MATCH");
    const selected = candidates[0].record;
    return Object.freeze({
      status: "PASS",
      waitReason: null,
      records: Object.freeze([selected]),
      route: "experience://lessons",
      evidence: Object.freeze({
        collection: "EXPERIENCE",
        sourceTaskId: selected.sourceTaskId,
        sourceArtifactDigest: selected.sourceArtifactDigest,
        recordedAt: selected.recordedAt,
      }),
    });
  };
}
