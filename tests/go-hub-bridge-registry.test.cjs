const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const registryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-bridge-registry.mjs")).href;

test("Bridge Registry keeps provider growth behind stable catalog/read/action surfaces", async () => {
  const { createBridgeRegistry } = await import(registryUrl + "?unit=" + Date.now());
  const calls = [];
  const registry = createBridgeRegistry({
    providers:[{
      id:"cloudflare",
      label:"Cloudflare",
      reads:{
        health: async input => {
          calls.push(["read", input]);
          return new Response(JSON.stringify({ ok:true, upstream:"PASS" }), {
            headers:{ "content-type":"application/json" },
          });
        },
      },
      actions:{
        deploy: async (input, request) => {
          calls.push(["action", input, request.workContext]);
          return new Response(JSON.stringify({ ok:true, accepted:true }), {
            headers:{ "content-type":"application/json" },
          });
        },
      },
    }],
  });

  const catalog = await registry.catalog().json();
  assert.equal(catalog.interfaceVersion, "go-hub-bridge/v1");
  assert.deepEqual(catalog.bridges, [{
    id:"cloudflare",
    label:"Cloudflare",
    readOperations:["health"],
    actionOperations:["deploy"],
    access:{ GO:"READ_ACTION", LIGHT:"READ_ONLY" },
  }]);

  const read = await registry.read({ bridgeId:"cloudflare", operation:"health", input:{ probe:true } });
  assert.deepEqual(await read.json(), { ok:true, upstream:"PASS" });

  const action = await registry.action({
    bridgeId:"cloudflare",
    operation:"deploy",
    input:{ version:"v2" },
    workContext:{ workId:"WORK-1", checkpointId:"CP-1" },
  });
  assert.deepEqual(await action.json(), { ok:true, accepted:true });
  assert.deepEqual(calls, [
    ["read", { probe:true }],
    ["action", { version:"v2" }, { workId:"WORK-1", checkpointId:"CP-1" }],
  ]);
});

test("Bridge Registry fails closed for unknown providers and operations", async () => {
  const { createBridgeRegistry } = await import(registryUrl + "?closed=" + Date.now());
  const registry = createBridgeRegistry({ providers:[{ id:"cloudflare", reads:{}, actions:{} }] });

  const missing = await registry.read({ bridgeId:"missing", operation:"health" });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "BRIDGE_NOT_FOUND");

  const unsupported = await registry.action({ bridgeId:"cloudflare", operation:"deploy" });
  assert.equal(unsupported.status, 400);
  assert.equal((await unsupported.json()).code, "BRIDGE_OPERATION_NOT_SUPPORTED");
});
