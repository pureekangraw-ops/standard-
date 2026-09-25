"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("LIGHTHOUSE deploy smoke retries propagation failures without weakening the access guard", () => {
  const workflow = fs.readFileSync(".github/workflows/go-hub-deploy.yml", "utf8");
  assert.match(workflow, /retryableStatus = status => status === 409 \|\| status === 425 \|\| status === 429 \|\| status >= 500/);
  assert.match(workflow, /const runtimeFetch = async \(url, init = \{\}\) =>/);
  assert.match(workflow, /const roomResponse = await runtimeFetch\(roomUrl/);
  assert.match(workflow, /const realityResponse = await runtimeFetch\(/);
  assert.match(workflow, /const reentered = await runtimeFetch\(roomUrl/);
  assert.match(workflow, /const denied = await fetch\(origin \+ "\/hub\/lighthouse"/);
  assert.match(workflow, /denied\.status !== 403/);
});
