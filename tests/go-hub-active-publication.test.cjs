"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const release = JSON.parse(read("RELEASE_MANIFEST.json"));
const sw = require("../sw.js");

const rootHubFiles = [
  "index.html",
  "go-hub.html",
  "go-hub.webmanifest",
  "go-hub-shell.css",
  "go-hub-shell.js",
  "go-hub-runtime.js",
  "go-hub-root-route.js",
  "normalpocket-root-compat.js",
  "normalpocket.html",
  "manifest.webmanifest",
];

test("active publication truth declares GO Hub root with NormalPocket compatibility", () => {
  assert.equal(release.product, "GO Hub");
  assert.equal(release.release, "go-hub-root-cutover-compat-1");
  assert.equal(release.rootEntry, "index.html");
  assert.equal(release.compatibility.normalPocket.release, "1.3.1-mobile-polish");
  assert.equal(release.compatibility.normalPocket.route, "normalpocket.html");
  assert.equal(release.compatibility.normalPocket.workerName, "normalpocket");
  assert.equal(release.compatibility.normalPocket.database.name, "ygph-standard-secure");
  assert.equal(release.serviceWorker.mode, "compatibility-bridge");
  assert.equal(release.serviceWorker.cachePrefix, "ygph-standard-app-");
  assert.equal(release.serviceWorker.autoActivate, false);

  const files = new Set(release.productionFiles.map(item => item.path));
  const allowlist = read(".assetsignore");
  for (const file of rootHubFiles) {
    assert.equal(files.has(file), true, `${file} must be in active publication truth`);
    assert.match(allowlist, new RegExp(`!/${file.replaceAll(".", "\\.")}`));
    assert.equal(sw.APP_SHELL.includes(file), true, `${file} must be available in the compatibility cache`);
  }
});

test("compatibility service worker routes NormalPocket navigation without falling through to Hub root", () => {
  assert.match(sw.CACHE_GENERATION, /go-hub-root-cutover/);
  assert.equal(sw.shouldAutoActivateCurrentGeneration(), false);
  assert.deepEqual(
    sw.offlineLookupKeys({ mode: "navigate", url: "https://example.test/normalpocket.html" }),
    ["normalpocket.html"],
  );
  assert.deepEqual(
    sw.offlineLookupKeys({ mode: "navigate", url: "https://example.test/" }),
    ["index.html", "./"],
  );
  assert.deepEqual(
    sw.offlineLookupKeys({ mode: "navigate", url: "https://example.test/go-hub.html" }),
    ["go-hub.html", "index.html", "./"],
  );
});

test("deploy syntax gate covers every new active root JavaScript entry", () => {
  const pkg = JSON.parse(read("package.json"));
  for (const file of ["go-hub-shell.js", "go-hub-runtime.js", "go-hub-root-route.js", "normalpocket-root-compat.js"]) {
    assert.match(pkg.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")), `${file} must be syntax checked`);
  }
});
