# GO Browser Local Safe Fill V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, fail-closed Local Safe Fill adapter that runs on Firefox Android, uses Gumroad as the first site profile, fills only explicit safe draft fields in BIG's real mobile tab, and verifies actual values without submitting or publishing.

**Architecture:** Preserve V0 as the cloud reader, extract its reusable semantic contract, then add a local DOM reader/fingerprint layer, narrow site profiles, a Safe Fill guard/resolver/writer, and a mobile in-page panel. Package these as a Firefox Android Manifest V3 WebExtension with Gumroad-only host authority. Ordinary CI produces an unsigned review artifact; a separate manual workflow may produce a Mozilla-signed XPI using signing credentials stored only in GitHub secrets.

**Tech Stack:** Node.js 22 built-ins, existing `node:test` suite, ES modules, WebExtension Manifest V3, Firefox Android content scripts, GitHub Actions, Mozilla AMO signing.

**Spec:** `docs/superpowers/specs/2026-09-15-go-browser-local-safe-fill-v1-design.md`

## Global Constraints

- BIG remains Owner / highest authority.
- V1 must work without a desktop computer.
- Gumroad is the first site profile, not the product identity.
- V0 public read behavior and risk semantics remain unchanged.
- No `<all_urls>` authority.
- No GO Hub, GitHub, Notion, Browser Run, AMO, or other secret in extension source/build output.
- No GO Hub ↔ extension network bridge in V1.
- No password, OTP, payment, CAPTCHA, file upload, submit, publish, purchase, delete, account-confirmation, or autonomous navigation capability.
- Page load and Scan are read-only; Fill always requires explicit user action.
- Every field is re-resolved immediately before mutation.
- Unknown, ambiguous, hidden, disabled, or read-only targets fail closed.
- A write is successful only after read-back matches the requested normalized value.
- Dynamic ES modules imported by the Firefox MV3 content script must be declared as `web_accessible_resources`, and those resources must be exposed only to Gumroad match patterns.
- Real-device Product Verification requires an actually installed Mozilla-signed Firefox Android extension and a Gumroad Scan → Guard → Fill → Verify flow.
- Signing credentials, if supplied, live only in GitHub Actions secrets.

---

## File Structure

### Existing files modified

- `go-hub-browser-interface.js` — consume shared semantic helpers without changing V0 HTTP behavior.
- `package.json` — add syntax/build scripts for V1.
- `.github/workflows/standard-safety-gate.yml` — build and upload the unsigned review artifact after the existing gate passes.

### New core files

- `go-browser-field-contract.js` — shared semantic/value/sensitivity helpers.
- `go-browser-site-profiles.js` — static, fail-closed site profiles; V1 ships Gumroad only.
- `go-browser-local-reader.js` — DOM evidence, field signatures, page fingerprint.
- `go-browser-safe-fill.js` — Fill Plan, guard, re-resolution, write, read-back receipts.

### New extension files

- `browser-extension/go-browser-local-v1/manifest.json`
- `browser-extension/go-browser-local-v1/content-script.js`
- `browser-extension/go-browser-local-v1/go-browser-panel.js`
- `browser-extension/go-browser-local-v1/go-browser-panel.css`

### New build/release files

- `scripts/build-go-browser-extension.mjs`
- `.github/workflows/go-browser-extension-sign.yml`

### New tests

- `tests/go-browser-field-contract.test.cjs`
- `tests/go-browser-local-reader.test.cjs`
- `tests/go-browser-safe-fill.test.cjs`
- `tests/go-browser-extension-boundary.test.cjs`
- `tests/go-browser-extension-build.test.cjs`

---

### Task 1: Extract Shared Field Semantics Without Changing V0

**Files:**
- Create: `go-browser-field-contract.js`
- Modify: `go-hub-browser-interface.js`
- Create: `tests/go-browser-field-contract.test.cjs`
- Modify: `tests/go-hub-browser-interface.test.cjs`

**Interfaces:**
- Produces: `semanticRoleForName(name)`
- Produces: `valueKindForRole(role)`
- Produces: `isSensitiveSemanticRole(semanticRole)`
- Produces: `readRiskClassForSemanticRole(semanticRole)`

