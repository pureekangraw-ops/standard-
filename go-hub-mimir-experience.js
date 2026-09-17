import { createMimirStructuredRetriever } from "./go-hub-mimir-retriever.js";

const retrieveExperience = createMimirStructuredRetriever({
  coreText: record => [record.context, record.action, record.finding, record.resolution, record.reusableWhen].join(" "),
  helperText: record => [record.sourceTaskId, record.sourceArtifactDigest].join(" "),
});

function wait(reason, evidence = null) {
  return Object.freeze({ status: "WAIT", waitReason: reason, records: Object.freeze([]), route: null, evidence });
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

export function proposeKnowledgeCandidateFromExperience(record = {}, { authorized = false } = {}) {
  const lesson = normalizeExperienceRecord(record);
  if (authorized !== true) {
    return Object.freeze({ status: "WAIT", waitReason: "NEED_AUTHORITY", writePerformed: false, candidate: null });
  }
  if (lesson.status !== "RECORDED") {
    return Object.freeze({ status: "WAIT", waitReason: "EXPERIENCE_NOT_PROMOTABLE", writePerformed: false, candidate: null });
  }
  if (!lesson.id || !lesson.finding || !lesson.sourceTaskId || !lesson.sourceArtifactDigest) {
    return Object.freeze({ status: "WAIT", waitReason: "MISSING_DECISION_CRITICAL_FIELD", writePerformed: false, candidate: null });
  }
  return Object.freeze({
    status: "PASS",
    waitReason: null,
    writePerformed: false,
    candidate: Object.freeze({
      title: lesson.context || lesson.id,
      topic: lesson.reusableWhen || lesson.context,
      claim: lesson.finding,
      summary: lesson.resolution,
      knowledgeStatus: "CANDIDATE",
      verificationState: "PENDING",
      sourceId: lesson.sourceTaskId,
      sourceUrl: `experience://${lesson.id}`,
      evidence: lesson.sourceArtifactDigest,
      publishedAt: lesson.recordedAt,
      supersedes: "",
      tags: "experience-candidate",
    }),
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
    const selected = candidates.find(candidate => candidate.record.status === "RECORDED")?.record;
    if (!selected) {
      const disputed = candidates.filter(candidate => candidate.record.status === "DISPUTED");
      if (disputed.length) {
        return wait("CONFLICT", Object.freeze({
          collection: "EXPERIENCE",
          conflictIds: Object.freeze(disputed.map(candidate => candidate.record.id)),
        }));
      }
      const outdated = candidates.filter(candidate => candidate.record.status === "OUTDATED");
      if (outdated.length) {
        return wait("OUTDATED_LESSON", Object.freeze({
          collection: "EXPERIENCE",
          outdatedIds: Object.freeze(outdated.map(candidate => candidate.record.id)),
        }));
      }
      return wait("PENDING_VERIFICATION");
    }
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
