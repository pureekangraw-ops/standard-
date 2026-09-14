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


test("Worker opens or updates a pull request while preserving exact head/base", async () => {
  for (const existing of [null, { number: 23 }]) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const value = String(url);
      if (value === `https://api.github.com/repos/${repository}/pulls?state=open&head=pureekangraw-ops%3Afeature-c&base=main`) {
        return jsonResponse(existing ? [existing] : []);
      }
      if (!existing && value === `https://api.github.com/repos/${repository}/pulls`) {
        assert.equal(init.method, "POST");
        assert.deepEqual(JSON.parse(init.body), { title: "Slice C", body: "details", head: "feature-c", base: "main" });
        return jsonResponse({ number: 24, html_url: "https://github.test/pr/24", state: "open", head: { ref: "feature-c", sha: "head-c" }, base: { ref: "main", sha: "base-c" } }, 201);
      }
      if (existing && value === `https://api.github.com/repos/${repository}/pulls/23`) {
        assert.equal(init.method, "PATCH");
        assert.deepEqual(JSON.parse(init.body), { title: "Slice C", body: "details", base: "main" });
        return jsonResponse({ number: 23, html_url: "https://github.test/pr/23", state: "open", head: { ref: "feature-c", sha: "head-c" }, base: { ref: "main", sha: "base-c" } });
      }
      throw new Error(`unexpected upstream ${value}`);
    };
    const { createWorkerHandler } = await import(`${workerUrl}?pr=${Date.now()}-${Boolean(existing)}`);
    const handler = createWorkerHandler({ fetchImpl });
    const response = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/pull-request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository, branch: "feature-c", base: "main", title: "Slice C", body: "details" }),
    }), { GITHUB_TOKEN: "token" });
    assert.equal(response.status, existing ? 200 : 201);
    const payload = await response.json();
    assert.equal(payload.number, existing ? 23 : 24);
    assert.equal(payload.headBranch, "feature-c");
    assert.equal(payload.headSha, "head-c");
    assert.equal(payload.baseBranch, "main");
  }
});

test("Worker reads one pull request with exact head evidence", async () => {
  const fetchImpl = async url => {
    assert.equal(String(url), `https://api.github.com/repos/${repository}/pulls/19`);
    return jsonResponse({ number: 19, html_url: "https://github.test/pr/19", state: "open", mergeable: true, head: { ref: "feature-c", sha: "head-c" }, base: { ref: "main", sha: "base-c" } });
  };
  const { createWorkerHandler } = await import(`${workerUrl}?getpr=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const response = await handler.fetch(new Request(`https://hub.example/hub/api/github-workspace/pull-request?repository=${encodeURIComponent(repository)}&number=19`), { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    number: 19, url: "https://github.test/pr/19", state: "open", mergeable: true,
    headBranch: "feature-c", headSha: "head-c", baseBranch: "main", baseSha: "base-c",
  });
});

test("Worker returns workflow runs and checks only for the requested head SHA", async () => {
  const fetchImpl = async url => {
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}/actions/runs?head_sha=head-c`) {
      return jsonResponse({ workflow_runs: [
        { id: 7, name: "Safety Gate", status: "completed", conclusion: "success", head_sha: "head-c", html_url: "https://github.test/run/7" },
        { id: 6, name: "Old", status: "completed", conclusion: "failure", head_sha: "old-head" },
      ] });
    }
    if (value === `https://api.github.com/repos/${repository}/commits/head-c/check-runs`) {
      return jsonResponse({ check_runs: [
        { id: 8, name: "test", status: "completed", conclusion: "success", head_sha: "head-c", html_url: "https://github.test/check/8" },
        { id: 5, name: "old", status: "completed", conclusion: "failure", head_sha: "old-head" },
      ] });
    }
    throw new Error(`unexpected upstream ${value}`);
  };
  const { createWorkerHandler } = await import(`${workerUrl}?ci=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const response = await handler.fetch(new Request(`https://hub.example/hub/api/github-workspace/ci?repository=${encodeURIComponent(repository)}&sha=head-c`), { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    headSha: "head-c",
    runs: [{ id: 7, name: "Safety Gate", status: "completed", conclusion: "success", headSha: "head-c", url: "https://github.test/run/7" }],
    checks: [{ id: 8, name: "test", status: "completed", conclusion: "success", headSha: "head-c", url: "https://github.test/check/8" }],
  });
});

