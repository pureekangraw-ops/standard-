"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("bounded live source bridge owns remaining r5-3 compatibility effects", () => {
  const source = read("normalpocket-live-source-bridge.js");
  assert.match(source, /renderLiveSourceLists/);
  assert.match(source, /patchHistoryHtml/);
  assert.match(source, /selectLiveRecords/);
  assert.doesNotMatch(source, /flowCalendarItems/);
});

test("production runtime no longer loads metropolis-r5-3", () => {
  const runtime = read("normalpocket-runtime.js");
  assert.match(runtime, /normalpocket-live-source-bridge\.js/);
  assert.doesNotMatch(runtime, /metropolis-r5-3\.js/);
});

test("r5-3 javascript remains source evidence but is not a production asset", () => {
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const assets = read(".assetsignore");
  const sw = read("sw.js");
  assert.equal(manifest.productionFiles.some(item => item.path === "metropolis-r5-3.js"), false);
  assert.doesNotMatch(assets, /!\/metropolis-r5-3\.js/);
  assert.doesNotMatch(sw, /"metropolis-r5-3\.js"/);
});
