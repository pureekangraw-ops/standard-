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

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-browser-field-contract.test.cjs`

- [ ] **Step 3: Implement the contract**

- [ ] **Step 4: Refactor V0 to import these helpers**

Do not change the V0 response shape.

- [ ] **Step 5: Run GREEN + regression**

```bash
node --test tests/go-browser-field-contract.test.cjs tests/go-hub-browser-interface.test.cjs tests/go-hub-browser-worker.test.cjs tests/go-hub-browser-owner-auth.test.cjs
npm test
```

- [ ] **Step 6: Commit**

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
- [ ] **Step 2: Run RED**
- [ ] **Step 3: Implement the static Gumroad profile**
- [ ] **Step 4: Implement stable signature/fingerprint helpers**
- [ ] **Step 5: Implement `scanLocalDocument`**
- [ ] **Step 6: Add fail-closed evidence tests**
- [ ] **Step 7: Run GREEN + V0 regression**
- [ ] **Step 8: Commit**

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
- [ ] **Step 2: Run RED**
- [ ] **Step 3: Implement deterministic guard order**
- [ ] **Step 4: Write RED resolver tests**
- [ ] **Step 5: Implement scoring and unique resolution**
- [ ] **Step 6: Write RED write/read-back tests**
- [ ] **Step 7: Implement value setting without clicks**
- [ ] **Step 8: Implement page-change guard and receipts**
- [ ] **Step 9: Run GREEN + full regression**
- [ ] **Step 10: Commit**

Resolver scoring weights: accessible name 5, `name` attribute 4, tag/role 3, input type 2, autocomplete 2, options evidence 2, placeholder 1. Winner threshold is `>= 7`, and winner margin over second place is `>= 2`.

For `select`, reject any proposed value not already present in `element.options`. Contenteditable stays unsupported in V1 unless a dedicated test proves a safe path.

`executeFillPlan` performs a fresh scan before any write. Fingerprint changes return `PAGE_CHANGED_RESCAN_REQUIRED`. Assignments are processed independently; overall `ok` is true only if every requested assignment receipt is `VERIFIED`.

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
- [ ] **Step 2: Run RED**
- [ ] **Step 3: Add the exact MV3 manifest**
- [ ] **Step 4: Implement content-script bootstrap**
- [ ] **Step 5: Implement a pure panel state model first**
- [ ] **Step 6: Implement namespaced mobile DOM UI**
- [ ] **Step 7: Add source-level secret/network/action assertions**
- [ ] **Step 8: Run GREEN**
- [ ] **Step 9: Commit**

The panel renders Scan, page/profile evidence, only safe editable value controls, blocked field codes, Guard preview, one explicit Fill button, and final receipts. There is no Submit/Publish/Purchase/Delete button or handler.

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
- [ ] **Step 2: Run RED**
- [ ] **Step 3: Implement built-in-only copy builder**
- [ ] **Step 4: Extend package scripts**
- [ ] **Step 5: Extend STANDARD Safety Gate with unsigned artifact upload**
- [ ] **Step 6: Run GREEN + full gate**
- [ ] **Step 7: Commit**

Expected artifact files:
- `manifest.json`
- `content-script.js`
- `go-browser-panel.js`
- `go-browser-panel.css`
- `runtime/go-browser-field-contract.js`
- `runtime/go-browser-site-profiles.js`
- `runtime/go-browser-local-reader.js`
- `runtime/go-browser-safe-fill.js`

This artifact is not called installable/signed/Product Verified.

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
- [ ] **Step 2: Run RED**
- [ ] **Step 3: Add manual signing workflow**
- [ ] **Step 4: Run GREEN + repository gate**
- [ ] **Step 5: Commit**

Before implementation, verify the signing action/version still documents AMO unlisted signing. Keep the authority boundary and pin the reviewed action to an immutable commit.

Do not run the signing job until secrets are configured.

---

### Task 7: PR, Exact-Head CI, Signing Evidence, and Android Reality Gate

**Files:**
- Product code remains unchanged unless verification finds a defect.
- Update Notion handoff only after evidence exists.

**Interfaces:**
- Required evidence: feature-head SHA, STANDARD Safety Gate, unsigned artifact, signed artifact if credentials exist, Android Reality receipt.

- [ ] **Step 1: Run pre-PR verification**
- [ ] **Step 2: Open a draft PR**
- [ ] **Step 3: Require exact-head STANDARD Safety Gate success**
- [ ] **Step 4: Inspect unsigned artifact truthfully**
- [ ] **Step 5: Run manual Mozilla signing when credentials exist**
- [ ] **Step 6: Perform Firefox Android Reality test after signed XPI exists**
- [ ] **Step 7: Debug from the first broken truth if Reality fails**
- [ ] **Step 8: Merge only with truthful status**
- [ ] **Step 9: Update Notion handoff**
- [ ] **Step 10: Stop at the V1 boundary**

Any review commit invalidates earlier exact-head evidence.

If signing secrets are absent, record `AMO_SIGNING_NOT_CONFIGURED` and stop Product Verification. Do not relabel the unsigned artifact as installable/signed.

Firefox Android Reality flow:
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

Code-complete may merge with `REALITY_PENDING` only if an external signing credential or physical-device action blocks final Reality. Never record `PRODUCT VERIFIED` until the signed Android flow passes.

Notion handoff records PR number, merged main SHA, exact-head CI run, unsigned artifact run, signed artifact run when available, extension version, Android Reality result, and any remaining external dependency.

Do not add GO Hub bridge, remote Fill Plan delivery, broader site authority, submit/publish, pairing/session authorization, or Chromium Android support without a new Owner-authorized slice.
