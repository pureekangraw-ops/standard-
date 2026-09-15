# GO Browser Local Safe Fill V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, fail-closed Local Safe Fill adapter that runs on Firefox Android, uses Gumroad as the first site profile, fills only explicit safe draft fields in BIG's real mobile tab, and verifies actual values without submitting or publishing.

**Architecture:** Preserve V0 as the cloud reader, extract its reusable field semantics into a browser-neutral module, and add a local DOM adapter composed of a reader/fingerprint layer, site profiles, a Safe Fill guard/resolver/writer, and an in-page mobile panel. Package those pieces as a Firefox Android WebExtension with Gumroad-only host authority; CI builds an unsigned review artifact, while a separate manual signing path uses Mozilla signing credentials stored only as GitHub secrets.

**Tech Stack:** Node.js 22 built-ins, existing `node:test` suite, ES modules, WebExtension Manifest V3, Firefox Android content scripts, GitHub Actions, Mozilla `web-ext`/AMO signing through CI only.

**Spec:** `docs/superpowers/specs/2026-09-15-go-browser-local-safe-fill-v1-design.md`

## Global Constraints

- BIG remains Owner / highest authority.
- V1 must work without a desktop computer.
- Gumroad is the first site profile, not the product identity.
- V0 public read behavior and risk semantics must remain unchanged.
- No `<all_urls>` permission.
- No GO Hub, GitHub, Notion, Browser Run, or other secret may be embedded in extension source or build output.
- No GO Hub ↔ extension network bridge in V1.
- No password, OTP, payment, CAPTCHA, file upload, submit, publish, purchase, delete, account-confirmation, or autonomous navigation capability.
- Opening the page, loading the extension, or scanning must never write automatically.
- Every field must be re-resolved immediately before mutation.
- Unknown or ambiguous targets fail closed.
- A write is not successful until read-back evidence matches the requested normalized value.
- Real-device Product Verification requires an actually installed Firefox Android extension and a Gumroad Scan → Guard → Fill → Verify flow.
- Mozilla signing credentials, if later supplied, live only in GitHub Actions secrets and never in repository content.

---

## File Structure

### Existing files modified

- `go-hub-browser-interface.js` — consume the extracted shared semantic helpers without changing the V0 HTTP contract.
- `package.json` — add syntax/build checks for the new browser modules and extension artifact.
- `.github/workflows/standard-safety-gate.yml` — build and upload the unsigned extension review artifact after the existing gate passes.

### New core files

- `go-browser-field-contract.js` — pure shared semantic/value/sensitivity contract reused by V0 and V1.
- `go-browser-site-profiles.js` — fail-closed site profiles; V1 ships Gumroad only.
- `go-browser-local-reader.js` — DOM candidate extraction, accessible-name evidence, normalized signatures, and page fingerprint.
- `go-browser-safe-fill.js` — Fill Plan validation, guard decisions, candidate re-resolution, writes, and Reality receipts.

### New extension files

- `browser-extension/go-browser-local-v1/manifest.json` — Firefox Android MV3 manifest with Gumroad-only authority.
- `browser-extension/go-browser-local-v1/content-script.js` — top-frame bootstrap; dynamically imports packaged extension modules and mounts GO UI.
- `browser-extension/go-browser-local-v1/go-browser-panel.js` — narrow-screen Scan / Prepare / Guard / Receipt UI.
- `browser-extension/go-browser-local-v1/go-browser-panel.css` — namespaced panel styles copied into the build and injected by the content script.

### New build/release files

- `scripts/build-go-browser-extension.mjs` — creates a deterministic unpacked extension folder from repository sources without embedding secrets.
- `.github/workflows/go-browser-extension-sign.yml` — manual-only Mozilla signing workflow using GitHub secrets; does not run on ordinary pushes/PRs.

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
- Produces: `semanticRoleForName(name) -> string`
- Produces: `valueKindForRole(role) -> "text" | "number" | "boolean" | "choice"`
- Produces: `isSensitiveSemanticRole(semanticRole) -> boolean`
- Produces: `readRiskClassForSemanticRole(semanticRole) -> "SAFE_READ" | "SENSITIVE" | "UNKNOWN"`
- V0 continues to produce the exact existing Field Map shape and risk classes.

