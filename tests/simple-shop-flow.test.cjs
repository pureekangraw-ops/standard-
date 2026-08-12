"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("NormalPocket current release has neutral public branding with no owner-specific UI copy", () => {
  const index = read("index.html");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const metropolis = read("metropolis-v4.js");
  const simple = read("normalpocket-simple-flow.js");
  const visible = [index, manifest.name, manifest.short_name, manifest.description, metropolis, simple].join("\n");

  assert.match(index, /<title>NormalPocket 1\.3\.1<\/title>/);
  assert.equal(manifest.name, "NormalPocket");
  assert.equal(manifest.short_name, "NormalPocket");
  assert.match(visible, /NormalPocket/);
  for (const ownerCopy of ["แอปของบิ๊ก", "กับโก", "YGPH STANDARD", "ฐานงานส่วนตัว"]) {
    assert.doesNotMatch(visible, new RegExp(ownerCopy));
  }
  assert.equal(manifest.icons[0].src, "app-icon.svg");
  assert.equal(manifest.icons[0].sizes, "any");
});

test("NormalPocket current release exposes five simple daily actions", () => {
  const source = read("normalpocket-simple-flow.js");
  for (const label of ["ขายสินค้า", "ขายด่วน", "รับสินค้า", "เงิน", "จบวัน"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /normalpocketQuickHome/);
  assert.match(source, /openQuickSale/);
  assert.match(source, /openDayClose/);
  assert.match(source, /openStockAdjust/);
});

test("simple home hides the legacy launcher and duplicate dashboard", () => {
  const css = read("normalpocket-simple-flow.css");
  assert.match(css, /#homePage>\.section/);
  assert.match(css, /#homePage>\.metro-owner-dashboard/);
  assert.match(css, /display:none/);
});

test("legacy runtime layers load before NormalPocket authority", () => {
  const bootstrap = read("sw-bootstrap.js");
  assert.match(bootstrap, /async function loadRuntimeLayers/);
  assert.match(bootstrap, /await loadMetropolisLayers\(\)/);
  assert.match(bootstrap, /await loadScript\("normalpocket-bootstrap\.js"/);
  assert.ok(bootstrap.indexOf("await loadMetropolisLayers()") < bootstrap.indexOf('await loadScript("normalpocket-bootstrap.js"'));
});

test("quick sale is cash-first and never mutates product stock", () => {
  const flow = require("../normalpocket-simple-flow.js");
  const result = flow.buildQuickSale({ qty: 2, unitPriceSatang: 1250, receivedSatang: 2500, date: "2026-08-12", id: "QSALE-1", at: "2026-08-12T01:00:00.000Z" });
  assert.equal(result.totalSatang, 2500);
  assert.equal(result.receivedSatang, 2500);
  assert.equal(result.outstandingSatang, 0);
  assert.equal(result.quickSale, true);
  assert.equal(result.productId, null);
  assert.equal(result.variantId, null);
  assert.throws(() => flow.buildQuickSale({ qty: 1, unitPriceSatang: 1000, receivedSatang: 500 }), /รับเงินครบ/);
});

test("day close summary uses daily records without resetting durable stock or cash", () => {
  const flow = require("../normalpocket-simple-flow.js");
  const state = {
    store: {
      stockQty: 9,
      sales: [
        { date: "2026-08-12", status: "COMPLETED", totalSatang: 5000, receivedSatang: 5000, costSatang: 2000 },
        { date: "2026-08-11", status: "COMPLETED", totalSatang: 9000, receivedSatang: 9000, costSatang: 4000 }
      ]
    },
    ledger: {
      transactions: [
        { date: "2026-08-12", direction: "IN", amountSatang: 5000 },
        { date: "2026-08-12", direction: "OUT", amountSatang: 1000 }
      ]
    },
    calendar: [
      { due: "2026-08-12", status: "OPEN" },
      { due: "2026-08-12", status: "COMPLETED" }
    ]
  };
  const summary = flow.daySummary(state, "2026-08-12");
  assert.equal(summary.salesSatang, 5000);
  assert.equal(summary.cashInSatang, 5000);
  assert.equal(summary.cashOutSatang, 1000);
  assert.equal(summary.estimatedGrossSatang, 3000);
  assert.equal(summary.openTasks, 1);
  assert.equal(state.store.stockQty, 9);
});

test("stock adjustment reasons stay small and general-purpose", () => {
  const flow = require("../normalpocket-simple-flow.js");
  assert.deepEqual(flow.STOCK_ADJUST_REASONS, ["นับใหม่", "เสีย", "หาย", "ใช้เอง", "คืนสินค้า", "อื่นๆ"]);
});

test("release contract publishes the current NormalPocket simple-flow assets", () => {
  const pkg = JSON.parse(read("package.json"));
  const release = JSON.parse(read("RELEASE_MANIFEST.json"));
  const sw = require("../sw.js");
  assert.equal(pkg.version, "1.3.1");
  assert.equal(release.release, "1.3.1-mobile-polish");
  assert.equal(release.product, "NormalPocket");
  assert.equal(sw.RELEASE_ID, "v1.3.1-20260812-r6-mobile-polish");
  for (const file of ["normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg"]) {
    assert.ok(release.productionFiles.some(item => item.path === file), `${file} must be published`);
  }
});
