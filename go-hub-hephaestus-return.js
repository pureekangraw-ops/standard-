import { releaseFactorySlot } from "./go-hub-hephaestus-queue.js";

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function snapshot(value) {
  const copy = structuredClone(value);
  if (copy && typeof copy === "object") Object.freeze(copy);
  return copy;
}

export function completeMergeAndReturn(current, input = {}) {
  const repository = required(input.repository, "repository");
  const goId = required(input.goId, "goId");
  const jobId = required(input.jobId, "jobId");
  const verification = input.postMergeVerification;
  if (verification?.status !== "pass" || !String(verification.mainSha || "").trim() ||
      !String(verification.checkedAt || "").trim()) {
    throw new Error("passed post-merge verification is required");
  }

  const evidence = verification.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) ||
      evidence.root?.status !== "pass" || evidence.mcp?.status !== "pass") {
    throw new Error("structured production verification evidence is required");
  }
  if (String(evidence.deploymentSha || "") !== String(verification.mainSha)) {
    throw new Error("production deployment SHA must match verified main SHA");
  }

  const released = releaseFactorySlot(current, {
    repository,
    slot: "merge",
    goId,
    jobId,
  });

  return Object.freeze({
    state: released.state,
    outcome: released.outcome,
    returnPacket: Object.freeze({
      destination: "optician",
      reason: "FACTORY_REALITY_CHANGED",
      repository,
      goId,
      jobId,
      mainSha: String(verification.mainSha),
      postMergeVerification: snapshot(verification),
    }),
  });
}
