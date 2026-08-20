"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();

test("Git ignore control is effective under the canonical .gitignore filename", () => {
  assert.equal(fs.existsSync(path.join(root, ".gitignore")), true);
  assert.equal(fs.existsSync(path.join(root, "gitignore")), false);
  const result = spawnSync("git", ["check-ignore", "-q", ".env", ".dev.vars", "node_modules/example", ".wrangler/state"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || "git check-ignore must accept protected paths");
});

test("Cloudflare deployment control has no stale parallel assetsignore file", () => {
  assert.equal(fs.existsSync(path.join(root, ".assetsignore")), true);
  assert.equal(fs.existsSync(path.join(root, "assetsignore")), false);
});
