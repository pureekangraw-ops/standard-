# GO Browser Local Observer Eye V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate, read-only Firefox Android observer that sends locally sanitized Gumroad evidence to GO Hub only, with owner-started sessions, fail-closed policy, and one-shot screenshot consent.

**Architecture:** A dedicated Observer extension package collects visible Gumroad DOM evidence, classifies before reading values, sanitizes locally, and sends snapshots only to dedicated GO Hub observer ingress. GO Hub revalidates schema/session/freshness/fingerprint and never grants action capability. Safe Fill remains a separate package and is never imported by Observer.

**Tech Stack:** JavaScript ES modules, Firefox WebExtensions MV3, Node.js `node:test`, Cloudflare Worker/GO Hub edge worker, GitHub Actions STANDARD Safety Gate and AMO signing workflow.

**Spec:** `docs/superpowers/specs/2026-09-16-go-browser-local-observer-eye-v1-design.md`

## Global Constraints
- Gumroad-only V1 host scope; no `<all_urls>`.
- Sanitization before transport; sensitive values never enter outbound packets.
- Observer public API has no click/type/fill/submit/publish primitives.
- Screenshot requires explicit per-capture consent and active owner session.
- No fallback network destination; Hub failure returns `HUB_UNAVAILABLE`.
- No merge without BIG instruction.

---

### Task 1: RED — Observer local boundary and sanitizer

**Files:**
- Create: `tests/go-browser-local-observer.test.cjs`
- Later create: `go-browser-local-observer.js`

**Interfaces:**
- Produces `createObserverSession`, `collectObserverSnapshot`, `grantScreenshotConsent`, `consumeScreenshotConsent`, `sanitizePath`, `OBSERVER_STATUS`.

- [ ] Add failing tests covering inactive/expired sessions, Gumroad allowlist, URL query/fragment removal, sensitive/hidden/unknown redaction, explicit screenshot consent, stop-immediate semantics, and absence of action primitives.
- [ ] Open/update PR so STANDARD runs against test-only head.
- [ ] Verify RED is caused by the missing Observer implementation, not test setup.

### Task 2: GREEN — Local Observer implementation

**Files:**
- Create: `go-browser-local-observer.js`
- Create: `go-browser-observer-site-profile.js`
- Modify tests from Task 1 only when a test fixture is incorrect, never to weaken guards.

**Interfaces:**
- `createObserverSession({ sessionId, startedAt, ttlMs, origin }) -> controller`
- `collectObserverSnapshot({ document, location, title, viewport, session, now }) -> evidence packet | status`
- `grantScreenshotConsent(session) -> session state`
- `consumeScreenshotConsent(session) -> { allowed, code, session }`

- [ ] Implement classify-before-read semantics.
- [ ] Read only visible/relevant Gumroad elements.
- [ ] Emit safe values for title/name, description, price, and safe visible states.
- [ ] Emit metadata-only `UNKNOWN_REDACTED` for unconfirmed fields.
- [ ] Keep all sensitive/hidden/file-input values out of packet construction.
- [ ] Re-run PR CI and require local observer tests GREEN.

### Task 3: RED/GREEN — GO Hub observer ingress

**Files:**
- Create: `go-hub-browser-observer.js`
- Create: `tests/go-hub-browser-observer.test.cjs`
- Modify: `go-hub-edge-worker.mjs`

**Interfaces:**
- `createObserverIngress({ now })`
- `validateObserverPacket(packet, serverSession) -> { ok, code }`
- Dedicated routes under `/hub/api/browser/observer/*`.

- [ ] Add RED tests for invalid schema/session, stale timestamp, wrong fingerprint/page epoch, non-Gumroad origin, query/fragment presence, sensitive payload leakage, screenshot without consent, and wrong destination.
- [ ] Implement dedicated ingress without `BROWSER.quickAction()` and without reusing Cloud Browser `/read` semantics.
- [ ] Make Hub unavailable / misconfigured states fail closed.
- [ ] Re-run exact PR head CI to GREEN.

### Task 4: RED/GREEN — Separate Firefox Observer package

**Files:**
- Create: `browser-extension/go-browser-local-observer-v1/manifest.json`
- Create: `browser-extension/go-browser-local-observer-v1/content-script.js`
- Create: `browser-extension/go-browser-local-observer-v1/observer-panel.js`
- Create: `browser-extension/go-browser-local-observer-v1/observer-panel.css`
- Create: `tests/go-browser-observer-extension-boundary.test.cjs`
- Create: `scripts/build-go-browser-observer-extension.mjs`
- Modify: `package.json`

**Interfaces:**
- UI states: OFF / OBSERVING / EXPIRED.
- Buttons: Start Observer, Stop Observer, Observe now, One screenshot.

- [ ] Add RED boundary tests proving unique extension ID/package, Gumroad-only host scope, no Safe Fill imports, no action primitives, no cookies/storage/clipboard permissions, no `<all_urls>`, and at most `activeTab` for screenshot capture.
- [ ] Implement package and explicit owner UI.
- [ ] Ensure screenshot capture can only be called after one-shot consent and at most once per grant.
- [ ] Build observer artifact and keep Safe Fill build unchanged.

### Task 5: Full gate, PR evidence, signing

**Files:**
- Modify `.github/workflows/standard-safety-gate.yml` only if necessary to build/upload Observer review artifact while preserving existing Safe Fill artifact.
- Create/modify a manual Observer signing workflow if existing signing workflow cannot target the separate package safely.

- [ ] Run exact-head STANDARD Safety Gate via PR.
- [ ] Require all exact-head checks GREEN.
- [ ] Sign Observer XPI through authorized AMO secret-backed manual workflow.
- [ ] Record exact tested commit, signed artifact name and digest evidence available through Factory.
- [ ] Do not merge.

### Task 6: Stop at Android Reality retest

- [ ] Prepare acceptance checklist for Firefox Android + Gumroad real page.
- [ ] Stop before any action integration, Safe Fill invocation, submit/publish, autonomous browsing, merge, or host expansion.
- [ ] Report PASS/FAIL/UNKNOWN for each acceptance item based only on observed evidence.
