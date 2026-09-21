"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const counterUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter.mjs")).href;
const dispatcherUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter-dispatcher.mjs")).href;
const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
const oauthUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-oauth.mjs")).href;

function namespace(factory) {
  const instances = new Map();
  return {
    getByName(name) {
      if (!instances.has(name)) instances.set(name, factory(name));
      const instance = instances.get(name);
      return { fetch: request => instance.fetch(request) };
    },
  };
}

function storage() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async setAlarm() {},
  };
}

const workContext = {
  workId: "WORK-GO-LIGHT-COUNTER-20260919-001",
  checkpointId: "CP-GO-LIGHT-COUNTER-001",
  returnAddress: "CP-GO-LIGHT-COUNTER-001",
  destination: "destination://counter",
  task: "Pickup and answer one governed HANDOFF Counter ticket.",
  requestedResult: "Answer with evidence through LIGHT MCP.",
  lensReference: "GO-HANDOFF-REVIEW-011",
  ownerId: "GO",
  leaseId: "8b2bb78d-f728-40bb-aa97-782fda11ae2c",
  ownershipRevision: 21,
};

async function callMcp(worker, env, token, name, args, id) {
  const response = await worker.fetch(new Request("https://hub.example/mcp/light", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      origin: "https://www.notion.so",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.error, undefined, JSON.stringify(payload));
  return payload.result.structuredContent;
}

test("public LIGHT MCP Counter E2E enforces Centre ownership and lease state", async () => {
  const { GoHubCounterState, GoHubCounterInboxState } = await import(counterUrl + "?final-e2e=" + Date.now());
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?final-e2e=" + Date.now());
  const { createFactoryMcpWorker } = await import(workerUrl + "?final-e2e=" + Date.now());
  const { createAccessToken } = await import(oauthUrl + "?final-e2e=" + Date.now());

  const counterNamespace = namespace(() => new GoHubCounterState({ storage: storage() }, {}));
  const inboxNamespace = namespace(() => new GoHubCounterInboxState({ storage: storage() }, {}));
  const dispatchNamespace = namespace(() => new GoHubCounterDispatchState({ storage: storage() }, {}));
  const centreCalls = [];
  const auditCalls = [];
  const centreNamespace = namespace(() => ({
    async fetch(request) {
      const input = await request.json();
      centreCalls.push(input);
      if (input.action === "inspect") return new Response(JSON.stringify({
        ok: true,
        workId: workContext.workId,
        checkpointId: workContext.checkpointId,
        ownership: { enforced: true, active: true, ownerId: "GO", leaseId: workContext.leaseId, revision: 21 },
      }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  }));
  const auditNamespace = namespace(() => ({
    async fetch(request) {
      auditCalls.push(await request.json());
      return new Response(JSON.stringify({ ok: true, sequence: auditCalls.length }), { status: 200 });
    },
  }));
  const worker = createFactoryMcpWorker({ fetchImpl: async () => new Response("unused", { status: 500 }) });
  const env = {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: "master-secret",
    GOHUB_OWNER_PASSCODE: "owner-passcode",
    GO_HUB_COUNTER_STATE: counterNamespace,
    GO_HUB_COUNTER_INBOX: inboxNamespace,
    GO_HUB_COUNTER_DISPATCH_STATE: dispatchNamespace,
    GO_HUB_CENTRE_STATE: centreNamespace,
    GO_HUB_GLOBAL_AUDIT: auditNamespace,
  };
  const token = await createAccessToken({
    issuer: "https://hub.example",
    signingKey: "master-secret",
    resource: "https://hub.example/mcp/light",
    subject: "light",
    scope: "go-hub-light",
    ttlSeconds: 3600,
  });

  const created = await callMcp(worker, env, token, "go_hub_counter_create", {
    counterId: "COUNTER-FINAL-E2E-001",
    mode: "HANDOFF",
    request: "Read the current dispatcher contract.",
    requestedResult: "Evidence-backed dispatcher answer.",
    authority: "GO governs route; LIGHT uses bounded tools only.",
    target: "pureekangraw-ops/standard-",
    projectRef: "GO Hub",
    context: { repository: "pureekangraw-ops/standard-" },
    sourceHints: ["GitHub"],
    doNotChange: ["Do not search Notion", "Do not delete or merge"],
    workContext,
  }, 1);
  assert.equal(created.counter.currentState, "OPEN");
  assert.equal(created.dispatch.legs.LIGHT.status, "WAITING_PICKUP");

  const inbox = await callMcp(worker, env, token, "go_hub_counter_inbox", { workContext, limit: 10 }, 2);
  assert.equal(inbox.inbox.status, "WAITING_PICKUP");
  assert.equal(inbox.inbox.count, 1);
  assert.equal(inbox.inbox.tickets[0].counterId, "COUNTER-FINAL-E2E-001");

  const seen = await callMcp(worker, env, token, "go_hub_counter_seen", {
    counterId: "COUNTER-FINAL-E2E-001", workContext,
  }, 3);
  assert.equal(seen.counter.currentState, "SEEN");

  const answered = await callMcp(worker, env, token, "go_hub_counter_answer", {
    counterId: "COUNTER-FINAL-E2E-001",
    status: "ANSWERED",
    answer: "Dispatcher contract is available for GO review.",
    sources: ["https://github.com/pureekangraw-ops/standard-"],
    evidence: [{ kind: "runtime-test", name: "public-light-counter-e2e" }],
    confidence: "verified",
    nextRoute: "GO",
    workContext,
  }, 4);
  assert.equal(answered.counter.currentState, "ANSWERED");
  assert.equal(answered.counter.workId, workContext.workId);
  assert.equal(answered.counter.checkpointId, workContext.checkpointId);
  assert.ok(centreCalls.length >= 3);
  assert.ok(auditCalls.length >= 3);

  const empty = await callMcp(worker, env, token, "go_hub_counter_inbox", { workContext, limit: 10 }, 5);
  assert.equal(empty.inbox.count, 0);

  const missingLease = await callMcp(worker, env, token, "go_hub_counter_create", {
    counterId: "COUNTER-FINAL-E2E-MISSING-LEASE",
    mode: "HANDOFF",
    request: "Must be rejected without lease.",
    requestedResult: "No creation.",
    workContext: { ...workContext, leaseId: undefined },
  }, 6);
  assert.equal(missingLease.code, "CENTRE_WORK_LEASE_REQUIRED");

  const staleLease = await callMcp(worker, env, token, "go_hub_counter_create", {
    counterId: "COUNTER-FINAL-E2E-STALE-LEASE",
    mode: "HANDOFF",
    request: "Must be rejected with stale ownership revision.",
    requestedResult: "No creation.",
    workContext: { ...workContext, ownershipRevision: 20 },
  }, 7);
  assert.equal(staleLease.code, "CENTRE_OWNERSHIP_STALE_REVISION");
});
