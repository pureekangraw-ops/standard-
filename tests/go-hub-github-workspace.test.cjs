"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-github-workspace.js")).href;

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("workspace inspects a branch through the same-origin gateway without Authorization", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return response({
      repository: "pureekangraw-ops/standard-",
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
    repository: "pureekangraw-ops/standard-",
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
    repository: "pureekangraw-ops/standard-",
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
