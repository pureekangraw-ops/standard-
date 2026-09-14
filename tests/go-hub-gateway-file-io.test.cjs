"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, "../go-hub-worker.mjs")).href);
}

test("GO Hub gateway reads and updates a repository text file", async () => {
  const calls = [];
  const fetchImpl = async (_url, init = {}) => {
    calls.push(init);
    if ((init.method || "GET") === "GET") {
      return new Response(JSON.stringify({ content: Buffer.from("hello").toString("base64"), encoding: "base64", sha: "blob-a" }), { status: 200 });
    }
    const body = JSON.parse(init.body);
    assert.equal(body.sha, "blob-a");
    assert.equal(Buffer.from(body.content, "base64").toString("utf8"), "next");
    return new Response(JSON.stringify({ content: { sha: "blob-b" } }), { status: 200 });
  };

  const { createWorkerHandler } = await load();
  const handler = createWorkerHandler({ fetchImpl });
  const env = { GITHUB_TOKEN: "fixture", ASSETS: { fetch: async () => new Response("asset") } };

  const read = await handler.fetch(new Request("https://hub.test/hub/api/github-workspace/file?repository=owner/repo&path=a.js"), env);
  assert.deepEqual(await read.json(), { content: "hello", sha: "blob-a" });

  const write = await handler.fetch(new Request("https://hub.test/hub/api/github-workspace/file", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repository: "owner/repo", path: "a.js", content: "next" }),
  }), env);
  assert.equal(write.status, 200);
  assert.deepEqual(await write.json(), { ok: true, sha: "blob-b" });
  assert.equal(calls.length, 3);
});
