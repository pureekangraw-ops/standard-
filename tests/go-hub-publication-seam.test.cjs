"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const requiredHubFiles = [
  "go-hub.html",
  "go-hub-shell.css",
  "go-hub-shell.js",
  "go-hub-runtime.js",
  "go-hub-foundation.js",
  "go-hub-utils.js",
  "go-hub-persistence.js",
  "go-hub-update-lifecycle.js",
  "go-hub.webmanifest",
  "go-hub-sw.js",
];

test("GO Hub keeps its design-time publication contract free of legacy ownership", () => {
  assert.equal(fs.existsSync(path.join(root, "GO_HUB_RELEASE_MANIFEST.json")), true);
  assert.equal(fs.existsSync(path.join(root, "go-hub.assetsignore")), true);

  const manifest = JSON.parse(read("GO_HUB_RELEASE_MANIFEST.json"));
  assert.equal(manifest.product, "GO Hub");
  assert.equal(manifest.entrypoint, "go-hub.html");
  const files = new Set(manifest.productionFiles.map(item => item.path));
  for (const file of requiredHubFiles) assert.equal(files.has(file), true, `${file} must be in the Hub publication contract`);

  const allowlist = read("go-hub.assetsignore");
  for (const file of requiredHubFiles) assert.match(allowlist, new RegExp(`!/${file.replaceAll(".", "\\.")}`));
  for (const forbidden of ["normalpocket", "metropolis", "app.js", "sw-bootstrap.js", "manifest.webmanifest"]) {
    assert.equal(allowlist.toLowerCase().includes(forbidden.toLowerCase()), false, `Hub publication must not own ${forbidden}`);
  }
});

test("active publication now activates the dedicated GO Hub service worker", () => {
  const activeAllowlist = read(".assetsignore");
  for (const file of ["index.html", "go-hub.html", "go-hub.webmanifest", "go-hub-shell.css", "go-hub-shell.js", "go-hub-runtime.js", "go-hub-sw-bootstrap.js", "go-hub-sw.js"]) {
    assert.match(activeAllowlist, new RegExp(`!/${file.replaceAll(".", "\\.")}`));
  }
  for (const retired of ["go-hub-root-route.js", "normalpocket-root-compat.js", "normalpocket.html", "sw.js"]) {
    assert.equal(activeAllowlist.includes(`!/${retired}`), false, `${retired} must not be actively published`);
  }

  const activeRelease = JSON.parse(read("RELEASE_MANIFEST.json"));
  assert.equal(activeRelease.product, "GO Hub");
  assert.equal(activeRelease.serviceWorker.mode, "go-hub-exclusive");
  assert.equal(activeRelease.serviceWorker.file, "go-hub-sw.js");
  assert.equal(activeRelease.serviceWorker.autoActivate, true);
  assert.equal(activeRelease.productionFiles.some(item => item.path === "go-hub-sw.js"), true);
});
