"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("NormalPocket 1.3.1 publishes the mobile polish release identity", () => {
  const pkg = JSON.parse(read("package.json"));
  const index = read("index.html");
  const sw = require("../sw.js");

  assert.equal(pkg.version, "1.3.1");
  assert.match(index, /<title>NormalPocket 1\.3\.1<\/title>/);
  assert.equal(sw.RELEASE_ID, "v1.3.1-20260812-r6-mobile-polish");
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

test("first-run state has one setup action and does not duplicate quick sale", () => {
  const flow = require("../normalpocket-simple-flow.js");
  const source = read("normalpocket-simple-flow.js");

  assert.deepEqual(flow.firstRunHint({ productCount: 0 }), {
    empty: true,
    message: "ยังไม่มีสินค้า เพิ่มสินค้าแรกได้เลย"
  });
  assert.deepEqual(flow.firstRunHint({ productCount: 2 }), {
    empty: false,
    message: ""
  });
  assert.match(source, /data-np-first="add"/);
  assert.doesNotMatch(source, /data-np-first="quick"/);
});

test("today summary stays hidden only while the shop is genuinely empty", () => {
  const flow = require("../normalpocket-simple-flow.js");

  assert.equal(typeof flow.shouldShowTodaySummary, "function");
  assert.equal(flow.shouldShowTodaySummary({ productCount: 0, sales: 0, cash: 0, stock: 0, tasks: 0 }), false);
  assert.equal(flow.shouldShowTodaySummary({ productCount: 1, sales: 0, cash: 0, stock: 0, tasks: 0 }), true);
  assert.equal(flow.shouldShowTodaySummary({ productCount: 0, sales: 100, cash: 0, stock: 0, tasks: 0 }), true);
  assert.equal(flow.shouldShowTodaySummary({ productCount: 0, sales: 0, cash: -50, stock: 0, tasks: 0 }), true);
  assert.equal(flow.shouldShowTodaySummary({ productCount: 0, sales: 0, cash: 0, stock: 0, tasks: 1 }), true);
});

test("quick sale helper stays compact on the two-column card", () => {
  const source = read("normalpocket-simple-flow.js");
  const css = read("normalpocket-simple-flow.css");

  assert.match(source, /ราคา · จำนวน · รับเงิน/);
  assert.match(css, /\.np-action small\{[^}]*white-space:nowrap/);
});
