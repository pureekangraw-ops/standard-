"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
async function load(tag) { return import(`${workerUrl}?lhcp-mcp=${tag}-${Date.now()}`); }

test("LIGHTHOUSE Control Port MCP service reads paired state and queues commands", async () => {
  const m = await load("roundtrip");
  const calls = [];
  const namespace = {
    getByName(name) {
      assert.equal(name, "lighthouse-control-port-v1");
      return {
        async fetch(request) {
          const url = new URL(request.url);
          const input = await request.json();
          if (url.pathname === "/latest") {
            calls.push({ op:"latest" });
            return new Response(JSON.stringify({ ok:true, latest:{ snapshot:{ freshness:"LIVE", revision:9 } }, commands:[], receipts:[] }), { status:200, headers:{ "content-type":"application/json" } });
          }
          if (url.pathname === "/enqueue") {
            calls.push({ op:"enqueue", input });
            return new Response(JSON.stringify({ ok:true, duplicate:false, command:{ ...input, status:"QUEUED" } }), { status:200, headers:{ "content-type":"application/json" } });
          }
          return new Response(JSON.stringify({ ok:false, code:"NOT_FOUND" }), { status:404, headers:{ "content-type":"application/json" } });
        },
      };
    },
  };
  const service = m.createLighthouseControlPortMcpService
    ? m.createLighthouseControlPortMcpService({ namespace })
    : (await import(pathToFileURL(path.resolve(__dirname, "..", "go-hub-lighthouse-control-port-service.mjs")).href)).createLighthouseControlPortMcpService({ namespace });

  const state = await service.state({ targetId:"lighthouse" });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).latest.snapshot.freshness, "LIVE");

  const command = await service.command({
    targetId:"lighthouse",
    requestId:"hub-live-1",
    capabilityId:"system.appState",
    payload:{},
  });
  assert.equal(command.status, 200);
  assert.equal((await command.json()).command.requestId, "hub-live-1");
  assert.equal(calls.at(-1).op, "enqueue");
});

test("LIGHTHOUSE Control Port MCP service refuses wrong target and missing binding", async () => {
  const serviceUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-lighthouse-control-port-service.mjs")).href;
  const { createLighthouseControlPortMcpService } = await import(`${serviceUrl}?fail=${Date.now()}`);
  const missing = createLighthouseControlPortMcpService({ namespace:null });
  const response = await missing.state({ targetId:"lighthouse" });
  assert.equal(response.status, 503);
  await assert.rejects(
    missing.state({ targetId:"standard" }),
    /WORK_TARGET_REQUIRED/,
  );
});
