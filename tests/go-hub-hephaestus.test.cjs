"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-hephaestus.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);
const queueUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-hephaestus-queue.js")).href;
const loadQueue = () => import(`${queueUrl}?${Date.now()}-${Math.random()}`);
const returnUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-hephaestus-return.js")).href;
const loadReturn = () => import(`${returnUrl}?${Date.now()}-${Math.random()}`);
const admit = Object.freeze({ decision: "ADMIT", reasons: [] });

function request(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    goId: "go-a",
    jobId: "job-a",
    admission: admit,
    ...overrides,
  };
}

test("Hephaestus gives one GO the repo slot and queues the next GO", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  const initial = createHephaestusState();
  const first = requestFactorySlot(initial, request());
  assert.equal(first.outcome.status, "ACTIVE");
  const second = requestFactorySlot(first.state, request({ goId: "go-b", jobId: "job-b" }));
  assert.equal(second.outcome.status, "QUEUED");
  assert.equal(second.outcome.position, 1);
  assert.equal(second.state.repositories["pureekangraw-ops/standard-"].assembly.active.jobId, "job-a");
});

test("different repositories have independent Assembly slots", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  let state = createHephaestusState();
  const a = requestFactorySlot(state, request());
  state = a.state;
  const b = requestFactorySlot(state, request({ repository: "pureekangraw-ops/other", goId: "go-b", jobId: "job-b" }));
  assert.equal(b.outcome.status, "ACTIVE");
});

test("one GO cannot actively own two Hephaestus slots", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  const first = requestFactorySlot(createHephaestusState(), request());
  const second = requestFactorySlot(first.state, request({ slot: "merge", jobId: "job-merge" }));
  assert.equal(second.outcome.status, "WAIT");
  assert.equal(second.outcome.reason, "GO_ALREADY_ACTIVE");
});

test("new build without approved Blueprint is sent back to planning", async () => {
  const { screenFactoryIntent } = await load();
  assert.deepEqual(screenFactoryIntent({ kind: "create", blueprint: null }), {
    decision: "RETURN_FOR_PLAN",
    destination: "optician",
    reason: "APPROVED_BLUEPRINT_REQUIRED",
  });
  assert.equal(screenFactoryIntent({ kind: "create", blueprint: { approved: true } }).decision, "PROCEED");
});

test("queue risk fails closed on overlap stale projection conflict or dependency risk", async () => {
  const { evaluateQueueRisk } = await load();
  assert.deepEqual(evaluateQueueRisk({}), { status: "SAFE", reasons: [] });
  assert.deepEqual(evaluateQueueRisk({ overlappingPaths: ["go-hub-shell.js"] }), {
    status: "RECHECK",
    reasons: ["PATH_OVERLAP"],
  });
  assert.deepEqual(evaluateQueueRisk({ staleBase: true }), {
    status: "RECHECK",
    reasons: ["STALE_PROJECTION"],
  });
  assert.deepEqual(evaluateQueueRisk({ conflict: true }), {
    status: "BLOCKED",
    reasons: ["CONFLICT"],
  });
  assert.deepEqual(evaluateQueueRisk({ dependencyRisks: ["runtime-contract"] }), {
    status: "BLOCKED",
    reasons: ["DEPENDENCY_RISK"],
  });
});

test("Assembly admission requires Ready Gate truth for the exact Piece head", async () => {
  const { evaluateFactoryAdmission } = await load();
  const pass = evaluateFactoryAdmission({
    slot: "assembly",
    readyGate: { status: "READY_FOR_ASSEMBLY", headSha: "piece-head" },
    piece: { headSha: "piece-head" },
  });
  assert.deepEqual(pass, { decision: "ADMIT", reasons: [] });
  const stale = evaluateFactoryAdmission({
    slot: "assembly",
    readyGate: { status: "READY_FOR_ASSEMBLY", headSha: "old-head" },
    piece: { headSha: "piece-head" },
  });
  assert.equal(stale.decision, "WAIT");
  assert.deepEqual(stale.reasons, ["READY_GATE_STALE_HEAD"]);
});

