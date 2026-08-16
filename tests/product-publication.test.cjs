"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("NormalPocket bootstrap loads catalog scripts after the base app is ready without injecting styles", () => {
  const shell = read("sw-bootstrap.js");
  assert.match(shell, /normalpocket-bootstrap\.js/);
  assert.doesNotMatch(shell, /createElement\(["']link["']\)/);

  const bootstrap = read("normalpocket-bootstrap.js");
  for (const file of ["normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-simple-flow.js"]) {
    assert.match(bootstrap, new RegExp(file.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(bootstrap, /createElement\(["']link["']\)/);
  const core = bootstrap.indexOf("normalpocket-catalog-core.js");
  const runtime = bootstrap.indexOf("normalpocket-products.js");
  const reconcile = bootstrap.indexOf("normalpocket-reconcile.js");
  const simpleFlow = bootstrap.indexOf("normalpocket-simple-flow.js");
  assert.ok(core >= 0 && core < runtime && runtime < reconcile && reconcile < simpleFlow, "catalog -> product runtime -> reconcile -> simple flow order must be explicit");
  assert.match(bootstrap, /DOMContentLoaded/);
});

test("current stylesheet is the single CSS authority for legacy and NormalPocket layers", () => {
  const current = read("normalpocket-current.css");
  for (const file of [
    "styles.css", "flow-era.css", "metropolis-v4.css", "metropolis-r5.css", "metropolis-r5-1.css",
    "metropolis-r5-2.css", "metropolis-r5-3.css", "metropolis-r5-4.css",
    "normalpocket-products.css", "normalpocket-simple-flow.css"
  ]) {
    assert.match(current, new RegExp(file.replaceAll(".", "\\.")), `${file} must be ordered by current CSS authority`);
  }
});

test("release metadata publishes NormalPocket 1.3.1 while retaining catalog files", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "1.3.1");
  for (const file of ["normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-simple-flow.js"]) {
    assert.match(pkg.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")));
  }

  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  assert.equal(manifest.release, "1.3.1-mobile-polish");
  assert.equal(manifest.product, "NormalPocket");
  assert.equal(manifest.sourceCommit, "874cca49624a43a09b48c5155131f974e8d91b61");
  const files = new Set(manifest.productionFiles.map(item => item.path));
  for (const file of ["normalpocket-current.css", "normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css", "normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg"]) {
    assert.ok(files.has(file), `${file} must be published`);
  }
});

test("service worker precaches the complete NormalPocket 1.3 release", () => {
  const sw = require("../sw.js");
  assert.equal(sw.RELEASE_ID, "v1.3.1-20260812-r6-mobile-polish");
  for (const file of ["normalpocket-current.css", "normalpocket-bootstrap.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "normalpocket-reconcile.js", "normalpocket-products.css", "normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg"]) {
    assert.ok(sw.APP_SHELL.includes(file), `${file} must be offline`);
  }
});
