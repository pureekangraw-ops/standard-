"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-completion-stamp.js")).href;
async function load() { return import(`${moduleUrl}?stamp=${Date.now()}-${Math.random()}`); }

test("completion stamp contains exactly item name and current version", async () => {
  const { stampCompletedItem } = await load();
  const stamp = stampCompletedItem({ name: "RIDE-MAP", version: "OWNER.19", verified: true });
  assert.deepEqual(stamp, { name: "RIDE-MAP", version: "OWNER.19" });
  assert.deepEqual(Object.keys(stamp).sort(), ["name", "version"]);
  assert.equal(Object.isFrozen(stamp), true);
});

test("unfinished items cannot receive a completion stamp", async () => {
  const { stampCompletedItem } = await load();
  assert.throws(() => stampCompletedItem({ name: "RIDE-MAP", version: "OWNER.19" }), /verified completion/);
});

test("completion stamp rejects missing identity values", async () => {
  const { stampCompletedItem } = await load();
  assert.throws(() => stampCompletedItem({ name: "", version: "OWNER.19", verified: true }), /name is required/);
  assert.throws(() => stampCompletedItem({ name: "RIDE-MAP", version: "", verified: true }), /version is required/);
});
