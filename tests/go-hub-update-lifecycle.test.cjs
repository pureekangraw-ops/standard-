"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "go-hub-update-lifecycle.js");

test("GO Hub update lifecycle is neutral and identity-free", () => {
  assert.equal(fs.existsSync(sourcePath), true);
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const forbidden of ["NormalPocket", "normalpocket", "metropolis", "ygph-standard", "stock-pocket"]) {
    assert.equal(source.includes(forbidden), false, `neutral lifecycle must not own ${forbidden}`);
  }
});

test("GO Hub update lifecycle plans activation, rollback, and current selection", async () => {
  const lifecycle = await import(pathToFileURL(sourcePath).href);
  const activated = lifecycle.planActivation({ current: "a", serving: "a" }, "b", "2026-09-13T00:00:00.000Z");
  assert.equal(activated.current, "b");
  assert.equal(activated.serving, "b");
  assert.equal(activated.previous, "a");

  const rolledBack = lifecycle.planRollback(activated, "2026-09-13T00:01:00.000Z");
  assert.equal(rolledBack.serving, "a");
  assert.equal(rolledBack.rolledBack, true);

  const current = lifecycle.planUseCurrent(rolledBack, "2026-09-13T00:02:00.000Z");
  assert.equal(current.serving, "b");
  assert.equal(current.rolledBack, false);
});

test("GO Hub update lifecycle identifies obsolete caches through injected prefix", async () => {
  const { obsoleteCaches } = await import(pathToFileURL(sourcePath).href);
  const lifecycle = { current: "hub-v3", serving: "hub-v2", previous: "hub-v1" };
  assert.deepEqual(obsoleteCaches(["hub-v1", "hub-v2", "hub-v3", "hub-v0", "other"], lifecycle, "hub-"), ["hub-v0"]);
});
