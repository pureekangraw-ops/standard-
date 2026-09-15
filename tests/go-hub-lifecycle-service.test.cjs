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
