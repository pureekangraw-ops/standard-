"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, "../go-hub-worker.mjs")).href);
}

test("GO Hub gateway fails closed when GitHub credential is not configured", async () => {
  const { createWorkerHandler } = await load();
  const handler = createWorkerHandler({ fetchImpl: async () => { throw new Error("network must not run"); } });
  const response = await handler.fetch(new Request("https://hub.test/hub/api/github-workspace/files?repository=owner/repo"), { ASSETS: { fetch: async () => new Response("asset") } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "GITHUB_NOT_CONFIGURED" });
});

test("GO Hub gateway reads repository files through server-side GitHub authorization", async () => {
  let observedAuthorization = null;
  const fetchImpl = async (_url, init = {}) => {
    observedAuthorization = init.headers.authorization;
    return new Response(JSON.stringify([{ type: "file", path: "a.js" }, { type: "dir", path: "docs" }]), { status: 200 });
  };
  const { createWorkerHandler } = await load();
  const handler = createWorkerHandler({ fetchImpl });
  const env = { GITHUB_TOKEN: "server-only", ASSETS: { fetch: async () => new Response("asset") } };
  const response = await handler.fetch(new Request("https://hub.test/hub/api/github-workspace/files?repository=owner/repo"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { files: ["a.js"] });
  assert.match(observedAuthorization, /^Bearer /);
});

test("GO Hub worker forwards non-gateway traffic to static assets", async () => {
  const { createWorkerHandler } = await load();
  const handler = createWorkerHandler();
  const response = await handler.fetch(new Request("https://hub.test/"), { ASSETS: { fetch: async () => new Response("hub", { status: 200 }) } });
  assert.equal(await response.text(), "hub");
});
