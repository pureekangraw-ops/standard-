"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

test("GO Hub shell wires a GitHub workspace into Code", () => {
  const source = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");
  assert.match(source, /go-hub-github-workspace\.js/);
  assert.match(source, /gatewayBase:\s*["']\/hub\/api\/github-workspace["']/);
  assert.match(source, /repository:\s*["']pureekangraw-ops\/standard-["']/);
  assert.match(source, /createCodeCapability\\(\\{\\s*workspace,\\s*task\\s*\\}\\)/);
});

test("active publication includes the workspace adapter", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "RELEASE_MANIFEST.json"), "utf8"));
  const production = manifest.productionFiles.map(item => item.path);
  const assetsIgnore = fs.readFileSync(path.join(root, ".assetsignore"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "go-hub-sw.js"), "utf8");
  assert.equal(production.includes("go-hub-github-workspace.js"), true);
  assert.match(assetsIgnore, /!\/go-hub-github-workspace\.js/);
  assert.match(serviceWorker, /\.\/go-hub-github-workspace\.js/);
});
