"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const sw = require("../sw.js");
const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));

function sorted(values) {
  return [...values].sort();
}

function cloudflareAllowlist() {
  return read(".assetsignore")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("!/") && line.length > 2)
    .map(line => line.slice(2));
}

test("active publication metadata follows the GO Hub root cutover", () => {
  assert.equal(manifest.release, "go-hub-root-cutover-compat-1");
  assert.equal(manifest.product, "GO Hub");
  assert.equal(manifest.rootEntry, "index.html");
  assert.equal(manifest.compatibility.normalPocket.release, "1.3.1-mobile-polish");
  assert.equal(manifest.compatibility.normalPocket.sourceCommit, "874cca49624a43a09b48c5155131f974e8d91b61");
  assert.equal(sw.RELEASE_ID, manifest.serviceWorker.releaseId);
  assert.equal(sw.CACHE_GENERATION, manifest.serviceWorker.cacheGeneration);
  assert.equal(manifest.serviceWorker.autoActivate, false);
});

test("release manifest, Cloudflare allowlist, and offline shell cannot drift", () => {
  assert.ok(Array.isArray(manifest.productionFiles), "release manifest must list productionFiles");
  const manifestFiles = manifest.productionFiles.map(entry => typeof entry === "string" ? entry : entry.path);
  const allowed = cloudflareAllowlist();
  const shell = sw.APP_SHELL.filter(file => file !== "./");

  assert.deepEqual(sorted(allowed), sorted(manifestFiles));
  assert.deepEqual(sorted(shell), sorted(manifestFiles.filter(file => file !== "sw.js")));

  for (const file of manifestFiles) {
    assert.ok(fs.existsSync(path.join(root, file)), `publication file does not exist: ${file}`);
  }
});

test("operator guide retains the compatibility Worker name until service-worker ownership handoff", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc"));
  const guide = read("UPLOAD_GUIDE.md");
  assert.equal(wrangler.name, "normalpocket");
  assert.equal(manifest.compatibility.normalPocket.workerName, "normalpocket");
  assert.match(guide, /Worker[^\n]*`normalpocket`/);
  assert.doesNotMatch(guide, /Worker[^\n]*`ygph-standard`/);
});
