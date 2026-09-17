"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-github-workspace.js")).href;
const repository = "pureekangraw-ops/standard-";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function factoryWorkContext() {
  return {
    workId: "WORK-GITHUB-WORKSPACE",
    checkpointId: "CENTRE-GITHUB-WORKSPACE",
    returnAddress: "CENTRE-GITHUB-WORKSPACE",
    destination: "destination://factory",
    task: "Operate repository through Factory",
    requestedResult: "Repository change remains governed",
    lensReference: "lens://github-workspace",
  };
}

test("workspace inspects a branch through the same-origin gateway without Authorization", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return response({
      repository,
      defaultBranch: "main",
      branch: "feature-a",
      baseSha: "base-1",
      headSha: "head-1",
      tree: [{ path: "src/app.js", type: "blob", sha: "blob-1" }],
    });
  };
  const { createGitHubWorkspace } = await import(`${moduleUrl}?inspect=${Date.now()}`);
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
  });
  const result = await workspace.inspect({ branch: "feature-a" });
  assert.equal(result.headSha, "head-1");
  assert.match(calls[0].url, /^\/hub\/api\/github-workspace\/inspect\?/);
  assert.match(calls[0].url, /branch=feature-a/);
  assert.equal("Authorization" in (calls[0].init.headers || {}), false);
  assert.equal("authorization" in (calls[0].init.headers || {}), false);
});

test("workspace lists recursive tree and reads a selected branch", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/tree?")) {
      return response({ tree: [{ path: "src/app.js", type: "blob", sha: "blob-1" }] });
    }
    return response({ content: "hello", sha: "blob-1" });
  };
  const { createGitHubWorkspace } = await import(`${moduleUrl}?tree=${Date.now()}`);
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
  });
  assert.deepEqual(await workspace.listTree({ ref: "feature-a" }), [
    { path: "src/app.js", type: "blob", sha: "blob-1" },
  ]);
  assert.equal(await workspace.readText("src/app.js", { branch: "feature-a" }), "hello");
  assert.equal(calls.some(call => call.url.includes("ref=feature-a")), true);
  for (const call of calls) {
    assert.equal("Authorization" in (call.init.headers || {}), false);
    assert.equal("authorization" in (call.init.headers || {}), false);
  }
});

test("Factory-routed workspace creates a branch, mutates files with SHA guards, and compares refs", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/branch")) return response({ branch: "feature-b", headSha: "base-2" }, 201);
    if (String(url).endsWith("/file") && init.method === "PUT") return response({ ok: true, commit: "commit-put", sha: "blob-new" });
    if (String(url).endsWith("/file") && init.method === "DELETE") return response({ ok: true, commit: "commit-del" });
    if (String(url).includes("/compare?")) return response({ status: "ahead", aheadBy: 1, behindBy: 0, files: [] });
    throw new Error(`unexpected request ${url}`);
  };
  const { createGitHubWorkspace } = await import(`${moduleUrl}?mutate=${Date.now()}`);
  const workContext = factoryWorkContext();
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
    workContext,
  });

  assert.deepEqual(await workspace.createBranch({ name: "feature-b", fromSha: "base-2" }), {
    branch: "feature-b", headSha: "base-2",
  });
  assert.deepEqual(await workspace.writeText("src/app.js", "next", { branch: "feature-b", expectedSha: "blob-old" }), {
    ok: true, commit: "commit-put", sha: "blob-new",
  });
  assert.deepEqual(await workspace.deletePath("src/app.js", { branch: "feature-b", expectedSha: "blob-new" }), {
    ok: true, commit: "commit-del",
  });
  assert.equal((await workspace.compare({ base: "main", head: "feature-b" })).aheadBy, 1);

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    repository, name: "feature-b", fromSha: "base-2", workContext,
  });
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    repository, path: "src/app.js", content: "next",
    branch: "feature-b", workContext, expectedSha: "blob-old",
  });
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    repository, path: "src/app.js",
    branch: "feature-b", expectedSha: "blob-new", workContext,
  });
  for (const call of calls) {
    assert.equal("Authorization" in (call.init.headers || {}), false);
    assert.equal("authorization" in (call.init.headers || {}), false);
  }
});

test("Factory-routed workspace opens PR and reruns CI while read-only PR/CI remains observable", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value.endsWith("/pull-request") && init.method === "POST") {
      return response({ number: 19, headBranch: "feature-c", headSha: "head-c", baseBranch: "main" }, 201);
    }
    if (value.includes("/pull-request?")) {
      return response({ number: 19, headBranch: "feature-c", headSha: "head-c", baseBranch: "main" });
    }
    if (value.includes("/ci?")) {
      return response({ headSha: "head-c", runs: [{ id: 7 }], checks: [{ id: 8 }] });
    }
    if (value.endsWith("/ci/rerun-failed") && init.method === "POST") {
      return response({ ok: true, runId: 7 }, 202);
    }
    throw new Error(`unexpected request ${value}`);
  };
  const { createGitHubWorkspace } = await import(`${moduleUrl}?prci=${Date.now()}`);
  const workContext = factoryWorkContext();
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
    workContext,
  });

  assert.equal((await workspace.openPullRequest({
    branch: "feature-c", base: "main", title: "Slice C", body: "details",
  })).headSha, "head-c");
  assert.equal((await workspace.getPullRequest({ number: 19 })).number, 19);
  assert.equal((await workspace.getCI({ sha: "head-c" })).headSha, "head-c");
  assert.deepEqual(await workspace.rerunFailed({ runId: 7 }), { ok: true, runId: 7 });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    repository, branch: "feature-c", base: "main", title: "Slice C", body: "details", workContext,
  });
  assert.match(calls[1].url, /number=19/);
  assert.match(calls[2].url, /sha=head-c/);
  assert.deepEqual(JSON.parse(calls[3].init.body), {
    repository, runId: 7, workContext,
  });
  for (const call of calls) {
    assert.equal("Authorization" in (call.init.headers || {}), false);
    assert.equal("authorization" in (call.init.headers || {}), false);
  }
});

test("workspace does not expose direct merge and still observes exact-SHA deploy runs", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/workflow-runs?")) {
      return response({ headSha: "merge-d", runs: [{ id: 91, conclusion: "success" }] });
    }
    throw new Error("unexpected request " + url);
  };
  const { createGitHubWorkspace } = await import(moduleUrl + "?merge-deploy=" + Date.now());
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
  });
  assert.equal(typeof workspace.mergePullRequest, "undefined");
  assert.equal((await workspace.getWorkflowRuns({ sha: "merge-d" })).headSha, "merge-d");
  assert.match(calls[0].url, /sha=merge-d/);
  assert.equal("Authorization" in (calls[0].init.headers || {}), false);
  assert.equal("authorization" in (calls[0].init.headers || {}), false);
});
