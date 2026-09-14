"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, "../go-hub-github-workspace.js")).href);
}

test("GitHub workspace adapter lists, reads, and writes through a same-origin gateway", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/files")) return new Response(JSON.stringify({ files: ["a.js"] }), { status: 200 });
    if (url.includes("/file?")) return new Response(JSON.stringify({ content: "hello" }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const { createGitHubWorkspace } = await load();
  const workspace = createGitHubWorkspace({ gatewayBase: "/api/github-workspace", repository: "owner/repo", fetchImpl });

  assert.deepEqual(await workspace.listFiles(), ["a.js"]);
  assert.equal(await workspace.readText("a.js"), "hello");
  await workspace.writeText("a.js", "next");
  assert.equal(calls.some(call => /authorization/i.test(JSON.stringify(call.init.headers || {}))), false);
});

test("GitHub workspace adapter rejects unsafe repository paths before network access", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error("unexpected"); };
  const { createGitHubWorkspace } = await load();
  const workspace = createGitHubWorkspace({ gatewayBase: "/api/github-workspace", repository: "owner/repo", fetchImpl });

  await assert.rejects(() => workspace.readText("../secret"), /unsafe path/i);
  assert.equal(called, false);
});
