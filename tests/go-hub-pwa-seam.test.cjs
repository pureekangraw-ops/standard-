"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("GO Hub has an additive PWA identity separate from NormalPocket", () => {
  assert.equal(fs.existsSync(path.join(root, "go-hub.webmanifest")), true);
  const manifest = JSON.parse(read("go-hub.webmanifest"));
  assert.equal(manifest.name, "GO Hub");
  assert.equal(manifest.short_name, "GO Hub");
  assert.equal(manifest.id, "/go-hub.html");
  assert.equal(manifest.start_url, "/go-hub.html");

  const legacy = JSON.parse(read("manifest.webmanifest"));
  assert.equal(legacy.name, "NormalPocket");
  assert.equal(legacy.id, "/index.html");
});

test("GO Hub service-worker seam is isolated and inactive by default", () => {
  assert.equal(fs.existsSync(path.join(root, "go-hub-sw.js")), true);
  const source = read("go-hub-sw.js");
  assert.match(source, /go-hub-app-/);
  assert.match(source, /go-hub\.html/);
  assert.doesNotMatch(source, /ygph-standard-app-/);
  assert.doesNotMatch(source, /normalpocket/i);
  assert.doesNotMatch(source, /metropolis-r5/i);

  const hubHtml = read("go-hub.html");
  assert.match(hubHtml, /go-hub\.webmanifest/);
  assert.doesNotMatch(hubHtml, /go-hub-sw\.js/);
  assert.doesNotMatch(hubHtml, /serviceWorker\.register/);

  const legacyHtml = read("index.html");
  assert.doesNotMatch(legacyHtml, /go-hub\.webmanifest/);
  assert.doesNotMatch(legacyHtml, /go-hub-sw\.js/);
});