- [ ] **Step 1: Write the failing contract tests**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-browser-field-contract.js")).href;

async function loadContract(tag) {
  return import(`${moduleUrl}?${tag}=${Date.now()}`);
}

test("shared semantics preserve V0 classifications", async () => {
  const contract = await loadContract("semantic");
  assert.equal(contract.semanticRoleForName("Product name"), "title");
  assert.equal(contract.semanticRoleForName("Description"), "description");
  assert.equal(contract.semanticRoleForName("Price"), "price");
  assert.equal(contract.semanticRoleForName("OTP code"), "otp");
  assert.equal(contract.semanticRoleForName("Card number"), "payment");
  assert.equal(contract.semanticRoleForName("Whatever this is"), "unknown");
  assert.equal(contract.readRiskClassForSemanticRole("title"), "SAFE_READ");
  assert.equal(contract.readRiskClassForSemanticRole("otp"), "SENSITIVE");
  assert.equal(contract.readRiskClassForSemanticRole("unknown"), "UNKNOWN");
});

test("shared value-kind mapping preserves V0", async () => {
  const contract = await loadContract("kind");
  assert.equal(contract.valueKindForRole("spinbutton"), "number");
  assert.equal(contract.valueKindForRole("checkbox"), "boolean");
  assert.equal(contract.valueKindForRole("combobox"), "choice");
  assert.equal(contract.valueKindForRole("textbox"), "text");
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-field-contract.test.cjs`

Expected: FAIL because `go-browser-field-contract.js` is missing.

- [ ] **Step 3: Implement the contract**

```js
const SENSITIVE = new Set(["password", "otp", "payment"]);

export function semanticRoleForName(name) {
  const value = String(name || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (/password|passcode/.test(value)) return "password";
  if (/\botp\b|one[- ]?time|verification code/.test(value)) return "otp";
  if (/card number|credit card|debit card|\bcvv\b|\bcvc\b|bank account|account number/.test(value)) return "payment";
  if (/\bdescription\b|details|summary/.test(value)) return "description";
  if (/\bprice\b|amount|cost/.test(value)) return "price";
  if (/\bcategory\b|product type|type of product/.test(value)) return "category";
  if (/\btags?\b|keywords?/.test(value)) return "tags";
  if (/\bemail\b/.test(value)) return "email";
  if (/username|user name|handle/.test(value)) return "username";
  if (/\btitle\b|product name|item name/.test(value)) return "title";
  return "unknown";
}

export function valueKindForRole(role) {
  if (role === "spinbutton" || role === "slider") return "number";
  if (role === "checkbox" || role === "switch") return "boolean";
  if (role === "combobox" || role === "radio") return "choice";
  return "text";
}

export function isSensitiveSemanticRole(role) {
  return SENSITIVE.has(String(role || ""));
}

export function readRiskClassForSemanticRole(role) {
  if (isSensitiveSemanticRole(role)) return "SENSITIVE";
  if (role === "unknown") return "UNKNOWN";
  return "SAFE_READ";
}
```

- [ ] **Step 4: Refactor V0 to import these helpers**

At the top of `go-hub-browser-interface.js` add:

```js
import {
  semanticRoleForName,
  valueKindForRole,
  readRiskClassForSemanticRole,
} from "./go-browser-field-contract.js";
```

Replace calls to the old local helpers with the new names and remove the duplicate helper bodies. Do not change the V0 response shape.

- [ ] **Step 5: Run GREEN + regression**

```bash
node --test tests/go-browser-field-contract.test.cjs tests/go-hub-browser-interface.test.cjs tests/go-hub-browser-worker.test.cjs tests/go-hub-browser-owner-auth.test.cjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add go-browser-field-contract.js go-hub-browser-interface.js tests/go-browser-field-contract.test.cjs tests/go-hub-browser-interface.test.cjs
git commit -m "refactor: share GO Browser field semantics"
```

---

### Task 2: Add Gumroad Site Profile and Local DOM Reader

**Files:**
- Create: `go-browser-site-profiles.js`
- Create: `go-browser-local-reader.js`
- Create: `tests/go-browser-local-reader.test.cjs`

**Interfaces:**
- Consumes Task 1 field contract.
- Produces: `profileForUrl(url)`
- Produces: `scanLocalDocument({ document, location, title, profile })`
- Field shape: `{ fieldId, role, name, semanticRole, valueKind, sensitive, required, disabled, readOnly, hidden, options, signature }`.

- [ ] **Step 1: Write RED tests for host policy and field evidence**

The test file defines minimal fake controls with `tagName`, `type`, `name`, `value`, `disabled`, `readOnly`, `hidden`, `getAttribute()`, `labels`, and `options`, plus a fake document whose `querySelectorAll()` returns the supplied controls.

```js
test("Gumroad is the only V1 site profile", async () => {
  const { profileForUrl } = await loadProfiles();
  assert.equal(profileForUrl("https://example.com/form"), null);
  assert.equal(profileForUrl("https://gumroad.com/products/new").id, "gumroad-v1");
  assert.equal(profileForUrl("https://app.gumroad.com/products/new").id, "gumroad-v1");
});

test("scan derives semantic signatures and a structural fingerprint", async () => {
  const document = fakeDocument([
    fakeControl({ tagName: "INPUT", type: "text", name: "name", ariaLabel: "Product name", value: "Old title" }),
    fakeControl({ tagName: "TEXTAREA", name: "description", label: "Description", value: "Old body" }),
    fakeControl({ tagName: "INPUT", type: "number", name: "price", label: "Price", value: "10" }),
  ]);
  const result = scanLocalDocument({
    document,
    location: new URL("https://gumroad.com/products/new"),
    title: "New product",
    profile: GUMROAD_PROFILE,
  });
  assert.deepEqual(result.fields.map(field => field.semanticRole), ["title", "description", "price"]);
  assert.equal(result.fields[0].signature.accessibleName, "Product name");
  assert.equal(Object.hasOwn(result.fields[0].signature, "childIndex"), false);
  assert.match(result.fingerprint.id, /^fp:[0-9a-f]{8}$/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-local-reader.test.cjs`

Expected: FAIL because the modules are missing.

- [ ] **Step 3: Implement the static Gumroad profile**

```js
export const GUMROAD_PROFILE = Object.freeze({
  id: "gumroad-v1",
  hosts: Object.freeze(["gumroad.com", "*.gumroad.com"]),
  writableSemantics: Object.freeze(["title", "description", "price", "category", "tags"]),
  blockedActionPattern: /submit|publish|purchase|buy|delete|confirm|checkout|save\s*(and|&)\s*publish/i,
});

function hostnameMatches(hostname, pattern) {
  const host = String(hostname || "").toLowerCase();
  const policy = String(pattern || "").toLowerCase();
  if (!policy.startsWith("*.")) return host === policy;
  const suffix = policy.slice(2);
  return host !== suffix && host.endsWith(`.${suffix}`);
}

export function profileForUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  return GUMROAD_PROFILE.hosts.some(pattern => hostnameMatches(url.hostname, pattern))
    ? GUMROAD_PROFILE
    : null;
}
```

- [ ] **Step 4: Implement stable signature/fingerprint helpers**

```js
function stableHash(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedPathname(pathname) {
  const clean = String(pathname || "/").replace(/\/{2,}/g, "/");
  return clean.length > 1 ? clean.replace(/\/$/, "") : clean;
}
```

The reader inspects `input`, `textarea`, `select`, and `[contenteditable="true"]`. Accessible-name evidence order is `aria-label` → associated label → `aria-labelledby` text → `name` → placeholder. Placeholder is recorded as weak evidence.

- [ ] **Step 5: Implement `scanLocalDocument`**

The returned fingerprint source is exactly:

```js
JSON.stringify({
  algorithm: "go-browser-fingerprint-v1",
  profileId: profile.id,
  origin: location.origin,
  pathname: normalizedPathname(location.pathname),
  signatures: fields.map(field => field.signature),
});
```

Then return `id: "fp:" + stableHash(source)` with the source evidence fields alongside it. Generated DOM IDs and child indexes must not be primary signature fields.

- [ ] **Step 6: Add fail-closed evidence tests**

Add cases proving password/OTP/payment are `sensitive: true`, unknown remains `semanticRole: "unknown"`, and hidden/read-only/disabled state is preserved.

- [ ] **Step 7: Run GREEN + V0 regression**

```bash
node --test tests/go-browser-local-reader.test.cjs tests/go-browser-field-contract.test.cjs tests/go-hub-browser-interface.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add go-browser-site-profiles.js go-browser-local-reader.js tests/go-browser-local-reader.test.cjs
git commit -m "feat: add local GO Browser page reader"
```

---

### Task 3: Implement Safe Fill Guard, Re-Resolution, Writer, and Reality Receipt

**Files:**
- Create: `go-browser-safe-fill.js`
- Create: `tests/go-browser-safe-fill.test.cjs`

**Interfaces:**
- Consumes: Task 2 reader/profile.
- Produces: `buildFillPlan(scan, assignments)`
- Produces: `guardAssignment(field, profile)`
- Produces: `scoreCandidate(expected, candidate)`
- Produces: `resolveField(currentScan, expectedField)`
- Produces: `executeFillPlan({ document, location, title, profile, plan, window })`.

- [ ] **Step 1: Write RED guard tests**

```js
test("guard allows known draft metadata and blocks unsafe classes", async () => {
  const { guardAssignment } = await loadSafeFill();
  assert.deepEqual(guardAssignment(field({ semanticRole: "title" }), GUMROAD_PROFILE), { allowed: true });
  assert.equal(guardAssignment(field({ semanticRole: "otp", sensitive: true }), GUMROAD_PROFILE).code, "FIELD_SENSITIVE_BLOCKED");
  assert.equal(guardAssignment(field({ semanticRole: "unknown" }), GUMROAD_PROFILE).code, "FIELD_UNKNOWN_BLOCKED");
  assert.equal(guardAssignment(field({ semanticRole: "title", readOnly: true }), GUMROAD_PROFILE).code, "FIELD_READONLY_BLOCKED");
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-safe-fill.test.cjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement deterministic guard order**

```js
export function guardAssignment(field, profile) {
  if (field.hidden) return { allowed: false, code: "FIELD_ACTION_BLOCKED" };
  if (field.sensitive) return { allowed: false, code: "FIELD_SENSITIVE_BLOCKED" };
  if (field.semanticRole === "unknown") return { allowed: false, code: "FIELD_UNKNOWN_BLOCKED" };
  if (field.disabled || field.readOnly) return { allowed: false, code: "FIELD_READONLY_BLOCKED" };
  if (!profile.writableSemantics.includes(field.semanticRole)) return { allowed: false, code: "FIELD_ACTION_BLOCKED" };
  if (!["text", "number", "choice"].includes(field.valueKind)) return { allowed: false, code: "UNSUPPORTED_FIELD_KIND" };
  return { allowed: true };
}
```

Action-like controls discovered from labels/names matching `profile.blockedActionPattern` are marked blocked before this guard is called.

- [ ] **Step 4: Write RED resolver tests**

Use current-scan field fixtures proving:

```js
assert.equal(scoreCandidate(expected, exactCandidate), 18);
assert.equal(resolveField({ fields: [exactCandidate] }, expected).field.fieldId, exactCandidate.fieldId);
assert.equal(resolveField({ fields: [] }, expected).error, "FIELD_NOT_FOUND");
assert.equal(resolveField({ fields: [candidateA, candidateB] }, expected).error, "FIELD_RESOLUTION_AMBIGUOUS");
```

Scoring weights are fixed: accessible name 5, `name` attribute 4, tag/role 3, input type 2, autocomplete 2, options evidence 2, placeholder 1. Winner threshold is `>= 7`, and winner margin over second place is `>= 2`.

- [ ] **Step 5: Implement scoring and unique resolution**

`resolveField` returns `{ field }` only for a unique confident match. It never falls back to DOM index.

- [ ] **Step 6: Write RED write/read-back tests**

Define a fake control whose native setter updates `.value` and whose `dispatchEvent()` stores event types. Test:

```js
assert.deepEqual(control.events, ["input", "change"]);
assert.equal(result.receipts[0].state, "VERIFIED");
assert.equal(result.receipts[0].actualValue, "New title");
```

Define a second control whose setter refuses the value and assert `FIELD_VERIFY_MISMATCH`.

- [ ] **Step 7: Implement value setting without clicks**

```js
function dispatchEditEvents(element, windowLike) {
  element.dispatchEvent(new windowLike.Event("input", { bubbles: true }));
  element.dispatchEvent(new windowLike.Event("change", { bubbles: true }));
}

function setSimpleValue(element, value, windowLike) {
  const proto = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) descriptor.set.call(element, String(value));
  else element.value = String(value);
  dispatchEditEvents(element, windowLike);
}
```

For `select`, reject any proposed value not already present in `element.options`. Contenteditable stays unsupported in V1 unless a dedicated test proves a safe path.

- [ ] **Step 8: Implement page-change guard and receipts**

`executeFillPlan` performs a fresh scan before any write. If the fingerprint differs, return:

```js
{
  ok: false,
  code: "PAGE_CHANGED_RESCAN_REQUIRED",
  receipts: [],
  pageFingerprint: fresh.fingerprint,
}
```

Assignments are then processed independently. Blocked/failed fields are never written; safe fields may verify. `ok` is true only if every requested assignment receipt is `VERIFIED`.

- [ ] **Step 9: Run GREEN + full regression**

```bash
node --test tests/go-browser-safe-fill.test.cjs tests/go-browser-local-reader.test.cjs tests/go-browser-field-contract.test.cjs
npm test
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add go-browser-safe-fill.js tests/go-browser-safe-fill.test.cjs
git commit -m "feat: add guarded local Safe Fill writer"
```

---

### Task 4: Build the Firefox Android In-Page GO Panel and Permission Boundary

**Files:**
- Create: `browser-extension/go-browser-local-v1/manifest.json`
- Create: `browser-extension/go-browser-local-v1/content-script.js`
- Create: `browser-extension/go-browser-local-v1/go-browser-panel.js`
- Create: `browser-extension/go-browser-local-v1/go-browser-panel.css`
- Create: `tests/go-browser-extension-boundary.test.cjs`

**Interfaces:**
- Consumes packaged Task 1–3 modules.
- Panel states: `SCAN`, `PREPARE`, `GUARD`, `RECEIPT`.
- No arbitrary command evaluator or remote command surface.

- [ ] **Step 1: Write RED manifest/boundary tests**

```js
test("manifest is Gumroad-only and exposes dynamic modules only to Gumroad", () => {
  const manifest = readManifest();
  const matches = ["*://gumroad.com/*", "*://*.gumroad.com/*"];
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.deepEqual([...manifest.content_scripts[0].matches].sort(), [...matches].sort());
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.deepEqual([...manifest.web_accessible_resources[0].matches].sort(), [...matches].sort());
  assert.deepEqual(manifest.web_accessible_resources[0].resources.sort(), [
    "go-browser-panel.js",
    "runtime/go-browser-field-contract.js",
    "runtime/go-browser-local-reader.js",
    "runtime/go-browser-safe-fill.js",
    "runtime/go-browser-site-profiles.js",
  ].sort());
});
```

Add assertions that manifest permissions do not include `tabs`, `cookies`, `history`, `webRequest`, `clipboardRead`, or `clipboardWrite`.

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-extension-boundary.test.cjs`

Expected: FAIL because extension files are missing.

- [ ] **Step 3: Add the exact MV3 manifest**

```json
{
  "manifest_version": 3,
  "name": "GO Browser Local Safe Fill",
  "version": "0.1.0",
  "description": "Local, explicit, fail-closed Safe Fill adapter for GO Browser V1.",
  "browser_specific_settings": {
    "gecko": {
      "id": "go-browser-local-v1@pureekangraw.local"
    }
  },
  "content_scripts": [
    {
      "matches": ["*://gumroad.com/*", "*://*.gumroad.com/*"],
      "js": ["content-script.js"],
      "css": ["go-browser-panel.css"],
      "all_frames": false,
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": [
        "go-browser-panel.js",
        "runtime/go-browser-field-contract.js",
        "runtime/go-browser-site-profiles.js",
        "runtime/go-browser-local-reader.js",
        "runtime/go-browser-safe-fill.js"
      ],
      "matches": ["*://gumroad.com/*", "*://*.gumroad.com/*"]
    }
  ]
}
```

Do not add host patterns or capabilities outside this list.

- [ ] **Step 4: Implement content-script bootstrap**

```js
(async () => {
  if (window.top !== window) return;
  const base = browser.runtime.getURL("");
  const [{ profileForUrl }, { scanLocalDocument }, { executeFillPlan }, { mountGoBrowserPanel }] = await Promise.all([
    import(`${base}runtime/go-browser-site-profiles.js`),
    import(`${base}runtime/go-browser-local-reader.js`),
    import(`${base}runtime/go-browser-safe-fill.js`),
    import(`${base}go-browser-panel.js`),
  ]);
  const profile = profileForUrl(location.href);
  if (!profile) return;
  mountGoBrowserPanel({ profile, scanLocalDocument, executeFillPlan });
})().catch(error => console.error("GO_BROWSER_V1_BOOT_FAILED", error?.message || String(error)));
```

No `fetch`, `XMLHttpRequest`, WebSocket, or remote script load is allowed.

- [ ] **Step 5: Implement a pure panel state model first**

```js
export function reducePanelState(state, event) {
  if (state.phase === "SCAN" && event.type === "SCAN_COMPLETE") return { ...state, phase: "PREPARE", scan: event.scan };
  if (state.phase === "PREPARE" && event.type === "PREVIEW_GUARD") return { ...state, phase: "GUARD", plan: event.plan };
  if (state.phase === "GUARD" && event.type === "FILL_CONFIRMED") return { ...state, phase: "RECEIPT", pending: true };
  if (state.phase === "RECEIPT" && event.type === "FILL_COMPLETE") return { ...state, pending: false, result: event.result };
  return state;
}
```

Tests prove no writer is invoked by mount, page load, Scan, or guard preview; writer is called only from the explicit Fill button handler.

- [ ] **Step 6: Implement namespaced mobile DOM UI**

Use IDs/classes beginning `go-browser-v1-`. The panel renders:

- Scan button,
- page/profile evidence,
- only safe editable value controls,
- blocked field list with codes,
- Guard preview,
- one explicit Fill button,
- final receipts.

There is no Submit/Publish/Purchase/Delete button or handler.

- [ ] **Step 7: Add source-level secret/network/action assertions**

Recursively scan extension/runtime source and fail if it contains secret names (`GOHUB_OWNER_PASSCODE`, `GITHUB_TOKEN`, `NOTION_TOKEN`, `AMO_SIGN_SECRET`), network primitives (`fetch(`, `XMLHttpRequest`, `WebSocket(`), or command identifiers `submit`, `publish`, `purchase`, `navigate` in the extension command surface. Human-facing explanatory text may mention that publish is blocked; tests should inspect executable identifiers/handlers, not ordinary explanatory copy.

- [ ] **Step 8: Run GREEN**

```bash
node --test tests/go-browser-extension-boundary.test.cjs tests/go-browser-safe-fill.test.cjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add browser-extension/go-browser-local-v1 tests/go-browser-extension-boundary.test.cjs
git commit -m "feat: add Firefox Android GO Browser panel"
```

---

### Task 5: Add Deterministic Extension Build and CI Review Artifact

**Files:**
- Create: `scripts/build-go-browser-extension.mjs`
- Create: `tests/go-browser-extension-build.test.cjs`
- Modify: `package.json`
- Modify: `.github/workflows/standard-safety-gate.yml`

**Interfaces:**
- Produces unpacked artifact: `dist/go-browser-local-v1/`.
- Ordinary CI artifact is explicitly unsigned.

- [ ] **Step 1: Write RED build test**

Run the build script with `--out <temporary-dir>` and assert the exact artifact contains:

```js
const expected = [
  "manifest.json",
  "content-script.js",
  "go-browser-panel.js",
  "go-browser-panel.css",
  "runtime/go-browser-field-contract.js",
  "runtime/go-browser-site-profiles.js",
  "runtime/go-browser-local-reader.js",
  "runtime/go-browser-safe-fill.js",
];
```

Read every built text file and assert no secret value/name is injected and manifest authority remains Gumroad-only.

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-extension-build.test.cjs`

Expected: FAIL because the build script is missing.

- [ ] **Step 3: Implement built-in-only copy builder**

```js
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0
  ? path.resolve(process.argv[outIndex + 1])
  : path.join(root, "dist", "go-browser-local-v1");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "runtime"), { recursive: true });
await cp(path.join(root, "browser-extension", "go-browser-local-v1"), out, { recursive: true });
for (const file of [
  "go-browser-field-contract.js",
  "go-browser-site-profiles.js",
  "go-browser-local-reader.js",
  "go-browser-safe-fill.js",
]) {
  await cp(path.join(root, file), path.join(out, "runtime", file));
}
```

The script does not read or substitute environment secrets.

- [ ] **Step 4: Extend package scripts**

Add:

```json
"build:go-browser-extension": "node scripts/build-go-browser-extension.mjs",
"test:go-browser-extension": "node --test tests/go-browser-field-contract.test.cjs tests/go-browser-local-reader.test.cjs tests/go-browser-safe-fill.test.cjs tests/go-browser-extension-boundary.test.cjs tests/go-browser-extension-build.test.cjs"
```

Extend `check:syntax` with all four new core modules, `content-script.js`, `go-browser-panel.js`, and `scripts/build-go-browser-extension.mjs`.

- [ ] **Step 5: Extend STANDARD Safety Gate with unsigned artifact upload**

Append these steps after the existing deploy gate:

```yaml
      - name: Build GO Browser extension review artifact
        run: npm run build:go-browser-extension
      - name: Upload unsigned GO Browser extension
        uses: actions/upload-artifact@v4
        with:
          name: go-browser-local-v1-unsigned-${{ github.sha }}
          path: dist/go-browser-local-v1
          if-no-files-found: error
```

This artifact is not called installable/signed/Product Verified.

- [ ] **Step 6: Run GREEN + full gate**

```bash
npm run test:go-browser-extension
npm run deploy:gate
npm run build:go-browser-extension
```

Expected: PASS and `dist/go-browser-local-v1/manifest.json` exists.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-go-browser-extension.mjs tests/go-browser-extension-build.test.cjs package.json .github/workflows/standard-safety-gate.yml
git commit -m "build: package GO Browser Android extension"
```

---

### Task 6: Add Manual Mozilla Signing Gate Without Repository Secrets

**Files:**
- Create: `.github/workflows/go-browser-extension-sign.yml`
- Modify: `tests/go-browser-extension-boundary.test.cjs`

**Interfaces:**
- Trigger: `workflow_dispatch` only.
- Secrets: `AMO_SIGN_KEY`, `AMO_SIGN_SECRET`.
- Produces Mozilla-signed XPI only after AMO accepts the extension.

- [ ] **Step 1: Write RED workflow-policy test**

```js
const workflow = fs.readFileSync(path.join(root, ".github/workflows/go-browser-extension-sign.yml"), "utf8");
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /pull_request:/);
assert.doesNotMatch(workflow, /\n\s*push:/);
assert.match(workflow, /secrets\.AMO_SIGN_KEY/);
assert.match(workflow, /secrets\.AMO_SIGN_SECRET/);
assert.match(workflow, /channel:\s*unlisted/);
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-extension-boundary.test.cjs`

Expected: FAIL because the signing workflow is missing.

- [ ] **Step 3: Add manual signing workflow**

Use this structure:

```yaml
name: GO Browser Extension Sign

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  sign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Require signing secrets
        env:
          AMO_SIGN_KEY: ${{ secrets.AMO_SIGN_KEY }}
          AMO_SIGN_SECRET: ${{ secrets.AMO_SIGN_SECRET }}
        run: |
          test -n "$AMO_SIGN_KEY" && test -n "$AMO_SIGN_SECRET" || { echo "AMO_SIGNING_NOT_CONFIGURED"; exit 1; }
      - name: Verify repository
        run: npm run deploy:gate
      - name: Build extension source
        run: npm run build:go-browser-extension
      - name: Build unsigned XPI
        id: build
        uses: kewisch/action-web-ext@v2
        with:
          cmd: build
          source: dist/go-browser-local-v1
          filename: go-browser-local-v1-unsigned.xpi
      - name: Sign XPI with Mozilla AMO
        id: sign
        uses: kewisch/action-web-ext@v2
        with:
          cmd: sign
          source: ${{ steps.build.outputs.target }}
          channel: unlisted
          apiKey: ${{ secrets.AMO_SIGN_KEY }}
          apiSecret: ${{ secrets.AMO_SIGN_SECRET }}
      - name: Upload signed XPI
        uses: actions/upload-artifact@v4
        with:
          name: go-browser-local-v1-signed-${{ github.sha }}
          path: ${{ steps.sign.outputs.target }}
          if-no-files-found: error
```

Before implementation, verify the action/version still documents AMO unlisted signing. If the public action contract changed, keep the same authority boundary and pin the replacement to a reviewed immutable version.

- [ ] **Step 4: Run GREEN + repository gate**

```bash
node --test tests/go-browser-extension-boundary.test.cjs
npm run deploy:gate
```

Expected: PASS. Do not run the signing job until secrets are configured.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/go-browser-extension-sign.yml tests/go-browser-extension-boundary.test.cjs
git commit -m "ci: add guarded Mozilla extension signing"
```

---

### Task 7: PR, Exact-Head CI, Signing Evidence, and Android Reality Gate

**Files:**
- Product code remains unchanged unless verification finds a defect.
- Update Notion handoff only after evidence exists.

**Interfaces:**
- Required evidence: feature-head SHA, STANDARD Safety Gate, unsigned artifact, signed artifact if credentials exist, Android Reality receipt.

- [ ] **Step 1: Run pre-PR verification**

```bash
npm run deploy:gate
npm run build:go-browser-extension
```

Record the exact feature-head SHA.

- [ ] **Step 2: Open a draft PR**

The PR body states: generic adapter, Gumroad first profile, no network bridge, no submit/publish/auth/payment capability, unsigned/signed state, and Reality status.

- [ ] **Step 3: Require exact-head STANDARD Safety Gate success**

Any review commit invalidates earlier exact-head evidence; re-run/observe CI for the new head.

- [ ] **Step 4: Inspect unsigned artifact truthfully**

Verify manifest, runtime files, and absence of secret material. This proves packaging only.

- [ ] **Step 5: Run manual Mozilla signing when credentials exist**

If the secrets are absent, record `AMO_SIGNING_NOT_CONFIGURED` and stop Product Verification. Do not relabel the unsigned artifact as installable/signed.

- [ ] **Step 6: Perform Firefox Android Reality test after signed XPI exists**

On BIG's phone or another authorized Android device:

1. install the signed XPI,
2. open an authenticated Gumroad product create/edit page,
3. open the GO panel,
4. press Scan,
5. confirm discovered safe and blocked fields,
6. prepare at least two safe values such as title + description,
7. review Guard preview,
8. press Fill once,
9. confirm receipts show read-back values equal expected values,
10. confirm Publish/Submit was never triggered.

Capture only non-secret evidence: extension version, page class, receipt states/codes, and publish-untouched result. Never capture cookies, passwords, OTPs, or payment data.

- [ ] **Step 7: Debug from the first broken truth if Reality fails**

Classify the earliest failed layer: profile → reader → fingerprint → resolver → guard → writer → panel → package/signing. Add a reproducing RED test at that layer before changing code.

- [ ] **Step 8: Merge only with truthful status**

Code-complete may merge with `REALITY_PENDING` only if an external signing credential or physical-device action blocks final Reality. Never record `PRODUCT VERIFIED` until the signed Android flow passes.

- [ ] **Step 9: Update Notion handoff**

Record PR number, merged main SHA, exact-head CI run, unsigned artifact run, signed artifact run when available, extension version, Android Reality result, and any remaining external dependency.

- [ ] **Step 10: Stop at the V1 boundary**

Do not add GO Hub bridge, remote Fill Plan delivery, broader site authority, submit/publish, pairing/session authorization, or Chromium Android support without a new Owner-authorized slice.