test("Worker maps rerun failed to GitHub's failed-jobs endpoint", async () => {
  const fetchImpl = async (url, init = {}) => {
    assert.equal(String(url), `https://api.github.com/repos/${repository}/actions/runs/77/rerun-failed-jobs`);
    assert.equal(init.method, "POST");
    return new Response(null, { status: 201 });
  };
  const { createWorkerHandler } = await import(`${workerUrl}?rerun=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const response = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/ci/rerun-failed", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, runId: 77 }),
  }), { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, runId: 77 });
});


test("Worker merges only when expected head is current and exact-head CI is green", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (value === "https://api.github.com/repos/" + repository + "/pulls/19") {
      return jsonResponse({ number: 19, mergeable: true, head: { ref: "feature-d", sha: "head-d" }, base: { ref: "main", sha: "base-d" } });
    }
    if (value === "https://api.github.com/repos/" + repository + "/actions/runs?head_sha=head-d") {
      return jsonResponse({ workflow_runs: [
        { id: 70, name: "Safety Gate", status: "completed", conclusion: "success", head_sha: "head-d" },
      ] });
    }
    if (value === "https://api.github.com/repos/" + repository + "/commits/head-d/check-runs") {
      return jsonResponse({ check_runs: [
        { id: 80, name: "test", status: "completed", conclusion: "success", head_sha: "head-d" },
      ] });
    }
    if (value === "https://api.github.com/repos/" + repository + "/pulls/19/merge") {
      assert.equal(init.method, "PUT");
      assert.deepEqual(JSON.parse(init.body), { sha: "head-d", merge_method: "squash" });
      return jsonResponse({ merged: true, sha: "merge-d", message: "Pull Request successfully merged" });
    }
    throw new Error("unexpected upstream " + value);
  };
  const { createWorkerHandler } = await import(workerUrl + "?merge=" + Date.now());
  const handler = createWorkerHandler({ fetchImpl });
  const response = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/pull-request/merge", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository, number: 19, expectedHeadSha: "head-d", method: "squash" }),
  }), { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { merged: true, mergeSha: "merge-d", headSha: "head-d" });
  assert.equal(calls.at(-1).url.endsWith("/pulls/19/merge"), true);
});

test("Worker blocks stale-head and non-green CI merges before upstream merge", async () => {
  for (const scenario of ["stale", "failed-ci"]) {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      const value = String(url);
      if (value.endsWith("/pulls/19")) {
        return jsonResponse({ number: 19, mergeable: true, head: { ref: "feature-d", sha: "head-current" }, base: { ref: "main", sha: "base-d" } });
      }
      if (value.endsWith("/actions/runs?head_sha=head-current")) {
        return jsonResponse({ workflow_runs: [
          { id: 70, name: "Safety Gate", status: "completed", conclusion: "failure", head_sha: "head-current" },
        ] });
      }
      if (value.endsWith("/commits/head-current/check-runs")) {
        return jsonResponse({ check_runs: [] });
      }
      throw new Error("unexpected upstream " + value);
    };
    const { createWorkerHandler } = await import(workerUrl + "?merge-block=" + scenario + Date.now());
    const handler = createWorkerHandler({ fetchImpl });
    const response = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/pull-request/merge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository, number: 19,
        expectedHeadSha: scenario === "stale" ? "head-stale" : "head-current",
        method: "merge",
      }),
    }), { GITHUB_TOKEN: "token" });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: scenario === "stale" ? "STALE_PULL_REQUEST_HEAD" : "CURRENT_HEAD_CI_NOT_GREEN",
    });
    assert.equal(calls.some(value => value.endsWith("/pulls/19/merge")), false);
  }
});

test("Worker observes workflow runs for one exact deploy SHA", async () => {
  const fetchImpl = async url => {
    assert.equal(String(url), "https://api.github.com/repos/" + repository + "/actions/runs?head_sha=merge-d");
    return jsonResponse({ workflow_runs: [
      { id: 91, name: "Deploy", status: "completed", conclusion: "success", head_sha: "merge-d", html_url: "https://github.test/run/91" },
      { id: 90, name: "Old", status: "completed", conclusion: "success", head_sha: "old" },
    ] });
  };
  const { createWorkerHandler } = await import(workerUrl + "?deploy-runs=" + Date.now());
  const handler = createWorkerHandler({ fetchImpl });
  const response = await handler.fetch(new Request(
    "https://hub.example/hub/api/github-workspace/workflow-runs?repository=" + encodeURIComponent(repository) + "&sha=merge-d"
  ), { GITHUB_TOKEN: "token" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    headSha: "merge-d",
    runs: [{ id: 91, name: "Deploy", status: "completed", conclusion: "success", headSha: "merge-d", url: "https://github.test/run/91" }],
  });
});
