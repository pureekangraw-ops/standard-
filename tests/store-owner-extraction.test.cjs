"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("STORE owner module contains store command implementation", () => {
  const source = read("src/domains/store-owner.mjs");
  assert.match(source, /STORE_PURCHASE/);
  assert.match(source, /STORE_SALE/);
  assert.match(source, /STORE_WITHDRAW/);
  assert.match(source, /store\.purchases/);
  assert.match(source, /store\.sales/);
  assert.match(source, /store\.withdrawals/);
});

test("domain dispatcher delegates STORE commands to STORE owner", () => {
  const source = read("domain.js");
  assert.match(source, /applyStoreCommand/);
  assert.doesNotMatch(source, /case ['\"]STORE_PURCHASE['\"]/);
  assert.doesNotMatch(source, /case ['\"]STORE_SALE['\"]/);
  assert.doesNotMatch(source, /case ['\"]STORE_WITHDRAW['\"]/);
});
