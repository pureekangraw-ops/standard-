"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("GO Hub shell remains available directly while the root becomes Hub-owned", () => {
  for (const file of ["go-hub.html", "go-hub-shell.js", "go-hub-shell.css", "index.html", "normalpocket.html"]) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  const rootHtml = read("index.html");
  assert.match(rootHtml, /go-hub-shell\.js/);
  assert.match(rootHtml, /go-hub-shell\.css/);
});

test("GO Hub shell loads only neutral Hub runtime modules", () => {
  const html = read("go-hub.html");
  assert.match(html, /go-hub-shell\.css/);
  assert.match(html, /go-hub-shell\.js/);
  for (const forbidden of ["normalpocket-bootstrap.js", "metropolis-r5.js", "app.js", "sw-bootstrap.js", "manifest.webmanifest"]) assert.equal(html.includes(forbidden), false, `Hub shell must not load ${forbidden}`);
});

test("GO Hub shell bootstrap uses the neutral runtime registry", () => {
  const source = read("go-hub-shell.js");
  assert.match(source, /createHubRuntime/);
  assert.match(source, /go-hub-runtime\.js/);
  assert.doesNotMatch(source, /normalpocket/i);
  assert.doesNotMatch(source, /metropolis-r5/i);
});

test("GO Hub shell restores durable Code and Centre state", () => {
  const source = read("go-hub-shell.js");
  for (const marker of ["go-hub-persistence.js", "createLocalStorageKeyValueStore", "createCodeTaskSession", "await taskSession.load()", "createCentreSession", "await centreSession.load()"] ) assert.equal(source.includes(marker), true, `shell must include ${marker}`);
  assert.match(source, /createCodeCapability\(\{ workspace, task/);
});

test("GO Hub shell mounts the six truths from the restored Code task projection", () => {
  const source = read("go-hub-shell.js");
  assert.match(source, /createWorkbenchView/);
  assert.match(source, /renderWorkbench\(task\.snapshot\(\)\)/);
  for (const html of [read("go-hub.html"), read("index.html")]) {
    for (const selector of ["data-workbench-mission", "data-workbench-blueprint", "data-workbench-piece", "data-workbench-status", "data-workbench-evidence", "data-workbench-next"]) assert.match(html, new RegExp(selector));
  }
});

test("CENTRE keeps one checkpoint before destination access", () => {
  const source = read("go-hub-shell.js");
  for (const marker of ["admitDestination", "runtime.register(\"Code\"", "runtime.unregister(\"Code\")", "REVIEW_AT_CENTRE", "FIT_LENS", "LEAVE_CENTRE", "RETURN_TO_CENTRE"]) assert.equal(source.includes(marker), true, `shell must include ${marker}`);
  for (const html of [read("index.html"), read("go-hub.html")]) for (const marker of ["data-centre-state", "data-centre-checkpoint", "data-centre-work", "data-centre-form", "data-centre-action", "data-centre-return"]) assert.equal(html.includes(marker), true, `Centre surface must include ${marker}`);
});

test("Factory return in the Shell is derived from real workbench truth and bound Centre identity", () => {
  const source = read("go-hub-shell.js");
  assert.match(source, /go-hub-factory-return\.js/);
  assert.match(source, /createFactoryWorkContext/);
  assert.match(source, /createFactoryRealityReturn/);
  assert.match(source, /workContext/);
  assert.doesNotMatch(source, /returned-by-operator/);
});

test("active Shell drives Factory through City Route, Optician, and Heimdall instead of a hidden direct road", () => {
  const source = read("go-hub-shell.js");
  assert.match(source, /go-hub-city-route\.js/);
  assert.match(source, /go-hub-optician\.js/);
  assert.match(source, /createCityRoute/);
  assert.match(source, /fitWork/);
  assert.match(source, /routeInbound/);
  assert.match(source, /routeOutbound/);
  assert.match(source, /city\.destinations\.factory\.route/);
  assert.doesNotMatch(source, /const FACTORY_DESTINATION\s*=\s*["']destination:\/\/factory["']/);
});
