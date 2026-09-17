import { createMimirStructuredRetriever } from "./go-hub-mimir-retriever.js";
export { createMimirStructuredRetriever };

const PASS = "PASS";
const WAIT = "WAIT";

export const KNOWLEDGE_STATES = Object.freeze({
  CURRENT: "CURRENT",
  CANDIDATE: "CANDIDATE",
  SUPERSEDED: "SUPERSEDED",
  DISPUTED: "DISPUTED",
  PENDING: "PENDING",
});

function text(value) {
  return Array.isArray(value) ? value.join(" ") : String(value ?? "");
}

function first(record, keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

function numericRating(value) {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : -1;
}

function isoDateOnly(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(raw + "T23:59:59.999Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function normalizeKnowledgeRecord(record = {}) {
  return Object.freeze({
    id: String(first(record, ["id", "ID", "url"]) || ""),
    title: text(first(record, ["Title", "title", "ชื่อ"])).trim(),
    topic: text(first(record, ["Topic", "topic", "หัวข้อ"])).trim(),
    claim: text(first(record, ["Claim", "claim", "ข้อสรุป", "ความรู้"])).trim(),
    summary: text(first(record, ["Summary", "summary", "สรุป"])).trim(),
    knowledgeStatus: normalizeStatus(first(record, ["Knowledge Status", "knowledgeStatus", "สถานะความรู้"])),
    verificationState: normalizeStatus(first(record, ["Verification State", "verificationState", "สถานะการตรวจสอบ"])),
    sourceId: text(first(record, ["Source ID", "sourceId", "รหัสแหล่งที่มา"])).trim(),
    sourceUrl: text(first(record, ["Source URL", "sourceUrl", "url", "แหล่งที่มา"])).trim(),
    evidence: text(first(record, ["Evidence", "evidence", "หลักฐาน"])).trim(),
    publishedAt: first(record, ["Published Date", "publishedAt", "date:Published Date:start"]),
    verifiedAt: first(record, ["Verified Date", "verifiedAt", "date:Verified Date:start"]),
    reviewBy: first(record, ["Review By", "reviewBy", "date:Review By:start"]),
    supersedes: text(first(record, ["Supersedes", "supersedes", "แทนที่"])).trim(),
    tags: text(first(record, ["Tags", "tags", "แท็ก"])).trim(),
    rating: text(first(record, ["Rating", "rating", "GO Rating"])).trim(),
  });
}

function requiredFieldsPresent(record) {
  return Boolean(
    record.title &&
    (record.claim || record.summary) &&
    record.knowledgeStatus &&
    record.verificationState &&
    record.sourceId &&
    record.sourceUrl &&
    record.evidence &&
    record.verifiedAt &&
    record.reviewBy
  );
}

export function gateKnowledgeRecord(record, { now = () => new Date() } = {}) {
  if (!requiredFieldsPresent(record)) {
    return Object.freeze({ status: WAIT, reason: "MISSING_DECISION_CRITICAL_FIELD" });
  }

  switch (record.knowledgeStatus) {
    case KNOWLEDGE_STATES.CANDIDATE:
      return Object.freeze({ status: WAIT, reason: "CANDIDATE_NOT_ACCEPTED" });
    case KNOWLEDGE_STATES.SUPERSEDED:
      return Object.freeze({ status: WAIT, reason: "SUPERSEDED" });
    case KNOWLEDGE_STATES.DISPUTED:
      return Object.freeze({ status: WAIT, reason: "DISPUTED" });
    case KNOWLEDGE_STATES.PENDING:
      return Object.freeze({ status: WAIT, reason: "PENDING_VERIFICATION" });
    case KNOWLEDGE_STATES.CURRENT:
      break;
    default:
      return Object.freeze({ status: WAIT, reason: "UNKNOWN_KNOWLEDGE_STATUS" });
  }

  if (record.verificationState !== "VERIFIED") {
    if (record.verificationState === "STALE") return Object.freeze({ status: WAIT, reason: "STALE_VERIFICATION" });
    if (record.verificationState === "CONFLICT") return Object.freeze({ status: WAIT, reason: "CONFLICT" });
    if (record.verificationState === "FAILED") return Object.freeze({ status: WAIT, reason: "VERIFICATION_FAILED" });
    return Object.freeze({ status: WAIT, reason: "PENDING_VERIFICATION" });
  }

  const reviewBy = isoDateOnly(record.reviewBy);
  if (!reviewBy) return Object.freeze({ status: WAIT, reason: "INVALID_REVIEW_DATE" });
  const current = now();
  if (!(current instanceof Date) || Number.isNaN(current.getTime())) {
    throw new Error("knowledge clock must return a valid Date");
  }
  if (current.getTime() > reviewBy.getTime()) {
    return Object.freeze({ status: WAIT, reason: "STALE_VERIFICATION" });
  }

  return Object.freeze({ status: PASS, reason: null });
}

const retrieveKnowledge = createMimirStructuredRetriever({
  coreText: record => [record.title, record.topic, record.claim, record.summary].join(" "),
  helperText: record => record.tags,
});

export function createMimirKnowledgeSearchPort({ readKnowledge, now = () => new Date() } = {}) {
  if (typeof readKnowledge !== "function") throw new TypeError("MIMIR knowledge reader is required");
  if (typeof now !== "function") throw new TypeError("MIMIR knowledge clock is required");

  return async function searchKnowledge(query = {}) {
    const sourceRows = await readKnowledge();
    if (!Array.isArray(sourceRows)) throw new Error("MIMIR knowledge source must return an array");
    const records = sourceRows.map(normalizeKnowledgeRecord);
    const queryText = [query.task, query.requestedResult, query.lensReference].map(text).join(" ");
    const candidates = retrieveKnowledge({ records, query: queryText })
      .map(candidate => ({
        ...candidate,
        gate: gateKnowledgeRecord(candidate.record, { now }),
      }));

    if (!candidates.length) {
      return { status: WAIT, waitReason: "NO_MATCH", records: [], route: null, evidence: null };
    }

    const usable = candidates
      .filter(candidate => candidate.gate.status === PASS)
      .sort((a, b) => a.score === b.score
        ? numericRating(b.record.rating) - numericRating(a.record.rating) || a.record.title.localeCompare(b.record.title)
        : b.score - a.score);

    const selected = usable[0] || candidates
      .sort((a, b) => a.score === b.score
        ? a.record.title.localeCompare(b.record.title)
        : b.score - a.score)[0];

    return {
      status: selected.gate.status,
      waitReason: selected.gate.reason,
      records: [selected.record],
      route: selected.gate.status === PASS ? "knowledge://notion" : null,
      evidence: {
        source: selected.record.sourceUrl,
        sourceId: selected.record.sourceId,
        recordEvidence: selected.record.evidence,
        verifiedAt: selected.record.verifiedAt,
        reviewBy: selected.record.reviewBy,
        publishedAt: selected.record.publishedAt || null,
        gateBeforeRating: true,
        searchMode: "STRUCTURED_RELEVANCE_FALLBACK",
      },
    };
  };
}
