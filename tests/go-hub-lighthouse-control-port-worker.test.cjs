"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const edgeUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-edge-worker.mjs")).href;
async function load(tag) { return import(`${edgeUrl}?lhcp-edge=${tag}-${Date.now()}`); }

test("edge creates owner-approved LIGHTHOUSE bootstrap and routes device pull", async () => {
  const { createEdgeWorkerHandler } = await load("bootstrap");
  const calls = [];
  const namespace = {
    getByName(name) {
      assert.equal(name, "lighthouse-control-port-v1");
      return {
        async start(input) {
          calls.push({ op:"start", input });
          return { ok:true, session_id:"lh-1", session_token:"token-1", expires_at:999999, device_label:input.deviceLabel };
        },
        async pull(input) {
          calls.push({ op:"pull", input });
          return { ok:true, commands:[{ requestId:"hub-1", capabilityId:"system.appState", payload:{} }] };
        },
      };
    },
  };
  const handler = createEdgeWorkerHandler({
    delegate:{ async fetch(){ return new Response("delegate"); } },
    factoryMcp:{ async fetch(){ return new Response("mcp"); } },
  });
  const env = { LIGHTHOUSE_CONTROL_PORT_SESSIONS:namespace, GOHUB_OWNER_PASSCODE:"owner-pass" };

  const start = await handler.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/session/start", {
    method:"POST",
    headers:{ "content-type":"application/json", "x-go-owner-passcode":"owner-pass", origin:"https://hub.example" },
    body:JSON.stringify({ device_label:"Xiaomi 15T" }),
  }), env);
  assert.equal(start.status, 200);
  const bootstrap = await start.json();
  assert.equal(bootstrap.session_id, "lh-1");
  assert.equal(bootstrap.contract, "lighthouse-control-port-v1");
  assert.equal(bootstrap.hub_origin, "https://hub.example");

  const pull = await handler.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/pull", {
    method:"POST",
    headers:{
      "x-lighthouse-session-id":"lh-1",
      "x-lighthouse-session-token":"token-1",
      origin:"https://localhost",
    },
  }), env);
  assert.equal(pull.status, 200);
  assert.equal((await pull.json()).commands[0].requestId, "hub-1");
  assert.equal(calls.at(-1).op, "pull");
});

test("edge refuses owner bootstrap with wrong passcode and blocks unknown browser origin", async () => {
  const { createEdgeWorkerHandler } = await load("closed");
  const handler = createEdgeWorkerHandler({
    delegate:{ async fetch(){ return new Response("delegate"); } },
    factoryMcp:{ async fetch(){ return new Response("mcp"); } },
  });
  const namespace = { getByName(){ return { async start(){ return { ok:true }; } }; } };
  const env = { LIGHTHOUSE_CONTROL_PORT_SESSIONS:namespace, GOHUB_OWNER_PASSCODE:"owner-pass" };

  const denied = await handler.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/session/start", {
    method:"POST",
    headers:{ "content-type":"application/json", "x-go-owner-passcode":"wrong" },
    body:JSON.stringify({}),
  }), env);
  assert.equal(denied.status, 403);

  const origin = await handler.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/pull", {
    method:"POST",
    headers:{ origin:"https://evil.example", "x-lighthouse-session-id":"x", "x-lighthouse-session-token":"y" },
  }), env);
  assert.equal(origin.status, 403);
});
