"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function functionSlice(source, startName, nextName) {
  const start = source.indexOf(`function ${startName}`);
  assert.ok(start >= 0, `${startName} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end > start ? end : source.length);
}

test("catalog sale keeps only essential fields visible and moves optional data behind disclosure", () => {
  const source = read("normalpocket-products.js");
  const sale = functionSlice(source, "openCatalogSale", "openCatalogPurchase");
  assert.match(sale, /selectionFields\("npSale"\)/);
  assert.match(sale, /npSaleQty/);
  assert.match(sale, /npSaleReceived/);
  assert.match(sale, /<details class="np-sale-advanced">/);
  const disclosure = sale.slice(sale.indexOf('<details class="np-sale-advanced">'));
  for (const id of ["npSaleUnitPrice", "npSaleCustomer", "npSaleContact", "npSaleDue", "npSaleNote"]) {
    assert.match(disclosure, new RegExp(id));
  }
});

test("product editor keeps name price and stock primary while secondary metadata is disclosed", () => {
  const source = read("normalpocket-products.js");
  const editor = functionSlice(source, "openProductEditor", "productOptionsHtml");
  const disclosureAt = editor.indexOf('<details class="normalpocket-product-advanced">');
  assert.ok(disclosureAt > 0, "product advanced disclosure must exist");
  const primary = editor.slice(0, disclosureAt);
  const advanced = editor.slice(disclosureAt);
  for (const id of ["productName", "productSalePrice", "productStock", "productHasVariants"]) assert.match(primary, new RegExp(id));
  for (const id of ["productCategory", "productUnit", "productCost", "productActive"]) {
    assert.doesNotMatch(primary, new RegExp(id));
    assert.match(advanced, new RegExp(id));
  }
});

test("one-hand controls keep at least 44px tap targets across home and product editor", () => {
  const css = read("normalpocket-simple-flow.css");
  assert.match(css, /\.np-one-hand \.home-btn\{[^}]*width:44px;[^}]*height:44px/);
  assert.match(css, /\.np-first-run button\{[^}]*min-height:44px/);
  assert.match(css, /\.np-secondary-actions button\{[^}]*min-height:44px/);
  assert.match(css, /\.normalpocket-product-advanced summary\{[^}]*min-height:44px/);
  assert.match(css, /\.np-one-hand \.text-btn\{[^}]*min-height:44px/);
  assert.match(css, /\.np-one-hand \.secondary-btn\{[^}]*min-height:44px/);
  assert.match(css, /\.np-one-hand \.modal-actions button\{[^}]*min-height:44px/);
});

test("closing a day is refreshable when records are added after the first close", () => {
  const flow = require("../normalpocket-simple-flow.js");
  assert.equal(typeof flow.upsertDayCloseEvent, "function");
  const first = flow.upsertDayCloseEvent(null, { date: "2026-08-12", salesSatang: 100 }, { id: "DAY-1", at: "2026-08-12T10:00:00.000Z" });
  const next = flow.upsertDayCloseEvent(first, { date: "2026-08-12", salesSatang: 250 }, { id: "DAY-2", at: "2026-08-12T11:00:00.000Z" });
  assert.equal(next.id, "DAY-1");
  assert.equal(next.createdAt, first.createdAt);
  assert.equal(next.updatedAt, "2026-08-12T11:00:00.000Z");
  assert.equal(next.summary.salesSatang, 250);
});

test("every text production runtime file is free of owner-specific public identity", () => {
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const forbidden = ["แอปของบิ๊ก", "กับโก", "ฐานงานส่วนตัว"];
  const textExt = /\.(?:html|js|css|json|webmanifest)$/i;
  for (const item of manifest.productionFiles || []) {
    if (!textExt.test(item.path)) continue;
    const content = read(item.path);
    for (const phrase of forbidden) assert.doesNotMatch(content, new RegExp(phrase), `${item.path} must not contain ${phrase}`);
  }
});
