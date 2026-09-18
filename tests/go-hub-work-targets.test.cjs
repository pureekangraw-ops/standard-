"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const url = pathToFileURL(path.resolve(__dirname, "../go-hub-work-targets.js")).href;

test("Work Target registry has no implicit default and LIGHTHOUSE resolves explicitly", async () => {
  const { getWorkTarget, requireWorkTarget } = await import(url + "?targets=" + Date.now());
  assert.equal(getWorkTarget(""), null);
  assert.equal(getWorkTarget(null), null);

  const lighthouse = requireWorkTarget("lighthouse");
  assert.equal(lighthouse.label, "LIGHTHOUSE");
  assert.equal(lighthouse.repository, "pureekangraw-ops/ygph-metropolis");
  assert.equal(lighthouse.projectRoot, "lighthouse-next");

  const standard = requireWorkTarget("standard");
  assert.equal(standard.repository, "pureekangraw-ops/standard-");
  assert.throws(() => requireWorkTarget("unknown"), /WORK_TARGET_REQUIRED/);
});
