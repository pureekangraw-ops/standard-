"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;

test("guarded stale-work cancellation verifies GitHub closed/unmerged truth before Foreman cancel", async () => {
  const { createFactoryGuardedLifecycle } = await import(workerUrl + "?cancel-guard=" + Date.now());
  const calls = [];
  const lifecycle = {
    async getPullRequest() {
      return new Response(JSON.stringify({ number: 69, state: "closed", merged: false, headSha: "head-69" }), { headers: { "content-type": "application/json" } });
    },
  };
  const factory = {
    async foreman(input) {
      calls.push(structuredClone(input));
      return new Response(JSON.stringify({ outcome: { status: "CANCELLED" } }), { headers: { "content-type": "application/json" } });
    },
  };
  const guarded = createFactoryGuardedLifecycle({ lifecycle, factory });
  const response = await guarded.cancelStaleFactoryWork({
    repository: "pureekangraw-ops/standard-", number: 69, goId: "go-mimir-knowledge", jobId: "job-pr-69",
    workContext: { workId: "WORK-69", checkpointId: "CENTRE-69", returnAddress: "CENTRE-69", destination: "destination://factory", task: "Cancel stale PR ownership", requestedResult: "Release only closed unmerged work", lensReference: "lens://factory" },
  });
  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, "cancel");
  assert.deepEqual(calls[0].cancellation.pullRequest, { number: 69, state: "closed", merged: false, headSha: "head-69" });
});

test("guarded stale-work cancellation refuses open or merged pull requests", async () => {
  const { createFactoryGuardedLifecycle } = await import(workerUrl + "?cancel-refuse=" + Date.now());
  let foremanCalls = 0;
  for (const proof of [
    { number: 69, state: "open", merged: false, headSha: "head-69" },
    { number: 69, state: "closed", merged: true, headSha: "head-69" },
  ]) {
    const guarded = createFactoryGuardedLifecycle({
      lifecycle: { async getPullRequest() { return new Response(JSON.stringify(proof), { headers: { "content-type": "application/json" } }); } },
      factory: { async foreman() { foremanCalls += 1; return new Response("{}"); } },
    });
    const response = await guarded.cancelStaleFactoryWork({ repository: "pureekangraw-ops/standard-", number: 69, goId: "go", jobId: "job-pr-69", workContext: {} });
    assert.equal(response.status, 409);
  }
  assert.equal(foremanCalls, 0);
});
