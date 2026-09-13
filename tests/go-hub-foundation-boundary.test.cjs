"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("GO Hub foundation exposes a neutral foundation module", () => {
  assert.equal(fs.existsSync(path.join(root, "go-hub-foundation.js")), true,
    "go-hub-foundation.js must exist as the neutral Hub substrate");
});

test("GO Hub foundation does not own NormalPocket business domains or storage identity", () => {
  const source = read("go-hub-foundation.js");
  for (const forbidden of [
    "STORE_PURCHASE",
    "STORE_SALE",
    "LEDGER_OBLIGATION_ADD",
    "CALENDAR_COMPLETE",
    "ygph-standard-secure",
    "stock-pocket-vault",
    "normalpocket",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false,
      `neutral foundation must not contain ${forbidden}`);
  }
});

test("GO Hub foundation keeps command dispatch independent through injected ports", () => {
  const source = read("go-hub-foundation.js");
  assert.match(source, /createHubController/);
  assert.match(source, /applyCommand/);
  assert.match(source, /commitState/);
  assert.doesNotMatch(source, /from ['"]\.\/domain\.js['"]/);
  assert.doesNotMatch(source, /from ['"]\.\/vault\.js['"]/);
});
