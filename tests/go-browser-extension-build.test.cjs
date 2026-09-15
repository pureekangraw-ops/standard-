"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "build-go-browser-extension.mjs");

function walk(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(absolute, relative) : [relative];
    })
    .sort();
}

test("build emits the exact unsigned Firefox Android review artifact without authority material", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "go-browser-v1-"));
  const out = path.join(temp, "artifact");
  const result = spawnSync(process.execPath, [script, "--out", out], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(walk(out), [
    "content-script.js",
    "go-browser-panel.css",
    "go-browser-panel.js",
    "manifest.json",
    "runtime/go-browser-field-contract.js",
    "runtime/go-browser-local-reader.js",
    "runtime/go-browser-safe-fill.js",
    "runtime/go-browser-site-profiles.js",
  ]);

  const expectedCopies = new Map([
    ["manifest.json", "browser-extension/go-browser-local-v1/manifest.json"],
    ["content-script.js", "browser-extension/go-browser-local-v1/content-script.js"],
    ["go-browser-panel.js", "browser-extension/go-browser-local-v1/go-browser-panel.js"],
    ["go-browser-panel.css", "browser-extension/go-browser-local-v1/go-browser-panel.css"],
    ["runtime/go-browser-field-contract.js", "go-browser-field-contract.js"],
    ["runtime/go-browser-site-profiles.js", "go-browser-site-profiles.js"],
    ["runtime/go-browser-local-reader.js", "go-browser-local-reader.js"],
    ["runtime/go-browser-safe-fill.js", "go-browser-safe-fill.js"],
  ]);
  for (const [built, source] of expectedCopies) {
    assert.equal(
      fs.readFileSync(path.join(out, built), "utf8"),
      fs.readFileSync(path.join(root, source), "utf8"),
      `${built} drifted from ${source}`,
    );
  }

  const bundleText = walk(out)
    .map(relative => fs.readFileSync(path.join(out, relative), "utf8"))
    .join("\n");
  for (const forbidden of ["GOHUB_OWNER_PASSCODE", "GITHUB_TOKEN", "NOTION_TOKEN", "AMO_SIGN_SECRET", "AMO_SIGN_KEY"]) {
    assert.equal(bundleText.includes(forbidden), false, `authority material leaked: ${forbidden}`);
  }
});

test("build refuses output paths outside the repository temp/dist intent when omitted input is malformed", () => {
  const result = spawnSync(process.execPath, [script, "--out"], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /BUILD_OUTPUT_REQUIRED/);
});

test("targeted GO Browser extension suite covers core reader, guard, and package boundaries", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const command = String(pkg.scripts?.["test:go-browser-extension"] || "");
  for (const required of [
    "tests/go-browser-field-contract.test.cjs",
    "tests/go-browser-local-reader.test.cjs",
    "tests/go-browser-safe-fill.test.cjs",
    "tests/go-browser-safe-fill-hardening.test.cjs",
    "tests/go-browser-extension-boundary.test.cjs",
    "tests/go-browser-extension-build.test.cjs",
  ]) {
    assert.equal(command.includes(required), true, `targeted suite missing ${required}`);
  }
});
