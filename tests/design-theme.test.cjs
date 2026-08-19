"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = () => fs.readFileSync(path.join(root, "normalpocket-design.css"), "utf8");

test("NormalPocket design authority publishes one calm mint visual theme", () => {
  const source = css();
  assert.match(source, /--np-theme:\s*"calm-mint"/);
  assert.match(source, /--np-bg:/);
  assert.match(source, /--np-surface-elevated:/);
  assert.match(source, /--np-primary-strong:/);
  assert.match(source, /--np-warning:/);
  assert.match(source, /--np-info:/);
  assert.match(source, /body\s*\{[^}]*background:/s);
  assert.match(source, /\.shell\s*\{[^}]*background:/s);
  assert.match(source, /\.topbar\s*\{[^}]*background:/s);
  assert.match(source, /\.bottom-nav\s*\{[^}]*backdrop-filter:/s);
});

test("theme keeps interaction states semantic and accessible", () => {
  const source = css();
  assert.match(source, /\.primary-btn[^}]*background:/s);
  assert.match(source, /\.danger-btn[^}]*background:/s);
  assert.match(source, /\.status\.open[^}]*background:/s);
  assert.match(source, /\.status\.completed[^}]*background:/s);
  assert.match(source, /:focus-visible/);
  assert.match(source, /prefers-reduced-motion/);
  assert.doesNotMatch(source, /persistAndRender|IndexedDB|transaction|state\s*=|addEventListener\(/);
});
