"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-worker.mjs")).href;
const workspaceUrl = pathToFileURL(path.join(root, "go-hub-github-workspace.js")).href;
const repository = "pureekangraw-ops/standard-";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("workspace can create a new file without an expected blob SHA", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return response({ ok: true, commit: "commit-new", sha: "blob-new" });
  };
  const { createGitHubWorkspace } = await import(`${workspaceUrl}?create=${Date.now()}`);
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl,
  });

  assert.deepEqual(
    await workspace.writeText("src/new.js", "hello", { branch: "feature-create" }),
    { ok: true, commit: "commit-new", sha: "blob-new" },
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    repository,
    path: "src/new.js",
    content: "hello",
    branch: "feature-create",
  });
});

test("Worker creates a new file on a non-default branch without sending sha", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}`) {
      return response({ default_branch: "main" });
    }
    if (value === `https://api.github.com/repos/${repository}/contents/src/new.js`) {
      assert.equal(init.method, "PUT");
      assert.deepEqual(JSON.parse(init.body), {
        message: "GO Hub: create src/new.js",
        content: btoa("hello"),
        branch: "feature-create",
      });
      return response({ commit: { sha: "commit-new" }, content: { sha: "blob-new" } });
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?create=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request("https://hub.example/hub/api/github-workspace/file", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repository,
      path: "src/new.js",
      content: "hello",
      branch: "feature-create",
    }),
  });

  const result = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, commit: "commit-new", sha: "blob-new" });
});
