import { releaseFactorySlot } from "./go-hub-hephaestus-queue.js";

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waitingRoomFor(state, repository) {
  const repositoryState = state.repositories?.[repository];
  if (!repositoryState) throw new Error("queue lane not found");
  if (!Array.isArray(repositoryState.waitingRoom)) repositoryState.waitingRoom = [];
  return repositoryState.waitingRoom;
}

export function parkMergedWork(current, input = {}) {
  const repository = required(input.repository, "repository");
  const goId = required(input.goId, "goId");
  const jobId = required(input.jobId, "jobId");
  const mainSha = required(input.mainSha, "main sha");
  const mergedAt = required(input.mergedAt, "merged at");

  const released = releaseFactorySlot(current, {
    repository,
    slot: "merge",
    goId,
    jobId,
  });
  const state = clone(released.state);
  const room = waitingRoomFor(state, repository);
  if (room.some(item => item.goId === goId && item.jobId === jobId)) {
    throw new Error("work is already in verification waiting room");
  }
  room.push({
    repository,
    goId,
    jobId,
    status: "WAITING_VERIFICATION",
    mainSha,
    mergedAt,
  });

  return Object.freeze({
    state: Object.freeze(state),
    outcome: Object.freeze({
      status: "PARKED_FOR_VERIFICATION",
      promotedJobId: released.outcome.promotedJobId,
      nextAction: released.outcome.nextAction,
    }),
  });
}

export function completeWaitingRoomVerification(current, input = {}) {
  const repository = required(input.repository, "repository");
  const goId = required(input.goId, "goId");
  const jobId = required(input.jobId, "jobId");
  const verification = input.postMergeVerification;
  if (verification?.status !== "pass" || !String(verification.mainSha || "").trim() ||
      !String(verification.checkedAt || "").trim()) {
    throw new Error("passed post-merge verification is required");
  }

  const state = clone(current || { version: 1, repositories: {} });
  const room = waitingRoomFor(state, repository);
  const index = room.findIndex(item => item.goId === goId && item.jobId === jobId);
  if (index < 0) throw new Error("work is not in verification waiting room");
  const parked = room[index];
  if (String(parked.mainSha) !== String(verification.mainSha)) {
    throw new Error("verified main sha does not match parked merge main sha");
  }
  room.splice(index, 1);

  return Object.freeze({
    state: Object.freeze(state),
    outcome: Object.freeze({ status: "VERIFIED" }),
    returnPacket: Object.freeze({
      destination: "optician",
      reason: "FACTORY_REALITY_CHANGED",
      repository,
      goId,
      jobId,
      mainSha: String(verification.mainSha),
    }),
  });
}

export function completeMergeAndReturn(current, input = {}) {
  const verification = input.postMergeVerification;
  if (verification?.status !== "pass" || !String(verification.mainSha || "").trim() ||
      !String(verification.checkedAt || "").trim()) {
    throw new Error("passed post-merge verification is required");
  }
  const parked = parkMergedWork(current, {
    repository: input.repository,
    goId: input.goId,
    jobId: input.jobId,
    mainSha: verification.mainSha,
    mergedAt: verification.checkedAt,
  });
  return completeWaitingRoomVerification(parked.state, input);
}
