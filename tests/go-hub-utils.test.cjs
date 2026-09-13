"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const modulePath = path.join(root, "go-hub-utils.js");

test("GO Hub generic utilities exist outside legacy business core", () => {
  assert.equal(fs.existsSync(modulePath), true);
  const source = fs.readFileSync(modulePath, "utf8");
  for (const forbidden of ["ygph-standard", "NormalPocket", "STORE", "LEDGER", "CALENDAR", "DB_NAME", "VAULT_KEY"]) {
    assert.equal(source.includes(forbidden), false, `generic utilities must not own ${forbidden}`);
  }
});

test("GO Hub generic utilities provide deterministic serialization and ISO-date validation", async () => {
  const mod = await import(pathToFileURL(modulePath).href);
  assert.equal(mod.stableStringify({ z: 1, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":1}');
  assert.equal(mod.isValidISODate("2026-02-28"), true);
  assert.equal(mod.isValidISODate("2026-02-30"), false);
  assert.equal(mod.isValidISODate("not-a-date"), false);
});

test("GO Hub generic ID creation keeps caller-owned prefixes", async () => {
  const mod = await import(pathToFileURL(modulePath).href);
  const id = mod.createId("HUB");
  assert.match(id, /^HUB-[a-z0-9]+-[a-z0-9]+$/);
});
