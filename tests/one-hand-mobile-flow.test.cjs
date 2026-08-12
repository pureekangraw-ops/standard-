"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("NormalPocket 1.3 publishes one-hand mobile release identity", () => {
  const pkg = JSON.parse(read("package.json"));
  const index = read("index.html");
  const sw = require("../sw.js");

  assert.equal(pkg.version, "1.3.0");
  assert.match(index, /<title>NormalPocket 1\.3\.0<\/title>/);
  assert.equal(sw.RELEASE_ID, "v1.3.0-20260812-r5-one-hand-mobile");
});

test("mobile home keeps daily actions compact in two columns", () => {
  const css = read("normalpocket-simple-flow.css");

  assert.match(css, /@media\(max-width:520px\)[\s\S]*\.np-daily-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.np-action\{[^}]*min-height:72px/);
  assert.match(css, /\.np-one-hand \.topbar\{/);
});

test("one-hand authority removes redundant home branding and compacts the shell", () => {
  const source = read("normalpocket-simple-flow.js");

  assert.match(source, /document\.body\.classList\.add\("np-one-hand"\)/);
  assert.doesNotMatch(source, /<span>NormalPocket<\/span><\/div>/);
  assert.match(source, /เริ่มงานได้เลย/);
});

test("first-run hint recommends catalog setup without blocking quick sale", () => {
  const flow = require("../normalpocket-simple-flow.js");

  assert.deepEqual(flow.firstRunHint({ productCount: 0 }), {
    empty: true,
    message: "ยังไม่มีสินค้า เพิ่มสินค้าแรกหรือใช้ขายด่วนได้ทันที"
  });
  assert.deepEqual(flow.firstRunHint({ productCount: 2 }), {
    empty: false,
    message: ""
  });
});
