"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("hard cutover keeps GO Hub at slash with no compatibility route", () => {
  const rootHtml = read("index.html");
  for (const required of ["go-hub.webmanifest", "go-hub-shell.css", "go-hub-sw-bootstrap.js", "go-hub-shell.js"]) {
    assert.match(rootHtml, new RegExp(required.replaceAll(".", "\\.")));
  }
  for (const retiredRuntime of [
    "normalpocket-root-compat.js",
    "normalpocket-bootstrap.js",
    "metropolis-r5.js",
    "app.js",
    "manifest.webmanifest",
  ]) {
    assert.equal(rootHtml.includes(retiredRuntime), false, `root must not boot ${retiredRuntime}`);
  }
  assert.doesNotMatch(rootHtml, /src=["']\.\/sw-bootstrap\.js["']/, "root must not boot the legacy service-worker bootstrap");
});

test("legacy compatibility source may remain but is unreachable and unpublished", () => {
  for (const legacyFile of ["normalpocket.html", "normalpocket-root-compat.js", "go-hub-root-route.js", "sw.js"]) {
    assert.equal(fs.existsSync(path.join(root, legacyFile)), true, `${legacyFile} may remain as source reference`);
  }

  const release = JSON.parse(read("RELEASE_MANIFEST.json"));
  const published = release.productionFiles.map(item => item.path);
  for (const legacyFile of ["normalpocket.html", "normalpocket-root-compat.js", "go-hub-root-route.js", "sw.js"]) {
    assert.equal(published.includes(legacyFile), false, `${legacyFile} must not be active publication`);
  }
  assert.equal(Object.hasOwn(release, "compatibility"), false);
});

test("real-device release gate is GO Hub online and offline only", () => {
  const release = JSON.parse(read("RELEASE_MANIFEST.json"));
  const sw = read("go-hub-sw.js");

  assert.equal(release.serviceWorker.file, "go-hub-sw.js");
  assert.equal(release.serviceWorker.autoActivate, true);
  assert.match(sw, /\.\/index\.html/);
  assert.match(sw, /cache\.match\(["']\.\/index\.html["']\)/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);

  const runbookPath = path.join(root, "docs", "go-hub", "real-device-cutover-verification.md");
  assert.equal(fs.existsSync(runbookPath), true, "current cutover runbook must define the owner gate");
  const runbook = fs.readFileSync(runbookPath, "utf8");
  for (const marker of ["Online `/` opens GO Hub", "Disable network", "NormalPocket online/offline behavior is not evaluated", "Do not merge", "Do not deploy"]) {
    assert.match(runbook, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\  const specPath = path.join(root, "docs", "superpowers", "specs", "2026-09-14-go-hub-hard-cutover-design.md");
  assert.equal(fs.existsSync(specPath), true, "hard-cutover design must define the owner gate");
  const spec = fs.readFileSync(specPath, "utf8");
  for (const marker of ["Online `/` opens GO Hub", "Disable network", "NormalPocket online/offline behavior is not evaluated", "Do not merge", "Do not deploy"]) {
    assert.match(spec, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `spec must contain ${marker}`);
  }"), "i"), `runbook must contain ${marker}`);
  }
});
