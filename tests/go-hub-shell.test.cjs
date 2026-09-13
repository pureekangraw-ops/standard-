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
