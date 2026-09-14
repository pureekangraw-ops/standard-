"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadWranglerConfig() {
  const filePath = path.resolve(__dirname, "../wrangler.go-hub.jsonc");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("GO Hub API routes run the Worker before SPA asset fallback", () => {
  const config = loadWranglerConfig();
  assert.deepEqual(config.assets?.run_worker_first, ["/hub/api/github-workspace/*", "/mcp", "/oauth/*", "/.well-known/*"]);
});
