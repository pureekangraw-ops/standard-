"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-centre-live.mjs")).href;

class MemoryStorage {
  constructor(map = new Map()) { this.map = map; }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
}

async function call(instance, input) {
  const response = await instance.fetch(new Request("https://centre.test/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
  return { status: response.status, body: await response.json() };
}

async function reviewed(instance, suffix) {
  const id = { workId: "WORK-" + suffix, checkpointId: "CP-" + suffix, returnAddress: "CP-" + suffix };
  assert.equal((await call(instance, { action: "start", ...id })).status, 200);
  assert.equal((await call(instance, {
    action: "review", ...id, task: "Smoke", requestedResult: "Verified", authority: "BIG",
  })).status, 200);
  return id;
}

async function prepared(instance, suffix) {
  const id = await reviewed(instance, suffix);
  assert.equal((await call(instance, {
    action: "fit", ...id,
    roleId: "ROLE-" + suffix,
    roleReference: "role://" + suffix,
    workingView: "smoke",
  })).status, 200);
  assert.equal((await call(instance, {
    action: "leave", ...id, destination: "destination://factory",
  })).status, 200);
  return id;
}

test("Centre live round-trip keeps exact identity through return", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?roundtrip=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = await prepared(instance, "RT");

  const away = await call(instance, { action: "inspect", ...id });
  assert.equal(away.body.phase, "AWAY");
  assert.equal(away.body.work.status, "AWAY");
  assert.equal(away.body.envelope, undefined);

  const returned = await call(instance, {
    action: "return", ...id, payload: { status: "OK" },
  });
  assert.equal(returned.status, 200);
  assert.equal(returned.body.phase, "RETURNED");
  assert.equal(returned.body.work.status, "RETURNED");
  assert.equal(returned.body.workId, id.workId);
  assert.equal(returned.body.checkpointId, id.checkpointId);
  assert.equal(returned.body.returnAddress, id.returnAddress);
});

test("Centre live rejects legacy Lens fit fields", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?legacy-lens=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = await reviewed(instance, "LEGACY");
  const result = await call(instance, {
    action: "fit", ...id,
    lensId: "L-LEGACY",
    lensReference: "lens://legacy",
    fittedView: "legacy",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "LEGACY_LENS_CONTRACT_REJECTED");
});

test("pre-Reality cancel cancels, post-Reality cancel requires recovery", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?cancel=" + Date.now());

  const pre = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const preId = await prepared(pre, "PRE");
  const cancelled = await call(pre, { action: "cancel", ...preId });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.interruption.state, "CANCELLED_BY_OWNER");
  assert.equal(cancelled.body.work.status, "RETURNED");

  const post = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const postId = await prepared(post, "POST");
  const marked = await call(post, {
    action: "record_reality", ...postId,
    evidence: { kind: "deployment", reference: "run-123" },
  });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.realityExists, true);

  const recovery = await call(post, { action: "cancel", ...postId });
  assert.equal(recovery.status, 200);
  assert.equal(recovery.body.phase, "RECOVERY_REQUIRED");
  assert.equal(recovery.body.interruption.state, "RECOVERY_REQUIRED");
  assert.equal(recovery.body.interruption.cancellable, false);
  assert.equal(recovery.body.work.status, "AWAY");
});

test("wrong Return Address fails closed", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?return=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = await prepared(instance, "BADRET");
  const result = await call(instance, {
    action: "return",
    workId: id.workId,
    checkpointId: id.checkpointId,
    returnAddress: "CP-OTHER",
  });
  assert.equal(result.status, 409);
  assert.match(result.body.code, /Return Address does not match Checkpoint ID/);
});

test("new state instance resumes the same durable identity", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?resume=" + Date.now());
  const shared = new Map();
  const first = new GoHubCentreState({ storage: new MemoryStorage(shared) }, {});
  const id = await prepared(first, "RESTART");

  const second = new GoHubCentreState({ storage: new MemoryStorage(shared) }, {});
  const resumed = await call(second, { action: "inspect", ...id });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.workId, id.workId);
  assert.equal(resumed.body.checkpointId, id.checkpointId);
  assert.equal(resumed.body.returnAddress, id.returnAddress);
  assert.equal(resumed.body.work.status, "AWAY");
  assert.equal(resumed.body.work.role.roleReference, "role://RESTART");
  assert.equal(resumed.body.work.role.workingView, "smoke");
});


