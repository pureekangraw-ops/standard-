"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workspaceUrl = pathToFileURL(path.join(root, "go-hub-github-workspace.js")).href;
const workerUrl = pathToFileURL(path.join(root, "go-hub-worker.mjs")).href;
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

test("Factory REST mutation endpoints reject missing or wrong City context before GitHub upstream", async () => {
  const upstream = [];
  const fetchImpl = async (url, init = {}) => {
    upstream.push({ url: String(url), init });
    if (String(url) === `https://api.github.com/repos/${repository}/git/refs`) {
      return response({ ref: "refs/heads/feature-a", object: { sha: "base" } }, 201);
    }
    throw new Error(`unexpected upstream ${url}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?factory-route=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });

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
    }), { GITHUB_TOKEN: "token" });
    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), { code: "INVALID_FACTORY_WORK_CONTEXT" });
  }
  assert.equal(upstream.length, 0);

  const accepted = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/branch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, name: "feature-a", fromSha: "base", workContext: factoryWorkContext() }),
  }), { GITHUB_TOKEN: "token" });
  assert.equal(accepted.status, 201);
  assert.equal(upstream.length, 1);
});

test("direct browser REST merge is closed even with valid Factory context", async () => {
  let upstreamCalls = 0;
  const { createWorkerHandler } = await import(`${workerUrl}?merge-closed=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl: async () => { upstreamCalls += 1; return response({}); } });
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
  }), { GITHUB_TOKEN: "token" });
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), { code: "GOVERNED_MERGE_REQUIRED" });
  assert.equal(upstreamCalls, 0);
});
