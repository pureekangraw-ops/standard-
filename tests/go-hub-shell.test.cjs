"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("GO Hub shell remains available directly while the root becomes Hub-owned", () => {
  for (const file of ["go-hub.html", "go-hub-shell.js", "go-hub-shell.css", "index.html", "normalpocket.html"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  }
  const rootHtml = read("index.html");
  assert.match(rootHtml, /go-hub-shell\.js/);
  assert.match(rootHtml, /go-hub-shell\.css/);
});

test("GO Hub shell loads only neutral Hub runtime modules", () => {
  const html = read("go-hub.html");
  assert.match(html, /go-hub-shell\.css/);
  assert.match(html, /go-hub-shell\.js/);
  for (const forbidden of [
    "normalpocket-bootstrap.js",
    "metropolis-r5.js",
    "app.js",
    "sw-bootstrap.js",
    "manifest.webmanifest",
  ]) {
    assert.equal(html.includes(forbidden), false, `Hub shell must not load ${forbidden}`);
  }
});

test("GO Hub shell bootstrap uses the neutral runtime registry", () => {
  const source = read("go-hub-shell.js");
  assert.match(source, /createHubRuntime/);
  assert.match(source, /go-hub-runtime\.js/);
  assert.doesNotMatch(source, /normalpocket/i);
  assert.doesNotMatch(source, /metropolis-r5/i);
});


test("GO Hub shell restores the durable Code task before capability registration", () => {
  const source = read("go-hub-shell.js");
  assert.match(source, /go-hub-persistence\.js/);
  assert.match(source, /createLocalStorageKeyValueStore/);
  assert.match(source, /createCodeTaskSession/);
  assert.match(source, /await taskSession\.load\(\)/);
  assert.match(source, /createCodeCapability\(\{ workspace, task \}\)/);
});

test("GO Hub shell mounts the six truths from the restored Code task projection", () => {
  const source = read("go-hub-shell.js");
  const goHubHtml = read("go-hub.html");
  const indexHtml = read("index.html");
  assert.match(source, /createWorkbenchView/);
  assert.match(source, /renderWorkbench\(task\.snapshot\(\)\)/);
  [
    "data-workbench-mission",
    "data-workbench-blueprint",
    "data-workbench-piece",
    "data-workbench-status",
    "data-workbench-evidence",
    "data-workbench-next",
  ].forEach((selector) => {
    assert.match(goHubHtml, new RegExp(selector));
    assert.match(indexHtml, new RegExp(selector));
  });
});


test("CENTRE is the durable entry and exit gate before Code capability access", () => {
  const source = read("go-hub-shell.js");
  const htmlFiles = [read("index.html"), read("go-hub.html")];

  for (const marker of [
    "createCentreSession",
    "await centreSession.load()",
    "admitDestination",
    "destination://factory",
    "createFactoryWorkContext",
    "runtime.register(\"Code\", createCodeCapability({ workspace, task, workContext }))",
    "runtime.unregister(\"Code\")",
    "REVIEW_AT_CENTRE",
    "FIT_ROLE",
    "LEAVE_CENTRE",
    "RETURN_TO_CENTRE",
  ]) {
    assert.equal(source.includes(marker), true, `shell must include ${marker}`);
  }

  for (const html of htmlFiles) {
    for (const marker of [
      "data-centre-state",
      "data-centre-checkpoint",
      "data-centre-work",
      "data-centre-form",
      "data-centre-action",
      "data-centre-return",
    ]) {
      assert.equal(html.includes(marker), true, `Centre surface must include ${marker}`);
    }
  }
});

test("active shell must pass Optician and canonical city route before leaving Centre for Factory", () => {
  const source = read("go-hub-shell.js");

  assert.match(source, /go-hub-optician\.js/);
  assert.match(source, /go-hub-city-route\.js/);
  assert.match(source, /fitWork/);
  assert.match(source, /routeInbound/);
  assert.match(source, /fit\.gate !== "PASS"/);
  assert.match(source, /route\.destination !== "go-work-loop"/);
  assert.match(source, /centre\.leave\(centreWork/);

  const fitIndex = source.indexOf("fitWork(");
  const routeIndex = source.indexOf("routeInbound(");
  const leaveIndex = source.indexOf("centre.leave(centreWork");
  assert.ok(fitIndex >= 0 && routeIndex > fitIndex && leaveIndex > routeIndex,
    "Optician fit and city route must run before Centre handoff");
});


test("Centre Review is not blocked by fit-only Role fields", () => {
  for (const html of [read("index.html"), read("go-hub.html")]) {
    assert.match(html, /name="roleReference"/);
    assert.match(html, /name="workingView"/);
    assert.doesNotMatch(html, /name="roleReference"[^>]*required/);
    assert.doesNotMatch(html, /name="workingView"[^>]*required/);
  }

  const source = read("go-hub-shell.js");
  assert.match(source, /\["roleReference", "workingView"\]\.forEach/);
  assert.match(source, /field\(name\)\.required = reviewed && !fitted/);
  assert.match(source, /FIT_ROLE/);
  assert.match(source, /CENTRE_STATES\.READY && !centreWork\.role && !centreWork\.lens/);
});
