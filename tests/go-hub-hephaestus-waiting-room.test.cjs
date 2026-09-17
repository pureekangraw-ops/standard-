"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const hephaestusUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-hephaestus.js")).href;
const returnUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-hephaestus-return.js")).href;
const loadHephaestus = () => import(`${hephaestusUrl}?${Date.now()}-${Math.random()}`);
const loadReturn = () => import(`${returnUrl}?${Date.now()}-${Math.random()}`);
const admit = Object.freeze({ decision: "ADMIT", reasons: [] });

function mergeRequest(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    goId: "go-a",
    jobId: "job-a",
    admission: admit,
    mergeAdmission: {
      assemblyId: "assembly-a",
      sourceHeadSha: "head-a",
      pullRequestNumber: 84,
      pullRequestHeadSha: "head-a",
      ciHeadSha: "head-a",
      ciStatus: "success",
    },
    ...overrides,
  };
}

function sealMergeResult(state) {
  const next = structuredClone(state);
  next.repositories["pureekangraw-ops/standard-"].merge.active.mergeResult = {
    pullRequestNumber: 84,
    headSha: "head-a",
    mergeSha: "main-after-merge",
    recordedAt: "2026-09-17T08:09:00+07:00",
  };
  return next;
}

test("merged work releases the merge lane immediately and moves into the verification waiting room", async () => {
  const { createHephaestusState, requestFactorySlot } = await loadHephaestus();
  const { parkMergedWork } = await loadReturn();

  let state = requestFactorySlot(createHephaestusState(), mergeRequest()).state;
  state = requestFactorySlot(state, mergeRequest({ goId: "go-b", jobId: "job-b" })).state;
  state = sealMergeResult(state);

  const parked = parkMergedWork(state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    mainSha: "main-after-merge",
    mergedAt: "2026-09-17T08:10:00+07:00",
  });

  const repository = parked.state.repositories["pureekangraw-ops/standard-"];
  assert.equal(repository.merge.active, null);
  assert.equal(repository.merge.queue[0].status, "NEEDS_RECHECK");
  assert.equal(parked.outcome.status, "PARKED_FOR_VERIFICATION");
  assert.equal(parked.outcome.promotedJobId, "job-b");
  assert.equal(repository.waitingRoom.length, 1);
  assert.equal(repository.waitingRoom[0].repository, "pureekangraw-ops/standard-");
  assert.equal(repository.waitingRoom[0].goId, "go-a");
  assert.equal(repository.waitingRoom[0].jobId, "job-a");
  assert.equal(repository.waitingRoom[0].status, "WAITING_VERIFICATION");
  assert.equal(repository.waitingRoom[0].mainSha, "main-after-merge");
  assert.equal(repository.waitingRoom[0].mergeGate.status, "MERGED");
  assert.equal(repository.waitingRoom[0].mergeGate.merge.mergeSha, "main-after-merge");
});

test("passed verification checks out of the waiting room and returns to Optician", async () => {
  const { createHephaestusState, requestFactorySlot } = await loadHephaestus();
  const { parkMergedWork, completeWaitingRoomVerification } = await loadReturn();

  const active = requestFactorySlot(createHephaestusState(), mergeRequest());
  const sealed = sealMergeResult(active.state);
  const parked = parkMergedWork(sealed, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    mainSha: "main-after-merge",
    mergedAt: "2026-09-17T08:10:00+07:00",
  });

  const completed = completeWaitingRoomVerification(parked.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: {
      status: "pass",
      mainSha: "main-after-merge",
      checkedAt: "2026-09-17T08:12:00+07:00",
    },
  });

  assert.deepEqual(completed.state.repositories["pureekangraw-ops/standard-"].waitingRoom, []);
  assert.equal(completed.returnPacket.destination, "optician");
  assert.equal(completed.returnPacket.reason, "FACTORY_REALITY_CHANGED");
  assert.equal(completed.returnPacket.repository, "pureekangraw-ops/standard-");
  assert.equal(completed.returnPacket.goId, "go-a");
  assert.equal(completed.returnPacket.jobId, "job-a");
  assert.equal(completed.returnPacket.mainSha, "main-after-merge");
  assert.equal(completed.returnPacket.mergeGate.status, "MERGED_VERIFIED");
  assert.equal(completed.returnPacket.mergeGate.merge.mergeSha, "main-after-merge");
});

test("waiting-room verification fails closed when the verified main SHA does not match the parked merge", async () => {
  const { createHephaestusState, requestFactorySlot } = await loadHephaestus();
  const { parkMergedWork, completeWaitingRoomVerification } = await loadReturn();
  const active = requestFactorySlot(createHephaestusState(), mergeRequest());
  const sealed = sealMergeResult(active.state);
  const parked = parkMergedWork(sealed, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    mainSha: "main-after-merge",
    mergedAt: "2026-09-17T08:10:00+07:00",
  });

  assert.throws(() => completeWaitingRoomVerification(parked.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: {
      status: "pass",
      mainSha: "different-main",
      checkedAt: "2026-09-17T08:12:00+07:00",
    },
  }), /main sha/i);
});
