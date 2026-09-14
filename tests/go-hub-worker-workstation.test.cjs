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
    if (value === `https://api.github.com/repos/${repository}`) return jsonResponse({ default_branch: "main" });
    if (value === `https://api.github.com/repos/${repository}/branches/main`) return jsonResponse({ name: "main", commit: { sha: "base-1" } });
    if (value === `https://api.github.com/repos/${repository}/branches/feature-a`) return jsonResponse({ name: "feature-a", commit: { sha: "head-1" } });
    if (value === `https://api.github.com/repos/${repository}/git/trees/head-1?recursive=1`) {
      return jsonResponse({ sha: "head-1", tree: [
        { path: "go-hub-shell.js", type: "blob", sha: "blob-a" },
        { path: "tests", type: "tree", sha: "tree-b" },
      ] });
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?inspect=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request(`https://hub.example/hub/api/github-workspace/inspect?repository=${encodeURIComponent(repository)}&branch=feature-a`);
  const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    repository, defaultBranch: "main", branch: "feature-a", baseSha: "base-1", headSha: "head-1",
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

test("Worker rejects routine writes to the default branch before upstream mutation", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url) === `https://api.github.com/repos/${repository}`) return jsonResponse({ default_branch: "main" });
    throw new Error(`unexpected upstream ${url}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?mainwrite=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request("https://hub.example/hub/api/github-workspace/file", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, path: "src/app.js", content: "x", branch: "main" }),
  });
  const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "DEFAULT_BRANCH_WRITE_BLOCKED" });
  assert.deepEqual(calls, [`https://api.github.com/repos/${repository}`]);
});

test("Worker creates a branch from an exact SHA", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === `https://api.github.com/repos/${repository}/git/refs`) {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { ref: "refs/heads/feature-b", sha: "base-2" });
      return jsonResponse({ ref: "refs/heads/feature-b", object: { sha: "base-2" } }, 201);
    }
    throw new Error(`unexpected upstream ${url}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?branch=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request("https://hub.example/hub/api/github-workspace/branch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, name: "feature-b", fromSha: "base-2" }),
  });
  const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { branch: "feature-b", headSha: "base-2" });
});

test("Worker writes and deletes only on a non-default branch with optimistic SHA", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}`) return jsonResponse({ default_branch: "main" });
    if (value === `https://api.github.com/repos/${repository}/contents/src/app.js`) {
      const body = JSON.parse(init.body);
      if (init.method === "PUT") {
        assert.deepEqual(body, {
          message: "GO Hub: update src/app.js",
          content: btoa("next"),
          branch: "feature-b",
          sha: "blob-old",
        });
        return jsonResponse({ commit: { sha: "commit-put" }, content: { sha: "blob-new" } });
      }
      if (init.method === "DELETE") {
        assert.deepEqual(body, {
          message: "GO Hub: delete src/app.js",
          branch: "feature-b",
          sha: "blob-new",
        });
        return jsonResponse({ commit: { sha: "commit-del" } });
      }
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?mutate=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const put = new Request("https://hub.example/hub/api/github-workspace/file", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, path: "src/app.js", content: "next", branch: "feature-b", expectedSha: "blob-old" }),
  });
  const putResponse = await handler.fetch(put, { GITHUB_TOKEN: "token" });
  assert.equal(putResponse.status, 200);
  assert.deepEqual(await putResponse.json(), { ok: true, commit: "commit-put", sha: "blob-new" });

  const del = new Request("https://hub.example/hub/api/github-workspace/file", {
    method: "DELETE", headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, path: "src/app.js", branch: "feature-b", expectedSha: "blob-new" }),
  });
  const delResponse = await handler.fetch(del, { GITHUB_TOKEN: "token" });
  assert.equal(delResponse.status, 200);
  assert.deepEqual(await delResponse.json(), { ok: true, commit: "commit-del" });
  assert.equal(calls.filter(call => call.url === `https://api.github.com/repos/${repository}`).length, 2);
});

test("Worker compares branch against base and returns diff evidence", async () => {
  const fetchImpl = async url => {
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}/compare/main...feature-b`) {
      return jsonResponse({ status: "ahead", ahead_by: 2, behind_by: 0, files: [
        { filename: "src/app.js", status: "modified", additions: 3, deletions: 1, patch: "@@" },
      ] });
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?compare=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const request = new Request(`https://hub.example/hub/api/github-workspace/compare?repository=${encodeURIComponent(repository)}&base=main&head=feature-b`);
  const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ahead", aheadBy: 2, behindBy: 0,
    files: [{ path: "src/app.js", status: "modified", additions: 3, deletions: 1, patch: "@@" }],
  });
});
