"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const modulePath = path.join(root, "go-hub-persistence.js");

test("GO Hub persistence mechanics stay neutral and identity-free", () => {
  assert.equal(fs.existsSync(modulePath), true);
  const source = fs.readFileSync(modulePath, "utf8");
  for (const forbidden of ["ygph-standard", "stock-pocket", "NormalPocket", "STORE", "LEDGER", "CALENDAR", "indexedDB"]) {
    assert.equal(source.includes(forbidden), false, `neutral persistence must not own ${forbidden}`);
  }
});

test("GO Hub persistence port commits with durable readback through injected store", async () => {
  const { createMemoryKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const store = createMemoryKeyValueStore();
  const persistence = createStatePersistence({
    store,
    key: "hub-state",
    validate(value) {
      if (!Number.isSafeInteger(value?.revision)) throw new Error("revision required");
      return value;
    },
  });

  const proposed = { revision: 2, nested: { ready: true } };
  const receipt = await persistence.commitState({ proposed, command: { type: "REGISTER" } });

  assert.equal(receipt.status, "COMMITTED");
  assert.equal(receipt.revision, 2);
  assert.equal(receipt.commandType, "REGISTER");
  assert.deepEqual(await persistence.loadState(), proposed);

  proposed.nested.ready = false;
  assert.equal((await persistence.loadState()).nested.ready, true);
});

test("GO Hub persistence rejects invalid proposed state before write", async () => {
  const { createMemoryKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const store = createMemoryKeyValueStore();
  const persistence = createStatePersistence({
    store,
    validate(value) {
      if (value?.ok !== true) throw new Error("invalid state");
      return value;
    },
  });

  await assert.rejects(
    persistence.commitState({ proposed: { ok: false }, command: { type: "BAD" } }),
    /invalid state/,
  );
  assert.equal(await persistence.loadState(), null);
});
