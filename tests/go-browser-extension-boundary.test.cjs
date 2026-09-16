"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const extensionRoot = path.join(root, "browser-extension", "go-browser-local-v1");
const manifestPath = path.join(extensionRoot, "manifest.json");
const panelPath = path.join(extensionRoot, "go-browser-panel.js");
const contentScriptPath = path.join(extensionRoot, "content-script.js");
const signingWorkflowPath = path.join(root, ".github", "workflows", "go-browser-extension-sign.yml");
const panelUrl = pathToFileURL(panelPath).href;

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function readExtensionSource() {
  return [contentScriptPath, panelPath]
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");
}

test("manifest is MV3, Android-enabled, AMO-signable, Gumroad-only, and top-frame", () => {
  const manifest = readManifest();
  const matches = ["*://gumroad.com/*", "*://*.gumroad.com/*"];
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.browser_specific_settings.gecko.id, "go-browser-local-v1@pureekangraw.local");
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, { required: ["none"] });
  assert.deepEqual(manifest.browser_specific_settings.gecko_android, {});
  assert.equal(manifest.content_scripts.length, 1);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.deepEqual([...manifest.content_scripts[0].matches].sort(), [...matches].sort());
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.deepEqual([...manifest.web_accessible_resources[0].matches].sort(), [...matches].sort());
  assert.deepEqual([...manifest.web_accessible_resources[0].resources].sort(), [
    "go-browser-panel.js",
    "runtime/go-browser-field-contract.js",
    "runtime/go-browser-local-reader.js",
    "runtime/go-browser-safe-fill.js",
    "runtime/go-browser-site-profiles.js",
  ].sort());

  const permissions = manifest.permissions || [];
  for (const forbidden of ["tabs", "cookies", "history", "webRequest", "clipboardRead", "clipboardWrite"]) {
    assert.equal(permissions.includes(forbidden), false, `forbidden permission: ${forbidden}`);
  }
  assert.equal((manifest.host_permissions || []).some(value => value === "<all_urls>"), false);
});

test("extension source contains no network bridge, embedded authority secret, or consequential command evaluator", () => {
  const source = readExtensionSource();
  for (const secret of ["GOHUB_OWNER_PASSCODE", "GITHUB_TOKEN", "NOTION_TOKEN", "AMO_SIGN_SECRET", "AMO_SIGN_KEY"]) {
    assert.equal(source.includes(secret), false, `secret authority leaked: ${secret}`);
  }
  for (const primitive of ["fetch(", "XMLHttpRequest", "WebSocket("]) {
    assert.equal(source.includes(primitive), false, `network primitive present: ${primitive}`);
  }
  assert.equal(/\beval\s*\(/.test(source), false);
  assert.equal(/new\s+Function\s*\(/.test(source), false);
  assert.equal(/\.submit\s*\(/.test(source), false);
  assert.equal(/\.click\s*\(/.test(source), false);
});

test("panel state machine requires Scan then Guard before explicit Fill", async () => {
  const panel = await import(`${panelUrl}?state=${Date.now()}`);
  const initial = panel.createInitialPanelState();
  assert.equal(initial.phase, "SCAN");

  const scanned = panel.reducePanelState(initial, { type: "SCAN_COMPLETE", scan: { fields: [] } });
  assert.equal(scanned.phase, "PREPARE");
  const guarded = panel.reducePanelState(scanned, { type: "PREVIEW_GUARD", plan: { assignments: [] }, blocked: [] });
  assert.equal(guarded.phase, "GUARD");
  const filling = panel.reducePanelState(guarded, { type: "FILL_CONFIRMED" });
  assert.equal(filling.phase, "RECEIPT");
  assert.equal(filling.pending, true);
  const done = panel.reducePanelState(filling, { type: "FILL_COMPLETE", result: { ok: true, receipts: [] } });
  assert.equal(done.phase, "RECEIPT");
  assert.equal(done.pending, false);
});

test("panel controller is read-only on create, Scan, value edit, and guard preview; writer runs only on explicit fill", async () => {
  const panel = await import(`${panelUrl}?controller=${Date.now()}`);
  let scanCalls = 0;
  let writeCalls = 0;
  const fakeScan = {
    fingerprint: { id: "fp:12345678" },
    page: { profileId: "gumroad-v1", pathname: "/products/new" },
    fields: [{
      fieldId: "local:title:0",
      semanticRole: "title",
      valueKind: "text",
      name: "Product name",
      sensitive: false,
      hidden: false,
      disabled: false,
      readOnly: false,
      signature: { contenteditable: false },
    }],
    unknowns: [],
  };
  const controller = panel.createPanelController({
    profile: { writableSemantics: ["title"], blockedActionPattern: /publish/i },
    scanPage() { scanCalls += 1; return fakeScan; },
    buildFillPlan(scan, assignments) { return { fingerprintId: scan.fingerprint.id, assignments }; },
    guardAssignment() { return { allowed: true }; },
    executeFillPlan() { writeCalls += 1; return { ok: true, receipts: [{ state: "VERIFIED" }] }; },
  });

  assert.equal(writeCalls, 0);
  controller.scan();
  assert.equal(scanCalls, 1);
  assert.equal(writeCalls, 0);
  controller.setValue("local:title:0", "Draft title");
  assert.equal(writeCalls, 0);
  controller.preview();
  assert.equal(writeCalls, 0);
  assert.equal(controller.getState().phase, "GUARD");
  controller.fill();
  assert.equal(writeCalls, 1);
  assert.equal(controller.getState().phase, "RECEIPT");
});

test("Mozilla signing keeps Safe Fill manual-only while Observer fallback is branch-and-path scoped, unlisted, secret-backed, and pinned", () => {
  const workflow = fs.readFileSync(signingWorkflowPath, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*-\s*feat\/go-browser-local-observer-eye-v1-r2/);
  assert.match(workflow, /paths:\s*\n\s*-\s*['\"]?\.github\/workflows\/go-browser-extension-sign\.yml['\"]?/);
  assert.doesNotMatch(workflow, /branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /safe-fill-sign:\s*\n\s*if:\s*\$\{\{\s*!startsWith\(github\.ref_name, 'feat\/go-browser-local-observer-eye-v1'\)\s*\}\}/);
  assert.match(workflow, /secrets\.AMO_SIGN_KEY/);
  assert.match(workflow, /secrets\.AMO_SIGN_SECRET/);
  assert.match(workflow, /channel:\s*unlisted/);
  assert.match(workflow, /kewisch\/action-web-ext@84a13bb9e1b6108c43788ba091c41ca1dba6ad45/);
  assert.match(workflow, /AMO_SIGNING_NOT_CONFIGURED/);
});
