# GO Browser Interface V0 Implementation Plan

> **Status:** Implementation and review complete on feature branch; final exact-head gate / merge / deploy verification remain.

**Goal:** Add a cloud-first, read-only browser capability to GO Hub that returns a normalized Field Map from Cloudflare Browser Run without requiring a desktop computer.

**Final architecture:** `go-hub-edge-worker.mjs` owns only the exact browser namespace and delegates every non-browser request to the pre-existing `go-hub-worker.mjs`. `go-hub-browser-interface.js` owns target validation, Browser Run response normalization, Field Map creation, and conservative risk classification. Host policy is server-owned. Production V0 is Gumroad-only and reuses the existing GO Hub owner passcode authority.

**Tech stack:** JavaScript ES modules, Node `node:test`, Cloudflare Workers, Cloudflare Browser Run Quick Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-go-browser-interface-v0-design.md`

## Locked constraints

- V0 is read-only: no click, type, fill, submit, publish, payment, password, OTP, CAPTCHA, or autonomous multi-site navigation.
- Browser execution does not inherit `GITHUB_TOKEN` authority.
- Caller cannot supply or expand the hostname allowlist.
- V0 initial target policy: `gumroad.com`, `*.gumroad.com`.
- Production policy requires the existing `GOHUB_OWNER_PASSCODE`; missing/wrong authority fails before Browser Run.
- Embedded URL credentials are rejected.
- Browser Run failures, including `success:false` envelopes, become explicit `502 BROWSER_UPSTREAM_ERROR` responses.
- Unknown page evidence stays unknown.
- Browser API root is exact; lookalike namespaces delegate to the existing Worker.
- Quick Actions target policy is not a Browser Session network Guardrail.

---

## Task 1 — Browser Interface contract and Field Map

**Files:** `go-hub-browser-interface.js`, `tests/go-hub-browser-interface.test.cjs`

- [x] Wrote failing contract tests before implementation.
- [x] Confirmed RED with module absent; existing suite remained green.
- [x] Implemented HTTP(S) validation, exact/wildcard hostname matching, and Browser Run `snapshot`.
- [x] Implemented Markdown + accessibility-tree normalization.
- [x] Implemented deterministic V0 Field Map with semantic role, required/disabled state, value kind, options, risk class, and tree path.
- [x] Classified password/OTP/payment as `SENSITIVE`; insufficient evidence remains `UNKNOWN`.
- [x] Added URL-credential blocking.
- [x] Added thrown/non-OK/`success:false` upstream failure handling.

Key call:

```js
await browser.quickAction("snapshot", {
  url: target.toString(),
  formats: ["markdown", "accessibilityTree"],
  gotoOptions: { waitUntil, timeout: 30000 },
});
```

---

## Task 2 — Edge browser route and authority separation

**Files:** `go-hub-edge-worker.mjs`, `tests/go-hub-browser-worker.test.cjs`, `tests/go-hub-browser-owner-auth.test.cjs`

Initial plan proposed editing `go-hub-worker.mjs` directly. Reality inspection showed it is already the GitHub/workstation gateway, so implementation changed to a thin edge router rather than mixing authorities.

- [x] Wrote route tests before implementation and confirmed RED.
- [x] Added `POST /hub/api/browser/read` at the edge.
- [x] Preserved `go-hub-worker.mjs` as delegate for all non-browser traffic.
- [x] Browser route works without `GITHUB_TOKEN`.
- [x] Added fail-closed invalid JSON / missing binding / missing policy behavior.
- [x] Moved hostname authority from request body to server-owned `env.BROWSER_POLICY` after security review.
- [x] Proved caller-supplied allowlists cannot expand authority.
- [x] Added exact namespace regression; `/hub/api/browserfoo` delegates to existing Worker.
- [x] Reused existing `GOHUB_OWNER_PASSCODE` instead of creating another owner authority.
- [x] Added protected-policy tests: missing secret = 503; missing/wrong passcode = 403; correct passcode permits read.
- [x] Owner auth occurs before Browser Run and before parsing the request body.

---

## Task 3 — Cloudflare binding, production policy, repository gates

**Files:** `wrangler.go-hub.jsonc`, `package.json`, `tests/go-hub-cloudflare-routing.test.cjs`, `tests/go-hub-mcp-publication.test.cjs`

- [x] Wrote routing/binding assertions before configuration and confirmed RED.
- [x] Set Worker entry to `go-hub-edge-worker.mjs`.
- [x] Added Browser Run binding `BROWSER`.
- [x] Added `/hub/api/browser/*` to worker-first routing while preserving previous routes.
- [x] Added Gumroad-only `BROWSER_POLICY` with `requireOwnerPasscode: true`.
- [x] Added Browser Interface and edge Worker to syntax gate.
- [x] Updated stale publication contract after it exposed the old four-route expectation.
- [x] Confirmed owner-auth implementation/config Safety Gate GREEN on `df703aec6cf23d1c4a78f6fb283e2895df58ec1c`, run `34965328982`.
- [ ] Obtain fresh exact-head GREEN after final documentation commits.

---

## TDD / review evidence

Observed RED → GREEN checkpoints:

- Browser module missing: old suite passed; five new tests failed as intended.
- Browser module implementation: run `34963687063` GREEN.
- Browser route absent: route tests failed as intended.
- Edge router implementation: run `34963953412` GREEN.
- Cloudflare binding/routing absent: infrastructure test failed as intended.
- Config integration exposed one stale existing publication expectation; corrected rather than bypassed.
- Security review tests for server policy / URL credentials / upstream errors produced only intended failures; fixes followed.
- Gumroad policy requirement produced 252/253 pass; sole failure was missing `BROWSER_POLICY`; fixed.
- Exact-head `754a23c1b3afc180647e42005b3a44252d99471f`: run `34964678655` GREEN.
- Namespace review found `/hub/api/browserfoo` interception; regression test RED then boundary fixed.
- Browser Run `success:false` envelope regression: run `34965045769` RED as intended; fix produced run `34965111628` GREEN.
- Owner authority regression/policy: run `34965237760` RED as intended; implementation/config produced run `34965328982` GREEN.

## Remaining finish line

- [ ] Fresh exact-head full repository Safety Gate GREEN after docs.
- [ ] Fresh PR diff review for Critical / Important issues.
- [ ] Refresh `main` and PR mergeability.
- [ ] Mark PR #47 ready and merge only with current-head evidence.
- [ ] Verify main Safety Gate and GO Hub Deploy on merge SHA.
- [ ] Attempt non-destructive authenticated production Browser Run read if a secure invocation path is available.
- [ ] If authenticated production read cannot be exercised without exposing the owner secret, record it as unproven rather than claiming Product Verify.
- [ ] Update Notion GO Hub handoff with final SHA/run/deploy/reality status.
