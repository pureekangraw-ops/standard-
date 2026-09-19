"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(
  path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs"),
).href;

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers:{ "content-type":"application/json" },
  });
}
function counterState(overrides = {}) {
  return {
    counterId:"COUNTER-FMCP-1",
    workId:"WORK-1",
    checkpointId:"CP-1",
    request:"Find in Notion AI Search",
    context:{ purpose:"factory-mcp" },
    sourceHints:["Notion AI Search"],
    doNotChange:["Do not use MIMIR"],
    currentState:"OPEN",
    answer:null,
    sources:[],
    evidence:[],
    confidence:null,
    nextRoute:null,
    ...overrides,
  };
}

test("Factory MCP counter create attaches dispatcher truth from the real execution seam", async () => {
  const { createCounterDispatchLifecycle } = await import(moduleUrl + "?create=" + Date.now());
  const calls = [];
  const lifecycle = createCounterDispatchLifecycle({
    counter:{
      create:async () => response({ ok:true, counter:counterState(), created:true }),
      get:async () => response({ ok:true, counter:counterState() }),
      answer:async () => response({ ok:true, counter:counterState() }),
    },
    dispatch:{
      async open(input) {
        calls.push(["open", input]);
        return response({
          ok:true,
          dispatch:{
            counterId:input.counterId,
            workId:input.workId,
            checkpointId:input.checkpointId,
            legs:{ LIGHT:{ status:"WAITING_TARGET" }, GO:{ status:"IDLE" } },
          },
          targetConfigured:false,
        });
      },
      async get() { return response({ code:"DISPATCH_NOT_FOUND" }, 404); },
      async answer() { return response({ code:"unused" }, 500); },
    },
  });

  const result = await lifecycle.create({});
  const payload = await result.json();

  assert.equal(result.status, 200);
  assert.equal(payload.counter.counterId, "COUNTER-FMCP-1");
  assert.equal(payload.dispatch.legs.LIGHT.status, "WAITING_TARGET");
  assert.equal(payload.dispatchCode, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].request, "Find in Notion AI Search");
});

test("Factory MCP counter get exposes dispatcher state without mutating Counter", async () => {
  const { createCounterDispatchLifecycle } = await import(moduleUrl + "?get=" + Date.now());
  let counterGets = 0;
  let dispatchGets = 0;
  const lifecycle = createCounterDispatchLifecycle({
    counter:{
      async create() { return response({ code:"unused" }, 500); },
      async get() {
        counterGets += 1;
        return response({ ok:true, counter:counterState() });
      },
      async answer() { return response({ code:"unused" }, 500); },
    },
    dispatch:{
      async open() { return response({ code:"unused" }, 500); },
      async get(input) {
        dispatchGets += 1;
        return response({
          ok:true,
          dispatch:{
            counterId:input.counterId,
            workId:input.workId,
            checkpointId:input.checkpointId,
            legs:{ LIGHT:{ status:"WAITING_TARGET" }, GO:{ status:"IDLE" } },
          },
        });
      },
      async answer() { return response({ code:"unused" }, 500); },
    },
  });

  const result = await lifecycle.get({});
  const payload = await result.json();
  assert.equal(counterGets, 1);
  assert.equal(dispatchGets, 1);
  assert.equal(payload.dispatch.legs.LIGHT.status, "WAITING_TARGET");
});

test("Factory MCP counter answer queues GO wake on the same Counter identity", async () => {
  const { createCounterDispatchLifecycle } = await import(moduleUrl + "?answer=" + Date.now());
  const calls = [];
  const answered = counterState({
    currentState:"ANSWERED",
    answer:"Found it",
    sources:["notion://page/1"],
    evidence:[{ kind:"page", reference:"notion://page/1" }],
    confidence:"HIGH",
    nextRoute:"GO",
  });
  const lifecycle = createCounterDispatchLifecycle({
    counter:{
      async create() { return response({ code:"unused" }, 500); },
      async get() { return response({ code:"unused" }, 500); },
      async answer() { return response({ ok:true, counter:answered }); },
    },
    dispatch:{
      async open() { return response({ code:"unused" }, 500); },
      async get() { return response({ code:"unused" }, 500); },
      async answer(input) {
        calls.push(input);
        return response({
          ok:true,
          dispatch:{
            counterId:input.counterId,
            workId:input.workId,
            checkpointId:input.checkpointId,
            legs:{ LIGHT:{ status:"DELIVERED" }, GO:{ status:"WAITING_TARGET" } },
          },
        });
      },
    },
  });

  const result = await lifecycle.answer({});
  const payload = await result.json();
  assert.equal(payload.dispatch.legs.GO.status, "WAITING_TARGET");
  assert.equal(calls[0].status, "ANSWERED");
  assert.equal(calls[0].answer, "Found it");
  assert.deepEqual(calls[0].sources, ["notion://page/1"]);
});
