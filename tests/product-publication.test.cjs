"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("NormalPocket bootstrap loads product assets after the base app is ready", () => {
  const shell = read("sw-bootstrap.js");
  assert.match(shell, /normalpocket-bootstrap\.js/);
  const bootstrap = read("normalpocket-bootstrap.js");
  for (const file of ["normalpocket-products.css", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js"]) {
    assert.match(bootstrap, new RegExp(file.replaceAll(".", "\\.")));
  }
  const core = bootstrap.indexOf("normalpocket-catalog-core.js");
  const runtime = bootstrap.indexOf("normalpocket-products.js");
  const reconcile = bootstrap.indexOf("normalpocket-reconcile.js");
  assert.ok(core >= 0 && core < runtime && runtime < reconcile, "catalog -> product runtime -> reconcile order must be explicit");
  assert.match(bootstrap, /DOMContentLoaded/);
});

test("release metadata publishes NormalPocket 1.1.0 product catalog files", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "1.1.0");
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js"]) {
    assert.match(pkg.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")));
  }

  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  assert.equal(manifest.release, "1.1.0-product-catalog");
  assert.equal(manifest.product, "NormalPocket / YGPH STANDARD");
  assert.equal(manifest.sourceCommit, "874cca49624a43a09b48c5155131f974e8d91b61");
  const files = new Set(manifest.productionFiles.map(item => item.path));
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css"]) {
    assert.ok(files.has(file), `${file} must be published`);
  }
});

test("service worker precaches the complete NormalPocket catalog release", () => {
  const sw = require("../sw.js");
  assert.equal(sw.RELEASE_ID, "v1.1.0-20260812-r3-product-catalog");
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css"]) {
    assert.ok(sw.APP_SHELL.includes(file), `${file} must be offline`);
  }
});