- [ ] **Step 1: Write failing shared-contract tests**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const url = pathToFileURL(path.resolve(__dirname, "..", "go-browser-field-contract.js")).href;

test("shared field contract classifies known, sensitive, and unknown semantics", async () => {
  const contract = await import(`${url}?t=${Date.now()}`);
  assert.equal(contract.semanticRoleForName("Product name"), "title");
  assert.equal(contract.semanticRoleForName("Description"), "description");
  assert.equal(contract.semanticRoleForName("OTP code"), "otp");
  assert.equal(contract.semanticRoleForName("Whatever"), "unknown");
  assert.equal(contract.isSensitiveSemanticRole("otp"), true);
  assert.equal(contract.readRiskClassForSemanticRole("title"), "SAFE_READ");
  assert.equal(contract.readRiskClassForSemanticRole("payment"), "SENSITIVE");
  assert.equal(contract.readRiskClassForSemanticRole("unknown"), "UNKNOWN");
});

test("shared field contract preserves V0 value kinds", async () => {
  const contract = await import(`${url}?k=${Date.now()}`);
  assert.equal(contract.valueKindForRole("spinbutton"), "number");
  assert.equal(contract.valueKindForRole("checkbox"), "boolean");
  assert.equal(contract.valueKindForRole("combobox"), "choice");
  assert.equal(contract.valueKindForRole("textbox"), "text");
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `node --test tests/go-browser-field-contract.test.cjs`

Expected: FAIL because `go-browser-field-contract.js` does not exist.

- [ ] **Step 3: Implement the pure contract**

Create `go-browser-field-contract.js` with exported helpers containing the exact existing V0 vocabulary. The implementation must keep the current keyword ordering so `password`, `otp`, and `payment` remain sensitive before generic matches.

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

- [ ] **Step 4: Refactor V0 to import the shared helpers**

Replace the local semantic/value/risk helper implementations in `go-hub-browser-interface.js` with imports from `./go-browser-field-contract.js`, keeping its exported API and response shape unchanged.

- [ ] **Step 5: Run focused and full V0 regression tests**

Run:

```bash
node --test tests/go-browser-field-contract.test.cjs tests/go-hub-browser-interface.test.cjs tests/go-hub-browser-worker.test.cjs tests/go-hub-browser-owner-auth.test.cjs
npm test
```

Expected: PASS; existing V0 assertions remain byte-for-byte equivalent in semantic meaning.

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
- Consumes: Task 1 semantic helpers.
- Produces: `profileForUrl(url) -> profile | null`
- Produces: `scanLocalDocument({ document, location, title, profile }) -> { page, fingerprint, fields, unknowns }`
- Produces each field with `fieldId`, `role`, `name`, `semanticRole`, `valueKind`, `sensitive`, `required`, `disabled`, `readOnly`, `hidden`, `options`, and `signature`.

- [ ] **Step 1: Write RED tests for site gating and stable evidence**

Use minimal document/element fixtures, not a new DOM dependency. The fixture document only needs `querySelectorAll()` and label lookup helpers used by the reader.

```js
test("reader rejects sites without a server-shipped profile", async () => {
  const { profileForUrl } = await loadProfiles();
  assert.equal(profileForUrl("https://example.com/form"), null);
  assert.equal(profileForUrl("https://gumroad.com/products/new").id, "gumroad-v1");
});

test("reader creates semantic signatures without trusting child index", async () => {
  const document = fakeDocument([
    fakeInput({ type: "text", name: "name", ariaLabel: "Product name", value: "Old title" }),
    fakeTextarea({ name: "description", label: "Description", value: "Old body" }),
    fakeInput({ type: "number", name: "price", label: "Price", value: "10" }),
  ]);
  const result = scanLocalDocument({
    document,
    location: new URL("https://gumroad.com/products/new"),
    title: "New product",
    profile: GUMROAD_PROFILE,
  });
  assert.deepEqual(result.fields.map(field => field.semanticRole), ["title", "description", "price"]);
  assert.equal(result.fields[0].signature.accessibleName, "Product name");
  assert.equal("childIndex" in result.fields[0].signature, false);
  assert.match(result.fingerprint.id, /^fp:/);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/go-browser-local-reader.test.cjs`

Expected: FAIL because profile/reader modules do not exist.

- [ ] **Step 3: Implement Gumroad profile**

`go-browser-site-profiles.js` must contain a frozen `GUMROAD_PROFILE` and an exact/wildcard hostname matcher. Runtime input must not be able to add hostnames.

```js
export const GUMROAD_PROFILE = Object.freeze({
  id: "gumroad-v1",
  hosts: Object.freeze(["gumroad.com", "*.gumroad.com"]),
  writableSemantics: Object.freeze(["title", "description", "price", "category", "tags"]),
  blockedActionPattern: /submit|publish|purchase|buy|delete|confirm|checkout|save\s*(and|&)\s*publish/i,
});
```

- [ ] **Step 4: Implement candidate extraction and accessible-name evidence**

The reader must inspect only ordinary editable candidates: `input`, `textarea`, `select`, and `[contenteditable="true"]`. It must derive accessible name in this order: `aria-label`, associated `<label>`, `aria-labelledby`, `name`, placeholder. Placeholder is weak evidence and must be marked as such in the signature.

- [ ] **Step 5: Implement structural fingerprint**

Fingerprint source is `profile.id + origin + normalized pathname + ordered stable signatures`. Use a small deterministic non-cryptographic hash implemented in the module; do not hash raw HTML.

```js
function stableHash(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
```

- [ ] **Step 6: Add RED/GREEN cases for sensitive/hidden/read-only/unknown fields**

Tests must prove that password/OTP/payment semantics are marked sensitive, hidden/read-only evidence is preserved, and unknown semantics remain unknown rather than being promoted to writable metadata.

- [ ] **Step 7: Run focused + V0 regression tests**

Run:

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

### Task 3: Implement Fail-Closed Fill Plan, Guard, Re-Resolution, Writer, and Receipt

**Files:**
- Create: `go-browser-safe-fill.js`
- Create: `tests/go-browser-safe-fill.test.cjs`

**Interfaces:**
- Consumes: `scanLocalDocument`, shared field contract, site profile.
- Produces: `buildFillPlan(scan, assignments) -> { fingerprintId, assignments }`
- Produces: `guardAssignment(field, profile) -> { allowed, code? }`
- Produces: `resolveField(document, expectedField, profile) -> { field, element } | { error }`
- Produces: `executeFillPlan({ document, location, title, profile, plan, window }) -> { ok, receipts, pageFingerprint }`

- [ ] **Step 1: Write RED guard tests**

```js
test("guard permits recognized draft metadata and blocks sensitive unknown and actions", async () => {
  assert.deepEqual(guardAssignment(field("title"), GUMROAD_PROFILE), { allowed: true });
  assert.equal(guardAssignment(field("password", { sensitive: true }), GUMROAD_PROFILE).code, "FIELD_SENSITIVE_BLOCKED");
  assert.equal(guardAssignment(field("unknown"), GUMROAD_PROFILE).code, "FIELD_UNKNOWN_BLOCKED");
  assert.equal(guardAssignment(field("title", { readOnly: true }), GUMROAD_PROFILE).code, "FIELD_READONLY_BLOCKED");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/go-browser-safe-fill.test.cjs`

Expected: FAIL because `go-browser-safe-fill.js` does not exist.

- [ ] **Step 3: Implement deterministic guard codes**

The guard checks in this order so failures are stable: hidden/action → sensitive → unknown → disabled/read-only → unsupported kind → profile writable semantics. It never turns an unknown into a safe field.

- [ ] **Step 4: Write RED candidate re-resolution tests**

Tests must cover:

```js
// one confident match -> resolves
// zero matches -> FIELD_NOT_FOUND
// equal plausible matches -> FIELD_RESOLUTION_AMBIGUOUS
// index-only match -> rejected
```

Use signature scoring with explicit weights: accessible name 5, `name` attribute 4, tag/role 3, input type 2, autocomplete 2, options evidence 2, placeholder 1. Require score >= 7 and require the winner to beat second place by >= 2.

- [ ] **Step 5: Implement resolver with the explicit threshold**

Do not accept DOM child index or generated IDs as sufficient authority. Return the same field evidence used to justify the winner so the receipt is auditable.

- [ ] **Step 6: Write RED write/read-back tests**

Use fake controls with an event log. Cover text, number, select/choice, and read-back mismatch.

```js
test("writer dispatches input/change and requires read-back match", async () => {
  const result = await executeFillPlan(/* fixture with title assignment */);
  assert.equal(result.receipts[0].state, "VERIFIED");
  assert.deepEqual(control.events, ["input", "change"]);
});

test("writer reports mismatch instead of claiming success", async () => {
  const result = await executeFillPlan(/* fixture that refuses value */);
  assert.equal(result.ok, false);
  assert.equal(result.receipts[0].code, "FIELD_VERIFY_MISMATCH");
});
```

- [ ] **Step 7: Implement browser/framework-compatible value setting**

For ordinary input/textarea controls, use the native prototype setter when available, then dispatch bubbling `input` and `change` events. For `select`, set only an existing option value. Do not click any control. Contenteditable remains blocked unless a dedicated passing test is added in this task.

- [ ] **Step 8: Add page-change protection**

`executeFillPlan` performs a fresh scan before any write. If `plan.fingerprintId` differs from the fresh fingerprint in a structurally meaningful way, return `PAGE_CHANGED_RESCAN_REQUIRED` and perform zero writes.

- [ ] **Step 9: Define partial-result truth explicitly**

Assignments are independently guarded and written. Blocked/failed assignments receive receipts and are not written; safe assignments may still verify. `result.ok` is `true` only when every requested assignment is `VERIFIED`.

- [ ] **Step 10: Run focused + full unit tests**

Run:

```bash
node --test tests/go-browser-safe-fill.test.cjs tests/go-browser-local-reader.test.cjs tests/go-browser-field-contract.test.cjs
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add go-browser-safe-fill.js tests/go-browser-safe-fill.test.cjs
git commit -m "feat: add guarded local Safe Fill writer"
```

---

### Task 4: Build the Firefox Android In-Page GO Panel

**Files:**
- Create: `browser-extension/go-browser-local-v1/manifest.json`
- Create: `browser-extension/go-browser-local-v1/content-script.js`
- Create: `browser-extension/go-browser-local-v1/go-browser-panel.js`
- Create: `browser-extension/go-browser-local-v1/go-browser-panel.css`
- Create: `tests/go-browser-extension-boundary.test.cjs`

**Interfaces:**
- Consumes packaged `go-browser-local-reader.js`, `go-browser-safe-fill.js`, `go-browser-site-profiles.js`.
- Panel states: `SCAN`, `PREPARE`, `GUARD`, `RECEIPT`.
- Content script never exposes an arbitrary command evaluator.

- [ ] **Step 1: Write RED manifest boundary tests**

```js
test("extension manifest is Gumroad-only and top-frame", () => {
  const manifest = readManifest();
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.deepEqual(manifest.content_scripts[0].matches.sort(), [
    "*://*.gumroad.com/*",
    "*://gumroad.com/*",
  ]);
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
});
```

Also assert that the manifest declares a stable Gecko ID and no background/network permissions unrelated to this local adapter.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/go-browser-extension-boundary.test.cjs`

Expected: FAIL because the extension files do not exist.

- [ ] **Step 3: Add Manifest V3 with static Gumroad content-script injection**

Use an explicit Gecko add-on ID such as `go-browser-local-v1@pureekangraw.local`. Set `all_frames: false`; do not request `<all_urls>`, `tabs`, `webRequest`, cookies, history, or clipboard permissions.

- [ ] **Step 4: Implement content-script bootstrap**

`content-script.js` must:

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
})();
```

No network request is permitted in this bootstrap.

- [ ] **Step 5: Implement a namespaced, narrow-screen panel**

The UI must require explicit user presses for `Scan` and `Fill`. It must show blocked fields separately, never render a control for password/OTP/payment/unknown fields, and render a receipt state after fill. No button text or handler named Submit/Publish may exist in the extension command surface.

- [ ] **Step 6: Add source-level safety assertions**

Boundary tests must recursively inspect extension source and fail if they find:

- `GOHUB_OWNER_PASSCODE`
- `GITHUB_TOKEN`
- `NOTION_TOKEN`
- `AMO_JWT_SECRET`
- `fetch(` or `XMLHttpRequest` in V1 runtime source
- an extension command named `submit`, `publish`, `purchase`, or `navigate`

The test should permit CSS URLs or `browser.runtime.getURL()` because those are local extension resources.

- [ ] **Step 7: Test panel state transitions as pure functions**

Expose a small `createPanelModel()` helper from `go-browser-panel.js` so Node tests can prove `SCAN → PREPARE → GUARD → RECEIPT` and prove that no state transition performs a write until the explicit `FILL_CONFIRMED` event.

- [ ] **Step 8: Run focused tests**

Run:

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

### Task 5: Add Deterministic Extension Build and Repository Gates

**Files:**
- Create: `scripts/build-go-browser-extension.mjs`
- Create: `tests/go-browser-extension-build.test.cjs`
- Modify: `package.json`
- Modify: `.github/workflows/standard-safety-gate.yml`

**Interfaces:**
- Produces unpacked artifact: `dist/go-browser-local-v1/`
- CI review artifact: `go-browser-local-v1-unsigned`
- Build never reads signing secrets.

- [ ] **Step 1: Write RED build test**

The test runs the Node build script into a temporary output directory and verifies exact required files:

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

It also scans the built text files for forbidden secret names and verifies the manifest retains Gumroad-only patterns.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/go-browser-extension-build.test.cjs`

Expected: FAIL because the build script does not exist.

- [ ] **Step 3: Implement the built-in-only copy builder**

`scripts/build-go-browser-extension.mjs` accepts optional `--out <dir>` and uses `fs/promises` only. It deletes/recreates the output, copies extension shell files, and copies the four core runtime modules into `runtime/`. It must not substitute environment variables into source.

- [ ] **Step 4: Add package scripts and syntax coverage**

Add:

```json
"build:go-browser-extension": "node scripts/build-go-browser-extension.mjs",
"test:go-browser-extension": "node --test tests/go-browser-field-contract.test.cjs tests/go-browser-local-reader.test.cjs tests/go-browser-safe-fill.test.cjs tests/go-browser-extension-boundary.test.cjs tests/go-browser-extension-build.test.cjs"
```

Extend `check:syntax` to cover the four core modules, the content script, panel module, and build script.

- [ ] **Step 5: Extend STANDARD Safety Gate**

After `npm run deploy:gate`, run `npm run build:go-browser-extension` and upload `dist/go-browser-local-v1/` with `actions/upload-artifact@v4` as `go-browser-local-v1-unsigned-${{ github.sha }}`. This is explicitly an **unsigned review artifact**, not Product Verification.

- [ ] **Step 6: Run complete repository gate**

Run:

```bash
npm run test:go-browser-extension
npm run deploy:gate
npm run build:go-browser-extension
```

Expected: all PASS and `dist/go-browser-local-v1/manifest.json` exists.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-go-browser-extension.mjs tests/go-browser-extension-build.test.cjs package.json .github/workflows/standard-safety-gate.yml
git commit -m "build: package GO Browser Android extension"
```

---

### Task 6: Add Manual Mozilla Signing Gate Without Storing Secrets

**Files:**
- Create: `.github/workflows/go-browser-extension-sign.yml`
- Modify: `tests/go-browser-extension-boundary.test.cjs`

**Interfaces:**
- Inputs: GitHub Actions secrets `AMO_SIGN_KEY`, `AMO_SIGN_SECRET` supplied outside the repo.
- Trigger: `workflow_dispatch` only.
- Produces: Mozilla-signed XPI artifact when AMO accepts the extension.
- Missing secrets: workflow fails explicitly before signing; ordinary CI is unaffected.

- [ ] **Step 1: Add RED workflow-policy test**

Test the YAML as text and assert:

```js
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /pull_request:/);
assert.doesNotMatch(workflow, /push:/);
assert.match(workflow, /secrets\.AMO_SIGN_KEY/);
assert.match(workflow, /secrets\.AMO_SIGN_SECRET/);
```

Also assert neither secret literal appears in repository source.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/go-browser-extension-boundary.test.cjs`

Expected: FAIL because the signing workflow does not exist.

- [ ] **Step 3: Add manual build/sign workflow**

The workflow checks out the exact selected ref, uses Node 22, runs the full extension tests, builds the extension folder, then uses Mozilla signing through a dedicated action/`web-ext` command with `channel: unlisted`. API key/secret come only from `secrets.AMO_SIGN_KEY` and `secrets.AMO_SIGN_SECRET`. Upload the returned signed `.xpi` as a GitHub Actions artifact.

The workflow must include a preflight shell step that exits non-zero with `AMO_SIGNING_NOT_CONFIGURED` if either secret is empty.

- [ ] **Step 4: Document signing truth in workflow artifact names**

Unsigned PR artifact name contains `unsigned`; signed manual artifact name contains `signed`. Never reuse one label for the other.

- [ ] **Step 5: Run repository tests**

Run:

```bash
node --test tests/go-browser-extension-boundary.test.cjs
npm run deploy:gate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/go-browser-extension-sign.yml tests/go-browser-extension-boundary.test.cjs
git commit -m "ci: add guarded Mozilla extension signing"
```

---

### Task 7: PR, Exact-Head CI, Build Evidence, and Real-Device Reality Gate

**Files:**
- No product code changes unless evidence finds a defect.
- Update only the design/handoff documentation after evidence exists.

**Interfaces:**
- Required evidence: exact feature-head SHA, STANDARD Safety Gate result, unsigned build artifact, signed XPI run/artifact when credentials are configured, real-device receipt.

- [ ] **Step 1: Run local/repository verification before PR**

Run:

```bash
npm run deploy:gate
npm run build:go-browser-extension
```

Record the exact feature-head SHA after all commits.

- [ ] **Step 2: Open a draft PR from the implementation branch to `main`**

PR body must state:

- generic Local Safe Fill adapter,
- Gumroad first profile,
- no GO Hub bridge,
- no submit/publish/auth/payment actions,
- signing state,
- real-device verification still pending until performed.

- [ ] **Step 3: Require exact-head STANDARD Safety Gate success**

Do not merge based on an earlier SHA. If review changes the head, re-check the new exact head.

- [ ] **Step 4: Inspect the unsigned CI artifact**

Verify its manifest, runtime files, and absence of secret material. This proves packaging only, not installability in release Firefox.

- [ ] **Step 5: Run manual Mozilla signing when credentials exist**

If GitHub Actions secrets are not configured, stop with explicit external dependency `AMO_SIGNING_NOT_CONFIGURED`; do not call V1 Product Verified.

When configured, run the manual workflow against the exact feature head and capture the signed-XPI artifact ID/run ID.

- [ ] **Step 6: Perform real Firefox Android Reality test**

On BIG's phone or another authorized Android device:

1. install the Mozilla-signed XPI,
2. open an authenticated Gumroad product create/edit page,
3. open GO panel,
4. press Scan,
5. confirm discovered safe/blocked fields,
6. prepare at least two safe values such as title + description,
7. press Fill once,
8. verify receipts show actual read-back values,
9. confirm no Publish/Submit action occurred,
10. confirm any unknown/sensitive fixture encountered was blocked.

Capture only non-secret evidence: extension version, page class, receipt states/codes, and whether publish remained untouched. Do not record session cookies, passwords, OTPs, or payment data.

- [ ] **Step 7: Fix from the first broken truth if Reality fails**

If Reality differs from tests, classify the first broken layer: profile → reader → fingerprint → resolver → guard → writer → panel → package/signing. Add a reproducing RED test at that layer before changing implementation.

- [ ] **Step 8: Merge only after exact-head CI and product criteria allowed by available authority**

If signing/device verification is blocked by an external credential or physical-device action, the PR may be code-complete but must be labeled/noted `REALITY_PENDING`; do not record `PRODUCTION VERIFIED` or `PRODUCT VERIFIED`.

- [ ] **Step 9: Update Notion handoff with exact evidence**

Record:

- merged main SHA,
- PR number,
- exact-head gate run,
- unsigned artifact run,
- signed artifact run if available,
- Firefox Android extension version,
- real-device result and receipts,
- any remaining external dependency.

- [ ] **Step 10: Stop at V1 boundary**

Do not add GO Hub bridge, remote Fill Plan delivery, broader site authority, submit/publish, persistent pairing, or Chromium Android support without a new Owner-authorized slice.
