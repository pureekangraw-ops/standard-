# GO Browser Interface V0 Implementation Plan

> **Status:** Implementation complete on feature branch; final exact-head gate / merge / production verification remain.

**Goal:** Add a cloud-first, read-only browser capability to GO Hub that returns a normalized Field Map from Cloudflare Browser Run without requiring a desktop computer.

**Final architecture:** `go-hub-edge-worker.mjs` owns only the browser namespace and delegates every non-browser request to the pre-existing `go-hub-worker.mjs`. `go-hub-browser-interface.js` owns target validation, Browser Run response normalization, Field Map creation, and conservative risk classification. Host policy is server-owned via `env.BROWSER_POLICY`; V0 production policy is Gumroad only.

**Tech stack:** JavaScript ES modules, Node `node:test`, Cloudflare Workers, Cloudflare Browser Run Quick Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-go-browser-interface-v0-design.md`

## Locked constraints

- V0 is read-only: no click, type, fill, submit, publish, payment, password, OTP, CAPTCHA, or autonomous multi-site navigation.
- Browser execution does not inherit `GITHUB_TOKEN` authority.
- Caller cannot supply or expand the hostname allowlist.
- V0 initial target policy: `gumroad.com`, `*.gumroad.com`.
- Embedded URL credentials are rejected.
- Browser Run failures become explicit `502 BROWSER_UPSTREAM_ERROR` responses.
- Unknown page evidence stays unknown.
- Browser API root is exact; lookalike namespaces delegate to the existing Worker.
- Quick Actions target policy is **not** represented as a Cloudflare Browser Session Guardrail. True network guardrails require a later Browser Session execution path.

---

## Task 1 — Browser Interface contract and Field Map

**Files:**
- `go-hub-browser-interface.js`
- `tests/go-hub-browser-interface.test.cjs`

- [x] Wrote failing contract tests before implementation.
- [x] Confirmed RED with the new module absent: existing tests passed; five new Browser Interface tests failed as expected.
- [x] Implemented HTTP(S) validation, exact/wildcard hostname matching, and Browser Run `snapshot` call.
- [x] Implemented Markdown + accessibility-tree response normalization.
- [x] Implemented deterministic V0 Field Map with semantic role, required/disabled state, value kind, options, risk class, and tree path.
- [x] Classified password/OTP/payment fields as `SENSITIVE`; insufficient evidence remains `UNKNOWN`.
- [x] Added URL-credential blocking and explicit upstream exception handling.
- [x] Confirmed focused and repository tests GREEN after implementation.

Key Browser Run call:

```js
await browser.quickAction("snapshot", {
  url: target.toString(),
  formats: ["markdown", "accessibilityTree"],
  gotoOptions: { waitUntil, timeout: 30000 },
});
```

---

## Task 2 — Edge browser route and authority separation

**Files:**
- `go-hub-edge-worker.mjs`
- `tests/go-hub-browser-worker.test.cjs`

Initial plan proposed editing `go-hub-worker.mjs` directly. Reality inspection showed that file is already the GitHub/workstation gateway, so implementation changed to a thin edge router rather than mixing authorities.

- [x] Wrote route tests before route implementation and confirmed RED.
- [x] Added `POST /hub/api/browser/read` at the edge.
- [x] Preserved `go-hub-worker.mjs` unchanged as the delegate for all non-browser traffic.
- [x] Browser route works without `GITHUB_TOKEN`.
- [x] Added fail-closed handling for invalid JSON, missing Browser binding, and missing server policy.
- [x] Moved hostname authority from request body to server-owned `env.BROWSER_POLICY` after security review.
- [x] Added regression coverage proving caller-supplied allowlists cannot expand authority.
- [x] Added regression coverage for exact browser namespace ownership; `/hub/api/browserfoo` must delegate to the existing Worker.

---

## Task 3 — Cloudflare binding, production policy, repository gates

**Files:**
- `wrangler.go-hub.jsonc`
- `package.json`
- `tests/go-hub-cloudflare-routing.test.cjs`
- `tests/go-hub-mcp-publication.test.cjs`

- [x] Wrote routing/binding assertions before configuration and confirmed RED.
- [x] Set Worker entry to `go-hub-edge-worker.mjs`.
- [x] Added Browser Run binding `BROWSER`.
- [x] Added `/hub/api/browser/*` to worker-first routing while preserving all previous worker-first routes.
- [x] Added server-owned Gumroad V0 `BROWSER_POLICY`.
- [x] Added Browser Interface and edge Worker to syntax gate.
- [x] Updated existing publication contract after it correctly exposed a stale four-route expectation.
- [x] Full repository Safety Gate reached GREEN before the final namespace review (`754a23c1b3afc180647e42005b3a44252d99471f`, run `34964678655`).
- [ ] Obtain fresh exact-head GREEN after final namespace + documentation commits.

---

## TDD / review evidence

Observed RED → GREEN checkpoints:

- Browser module missing: old suite passed; five new tests failed as intended.
- Browser module implemented: Safety Gate run `34963687063` GREEN.
- Browser route absent: route tests failed as intended.
- Edge router implemented: Safety Gate run `34963953412` GREEN.
- Cloudflare binding/routing absent: infrastructure test failed as intended.
- Config added: one stale existing publication expectation was exposed and corrected rather than bypassed.
- Security review: new server-policy / URL-credential / upstream-error tests produced only the intended failures; fixes followed.
- Gumroad policy requirement: 252/253 tests passed; sole failure was missing `vars.BROWSER_POLICY`; config fix followed.
- Exact-head `754a23c1b3afc180647e42005b3a44252d99471f`: Safety Gate run `34964678655` GREEN.
- Namespace review found `/hub/api/browserfoo` interception; a regression test was added and confirmed RED before the boundary fix.

## Remaining finish line

- [ ] Fresh exact-head full repository Safety Gate GREEN.
- [ ] Review current PR diff for Critical / Important issues.
- [ ] Refresh `main` and PR mergeability.
- [ ] Mark PR #47 ready and merge only with current-head evidence.
- [ ] Verify main Safety Gate and GO Hub Deploy on the merge SHA.
- [ ] Attempt non-destructive production Browser Run read against an allowed Gumroad URL.
- [ ] If production read cannot be exercised from the available runtime, record that explicitly rather than treating deployment as product verification.
- [ ] Update Notion GO Hub handoff with final SHA/run/deploy/reality status.
