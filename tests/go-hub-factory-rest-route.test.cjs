"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workspaceUrl = pathToFileURL(path.join(root, "go-hub-github-workspace.js")).href;
const edgeUrl = pathToFileURL(path.join(root, "go-hub-edge-worker.mjs")).href;
const codeUrl = pathToFileURL(path.join(root, "go-hub-code-module.js")).href;
const repository = "pureekangraw-ops/standard-";

function factoryWorkContext(overrides = {}) {
  return {
    workId: "WORK-FACTORY-REST",
    checkpointId: "CENTRE-FACTORY-REST",
    returnAddress: "CENTRE-FACTORY-REST",
    destination: "destination://factory",
    task: "Change repository through governed Factory route",
    requestedResult: "Mutation preserves exact City work context",
    lensReference: "lens://factory-rest-route",
    ...overrides,
  };
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("browser workspace keeps observation open but requires Factory context for every mutation", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value.includes("/inspect?")) {
      return response({ repository, defaultBranch: "main", branch: "main", baseSha: "base", headSha: "base", tree: [] });
    }
    if (value.endsWith("/branch")) return response({ branch: "feature-a", headSha: "base" }, 201);
    if (value.endsWith("/file") && init.method === "PUT") return response({ ok: true, commit: "put", sha: "blob" });
    if (value.endsWith("/file") && init.method === "DELETE") return response({ ok: true, commit: "del" });
    if (value.endsWith("/pull-request") && init.method === "POST") return response({ number: 73, headSha: "head" }, 201);
    if (value.endsWith("/ci/rerun-failed")) return response({ ok: true, runId: 7 }, 202);
    throw new Error(`unexpected request ${value}`);
  };
  const { createGitHubWorkspace } = await import(`${workspaceUrl}?route=${Date.now()}`);

  const observationOnly = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
  });
  await observationOnly.inspect();
  await assert.rejects(
    observationOnly.createBranch({ name: "feature-a", fromSha: "base" }),
    /Factory workContext/i,
  );
  assert.equal(typeof observationOnly.mergePullRequest, "undefined", "shell workspace must not expose direct REST merge");

  const workContext = factoryWorkContext();
  const routed = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
    workContext,
  });
  await routed.createBranch({ name: "feature-a", fromSha: "base" });
  await routed.writeText("src/app.js", "next", { branch: "feature-a", expectedSha: "old" });
  await routed.deletePath("src/app.js", { branch: "feature-a", expectedSha: "blob" });
  await routed.openPullRequest({ branch: "feature-a", base: "main", title: "Route", body: "details" });
  await routed.rerunFailed({ runId: 7 });

  const mutationCalls = calls.filter(call => call.init.method && call.init.method !== "GET");
  assert.equal(mutationCalls.length, 5);
  for (const call of mutationCalls) {
    assert.deepEqual(JSON.parse(call.init.body).workContext, workContext);
  }
});

test("production edge rejects Factory REST mutations without exact City context before delegate", async () => {
  const delegated = [];
  const delegate = {
    async fetch(request) {
      delegated.push(request);
      return response({ ok: true }, 201);
    },
  };
  const factoryMcp = { async fetch() { return response({ ok: true }); } };
  const { createEdgeWorkerHandler } = await import(`${edgeUrl}?factory-route=${Date.now()}`);
  const handler = createEdgeWorkerHandler({ delegate, factoryMcp });

  for (const workContext of [
    undefined,
    factoryWorkContext({ destination: "destination://linear" }),
    factoryWorkContext({ returnAddress: "CENTRE-OTHER" }),
  ]) {
    const body = { repository, name: "feature-a", fromSha: "base" };
    if (workContext) body.workContext = workContext;
    const result = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/branch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), {});
    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), { code: "INVALID_FACTORY_WORK_CONTEXT" });
  }
  assert.equal(delegated.length, 0);

  const accepted = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/branch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, name: "feature-a", fromSha: "base", workContext: factoryWorkContext() }),
  }), {});
  assert.equal(accepted.status, 201);
  assert.equal(delegated.length, 1);
});

test("production edge closes direct browser REST merge even with valid Factory context", async () => {
  let delegated = 0;
  const delegate = { async fetch() { delegated += 1; return response({ merged: true }); } };
  const factoryMcp = { async fetch() { return response({ ok: true }); } };
  const { createEdgeWorkerHandler } = await import(`${edgeUrl}?merge-closed=${Date.now()}`);
  const handler = createEdgeWorkerHandler({ delegate, factoryMcp });
  const result = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/pull-request/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repository,
      number: 73,
      expectedHeadSha: "head",
      method: "squash",
      workContext: factoryWorkContext(),
    }),
  }), {});
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), { code: "GOVERNED_MERGE_REQUIRED" });
  assert.equal(delegated, 0);
});

test("Code capability treats merge as Foreman-owned while deploy observation remains ready", async () => {
  const { createCodeCapability } = await import(`${codeUrl}?governed-merge=${Date.now()}`);
  const workspace = {
    workContext: factoryWorkContext(),
    inspect() {}, listTree() {}, listFiles() {}, readText() {}, writeText() {}, deletePath() {},
    createBranch() {}, compare() {}, openPullRequest() {}, getPullRequest() {}, getCI() {}, rerunFailed() {},
    getWorkflowRuns() {},
  };
  const capability = createCodeCapability({ workspace });
  assert.equal(capability.canMerge, false);
  assert.equal(capability.canObserveDeploy, true);
  assert.equal(capability.status, "ready");
});
