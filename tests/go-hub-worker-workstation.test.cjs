"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-worker.mjs")).href;
const repository = "pureekangraw-ops/standard-";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Worker inspect resolves default/base/head and recursive tree", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}`) {
      return jsonResponse({ default_branch: "main" });
    }
    if (value === `https://api.github.com/repos/${repository}/branches/main`) {
      return jsonResponse({ name: "main", commit: { sha: "base-1" } });
    }
    if (value === `https://api.github.com/repos/${repository}/branches/feature-a`) {
      return jsonResponse({ name: "feature-a", commit: { sha: "head-1" } });
    }
    if (value === `https://api.github.com/repos/${repository}/git/trees/head-1?recursive=1`) {
      return jsonResponse({
        sha: "head-1",
        tree: [
          { path: "go-hub-shell.js", type: "blob", sha: "blob-a" },
          { path: "tests", type: "tree", sha: "tree-b" },
        ],
      });
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?inspect=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request(`https://hub.example/hub/api/github-workspace/inspect?repository=${encodeURIComponent(repository)}&branch=feature-a`);
  const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    repository,
    defaultBranch: "main",
    branch: "feature-a",
    baseSha: "base-1",
    headSha: "head-1",
    tree: [
      { path: "go-hub-shell.js", type: "blob", sha: "blob-a" },
      { path: "tests", type: "tree", sha: "tree-b" },
    ],
  });
  assert.equal(calls.some(call => call.url.endsWith("/git/trees/head-1?recursive=1")), true);
});

test("Worker file read is branch aware", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}/contents/src/app.js?ref=feature-a`) {
      return jsonResponse({ type: "file", encoding: "base64", content: btoa("hello"), sha: "blob-1" });
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?read=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request(`https://hub.example/hub/api/github-workspace/file?repository=${encodeURIComponent(repository)}&path=src%2Fapp.js&ref=feature-a`);
  const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { content: "hello", sha: "blob-1" });
  assert.deepEqual(calls, [`https://api.github.com/repos/${repository}/contents/src/app.js?ref=feature-a`]);
});