test("live Work Target survives durable inspect and Factory leave", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?target=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-TARGET", checkpointId: "CP-TARGET", returnAddress: "CP-TARGET" };
  assert.equal((await call(instance, { action: "start", ...id })).status, 200);
  const reviewed = await call(instance, {
    action: "review", ...id,
    task: "LIGHTHOUSE task",
    requestedResult: "LIGHTHOUSE result",
    authority: "BIG",
    targetId: "lighthouse",
  });
  assert.equal(reviewed.body.work.targetId, "lighthouse");

  assert.equal((await call(instance, {
    action: "fit", ...id,
    roleId: "ROLE-LH",
    roleReference: "role://lighthouse",
    workingView: "target-aware",
  })).status, 200);

  const left = await call(instance, {
    action: "leave", ...id,
    destination: "destination://factory",
    targetId: "lighthouse",
  });
  assert.equal(left.body.work.targetId, "lighthouse");
  assert.equal(left.body.envelope.targetId, "lighthouse");

  const inspected = await call(instance, { action: "inspect", ...id });
  assert.equal(inspected.body.work.targetId, "lighthouse");
  assert.equal(inspected.body.work.handoff.targetId, "lighthouse");
});


test("Centre ownership claim is atomic and rejects a competing owner", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?claim=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-CLAIM", checkpointId: "CP-CLAIM", returnAddress: "CP-CLAIM" };
  assert.equal((await call(instance, { action: "start", ...id })).status, 200);

  const claimed = await call(instance, {
    action: "claim", ...id, ownerId: "GO-A", expectedOwnershipRevision: 0, leaseSeconds: 300,
  });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.ownership.status, "CLAIMED");
  assert.equal(claimed.body.ownership.revision, 1);
  assert.equal(claimed.body.ownership.ownerId, "GO-A");
  assert.ok(claimed.body.ownership.leaseId);

  const conflict = await call(instance, {
    action: "claim", ...id, ownerId: "GO-B", expectedOwnershipRevision: 1, leaseSeconds: 300,
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "CENTRE_WORK_ALREADY_CLAIMED");
});

test("claimed Centre work requires the exact live lease for lifecycle mutation", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?guard=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-GUARD", checkpointId: "CP-GUARD", returnAddress: "CP-GUARD" };
  assert.equal((await call(instance, { action: "start", ...id })).status, 200);
  const claimed = await call(instance, {
    action: "claim", ...id, ownerId: "GO-A", expectedOwnershipRevision: 0, leaseSeconds: 300,
  });
  const lease = claimed.body.ownership;

  const blocked = await call(instance, {
    action: "review", ...id, task: "Guard", requestedResult: "Safe", authority: "BIG",
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, "Owner ID is required");

  const reviewedWithLease = await call(instance, {
    action: "review", ...id, task: "Guard", requestedResult: "Safe", authority: "BIG",
    ownerId: "GO-A", leaseId: lease.leaseId, expectedOwnershipRevision: lease.revision,
  });
  assert.equal(reviewedWithLease.status, 200);
});

test("ownership renew and release are revisioned and released work cannot mutate until reclaimed", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?renew=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-RENEW", checkpointId: "CP-RENEW", returnAddress: "CP-RENEW" };
  await call(instance, { action: "start", ...id });
  const claimed = await call(instance, {
    action: "claim", ...id, ownerId: "GO-A", expectedOwnershipRevision: 0, leaseSeconds: 300,
  });
  const lease1 = claimed.body.ownership;

  const stale = await call(instance, {
    action: "renew", ...id, ownerId: "GO-A", leaseId: lease1.leaseId,
    expectedOwnershipRevision: 0, leaseSeconds: 300,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "CENTRE_OWNERSHIP_STALE_REVISION");

  const renewed = await call(instance, {
    action: "renew", ...id, ownerId: "GO-A", leaseId: lease1.leaseId,
    expectedOwnershipRevision: 1, leaseSeconds: 600,
  });
  assert.equal(renewed.status, 200);
  assert.equal(renewed.body.ownership.revision, 2);

  const released = await call(instance, {
    action: "release", ...id, ownerId: "GO-A", leaseId: lease1.leaseId,
    expectedOwnershipRevision: 2,
  });
  assert.equal(released.status, 200);
  assert.equal(released.body.ownership.status, "OPEN");
  assert.equal(released.body.ownership.revision, 3);
  assert.equal(released.body.ownership.enforced, true);

  const blocked = await call(instance, {
    action: "review", ...id, task: "No owner", requestedResult: "Blocked", authority: "BIG",
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "CENTRE_WORK_UNCLAIMED");
});

test("expired ownership can be reclaimed by another owner at the current revision", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?reclaim=" + Date.now());
  const map = new Map();
  const storage = new MemoryStorage(map);
  const instance = new GoHubCentreState({ storage }, {});
  const id = { workId: "WORK-EXPIRED", checkpointId: "CP-EXPIRED", returnAddress: "CP-EXPIRED" };
  await call(instance, { action: "start", ...id });
  const claimed = await call(instance, {
    action: "claim", ...id, ownerId: "GO-A", expectedOwnershipRevision: 0, leaseSeconds: 300,
  });
  const state = structuredClone(map.get("state"));
  state.ownership.leaseExpiresAt = "2000-01-01T00:00:00.000Z";
  map.set("state", state);

  const reclaimed = await call(instance, {
    action: "claim", ...id, ownerId: "GO-B",
    expectedOwnershipRevision: claimed.body.ownership.revision, leaseSeconds: 300,
  });
  assert.equal(reclaimed.status, 200);
  assert.equal(reclaimed.body.ownership.ownerId, "GO-B");
  assert.equal(reclaimed.body.ownership.revision, 2);
  assert.equal(reclaimed.body.ownership.status, "CLAIMED");
});


