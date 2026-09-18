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
  assert.equal(resumed.body.work.lens, null);
});
