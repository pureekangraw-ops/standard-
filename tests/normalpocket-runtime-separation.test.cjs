"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("legacy runtime loading is isolated from service-worker registration", () => {
  assert.equal(fs.existsSync(path.join(root, "normalpocket-runtime-bootstrap.js")), true);

  const runtimeBootstrap = read("normalpocket-runtime-bootstrap.js");
  assert.match(runtimeBootstrap, /metropolis-r5\.js/);
  assert.match(runtimeBootstrap, /normalpocket-bootstrap\.js/);

  const swBootstrap = read("sw-bootstrap.js");
  assert.match(swBootstrap, /serviceWorker\.register\("sw\.js"/);
  assert.doesNotMatch(swBootstrap, /metropolis-r5/i);
  assert.doesNotMatch(swBootstrap, /normalpocket/i);
});

test("NormalPocket root explicitly loads the compatibility runtime bootstrap", () => {
  const html = read("index.html");
  assert.match(html, /<script src="normalpocket-runtime-bootstrap\.js"><\/script>/);
  assert.match(html, /<script src="sw-bootstrap\.js"><\/script>/);
});
