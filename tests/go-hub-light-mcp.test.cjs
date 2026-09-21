"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const oauthUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-oauth.mjs")).href;
const factoryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
const edgeUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-edge-worker.mjs")).href;

test("LIGHT scoped bearer token authenticates only its resource/scope/subject", async () => {
  const { createAccessToken, verifyAccessToken } = await import(oauthUrl + "?light-scope=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  const request = new Request("https://hub.example/mcp/light", {
    headers:{ authorization:"Bearer " + token },
  });
  const verified = await verifyAccessToken(request, {
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
  });
  assert.deepEqual(verified, { subject:"light", scope:"go-hub-light" });
  await assert.rejects(
    () => verifyAccessToken(request, {
      issuer:"https://hub.example",
      signingKey:"master-secret",
    }),
    /invalid access token/,
  );
});

test("LIGHT MCP exposes bounded code tools and hides delete/merge", async () => {
  const { createAccessToken } = await import(oauthUrl + "?light-token=" + Date.now());
  const { createFactoryMcpWorker } = await import(factoryUrl + "?light-tools=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  const worker = createFactoryMcpWorker({
    fetchImpl: async () => { throw new Error("network should not be used for tools/list"); },
  });
  const env = {
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
  };
  const response = await worker.fetch(new Request("https://hub.example/mcp/light", {
    method:"POST",
    headers:{
      authorization:"Bearer " + token,
      "content-type":"application/json",
      origin:"https://www.notion.so",
    },
    body:JSON.stringify({ jsonrpc:"2.0", id:1, method:"tools/list", params:{} }),
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  const names = payload.result.tools.map(tool => tool.name);
  assert.ok(names.includes("go_hub_put_file"));
  assert.ok(names.includes("go_hub_create_branch"));
  assert.ok(names.includes("go_hub_open_pull_request"));
  assert.ok(names.includes("go_hub_centre_inspect"));
  assert.ok(names.includes("go_hub_centre_audit_history"));
  assert.equal(names.includes("go_hub_delete_file"), false);
  assert.equal(names.includes("go_hub_merge_pull_request"), false);
  assert.equal(names.includes("go_hub_centre_live_action"), false);
});

test("LIGHT owner page mints scoped bearer without echoing owner passcode", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?light-owner=" + Date.now());
  const { verifyAccessToken } = await import(oauthUrl + "?light-verify=" + Date.now());
  const handler = createEdgeWorkerHandler({
    delegate:{ fetch:async () => new Response("delegate") },
    factoryMcp:{ fetch:async () => new Response("factory") },
  });
  const env = {
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
  };
  const form = new FormData();
  form.set("passcode", "owner-passcode");
  const response = await handler.fetch(new Request("https://hub.example/hub/light-mcp", {
    method:"POST",
    body:form,
  }), env);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /https:\/\/hub\.example\/mcp\/light/);
  assert.equal(body.includes("owner-passcode"), false);
  const textareaValues = [...body.matchAll(/<textarea[^>]*>([^<]+)<\/textarea>/g)].map(match => match[1]);
  assert.equal(textareaValues.length, 2);
  const token = textareaValues[1];
  const verified = await verifyAccessToken(new Request("https://hub.example/mcp/light", {
    headers:{ authorization:"Bearer " + token },
  }), {
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
  });
  assert.equal(verified.subject, "light");
});
