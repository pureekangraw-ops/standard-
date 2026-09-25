"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const edgeUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-edge-worker.mjs")).href;

test("live edge routes MCP through Factory MCP gate instead of legacy delegate", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?factory-edge=" + Date.now());
  let factoryCalls = 0;
  let delegateCalls = 0;
  const factoryMcp = {
    async fetch() {
      factoryCalls += 1;
      return new Response("factory", { status: 202 });
    },
  };
  const delegate = {
    async fetch() {
      delegateCalls += 1;
      return new Response("delegate", { status: 200 });
    },
  };
  const handler = createEdgeWorkerHandler({ delegate, factoryMcp });
  const response = await handler.fetch(new Request("https://hub.example/mcp", { method: "POST" }), {});

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "factory");
  assert.equal(factoryCalls, 1);
  assert.equal(delegateCalls, 0);
});

test("live edge routes Centre API into durable Centre binding", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?centre-edge=" + Date.now());
  let delegateCalls = 0;
  let received = null;
  const namespace = {
    getByName(name) {
      assert.equal(name, "WORK-EDGE");
      return {
        async fetch(request) {
          received = await request.json();
          return new Response(JSON.stringify({
            ok: true,
            phase: "ARRIVED",
            workId: received.workId,
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      };
    },
  };
  const delegate = {
    async fetch() {
      delegateCalls += 1;
      return new Response("delegate", { status: 200 });
    },
  };
  const handler = createEdgeWorkerHandler({
    delegate,
    factoryMcp: { async fetch() { return new Response("factory"); } },
  });
  const response = await handler.fetch(new Request("https://hub.example/hub/api/centre/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "inspect", workId: "WORK-EDGE" }),
  }), {
    GO_HUB_CENTRE_STATE: namespace,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    phase: "ARRIVED",
    workId: "WORK-EDGE",
  });
  assert.equal(received.action, "inspect");
  assert.equal(delegateCalls, 0);
});


test("legacy direct Factory action route is quarantined instead of invoking old authority", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?factory-quarantine=" + Date.now());
  const handler = createEdgeWorkerHandler({
    delegate:{ async fetch(){ return new Response("delegate"); } },
    factoryMcp:{ async fetch(){ return new Response("mcp"); } },
  });
  const response = await handler.fetch(new Request("https://hub.example/hub/api/github-workspace/factory-action", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({}),
  }), {});
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    code:"FACTORY_LEGACY_ROUTE_QUARANTINED",
    compatibility:"SOURCE_ONLY",
    nextTool:"go_hub_factory_v4",
  });
});

test("direct Centre HTTP route locks to GO Hub broadcast and rejects stale callers", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?centre-broadcast=" + Date.now());
  let centreCalls = 0;
  const centreNamespace = {
    getByName() {
      return { fetch: async request => {
        centreCalls += 1;
        const input = await request.json();
        return new Response(JSON.stringify({ ok:true, phase:"V4_INSPECT", workId:input.workId }), {
          headers:{ "content-type":"application/json" },
        });
      }};
    },
  };
  const broadcastNamespace = {
    getByName(name) {
      assert.equal(name, "go-hub-broadcast-v1");
      return { fetch: async request => {
        const input = await request.json();
        assert.equal(input.action, "current");
        return new Response(JSON.stringify({
          ok:true,
          broadcast:{ program:"GO_HUB_SYSTEM", version:"V5", hash:"h5", sourceRef:"owner://v5" },
        }), { headers:{ "content-type":"application/json" } });
      }};
    },
  };
  const handler = createEdgeWorkerHandler({
    delegate:{ async fetch(){ return new Response("delegate"); } },
    factoryMcp:{ async fetch(){ return new Response("mcp"); } },
  });
  const stale = await handler.fetch(new Request("https://hub.example/hub/api/centre/action", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({
      action:"v4_inspect",
      workId:"WORK-BROADCAST",
      broadcast:{ program:"GO_HUB_SYSTEM", version:"V4", hash:"old" },
    }),
  }), {
    GO_HUB_CENTRE_STATE:centreNamespace,
    GO_HUB_BROADCAST_STATE:broadcastNamespace,
  });
  assert.equal(stale.status,409);
  assert.equal((await stale.json()).code,"BROADCAST_MISMATCH");
  assert.equal(centreCalls,0);

  const current = await handler.fetch(new Request("https://hub.example/hub/api/centre/action", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({
      action:"v4_inspect",
      workId:"WORK-BROADCAST",
      broadcast:{ program:"GO_HUB_SYSTEM", version:"V5", hash:"h5" },
    }),
  }), {
    GO_HUB_CENTRE_STATE:centreNamespace,
    GO_HUB_BROADCAST_STATE:broadcastNamespace,
  });
  assert.equal(current.status,200);
  const body=await current.json();
  assert.equal(body.broadcastReadback.version,"V5");
  assert.equal(body.broadcastReadback.hash,"h5");
  assert.equal(centreCalls,1);
});



