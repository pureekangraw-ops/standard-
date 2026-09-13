"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const legacyPublicationNames = [
  "normalpocket.html",
  "normalpocket-root-compat.js",
  "manifest.webmanifest",
  "sw-bootstrap.js",
  "sw.js",
  "normalpocket-bootstrap.js",
  "app.js",
  "metropolis-r5.js",
];

test("GO Hub root has no active NormalPocket compatibility route", () => {
  const html = read("index.html");
  assert.match(html, /go-hub\.webmanifest/);
  assert.match(html, /go-hub-shell\.js/);
  assert.match(html, /go-hub-sw-bootstrap\.js/);
  assert.doesNotMatch(html, /normalpocket-root-compat\.js/);
  assert.doesNotMatch(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /src=["']\.\/sw-bootstrap\.js["']/);
});

test("dedicated GO Hub service worker owns root offline startup", () => {
  assert.equal(fs.existsSync(path.join(root, "go-hub-sw-bootstrap.js")), true);
  const bootstrap = read("go-hub-sw-bootstrap.js");
  assert.match(bootstrap, /serviceWorker\.register\(["']\.\/go-hub-sw\.js["']/);
  assert.match(bootstrap, /scope:\s*["']\/["']/);
  assert.doesNotMatch(bootstrap, /register\(["']sw\.js["']/);

  const sw = read("go-hub-sw.js");
  for (const required of [
    "index.html",
    "go-hub.html",
    "go-hub.webmanifest",
    "go-hub-shell.css",
    "go-hub-shell.js",
    "go-hub-runtime.js",
    "go-hub-sw-bootstrap.js",
  ]) {
    assert.match(sw, new RegExp(required.replaceAll(".", "\\.")));
  }
  assert.match(sw, /go-hub-app-/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  assert.doesNotMatch(sw, /ygph-standard-app-/);
  assert.doesNotMatch(sw, /normalpocket/i);
  assert.doesNotMatch(sw, /metropolis-r5/i);
});

test("active publication truth contains only GO Hub runtime assets", () => {
  const release = JSON.parse(read("RELEASE_MANIFEST.json"));
  assert.equal(release.product, "GO Hub");
  assert.equal(release.rootEntry, "index.html");
  assert.equal(Object.hasOwn(release, "compatibility"), false);
  assert.equal(release.serviceWorker.file, "go-hub-sw.js");
  assert.equal(release.serviceWorker.cachePrefix, "go-hub-app-");

  const files = release.productionFiles.map(item => item.path);
  for (const legacy of legacyPublicationNames) {
    assert.equal(files.includes(legacy), false, `${legacy} must be retired from publication`);
  }

  const allowlist = read(".assetsignore");
  for (const legacy of legacyPublicationNames) {
    assert.equal(allowlist.includes(`!/${legacy}`), false, `${legacy} must not be deployment-allowlisted`);
  }
});
