"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const counterUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter.mjs")).href;
const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
const oauthUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-oauth.mjs")).href;

function namespace(factory) {
  const instances = new Map();
  return {
    getByName(name) {
      if (!instances.has(name)) instances.set(name, factory());
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

test("LIGHT MCP picks up a waiting HANDOFF through governed Counter operations", async () => {
  const { GoHubCounterState, GoHubCounterInboxState, createCounterService } = await import(counterUrl + "?runtime=" + Date.now());
  const { createFactoryMcpWorker } = await import(workerUrl + "?runtime=" + Date.now());
  const { createAccessToken } = await import(oauthUrl + "?runtime=" + Date.now());

  const counterNamespace = namespace(() => new GoHubCounterState({ storage: storage() }, {}));
  const inboxNamespace = namespace(() => new GoHubCounterInboxState({ storage: storage() }, {}));
  const counter = createCounterService({ namespace: counterNamespace, inboxNamespace });
  const created = await counter.create({
    counterId: "COUNTER-RUNTIME-HANDOFF-001",
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
  });
  assert.equal(created.ok, true);

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
        ownership: {
          enforced: true,
          active: true,
          ownerId: "GO",
          leaseId: workContext.leaseId,
          revision: 21,
        },
      }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  }));
  const auditNamespace = namespace(() => ({
    async fetch(request) {
      const input = await request.json();
      auditCalls.push(input);
      return new Response(JSON.stringify({ ok: true, sequence: auditCalls.length }), { status: 200 });
    },
  }));
  const dispatchNamespace = {
    getByName() {
      return { fetch: async () => new Response(JSON.stringify({ code: "DISPATCH_NOT_SEEDED" }), { status: 404 }) };
    },
  };
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

  const inbox = await callMcp(worker, env, token, "go_hub_counter_inbox", { workContext, limit: 10 }, 1);
  assert.equal(inbox.inbox.status, "WAITING_PICKUP");
  assert.equal(inbox.inbox.count, 1);
  assert.equal(inbox.inbox.tickets[0].counterId, "COUNTER-RUNTIME-HANDOFF-001");
  assert.deepEqual(inbox.inbox.tickets[0].workContext, workContext);

  const seen = await callMcp(worker, env, token, "go_hub_counter_seen", {
    counterId: "COUNTER-RUNTIME-HANDOFF-001", workContext,
  }, 2);
  assert.equal(seen.counter.currentState, "SEEN");

  const answered = await callMcp(worker, env, token, "go_hub_counter_answer", {
    counterId: "COUNTER-RUNTIME-HANDOFF-001",
    status: "ANSWERED",
    answer: "Dispatcher contract is available for GO review.",
    sources: ["https://github.com/pureekangraw-ops/standard-"],
    evidence: [{ kind: "runtime-test", name: "go-light-counter-mcp-runtime" }],
    confidence: "verified",
    nextRoute: "GO",
    workContext,
  }, 3);
  assert.equal(answered.counter.currentState, "ANSWERED");
  assert.equal(answered.counter.workId, workContext.workId);
  assert.equal(answered.counter.checkpointId, workContext.checkpointId);
  assert.ok(centreCalls.length >= 2);
  assert.ok(auditCalls.length >= 2);

  const empty = await callMcp(worker, env, token, "go_hub_counter_inbox", { workContext, limit: 10 }, 4);
  assert.equal(empty.inbox.count, 0);
});
