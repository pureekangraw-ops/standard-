function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function mergedTruth(evidence = {}) {
  const pr = evidence.pullRequest;
  const waiting = evidence.waitingRecord;
  const repository = required(waiting?.repository, "waiting repository");
  const goId = required(waiting?.goId, "waiting goId");
  const jobId = required(waiting?.jobId, "waiting jobId");
  const mainSha = required(waiting?.mainSha, "waiting mainSha");
  const merge = waiting?.mergeGate?.merge;
  if (waiting?.status !== "WAITING_VERIFICATION") throw new Error("waiting record must be WAITING_VERIFICATION");
  if (!pr || pr.state !== "closed" || pr.merged !== true) throw new Error("merged pull request truth is required");
  if (Number(pr.number) !== Number(merge?.pullRequestNumber)) throw new Error("pull request number does not match waiting record");
  if (String(pr.headSha || "") !== String(merge?.headSha || "")) throw new Error("pull request head does not match waiting record");
  if (String(merge?.mergeSha || "") !== mainSha) throw new Error("waiting mainSha does not match recorded merge");
  return { repository, goId, jobId, mainSha, pullRequestNumber: Number(pr.number), sourceHeadSha: String(pr.headSha) };
}

export function planLegacyWaitingReconciliation(evidence = {}) {
  const truth = mergedTruth(evidence);
  return Object.freeze({
    status: "LEGACY_RECONCILIATION_READY",
    authority: "SOURCE_BOUND",
    mutates: false,
    reason: "ORPHAN_WAITING_VERIFICATION",
    ...truth,
    verification: Object.freeze({ status: "pass", mainSha: truth.mainSha }),
  });
}

export function reconcileLegacyWaitingRoom(state, evidence = {}) {
  const plan = planLegacyWaitingReconciliation(evidence);
  const next = structuredClone(state);
  const room = next?.repositories?.[plan.repository]?.waitingRoom;
  if (!Array.isArray(room)) throw new Error("Factory waiting room is unavailable");
  const index = room.findIndex(item => item.goId === plan.goId && item.jobId === plan.jobId);
  if (index < 0) throw new Error("legacy waiting record not found");
  const current = room[index];
  if (current.mainSha !== plan.mainSha) throw new Error("legacy waiting record changed since evidence capture");
  room.splice(index, 1);
  return Object.freeze({
    state: Object.freeze(next),
    outcome: Object.freeze({
      status: "LEGACY_RECONCILED",
      reason: plan.reason,
      repository: plan.repository,
      goId: plan.goId,
      jobId: plan.jobId,
      mainSha: plan.mainSha,
      pullRequestNumber: plan.pullRequestNumber,
      sourceHeadSha: plan.sourceHeadSha,
    }),
  });
}
