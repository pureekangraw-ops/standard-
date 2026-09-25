"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Counter handoff channel is retired from every active GO Hub surface", () => {
  const registry = fs.readFileSync(path.join(root, "go-hub-mcp-registry.mjs"), "utf8");
  const factoryMcp = fs.readFileSync(path.join(root, "go-hub-factory-mcp-worker.mjs"), "utf8");
  const worker = fs.readFileSync(path.join(root, "go-hub-worker.mjs"), "utf8");
  const edge = fs.readFileSync(path.join(root, "go-hub-edge-worker.mjs"), "utf8");
  const shell = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "go-hub.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "go-hub-shell.css"), "utf8");
  const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.go-hub.jsonc"), "utf8"));

  for (const source of [registry, factoryMcp, worker, edge]) assert.doesNotMatch(source, /go_hub_counter_/);
  assert.doesNotMatch(edge, /\/hub\/api\/counter/);
  assert.doesNotMatch(shell, /data-counter-|\/hub\/api\/counter/);
  assert.doesNotMatch(html, /data-counter|SHARED COUNTER|<h2[^>]*>COUNTER<\/h2>/);
  assert.doesNotMatch(css, /\.counter-/);

  assert.equal(wrangler.assets.run_worker_first.includes("/hub/api/counter/*"), false);
  assert.equal(wrangler.durable_objects.bindings.some(item => item.name.includes("COUNTER")), false);
  assert.equal(Object.hasOwn(wrangler.vars || {}, "COUNTER_HANDOFF_AGENT_URL"), false);

  // Historical Durable Object migrations remain as repository history, not active bindings.
  assert.ok(wrangler.migrations.some(item =>
    Array.isArray(item.new_sqlite_classes) && item.new_sqlite_classes.includes("GoHubCounterState")));
});
