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

test("STANDARD publication metadata follows the defragged Current", () => {
  const expectedRelease = "v1.0.0-20260809-r2-defrag-current";
  assert.equal(sw.RELEASE_ID, expectedRelease);
  assert.equal(manifest.serviceWorker.releaseId, expectedRelease);
  assert.equal(manifest.sourceCommit, "70600e5811ba266cb57a843bd5ae6a1732fbcb91");
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

test("operator guide follows the current STANDARD Worker name", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc"));
  const guide = read("UPLOAD_GUIDE.md");
  assert.equal(wrangler.name, "normalpocket");
  assert.match(guide, /Worker[^\n]*`normalpocket`/);
  assert.doesNotMatch(guide, /Worker[^\n]*`ygph-standard`/);
});
