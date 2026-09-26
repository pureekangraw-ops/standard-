"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const serviceUrl = pathToFileURL(path.join(root, "go-hub-pixie-service.mjs")).href;
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;
const workerUrl = pathToFileURL(path.join(root, "go-hub-factory-mcp-worker.mjs")).href;
const oauthUrl = pathToFileURL(path.join(root, "go-hub-oauth.mjs")).href;

function rpc(token, name, args = {}) {
  return new Request("https://hub.example/mcp", {
    method:"POST",
    headers:{
      authorization:"Bearer " + token,
      "content-type":"application/json",
      accept:"application/json, text/event-stream",
    },
    body:JSON.stringify({ jsonrpc:"2.0", id:1, method:"tools/call", params:{ name, arguments:args } }),
  });
}

test("PIXIE service dispatches only the pinned PIXIE workflow", async () => {
  const { createPixieCommandService } = await import(serviceUrl + "?dispatch=" + Date.now());
  let observed = null;
  const service = createPixieCommandService({
    token:"github-secret",
    fetchImpl:async (url, init = {}) => {
      observed = { url:String(url), init };
      return new Response(null, { status:204 });
    },
  });
  const response = await service.command({
    requestId:"PIXIE-REQ-1",
    command:"status",
    args:{},
  });
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, "QUEUED");
  assert.match(observed.url, /pureekangraw-ops\/Go-Calalog-\/actions\/workflows\/pixie-lab-v1\.yml\/dispatches$/);
  assert.equal(observed.init.headers.authorization, "Bearer github-secret");
  const payload = JSON.parse(observed.init.body);
  assert.equal(payload.ref, "main");
  assert.equal(payload.inputs.request_id, "PIXIE-REQ-1");
  assert.deepEqual(JSON.parse(payload.inputs.command_json), { command:"status", args:{} });
  assert.doesNotMatch(JSON.stringify(body), /github-secret/);
});

test("PIXIE service reads request-bound result from runtime state branch", async () => {
  const { createPixieCommandService } = await import(serviceUrl + "?result=" + Date.now());
  const runtime = {
    requestId:"PIXIE-REQ-2",
    command:"ask",
    exitCode:0,
    ok:true,
    output:{ ok:true, result:{ answer:"3 room(s)" } },
    error:null,
    completedAt:"2026-09-26T00:00:00.000Z",
  };
  const service = createPixieCommandService({
    token:"token",
    fetchImpl:async url => {
      assert.match(String(url), /\.pixie\/last-result\.json\?ref=pixie-runtime-state$/);
      return new Response(JSON.stringify({
        sha:"result-sha",
        content:Buffer.from(JSON.stringify(runtime), "utf8").toString("base64"),
      }), { headers:{ "content-type":"application/json" } });
    },
  });
  const response = await service.result({ requestId:"PIXIE-REQ-2" });
  const body = await response.json();
  assert.equal(body.status, "ANSWERED");
  assert.equal(body.result.output.result.answer, "3 room(s)");
  assert.match(body.evidenceRef, /result-sha$/);
});

test("PIXIE result waits rather than returning another request result", async () => {
  const { createPixieCommandService } = await import(serviceUrl + "?wait=" + Date.now());
  const service = createPixieCommandService({
    token:"token",
    fetchImpl:async () => new Response(JSON.stringify({
      sha:"old",
      content:Buffer.from(JSON.stringify({ requestId:"OTHER", ok:true }), "utf8").toString("base64"),
    }), { headers:{ "content-type":"application/json" } }),
  });
  const response = await service.result({ requestId:"PIXIE-REQ-3" });
  assert.deepEqual(await response.json(), {
    ok:true,
    status:"WAIT",
    requestId:"PIXIE-REQ-3",
    reason:"PIXIE_RESULT_NOT_READY",
    observedRequestId:"OTHER",
  });
});

test("registry publishes PIXIE command and result with correct mutation hints", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?registry=" + Date.now());
  const lifecycle = new Proxy({}, {
    get:(_, name) => async input => new Response(JSON.stringify({ operation:name, input }), {
      headers:{ "content-type":"application/json" },
    }),
  });
  const registry = createMcpRegistry({ lifecycle });
  const tools = registry.listTools().filter(tool => tool.name.startsWith("go_hub_pixie_"));
  assert.deepEqual(tools.map(tool => tool.name), ["go_hub_pixie_command", "go_hub_pixie_result"]);
  assert.equal(tools[0].annotations.readOnlyHint, false);
  assert.equal(tools[1].annotations.readOnlyHint, true);
});

test("Factory MCP PIXIE command keeps GitHub token server-side", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?worker=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const accessToken = await createTestAccessToken({ issuer:"https://hub.example", signingKey });
  let auth = null;
  const fetchImpl = async (url, init = {}) => {
    if (!String(url).includes("/actions/workflows/pixie-lab-v1.yml/dispatches")) throw new Error("unexpected upstream " + url);
    auth = init.headers.authorization;
    return new Response(null, { status:204 });
  };
  const worker = createFactoryMcpWorker({ fetchImpl });
  const response = await worker.fetch(rpc(accessToken, "go_hub_pixie_command", {
    requestId:"PIXIE-REQ-MCP-1",
    command:"status",
    args:{},
    workContext:{
      workId:"WORK-PIXIE",
      checkpointId:"CP-PIXIE",
    },
  }), {
    GITHUB_TOKEN:"github-runtime-secret",
    GOHUB_MASTER_KEY:signingKey,
    GOHUB_OWNER_PASSCODE:"owner-passcode",
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.status, "QUEUED");
  assert.equal(auth, "Bearer github-runtime-secret");
  assert.doesNotMatch(JSON.stringify(payload), /github-runtime-secret/);
});
