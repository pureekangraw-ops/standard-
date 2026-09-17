"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");

test("active shell binds Factory work context and returns real Factory reality", () => {
  assert.match(shell, /createFactoryWorkContext/);
  assert.match(shell, /createFactoryRealityReturn/);
  assert.match(shell, /workContext/);
  assert.equal(shell.includes("returned-by-operator"), false);
});

test("active shell creates the mutation workspace only from the admitted Centre envelope", () => {
  assert.match(shell, /createGitHubWorkspace/);
  assert.match(shell, /workContext:\s*access\.envelope/);
  const accessIndex = shell.indexOf("const access = createFactoryAccess()");
  const routedWorkspaceIndex = shell.indexOf("workContext: access.envelope");
  assert.ok(accessIndex >= 0 && routedWorkspaceIndex > accessIndex,
    "Factory mutation workspace must be created only after Centre admission");
});

test("active shell preserves the Optician fit, checks changed reality, and resumes through refit", () => {
  assert.match(shell, /checkRound/);
  assert.match(shell, /activeFit/);
  assert.match(shell, /round\.decision === "REUSE_FIT"/);
  assert.match(shell, /centre\.resume\(/);
  assert.match(shell, /REFIT/);
});
