"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("current stylesheet ends with one NormalPocket design authority layer", () => {
  const current = read("normalpocket-current.css");
  const design = 'normalpocket-design.css';
  assert.match(current, new RegExp(`@import\\s+url\\(["']${design.replaceAll('.', '\\.')}`));
  const imports = [...current.matchAll(/@import\s+url\(["']([^"']+)["']\)/g)].map(match => match[1]);
  assert.equal(imports.at(-1), design);
});

test("design authority defines shared hierarchy, focus and reduced-motion contracts", () => {
  const css = read("normalpocket-design.css");
  for (const token of ["--np-surface", "--np-surface-muted", "--np-border", "--np-text", "--np-muted", "--np-primary", "--np-danger", "--np-radius-card", "--np-space-3"]) {
    assert.match(css, new RegExp(token.replaceAll('-', '\\-')));
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.np-action/);
  assert.match(css, /\.normalpocket-product-card/);
  assert.match(css, /\.modal-actions/);
});

test("design authority stays presentation-only", () => {
  const css = read("normalpocket-design.css");
  assert.doesNotMatch(css, /javascript:|expression\s*\(|url\s*\(\s*data:text\/html/i);
});
