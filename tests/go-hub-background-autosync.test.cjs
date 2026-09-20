"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-background-autosync.mjs")).href;
async function load(tag) {
  return import(`${moduleUrl}?autosync=${tag}-${Date.now()}-${Math.random()}`);
}

test("background autosync projects the first view and skips unchanged views", async () => {
  const { createBackgroundAutosync } = await load("dedupe");
  const view = { ok:true, workId:"WORK-1", work:{ status:"AWAY" } };
  let reads = 0;
  const projections = [];
  const service = createBackgroundAutosync({
    readView:async () => { reads += 1; return view; },
    projectCentre:async next => { projections.push(next); return { ok:true, changed:true }; },
    now:() => "2026-09-20T08:00:00.000Z",
  });

  assert.equal((await service.syncNow()).changed, true);
  assert.equal((await service.syncNow()).skipped, true);
  assert.equal(reads, 2);
  assert.equal(projections.length, 1);
  assert.equal(service.status().projectedCount, 1);
});

test("background autosync never overlaps reads or projections", async () => {
  const { createBackgroundAutosync } = await load("overlap");
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let reads = 0;
  const service = createBackgroundAutosync({
    readView:async () => {
      reads += 1;
      await pending;
      return { ok:true, workId:"WORK-2" };
    },
    projectCentre:async () => ({ ok:true }),
  });

  const first = service.syncNow("first");
  const second = await service.syncNow("second");
  assert.equal(second.code, "AUTOSYNC_IN_FLIGHT");
  release();
  assert.equal((await first).ok, true);
  assert.equal(reads, 1);
  assert.equal(service.status().skippedCount, 1);
});

test("background autosync records failures and can recover on the next tick", async () => {
  const { createBackgroundAutosync } = await load("recovery");
  let attempts = 0;
  const events = [];
  const service = createBackgroundAutosync({
    readView:async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("SOURCE_OFFLINE");
      return { ok:true, workId:"WORK-3", revision:attempts };
    },
    projectCentre:async () => ({ ok:true }),
    onEvent:async event => { events.push(event); },
  });

  assert.equal((await service.syncNow("first")).code, "SOURCE_OFFLINE");
  assert.equal((await service.syncNow("retry")).ok, true);
  assert.equal(service.status().lastError, null);
  assert.deepEqual(events.map(event => event.type), ["AUTOSYNC_FAILED", "AUTOSYNC_PROJECTED"]);
});

test("start schedules background work and stop clears the schedule", async () => {
  const { createBackgroundAutosync } = await load("lifecycle");
  const timers = [];
  const cleared = [];
  let projects = 0;
  const service = createBackgroundAutosync({
    readView:async () => ({ ok:true, workId:`WORK-${projects}` }),
    projectCentre:async () => { projects += 1; return { ok:true }; },
    intervalMs:50,
    setTimeoutFn:(callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn:timer => { cleared.push(timer); },
  });

  await service.start();
  assert.equal(service.status().running, true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 50);
  await timers[0].callback();
  assert.equal(timers.length, 2);
  service.stop();
  assert.equal(service.status().running, false);
  assert.equal(cleared.length >= 1, true);
});
