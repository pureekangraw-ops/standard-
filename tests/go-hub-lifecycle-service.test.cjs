"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-worker.mjs")).href;

test("shared lifecycle service exposes the guarded workstation contract", async () => {
  const module = await import(workerUrl + "?service-red=" + Date.now());
  assert.equal(typeof module.createGithubLifecycleService, "function");

  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url) === "https://api.github.com/repos/pureekangraw-ops/standard-") {
      return new Response(JSON.stringify({ default_branch: "main" }), {
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected upstream " + url);
  };

  const lifecycle = module.createGithubLifecycleService({ fetchImpl, token: "token" });
  assert.deepEqual(
    Object.keys(lifecycle).sort(),
    [
      "compare", "createBranch", "deleteFile", "getCI", "getFailureEvidence", "getPullRequest",
      "getWorkflowRuns", "inspect", "listRepositories", "mergePullRequest", "openPullRequest",
      "putFile", "readFile", "rerunFailed", "tree",
    ],
  );

  const response = await lifecycle.putFile({
    repository: "pureekangraw-ops/standard-",
    path: "src/app.js",
    branch: "main",
    content: "blocked",
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "DEFAULT_BRANCH_WRITE_BLOCKED" });
  assert.deepEqual(calls, ["https://api.github.com/repos/pureekangraw-ops/standard-"]);
});


test("exact-head merge accepts completed success/skipped/neutral signals and still rejects real failure", async () => {
  const module = await import(workerUrl + "?ci-terminal=" + Date.now());
  const sha = "abc123";
  const repository = "pureekangraw-ops/example";
  const pullUrl = `https://api.github.com/repos/${repository}/pulls/7`;
  const runsUrl = `https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}`;
  const checksUrl = `https://api.github.com/repos/${repository}/commits/${sha}/check-runs`;

  function response(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  let failed = false;
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target === pullUrl && String(init.method || "GET") === "GET") {
      return response({ head: { sha } });
    }
    if (target === runsUrl) {
      return response({ workflow_runs: [
        { id:1, head_sha:sha, status:"completed", conclusion:"success" },
      ] });
    }
    if (target === checksUrl) {
      return response({ check_runs: failed
        ? [{ id:2, head_sha:sha, status:"completed", conclusion:"failure" }]
        : [
            { id:2, head_sha:sha, status:"completed", conclusion:"success" },
            { id:3, head_sha:sha, status:"completed", conclusion:"skipped" },
            { id:4, head_sha:sha, status:"completed", conclusion:"neutral" },
          ] });
    }
    if (target === `${pullUrl}/merge` && String(init.method || "") === "PUT") {
      return response({ merged:true, sha:"merge-sha" });
    }
    throw new Error("unexpected upstream " + target);
  };

  const lifecycle = module.createGithubLifecycleService({ fetchImpl, token:"token" });
  const accepted = await lifecycle.mergePullRequest({
    repository,
    number:7,
    expectedHeadSha:sha,
    method:"squash",
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { merged:true, mergeSha:"merge-sha", headSha:sha });

  failed = true;
  const rejected = await lifecycle.mergePullRequest({
    repository,
    number:7,
    expectedHeadSha:sha,
    method:"squash",
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { code:"CURRENT_HEAD_CI_NOT_GREEN" });
});


test("merge gate permits only pre-existing external failures when owned exact-head CI is green", async () => {
  const module = await import(workerUrl + "?baseline-external=" + Date.now());
  const repository = "pureekangraw-ops/example";
  const headSha = "head-123";
  const baseSha = "base-123";
  const pullUrl = `https://api.github.com/repos/${repository}/pulls/9`;
  const headRunsUrl = `https://api.github.com/repos/${repository}/actions/runs?head_sha=${headSha}`;
  const headChecksUrl = `https://api.github.com/repos/${repository}/commits/${headSha}/check-runs`;
  const baseRunsUrl = `https://api.github.com/repos/${repository}/actions/runs?head_sha=${baseSha}`;
  const baseChecksUrl = `https://api.github.com/repos/${repository}/commits/${baseSha}/check-runs`;

  function response(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers:{ "content-type":"application/json" },
    });
  }

  let mode = "baseline-same";
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target === pullUrl && String(init.method || "GET") === "GET") {
      return response({ head:{ sha:headSha }, base:{ sha:baseSha } });
    }
    if (target === headRunsUrl) {
      return response({ workflow_runs:[
        { id:1, head_sha:headSha, status:"completed", conclusion:"success" },
      ] });
    }
    if (target === headChecksUrl) {
      const owned = mode === "owned-fail"
        ? { id:2, head_sha:headSha, name:"test", status:"completed", conclusion:"failure", app:{ slug:"github-actions" } }
        : { id:2, head_sha:headSha, name:"test", status:"completed", conclusion:"success", app:{ slug:"github-actions" } };
      return response({ check_runs:[
        owned,
        { id:3, head_sha:headSha, name:"Workers Builds: external", status:"completed", conclusion:"failure", app:{ slug:"cloudflare-workers-and-pages" } },
      ] });
    }
    if (target === baseRunsUrl) {
      return response({ workflow_runs:[
        { id:4, head_sha:baseSha, status:"completed", conclusion:"success" },
      ] });
    }
    if (target === baseChecksUrl) {
      return response({ check_runs: mode === "new-external"
        ? []
        : [{ id:5, head_sha:baseSha, name:"Workers Builds: external", status:"completed", conclusion:"failure", app:{ slug:"cloudflare-workers-and-pages" } }]
      });
    }
    if (target === `${pullUrl}/merge` && String(init.method || "") === "PUT") {
      return response({ merged:true, sha:"merge-9" });
    }
    throw new Error("unexpected upstream " + target);
  };

  const lifecycle = module.createGithubLifecycleService({ fetchImpl, token:"token" });

  const allowed = await lifecycle.mergePullRequest({
    repository, number:9, expectedHeadSha:headSha, method:"squash",
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { merged:true, mergeSha:"merge-9", headSha });

  mode = "new-external";
  const blockedExternal = await lifecycle.mergePullRequest({
    repository, number:9, expectedHeadSha:headSha, method:"squash",
  });
  assert.equal(blockedExternal.status, 409);
  assert.deepEqual(await blockedExternal.json(), { code:"CURRENT_HEAD_CI_NOT_GREEN" });

  mode = "owned-fail";
  const blockedOwned = await lifecycle.mergePullRequest({
    repository, number:9, expectedHeadSha:headSha, method:"squash",
  });
  assert.equal(blockedOwned.status, 409);
  assert.deepEqual(await blockedOwned.json(), { code:"CURRENT_HEAD_CI_NOT_GREEN" });
});
