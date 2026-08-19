"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("catalog sale UI owns product selection plus shipping after compatibility bootstrap", () => {
  const source = read("normalpocket-catalog-sale-ui.js");
  assert.match(source, /NormalPocketCatalog/);
  assert.match(source, /catalogSaleContext/);
  assert.match(source, /saleHasShippingCost/);
  assert.match(source, /buildSaleEffects/);
});

test("runtime installs catalog sale authority only after compatibility catalog is ready", () => {
  const runtime = read("normalpocket-runtime.js");
  const wait = runtime.indexOf("await globalThis.NormalPocketCompatibilityReady");
  const load = runtime.indexOf('loadClassicScript("normalpocket-catalog-sale-ui.js")');
  assert.ok(wait >= 0 && load > wait);
  assert.doesNotMatch(runtime, /"normalpocket-sale-ui\.js"/);
});

test("Store port owns catalog stock mutation for catalog sales", () => {
  const source = read("normalpocket-store-port.js");
  assert.match(source, /catalogSaleContext/);
  assert.match(source, /NormalPocketCatalog/);
  assert.match(source, /adjustStock/);
});
