"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "RELEASE_MANIFEST.json"), "utf8"));

test("NormalPocket production identity does not claim METROPOLIS as its source product", () => {
  assert.equal(manifest.product, "NormalPocket");
  assert.equal(Object.hasOwn(manifest, "sourceProduct"), false);
  assert.equal(Object.hasOwn(manifest, "sourceCommit"), false);
});

test("cross-product engineering provenance is explicitly non-authoritative when retained", () => {
  const reference = manifest.engineeringReference;
  if (!reference) return;
  assert.equal(reference.authority, "READ_ONLY_REFERENCE");
  assert.equal(reference.product, "METROPOLIS");
});
