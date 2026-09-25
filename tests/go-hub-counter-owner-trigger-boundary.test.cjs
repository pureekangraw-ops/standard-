"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Counter UI exposes Ask LIGHT without fake Bell or Mirror controls", () => {
  const html = fs.readFileSync("go-hub.html", "utf8");
  const shell = fs.readFileSync("go-hub-shell.js", "utf8");
  assert.match(html, /data-counter-ask-light/);
  assert.match(html, />ถาม LIGHT</);
  assert.doesNotMatch(html, /data-counter-light-bell|data-counter-mirror-bell|Magnificent Architect|อัพเดท Mirror|🔔|🪞/);
  assert.match(shell, /\/hub\/api\/counter\/ask/);
  assert.doesNotMatch(shell, /\/hub\/api\/counter\/mirror|counterMirrorBell|counterLightBell|🔔|🪞/);
});

test("Counter HTTP surface maps Ask to SEARCH and exposes no Mirror endpoint", () => {
  const edge = fs.readFileSync("go-hub-edge-worker.mjs", "utf8");
  assert.match(edge, /COUNTER_API_ROOT}\/ask/);
  assert.match(edge, /mode:url\.pathname === `\$\{COUNTER_API_ROOT\}\/ask` \? "SEARCH" : "HANDOFF"/);
  assert.doesNotMatch(edge, /COUNTER_API_ROOT}\/mirror/);
});

test("HANDOFF source has no automatic LIGHT Bell or HANDOFF wake adapter", () => {
  const dispatcher = fs.readFileSync("go-hub-counter-dispatcher.mjs", "utf8");
  assert.doesNotMatch(dispatcher, /bellType:"LIGHT_HANDOFF"/);
  assert.doesNotMatch(dispatcher, /notion-light-bell-inbox|notion-light-counter-bell/);
  assert.doesNotMatch(dispatcher, /light-counter-handoff-wake/);
  assert.match(dispatcher, /triggerRequired:target === "LIGHT"/);
});
