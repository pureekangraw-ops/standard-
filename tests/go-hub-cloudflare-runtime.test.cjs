"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, "../go-hub-worker.mjs")).href);
}

test("GO Hub Worker keeps the reserved workspace route closed before backend wiring", async () => {
  const { createWorkerHandler } = await load();
  const handler = createWorkerHandler();
  const response = await handler.fetch(new Request("https://hub.test/hub/api/workspace/status"), {
    ASSETS: { fetch: async () => new Response("asset") },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "WORKSPACE_BACKEND_NOT_CONFIGURED" });
});

test("GO Hub Worker forwards ordinary traffic to static assets", async () => {
  const { createWorkerHandler } = await load();
  const handler = createWorkerHandler();
  const response = await handler.fetch(new Request("https://hub.test/"), {
    ASSETS: { fetch: async () => new Response("hub", { status: 200 }) },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "hub");
});
