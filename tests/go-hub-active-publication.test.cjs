"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const release = JSON.parse(read("RELEASE_MANIFEST.json"));

const activeHubFiles = [
  "index.html", "go-hub.html", "go-hub.webmanifest", "go-hub-shell.css", "go-hub-shell.js",
  "go-hub-runtime.js", "go-hub-centre.js", "go-hub-city-route.js", "go-hub-optician.js",
  "go-hub-factory-return.js", "go-hub-code-module.js", "go-hub-code-task.js", "go-hub-evidence-ledger.js",
  "go-hub-piece-qc.js", "go-hub-ready-gate.js", "go-hub-assembly-bench.js", "go-hub-assembly-qc.js",
  "go-hub-artifact.js", "go-hub-product-qc.js", "go-hub-verification-scanner.js", "go-hub-housekeeper.js",
  "go-hub-learning-recorder.js", "go-hub-workbench-model.js", "go-hub-github-workspace.js",
  "go-hub-persistence.js", "go-hub-sw-bootstrap.js", "go-hub-sw.js",
];

const retiredRuntimeNames = [
  "normalpocket.html", "normalpocket-root-compat.js", "manifest.webmanifest", "sw-bootstrap.js",
  "sw.js", "app.js", "metropolis-r5.js",
];

test("active publication truth declares exclusive GO Hub ownership", () => {
  assert.equal(release.product, "GO Hub");
  assert.equal(release.release, "go-hub-hard-cutover-1");
  assert.equal(release.rootEntry, "index.html");
  assert.equal(Object.hasOwn(release, "compatibility"), false);
  assert.equal(release.serviceWorker.file, "go-hub-sw.js");
  assert.equal(release.serviceWorker.mode, "go-hub-exclusive");
  assert.equal(release.serviceWorker.cachePrefix, "go-hub-app-");
  assert.equal(release.serviceWorker.autoActivate, true);

  const files = release.productionFiles.map(item => item.path).sort();
  assert.deepEqual(files, [...activeHubFiles].sort());
  const allowlist = read(".assetsignore");
  const sw = read("go-hub-sw.js");
  for (const file of activeHubFiles) {
    assert.match(allowlist, new RegExp(`!/${file.replaceAll(".", "\\.")}`));
    if (file !== "go-hub-sw.js") assert.match(sw, new RegExp(file.replaceAll(".", "\\.")), `${file} must be represented in the Hub shell/cache contract`);
  }
  for (const file of retiredRuntimeNames) assert.equal(files.includes(file), false, `${file} must stay outside active publication`);
});

test("deploy syntax gate covers every active GO Hub JavaScript entry", () => {
  const pkg = JSON.parse(read("package.json"));
  for (const file of activeHubFiles.filter(file => file.endsWith(".js") && file !== "go-hub-sw.js")) {
    assert.match(pkg.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")), `${file} must be syntax checked`);
  }
  assert.match(pkg.scripts["check:syntax"], /go-hub-sw\.js/);
});
