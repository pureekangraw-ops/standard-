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
    ...overrides,
  };
}

test("merged work releases the merge lane immediately and moves into the verification waiting room", async () => {
  const { createHephaestusState, requestFactorySlot } = await loadHephaestus();
  const { parkMergedWork } = await loadReturn();

  let state = requestFactorySlot(createHephaestusState(), mergeRequest()).state;
  state = requestFactorySlot(state, mergeRequest({ goId: "go-b", jobId: "job-b" })).state;

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
  assert.deepEqual(repository.waitingRoom, [{
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    status: "WAITING_VERIFICATION",
    mainSha: "main-after-merge",
    mergedAt: "2026-09-17T08:10:00+07:00",
  }]);
});

test("passed verification checks out of the waiting room and returns to Optician", async () => {
  const { createHephaestusState, requestFactorySlot } = await loadHephaestus();
  const { parkMergedWork, completeWaitingRoomVerification } = await loadReturn();

  const active = requestFactorySlot(createHephaestusState(), mergeRequest());
  const parked = parkMergedWork(active.state, {
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
  assert.deepEqual(completed.returnPacket, {
    destination: "optician",
    reason: "FACTORY_REALITY_CHANGED",
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    mainSha: "main-after-merge",
  });
});

test("waiting-room verification fails closed when the verified main SHA does not match the parked merge", async () => {
  const { createHephaestusState, requestFactorySlot } = await loadHephaestus();
  const { parkMergedWork, completeWaitingRoomVerification } = await loadReturn();
  const active = requestFactorySlot(createHephaestusState(), mergeRequest());
  const parked = parkMergedWork(active.state, {
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
