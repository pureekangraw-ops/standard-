"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function productionFiles() {
  return JSON.parse(read("RELEASE_MANIFEST.json")).productionFiles.map(item => typeof item === "string" ? item : item.path);
}

test("current runtime no longer loads stale r5-1 launcher/version layer", () => {
  const runtime = read("normalpocket-runtime.js");
  assert.doesNotMatch(runtime, /metropolis-r5-1\.js/);
});

test("r5-1 javascript is not a production publication asset", () => {
  assert.ok(!productionFiles().includes("metropolis-r5-1.js"));
  assert.doesNotMatch(read(".assetsignore"), /!\/metropolis-r5-1\.js/);
  const sw = require("../sw.js");
  assert.ok(!sw.APP_SHELL.includes("metropolis-r5-1.js"));
});
