import { releaseFactorySlot } from "./go-hub-hephaestus-queue.js";

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export function completeMergeAndReturn(current, input = {}) {
  const repository = required(input.repository, "repository");
  const goId = required(input.goId, "goId");
  const jobId = required(input.jobId, "jobId");
  const active = current?.repositories?.[repository]?.merge?.active;
  if (!active || active.goId !== goId || active.jobId !== jobId || active.status !== "ACTIVE") {
    throw new Error("active merge slot owner does not match release");
  }
  const admission = active.mergeAdmission;
  if (!admission?.assemblyId || !admission?.sourceHeadSha || !admission?.pullRequestNumber ||
      !admission?.pullRequestHeadSha || admission.ciStatus !== "success" || !admission?.ciHeadSha) {
    throw new Error("sealed merge admission truth is required");
  }
  const mergeResult = active.mergeResult;
  if (!mergeResult?.mergeSha || !mergeResult?.headSha || !mergeResult?.pullRequestNumber) {
    throw new Error("sealed merge result is required before release");
  }
  if (mergeResult.headSha !== admission.pullRequestHeadSha || mergeResult.headSha !== admission.sourceHeadSha ||
      mergeResult.pullRequestNumber !== admission.pullRequestNumber) {
    throw new Error("sealed merge result does not match admission truth");
  }

  const verification = input.postMergeVerification;
  if (verification?.status !== "pass" || !String(verification.mainSha || "").trim() ||
      !String(verification.checkedAt || "").trim()) {
    throw new Error("passed post-merge verification is required");
  }
  if (String(verification.mainSha) !== String(mergeResult.mergeSha)) {
    throw new Error("post-merge main SHA does not match sealed merge result");
  }

  const mergeGate = Object.freeze({
    status: "MERGED_VERIFIED",
    assemblyId: String(admission.assemblyId),
    sourceHeadSha: String(admission.sourceHeadSha),
    pullRequest: Object.freeze({ number: Number(admission.pullRequestNumber), headSha: String(admission.pullRequestHeadSha) }),
    ci: Object.freeze({ status: "success", headSha: String(admission.ciHeadSha) }),
    merge: Object.freeze({
      headSha: String(mergeResult.headSha),
      mergeSha: String(mergeResult.mergeSha),
      pullRequestNumber: Number(mergeResult.pullRequestNumber),
    }),
    postMergeVerification: Object.freeze({
      status: "pass",
      mainSha: String(verification.mainSha),
      checkedAt: String(verification.checkedAt),
    }),
  });

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
      mergeGate,
    }),
  });
}
