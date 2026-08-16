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

test("current runtime no longer loads legacy r5-4 dashboard/version authority", () => {
  const runtime = read("normalpocket-runtime.js");
  assert.doesNotMatch(runtime, /metropolis-r5-4\.js/);
});

test("r5-4 javascript remains source evidence but is not a production asset", () => {
  assert.ok(fs.existsSync(path.join(root, "metropolis-r5-4.js")));
  assert.ok(!productionFiles().includes("metropolis-r5-4.js"));
  assert.doesNotMatch(read(".assetsignore"), /!\/metropolis-r5-4\.js/);
  const sw = require("../sw.js");
  assert.ok(!sw.APP_SHELL.includes("metropolis-r5-4.js"));
});