test("Centre effect ledger is revisioned and duplicate receipts are idempotent", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?effect=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-EFFECT", checkpointId: "CP-EFFECT", returnAddress: "CP-EFFECT" };
  await call(instance, { action: "start", ...id });

  const first = await call(instance, {
    action: "record_effect", ...id,
    expectedEffectRevision: 0,
    effectId: "EFFECT-1", effectTool: "go_hub_put_file",
    effectReceiptRef: "commit:abc", effectStatus: "DONE",
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.effectLedger.revision, 1);
  assert.equal(first.body.effectRecorded, "RECORDED");

  const duplicate = await call(instance, {
    action: "record_effect", ...id,
    expectedEffectRevision: 1,
    effectId: "EFFECT-1", effectTool: "go_hub_put_file",
    effectReceiptRef: "commit:abc", effectStatus: "DONE",
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.effectLedger.revision, 1);
  assert.equal(duplicate.body.effectRecorded, "IDEMPOTENT");

  const conflict = await call(instance, {
    action: "record_effect", ...id,
    expectedEffectRevision: 1,
    effectId: "EFFECT-1", effectTool: "go_hub_put_file",
    effectReceiptRef: "commit:different", effectStatus: "DONE",
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "CENTRE_EFFECT_ID_CONFLICT");
});

test("Execution checkpoint binds a safe snapshot to effect revision and resumes with skip-effect IDs", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?exec-checkpoint=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-EXEC", checkpointId: "CP-EXEC", returnAddress: "CP-EXEC" };
  await call(instance, { action: "start", ...id });
  await call(instance, {
    action: "record_effect", ...id,
    expectedEffectRevision: 0,
    effectId: "EFFECT-A", effectTool: "drive.upload",
    effectReceiptRef: "drive:file-a", effectStatus: "DONE",
  });
  const saved = await call(instance, {
    action: "save_checkpoint", ...id,
    expectedExecutionCheckpointRevision: 0,
    expectedEffectRevision: 1,
    executionCheckpointId: "EXEC-CP-1",
    safePoint: true,
    resumeFrom: "archive-readback",
    snapshot: { artifactId: "A-1", destinationId: "drive:file-a" },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.executionCheckpoint.revision, 1);
  assert.equal(saved.body.executionCheckpoint.latest.effectRevision, 1);

  await call(instance, {
    action: "record_effect", ...id,
    expectedEffectRevision: 1,
    effectId: "EFFECT-B", effectTool: "github.merge",
    effectReceiptRef: "merge:def", effectStatus: "DONE",
  });
  const resumed = await call(instance, {
    action: "resume_checkpoint", ...id,
    expectedExecutionCheckpointRevision: 1,
    executionCheckpointId: "EXEC-CP-1",
    reconciliationEvidence: { kind: "readback", reference: "reconcile:pass" },
  });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.phase, "EXECUTION_RESUME");
  assert.equal(resumed.body.resumePlan.resumeFrom, "archive-readback");
  assert.deepEqual(resumed.body.resumePlan.skipEffectIds, ["EFFECT-A", "EFFECT-B"]);
  assert.equal(resumed.body.resumePlan.checkpointEffectRevision, 1);
  assert.equal(resumed.body.resumePlan.currentEffectRevision, 2);
});

test("Execution checkpoint refuses stale revisions, unsafe points and secret-bearing snapshots", async () => {
  const { GoHubCentreState } = await import(moduleUrl + "?exec-guard=" + Date.now());
  const instance = new GoHubCentreState({ storage: new MemoryStorage() }, {});
  const id = { workId: "WORK-EXEC-GUARD", checkpointId: "CP-EXEC-GUARD", returnAddress: "CP-EXEC-GUARD" };
  await call(instance, { action: "start", ...id });

  const unsafe = await call(instance, {
    action: "save_checkpoint", ...id,
    expectedExecutionCheckpointRevision: 0, expectedEffectRevision: 0,
    executionCheckpointId: "EXEC-BAD", safePoint: false, resumeFrom: "x", snapshot: { ok: true },
  });
  assert.equal(unsafe.status, 409);

  const secret = await call(instance, {
    action: "save_checkpoint", ...id,
    expectedExecutionCheckpointRevision: 0, expectedEffectRevision: 0,
    executionCheckpointId: "EXEC-SECRET", safePoint: true, resumeFrom: "x",
    snapshot: { apiToken: "must-not-store" },
  });
  assert.equal(secret.status, 400);
  assert.match(secret.body.code, /SECRET_FIELD_REJECTED/);
});
