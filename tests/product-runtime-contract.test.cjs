"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("product runtime is a private classic-script adapter over the catalog core", () => {
  const source = read("normalpocket-products.js");
  assert.match(source, /\(function\s+normalPocketProducts/);
  assert.match(source, /NormalPocketCatalog/);
  assert.match(source, /normalizeStore/);
  assert.match(source, /generateVariants/);
  assert.match(source, /adjustStock/);
  assert.match(source, /persistAndRender/);
  assert.match(source, /productId/);
  assert.match(source, /variantId/);
  assert.match(source, /สินค้ามีตัวเลือก/);
  assert.match(source, /สี/);
  assert.match(source, /ขนาด/);
  assert.doesNotMatch(source, /\bRIDE\b/);
});

test("runtime extends default state, normalization and Store rendering without replacing durable ownership", () => {
  const source = read("normalpocket-products.js");
  assert.match(source, /const\s+originalDefaultState\s*=\s*defaultState/);
  assert.match(source, /const\s+originalNormalizeState\s*=\s*normalizeState/);
  assert.match(source, /const\s+originalRenderStore\s*=\s*renderStore/);
  assert.match(source, /defaultState\s*=\s*function/);
  assert.match(source, /normalizeState\s*=\s*function/);
  assert.match(source, /renderStore\s*=\s*function/);
  assert.doesNotMatch(source, /indexedDB\.open/);
  assert.doesNotMatch(source, /crypto\.subtle/);
});

test("product UI stays progressive and keeps advanced metadata secondary", () => {
  const source = read("normalpocket-products.js");
  assert.match(source, /รายการสินค้า/);
  assert.match(source, /เพิ่มสินค้า/);
  assert.match(source, /productHasVariants/);
  assert.match(source, /productVariantEditor/);
  assert.match(source, /<details[^>]*>/);
  assert.match(source, /SKU/);
  assert.match(source, /บาร์โค้ด/);
  assert.match(source, /description/);
  assert.match(source, /imageRef/);
});

test("sale purchase and withdrawal resolve product plus variant and persist selection evidence", () => {
  const source = read("normalpocket-products.js");
  for (const id of ["addSaleBtn", "addPurchaseBtn", "withdrawStockBtn"]) {
    assert.match(source, new RegExp(id));
  }
  assert.match(source, /resolveSelection/);
  assert.match(source, /snapshotSelection/);
  assert.match(source, /productId:\s*selection\.productId/);
  assert.match(source, /variantId:\s*selection\.variantId/);
  assert.match(source, /optionSnapshot/);
});

test("existing cancellation path delegates product-specific inventory restoration to NormalPocket runtime", () => {
  const app = read("app.js");
  assert.match(app, /NormalPocketProducts\.restoreSaleStock\(source\)/);
  assert.match(app, /NormalPocketProducts\.removePurchaseStock\(source\)/);
});

test("product CSS provides compact list and variant editor surfaces", () => {
  const css = read("normalpocket-products.css");
  assert.match(css, /normalpocket-product-list/);
  assert.match(css, /normalpocket-product-card/);
  assert.match(css, /normalpocket-variant-grid/);
  assert.match(css, /normalpocket-option-summary/);
});
