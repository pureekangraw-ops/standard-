"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("NormalPocket bootstrap loads catalog then simple-flow assets after the base app is ready", () => {
  const shell = read("normalpocket.html");
  assert.match(shell, /normalpocket-bootstrap\.js/);
  const bootstrap = read("normalpocket-bootstrap.js");
  for (const file of ["normalpocket-products.css", "normalpocket-simple-flow.css", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-simple-flow.js"]) {
    assert.match(bootstrap, new RegExp(file.replaceAll(".", "\\.")));
  }
  const core = bootstrap.indexOf("normalpocket-catalog-core.js");
  const runtime = bootstrap.indexOf("normalpocket-products.js");
  const reconcile = bootstrap.indexOf("normalpocket-reconcile.js");
  const simpleFlow = bootstrap.indexOf("normalpocket-simple-flow.js");
  assert.ok(core >= 0 && core < runtime && runtime < reconcile && reconcile < simpleFlow, "catalog -> product runtime -> reconcile -> simple flow order must be explicit");
  assert.match(bootstrap, /DOMContentLoaded/);
});

test("NormalPocket catalog remains testable source but is retired from active GO Hub publication", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "1.3.1");
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-simple-flow.js"]) {
    assert.match(pkg.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")));
  }

  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  assert.equal(manifest.product, "GO Hub");
  assert.equal(Object.hasOwn(manifest, "compatibility"), false);
  const files = new Set(manifest.productionFiles.map(item => item.path));
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css", "normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg", "normalpocket.html"]) {
    assert.equal(files.has(file), false, `${file} must remain unpublished legacy source`);
  }
});

test("active GO Hub service worker does not precache the retired NormalPocket surface", () => {
  const sw = read("go-hub-sw.js");
  assert.match(sw, /go-hub-app-/);
  for (const file of ["normalpocket.html", "normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-simple-flow.js", "app-icon.svg"]) {
    assert.equal(sw.includes(file), false, `${file} must not be part of GO Hub service-worker ownership`);
  }
});
