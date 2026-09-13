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

test("active GO Hub publication retains the NormalPocket 1.3.1 compatibility catalog", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "1.3.1");
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-simple-flow.js"]) {
    assert.match(pkg.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")));
  }

  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  assert.equal(manifest.product, "GO Hub");
  assert.equal(manifest.compatibility.normalPocket.release, "1.3.1-mobile-polish");
  assert.equal(manifest.compatibility.normalPocket.sourceCommit, "874cca49624a43a09b48c5155131f974e8d91b61");
  const files = new Set(manifest.productionFiles.map(item => item.path));
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css", "normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg", "normalpocket.html"]) {
    assert.ok(files.has(file), `${file} must be published`);
  }
});

test("compatibility service worker precaches the complete NormalPocket 1.3 surface", () => {
  const sw = require("../sw.js");
  assert.equal(sw.RELEASE_ID, "v1.3.1-20260812-r6-mobile-polish");
  for (const file of ["normalpocket.html", "normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css", "normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg"]) {
    assert.ok(sw.APP_SHELL.includes(file), `${file} must be offline`);
  }
});
