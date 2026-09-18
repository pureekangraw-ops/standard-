"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-centre-client.js")).href;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    snapshot() { return Object.fromEntries(map); },
  };
}

test("Centre client restores durable work by identity pointer and does not replay local state", async () => {
  const { createCentreLiveClient, CENTRE_POINTER_KEY } = await import(moduleUrl + "?restore=" + Date.now());
  const storage = memoryStorage({
    [CENTRE_POINTER_KEY]: JSON.stringify({ workId: "WORK-A", checkpointId: "CENTRE-A", status: "FAKE_LOCAL_STATE" }),
  });
  const calls = [];
  const client = createCentreLiveClient({
    storage,
    fetchImpl: async (_url, options) => {
      const input = JSON.parse(options.body);
      calls.push(input);
      return response({
        ok: true,
        phase: "AWAY",
        workId: "WORK-A",
        checkpointId: "CENTRE-A",
        returnAddress: "CENTRE-A",
        work: {
          workId: "WORK-A",
          checkpointId: "CENTRE-A",
          status: "AWAY",
          role: { roleReference: "role://factory", workingView: "live" },
          handoff: { destination: "destination://factory", returnAddress: "CENTRE-A" },
        },
      });
    },
  });

  const work = await client.restoreOrStart();
  assert.equal(work.status, "AWAY");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    action: "inspect",
    workId: "WORK-A",
    checkpointId: "CENTRE-A",
    returnAddress: "CENTRE-A",
  });
  assert.deepEqual(JSON.parse(storage.snapshot()[CENTRE_POINTER_KEY]), {
    workId: "WORK-A",
    checkpointId: "CENTRE-A",
  });
});

test("Centre client starts once then reads back the durable state before returning it", async () => {
  const { createCentreLiveClient, CENTRE_POINTER_KEY } = await import(moduleUrl + "?start=" + Date.now());
  const storage = memoryStorage();
  const calls = [];
  const client = createCentreLiveClient({
    storage,
    idFactory: () => "ID-1",
    fetchImpl: async (_url, options) => {
      const input = JSON.parse(options.body);
      calls.push(input);
      if (input.action === "start") {
        return response({
          ok: true,
          phase: "ARRIVED",
          workId: "WORK-ID-1",
          checkpointId: "CENTRE-ID-1",
          returnAddress: "CENTRE-ID-1",
          work: { workId: "WORK-ID-1", checkpointId: "CENTRE-ID-1", status: "ARRIVED" },
        });
      }
      return response({
        ok: true,
        phase: "ARRIVED",
        workId: "WORK-ID-1",
        checkpointId: "CENTRE-ID-1",
        returnAddress: "CENTRE-ID-1",
        work: { workId: "WORK-ID-1", checkpointId: "CENTRE-ID-1", status: "ARRIVED", authority: null },
      });
    },
  });

  const work = await client.restoreOrStart();
  assert.equal(work.status, "ARRIVED");
  assert.deepEqual(calls.map(item => item.action), ["start", "inspect"]);
  assert.deepEqual(JSON.parse(storage.snapshot()[CENTRE_POINTER_KEY]), {
    workId: "WORK-ID-1",
    checkpointId: "CENTRE-ID-1",
  });
});

test("Centre mutation always performs exact durable readback", async () => {
  const { createCentreLiveClient } = await import(moduleUrl + "?command=" + Date.now());
  const calls = [];
  const client = createCentreLiveClient({
    storage: memoryStorage(),
    fetchImpl: async (_url, options) => {
      const input = JSON.parse(options.body);
      calls.push(input);
      if (input.action === "review") {
        return response({
          ok: true, workId: "WORK-A", checkpointId: "CENTRE-A", returnAddress: "CENTRE-A",
          work: { workId: "WORK-A", checkpointId: "CENTRE-A", status: "READY", task: "T" },
        });
      }
      return response({
        ok: true, workId: "WORK-A", checkpointId: "CENTRE-A", returnAddress: "CENTRE-A",
        work: { workId: "WORK-A", checkpointId: "CENTRE-A", status: "READY", task: "T", authority: "BIG" },
      });
    },
  });

  const work = await client.command({
    action: "review",
    workId: "WORK-A",
    checkpointId: "CENTRE-A",
    returnAddress: "CENTRE-A",
    task: "T",
    requestedResult: "R",
    authority: "BIG",
  });

  assert.deepEqual(calls.map(item => item.action), ["review", "inspect"]);
  assert.equal(work.authority, "BIG");
});

test("Centre client fails closed when live readback is unavailable", async () => {
  const { createCentreLiveClient } = await import(moduleUrl + "?unavailable=" + Date.now());
  const client = createCentreLiveClient({
    storage: memoryStorage(),
    fetchImpl: async () => response({ code: "CENTRE_STATE_NOT_CONFIGURED" }, 503),
  });
  await assert.rejects(
    client.command({
      action: "review",
      workId: "WORK-A",
      checkpointId: "CENTRE-A",
      returnAddress: "CENTRE-A",
      task: "T",
      requestedResult: "R",
      authority: "BIG",
    }),
    /CENTRE_STATE_NOT_CONFIGURED/,
  );
});
