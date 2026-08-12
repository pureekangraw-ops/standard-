"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

let catalog = {};
try {
  catalog = require("../normalpocket-catalog-core.js");
} catch (_) {
  catalog = {};
}

function requireCatalog() {
  for (const name of [
    "normalizeStore",
    "generateVariants",
    "productStockQty",
    "catalogStockQty",
    "resolveStockOwner",
    "effectiveSalePriceSatang",
    "adjustStock"
  ]) {
    assert.equal(typeof catalog[name], "function", `${name} must be exported`);
  }
}

test("catalog core exposes the NormalPocket product contracts", () => {
  requireCatalog();
});

test("legacy aggregate stock migrates to one deterministic legacy product", () => {
  requireCatalog();
  const store = { stockQty: 7, stockValueSatang: 35000, sales: [], purchases: [], withdrawals: [] };
  catalog.normalizeStore(store);
  assert.equal(store.products.length, 1);
  assert.equal(store.products[0].id, "PRODUCT-LEGACY-STOCK");
  assert.equal(store.products[0].name, "สินค้าคงเหลือเดิม");
  assert.equal(store.products[0].stockQty, 7);
  assert.deepEqual(store.products[0].variants, []);
  assert.equal(store.stockQty, 7);
});

test("simple product normalization keeps one base stock owner", () => {
  requireCatalog();
  const store = {
    stockQty: 99,
    products: [{ id: "P-1", name: "กาแฟ", salePriceSatang: 5000, stockQty: 4, active: true }]
  };
  catalog.normalizeStore(store);
  const product = store.products[0];
  assert.deepEqual(product.variants, []);
  assert.equal(product.stockQty, 4);
  assert.equal(catalog.productStockQty(product), 4);
  assert.equal(store.stockQty, 4, "aggregate stock must be derived from catalog owners");
});

test("color-only options generate one variant per unique color", () => {
  requireCatalog();
  const variants = catalog.generateVariants({ color: ["ดำ", "ขาว", "ดำ"], size: [] });
  assert.deepEqual(variants.map(item => item.options), [
    { color: "ดำ" },
    { color: "ขาว" }
  ]);
});

test("size-only options generate one variant per unique size", () => {
  requireCatalog();
  const variants = catalog.generateVariants({ color: [], size: ["S", "M", "M"] });
  assert.deepEqual(variants.map(item => item.options), [
    { size: "S" },
    { size: "M" }
  ]);
});

test("color by size generates every unique sellable combination", () => {
  requireCatalog();
  const variants = catalog.generateVariants({ color: ["ดำ", "ขาว"], size: ["S", "M"] });
  assert.equal(variants.length, 4);
  assert.deepEqual(variants.map(item => item.options), [
    { color: "ดำ", size: "S" },
    { color: "ดำ", size: "M" },
    { color: "ขาว", size: "S" },
    { color: "ขาว", size: "M" }
  ]);
  assert.equal(new Set(variants.map(item => item.id)).size, 4, "generated ids must be unique");
});

test("variant product derives stock from active variants instead of base stock", () => {
  requireCatalog();
  const product = {
    id: "P-SHIRT",
    name: "เสื้อ",
    stockQty: 999,
    variants: [
      { id: "V-S", options: { size: "S" }, stockQty: 3, active: true },
      { id: "V-M", options: { size: "M" }, stockQty: 5, active: true },
      { id: "V-X", options: { size: "X" }, stockQty: 9, active: false }
    ],
    active: true
  };
  assert.equal(catalog.productStockQty(product), 8);
});

test("variant sale requires exact variant and uses price override when present", () => {
  requireCatalog();
  const product = {
    id: "P-1",
    salePriceSatang: 10000,
    stockQty: 0,
    variants: [
      { id: "V-1", options: { color: "ดำ", size: "M" }, stockQty: 2, salePriceSatang: 12000, active: true }
    ],
    active: true
  };
  assert.throws(() => catalog.resolveStockOwner(product, null), /ตัวเลือกสินค้า/);
  const owner = catalog.resolveStockOwner(product, "V-1");
  assert.equal(owner.id, "V-1");
  assert.equal(catalog.effectiveSalePriceSatang(product, owner), 12000);
  assert.equal(catalog.effectiveSalePriceSatang(product, { ...owner, salePriceSatang: null }), 10000);
});

test("stock adjustment mutates exactly one owner and rejects negative stock", () => {
  requireCatalog();
  const product = {
    id: "P-1",
    stockQty: 5,
    variants: [],
    active: true
  };
  catalog.adjustStock(product, null, -2);
  assert.equal(product.stockQty, 3);
  assert.throws(() => catalog.adjustStock(product, null, -4), /สต็อกไม่พอ/);

  const variantProduct = {
    id: "P-2",
    stockQty: 0,
    variants: [{ id: "V-2", options: { size: "L" }, stockQty: 2, active: true }],
    active: true
  };
  catalog.adjustStock(variantProduct, "V-2", 3);
  assert.equal(variantProduct.variants[0].stockQty, 5);
  assert.equal(variantProduct.stockQty, 0, "base stock is not a competing owner");
});
