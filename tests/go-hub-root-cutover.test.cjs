"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("root cutover keeps GO Hub at slash and NormalPocket behind compatibility", () => {
  for (const file of ["normalpocket.html", "normalpocket-root-compat.js", "go-hub-root-route.js"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  }

  const rootHtml = read("index.html");
  for (const required of ["go-hub.webmanifest", "go-hub-shell.css", "normalpocket-root-compat.js", "go-hub-shell.js"]) {
    assert.match(rootHtml, new RegExp(required.replaceAll(".", "\\.")));
  }
  for (const legacyRuntime of ["normalpocket-bootstrap.js", "metropolis-r5.js", "app.js", "manifest.webmanifest"]) {
    assert.equal(rootHtml.includes(legacyRuntime), false, `root must not boot ${legacyRuntime}`);
  }

  const legacyHtml = read("normalpocket.html");
  assert.match(legacyHtml, /NormalPocket/);
  assert.match(legacyHtml, /normalpocket-bootstrap\.js/);
  assert.match(legacyHtml, /metropolis-r5\.js/);
});

test("root route decision fails closed for clients whose legacy state cannot be inspected", async () => {
  const url = pathToFileURL(path.join(root, "go-hub-root-route.js")).href;
  const { chooseRootDestination } = await import(`${url}?t=${Date.now()}`);

  assert.equal(chooseRootDestination({ canInspectLegacy: false, legacyData: false }), "LEGACY");
  assert.equal(chooseRootDestination({ canInspectLegacy: true, legacyData: true }), "LEGACY");
  assert.equal(chooseRootDestination({ canInspectLegacy: true, legacyData: false }), "HUB");
  assert.equal(chooseRootDestination({ canInspectLegacy: false, legacyData: true, forceHub: true }), "HUB");
  assert.equal(chooseRootDestination({ canInspectLegacy: true, legacyData: false, forceLegacy: true }), "LEGACY");
});

test("NormalPocket root compatibility adapter detects the retained database without owning Hub core", () => {
  const source = read("normalpocket-root-compat.js");
  assert.match(source, /go-hub-root-route\.js/);
  assert.match(source, /indexedDB/);
  assert.match(source, /databases/);
  assert.match(source, /ygph-standard-secure/);
  assert.match(source, /normalpocket\.html/);
  assert.doesNotMatch(source, /createHubRuntime/);
  assert.doesNotMatch(source, /go-hub-foundation\.js/);
});

test("real-device cutover gate binds fresh, legacy, and offline-legacy scenarios", async () => {
  const url = pathToFileURL(path.join(root, "go-hub-root-route.js")).href;
  const { chooseRootDestination } = await import(`${url}?device-gate=${Date.now()}`);
  const sw = require("../sw.js");
  const release = JSON.parse(read("RELEASE_MANIFEST.json"));

  assert.equal(chooseRootDestination({ canInspectLegacy: true, legacyData: false }), "HUB", "fresh inspected client must be eligible for GO Hub");
  assert.equal(chooseRootDestination({ canInspectLegacy: true, legacyData: true }), "LEGACY", "legacy data must route to NormalPocket");
  assert.equal(chooseRootDestination({ canInspectLegacy: false, legacyData: false }), "LEGACY", "uninspectable client must fail closed");
  assert.equal(release.compatibility.normalPocket.database.name, "ygph-standard-secure");
  assert.match(sw.CACHE_GENERATION, /go-hub-root-cutover/);
  assert.equal(sw.shouldAutoActivateCurrentGeneration(), false, "cutover cache must wait for explicit activation");
  assert.equal(sw.APP_SHELL.includes("normalpocket.html"), true, "compatibility route must be cached for offline legacy use");
  assert.deepEqual(sw.offlineLookupKeys({ mode: "navigate", url: "https://device.test/normalpocket.html" }), ["normalpocket.html"]);

  const runbookPath = path.join(root, "docs", "go-hub", "real-device-cutover-verification.md");
  assert.equal(fs.existsSync(runbookPath), true, "real-device cutover runbook must exist before release review");
  const runbook = fs.readFileSync(runbookPath, "utf8");
  for (const marker of ["Fresh client", "Legacy client", "Offline legacy client", "STOP conditions", "CI GREEN is necessary but not sufficient", "Do not merge or deploy"]) {
    assert.match(runbook, new RegExp(marker, "i"), `runbook must contain ${marker}`);
  }
});
