"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-worker.mjs")).href;

function githubResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function repository(index, overrides = {}) {
  return {
    name: `repo-${index}`,
    full_name: `pureekangraw-ops/repo-${index}`,
    private: false,
    default_branch: "main",
    updated_at: "2026-09-15T00:00:00Z",
    archived: false,
    html_url: `https://github.com/pureekangraw-ops/repo-${index}`,
    owner: { login: "pureekangraw-ops" },
    ...overrides,
  };
}

test("lifecycle lists every allowed-owner repository with safe metadata and pagination", async () => {
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => repository(index + 1));
  firstPage[99] = repository(100, {
    name: "foreign",
    full_name: "someone-else/foreign",
    owner: { login: "someone-else" },
  });

  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const page = new URL(String(url)).searchParams.get("page");
    if (page === "1") return githubResponse(firstPage);
    if (page === "2") {
      return githubResponse([
        repository(101, {
          private: true,
          default_branch: "trunk",
          archived: true,
          updated_at: "2026-09-15T01:02:03Z",
        }),
      ]);
    }
    throw new Error("unexpected upstream " + url);
  };

  const module = await import(workerUrl + "?list-repositories=" + Date.now());
  const lifecycle = module.createGithubLifecycleService({ fetchImpl, token: "secret-token" });
  const response = await lifecycle.listRepositories({});
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.owner, "pureekangraw-ops");
  assert.equal(payload.count, 100);
  assert.equal(payload.repositories.some(item => item.fullName === "someone-else/foreign"), false);
  assert.deepEqual(payload.repositories.at(-1), {
    name: "repo-101",
    fullName: "pureekangraw-ops/repo-101",
    visibility: "private",
    defaultBranch: "trunk",
    updatedAt: "2026-09-15T01:02:03Z",
    archived: true,
    url: "https://github.com/pureekangraw-ops/repo-101",
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.init.headers.authorization === "Bearer secret-token"));
});

test("repository listing fails closed when GitHub rejects any page", async () => {
  const module = await import(workerUrl + "?list-repositories-error=" + Date.now());
  const lifecycle = module.createGithubLifecycleService({
    token: "secret-token",
    fetchImpl: async () => githubResponse({ message: "rate limited" }, 403),
  });

  const response = await lifecycle.listRepositories({});
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    code: "GITHUB_UPSTREAM_ERROR",
    status: 403,
  });
});
