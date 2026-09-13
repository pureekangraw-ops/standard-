"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("service-worker bootstrap stays free of legacy runtime ownership", () => {
  const source = read("sw-bootstrap.js");
  assert.match(source, /serviceWorker\.register\("sw\.js"/);
  assert.doesNotMatch(source, /metropolis-r5/i);
  assert.doesNotMatch(source, /normalpocket/i);
});

test("NormalPocket compatibility route owns legacy runtime wiring in order", () => {
  const html = read("normalpocket.html");
  const scripts = [
    "metropolis-v4.js",
    "metropolis-r5.js",
    "metropolis-r5-1.js",
    "metropolis-r5-2.js",
    "metropolis-r5-3.js",
    "metropolis-r5-4.js",
    "normalpocket-bootstrap.js",
  ];

  for (const script of scripts) assert.ok(html.includes(script), `missing ${script}`);
  for (let index = 1; index < scripts.length; index += 1) {
    assert.ok(html.indexOf(scripts[index - 1]) < html.indexOf(scripts[index]), `${scripts[index - 1]} must load before ${scripts[index]}`);
  }

  for (const stylesheet of [
    "metropolis-r5.css",
    "metropolis-r5-1.css",
    "metropolis-r5-2.css",
    "metropolis-r5-3.css",
    "metropolis-r5-4.css",
  ]) {
    assert.ok(html.includes(stylesheet), `missing ${stylesheet}`);
  }

  const rootHtml = read("index.html");
  for (const script of scripts) assert.equal(rootHtml.includes(script), false, `Hub root must not load ${script}`);
});
