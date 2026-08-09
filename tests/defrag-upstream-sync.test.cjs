"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("STANDARD Calendar source does not depend on cancelled compatibility controls", () => {
  const index = read("index.html");
  const app = read("app.js");
  assert.doesNotMatch(index, /id="calCancelled"/);
  assert.doesNotMatch(index, /data-filter="CANCELLED"/);
  assert.doesNotMatch(app, /byId\("calCancelled"\)/);
});

test("STANDARD runtime extensions use the shared hook bus instead of DOM observers", () => {
  for (const file of ["metropolis-r5.js", "metropolis-r5-1.js", "metropolis-r5-2.js", "metropolis-r5-3.js", "metropolis-r5-4.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /new MutationObserver\(/, `${file} still creates a MutationObserver`);
  }
});

test("STANDARD live rendering never swaps durable state to filter cancelled records", () => {
  const source = read("metropolis-r5-3.js");
  assert.doesNotMatch(source, /function withLiveCalendar/);
  assert.doesNotMatch(source, /function withLiveSourceRecords/);
  assert.doesNotMatch(source, /state\.calendar\s*=/);
  assert.doesNotMatch(source, /state\.(?:store|ledger)\.[A-Za-z]+\s*=/);
});

test("STANDARD dashboard metrics receive cash explicitly instead of reading global state", () => {
  const source = read("metropolis-r5-4.js");
  assert.match(source, /function r54Metrics\(targetState,\s*today\s*=\s*r54Today\(\),\s*cashSatang\s*=\s*0\)/);
  const metricsBody = source.match(/function r54Metrics[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(metricsBody, /currentBalanceSatang/);
});

test("STANDARD has one visible product-version authority", () => {
  const r52 = read("metropolis-r5-2.js");
  const r54 = read("metropolis-r5-4.js");
  assert.match(r52, /YGPH_STANDARD_PRODUCT_VERSION/);
  assert.match(r54, /YGPH_STANDARD_PRODUCT_VERSION\s*=\s*STANDARD_PRODUCT_VERSION/);
  assert.doesNotMatch(r54, /applyProductVersion42\s*=\s*function/);
});

test("STANDARD deploy gate points at all test files", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.test, "node --test tests/*.test.cjs");
});