test("Merge admission requires exact Assembly QC PR CI heads and SAFE risk", async () => {
  const { evaluateFactoryAdmission } = await load();
  const base = {
    slot: "merge",
    assembly: { status: "ASSEMBLED", integrationHeadSha: "integration-head" },
    assemblyQc: { status: "pass", checkedHeadSha: "integration-head" },
    pullRequest: { number: 49, headSha: "pr-head" },
    ci: { status: "success", headSha: "pr-head" },
    risk: { status: "SAFE", reasons: [] },
  };
  assert.deepEqual(evaluateFactoryAdmission(base), { decision: "ADMIT", reasons: [] });
  const staleCi = evaluateFactoryAdmission({ ...base, ci: { status: "success", headSha: "old-head" } });
  assert.equal(staleCi.decision, "WAIT");
  assert.deepEqual(staleCi.reasons, ["CI_STALE_HEAD"]);
  const recheck = evaluateFactoryAdmission({ ...base, risk: { status: "RECHECK", reasons: ["PATH_OVERLAP"] } });
  assert.deepEqual(recheck, { decision: "WAIT", reasons: ["PATH_OVERLAP"] });
  const blocked = evaluateFactoryAdmission({ ...base, risk: { status: "BLOCKED", reasons: ["CONFLICT"] } });
  assert.deepEqual(blocked, { decision: "BLOCK", reasons: ["CONFLICT"] });
});

test("queued GO gets a return-to-chat report with queue and risk context", async () => {
  const { createHephaestusState, requestFactorySlot, createQueueReport } = await load();
  const first = requestFactorySlot(createHephaestusState(), request());
  const second = requestFactorySlot(first.state, request({
    goId: "go-b",
    jobId: "job-b",
    risk: { status: "RECHECK", reasons: ["PATH_OVERLAP"] },
  }));
  assert.deepEqual(createQueueReport(second.state, {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    jobId: "job-b",
  }), {
    action: "RETURN_TO_CHAT",
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    jobId: "job-b",
    position: 1,
    activeJobId: "job-a",
    riskStatus: "RECHECK",
    reason: "PATH_OVERLAP",
  });
});

test("slot release promotes the next FIFO job as NEEDS_RECHECK before it can work", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  const { releaseFactorySlot, admitQueuedFactorySlot } = await loadQueue();
  let state = requestFactorySlot(createHephaestusState(), request()).state;
  state = requestFactorySlot(state, request({ goId: "go-b", jobId: "job-b" })).state;
  const released = releaseFactorySlot(state, {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    goId: "go-a",
    jobId: "job-a",
  });
  assert.equal(released.outcome.promotedJobId, "job-b");
  assert.equal(released.state.repositories["pureekangraw-ops/standard-"].assembly.active, null);
  assert.equal(released.state.repositories["pureekangraw-ops/standard-"].assembly.queue[0].status, "NEEDS_RECHECK");
  const rechecked = admitQueuedFactorySlot(released.state, {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    goId: "go-b",
    jobId: "job-b",
    admission: admit,
  });
  assert.equal(rechecked.outcome.status, "ACTIVE");
  assert.equal(rechecked.state.repositories["pureekangraw-ops/standard-"].assembly.active.status, "ACTIVE");
});

test("Merge completion requires post-merge verification before returning to Optician", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  const { completeMergeAndReturn } = await loadReturn();
  const active = requestFactorySlot(createHephaestusState(), request({ slot: "merge" }));
  assert.throws(() => completeMergeAndReturn(active.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: { status: "fail" },
  }), /post-merge verification/i);

  const completed = completeMergeAndReturn(active.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: {
      status: "pass",
      mainSha: "main-after-merge",
      checkedAt: "2026-09-15T23:30:00+07:00",
    },
  });
  assert.deepEqual(completed.returnPacket, {
    destination: "optician",
    reason: "FACTORY_REALITY_CHANGED",
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    mainSha: "main-after-merge",
  });
  assert.equal(completed.state.repositories["pureekangraw-ops/standard-"].merge.active, null);
});
