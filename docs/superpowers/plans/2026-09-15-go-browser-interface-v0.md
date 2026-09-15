# GO Browser Interface V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cloud-first, read-only browser capability to GO Hub that returns a normalized Field Map from Cloudflare Browser Run without requiring a desktop computer.

**Architecture:** A focused `go-hub-browser-interface.js` owns URL policy, Browser Run response normalization, field mapping, and risk classification. `go-hub-worker.mjs` exposes a separate `/hub/api/browser/read` route that delegates to this module through `env.BROWSER.quickAction`, while `wrangler.go-hub.jsonc` supplies the Browser Run binding and routes browser API traffic through the Worker.

**Tech Stack:** JavaScript ES modules, Node `node:test`, Cloudflare Workers, Cloudflare Browser Run Quick Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-go-browser-interface-v0-design.md`

## Global Constraints

- V0 is read-only: no click, type, fill, submit, publish, payment, password, OTP, CAPTCHA, or autonomous multi-site navigation.
- Target URL must be HTTP(S) and must satisfy an explicit non-empty hostname policy before Browser Run is called.
- The browser route is independent from GitHub credentials and must work without `GITHUB_TOKEN`.
- Missing Browser Run binding fails closed with `503 BROWSER_NOT_CONFIGURED`.
- Unknown page evidence stays unknown; the mapper must not invent fields.
- Browser API root is `/hub/api/browser`.

---

### Task 1: Browser Interface contract and Field Map

**Files:**
- Create: `go-hub-browser-interface.js`
- Create: `tests/go-hub-browser-interface.test.cjs`

**Interfaces:**
- Produces: `createBrowserInterface({ browser })`
- Produces: `readPage({ url, allowedHostnames, waitUntil }) -> Promise<Response>`
- Produces: `mapAccessibilityTree(tree) -> { fields, unknowns }`

- [ ] **Step 1: Write failing contract tests**

Create tests that import the new module and assert:

```js
const service = createBrowserInterface({ browser });
const response = await service.readPage({
  url: "https://shop.example.com/product/new",
  allowedHostnames: ["shop.example.com"],
});
```

Expected behavior:

```js
assert.equal(response.status, 200);
assert.deepEqual(browser.calls[0], {
  action: "snapshot",
  options: {
    url: "https://shop.example.com/product/new",
    formats: ["markdown", "accessibilityTree"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 30000 },
  },
});
```

Add field-map assertions for a tree containing textbox `Product name`, textbox `Description`, spinbutton `Price`, textbox `Password`, textbox `OTP code`, and combobox `Category`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test tests/go-hub-browser-interface.test.cjs
```

Expected: FAIL because `go-hub-browser-interface.js` does not exist.

- [ ] **Step 3: Implement URL policy and Browser Run adapter call**

Implement exact-host and wildcard-subdomain matching. Reject malformed URLs, non-HTTP(S), empty policies, and disallowed hosts before calling Browser Run.

Call:

```js
await browser.quickAction("snapshot", {
  url: target.toString(),
  formats: ["markdown", "accessibilityTree"],
  gotoOptions: { waitUntil, timeout: 30000 },
});
```

Normalize both direct Worker-binding payloads and `{ success, result, meta }` JSON envelopes.

- [ ] **Step 4: Implement deterministic field mapping and conservative risk classification**

Walk the accessibility tree recursively. Editable roles are:

```js
new Set(["textbox", "searchbox", "combobox", "checkbox", "radio", "spinbutton", "slider", "switch"])
```

Use the accessibility-tree child-index path as the V0 `fieldId` source. Infer semantic roles only from explicit accessible names and return `unknown` when evidence is insufficient.

Sensitive keywords include password/passcode, otp/one-time/verification code, card/cvv/cvc/bank/account number. Action keywords include publish, submit, purchase, buy, pay, confirm, place order.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run:

```bash
node --test tests/go-hub-browser-interface.test.cjs
```

Expected: PASS.

---

### Task 2: Worker browser route

**Files:**
- Modify: `go-hub-worker.mjs`
- Create: `tests/go-hub-browser-worker.test.cjs`

**Interfaces:**
- Consumes: `createBrowserInterface({ browser })`
- Produces: `POST /hub/api/browser/read`

- [ ] **Step 1: Write failing Worker tests**

Create tests using `createWorkerHandler()` with a fake `env.BROWSER` and no `GITHUB_TOKEN`.

Request:

```js
new Request("https://hub.example/hub/api/browser/read", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: "https://shop.example.com/product/new",
    allowedHostnames: ["shop.example.com"],
  }),
});
```

Assert `200`, normalized fields, and exactly one Browser Run call. Add tests for missing Browser binding (`503`) and invalid JSON (`400`).

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test tests/go-hub-browser-worker.test.cjs
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Integrate a separate browser API root before GitHub-token gating**

Add:

```js
import { createBrowserInterface } from "./go-hub-browser-interface.js";
const BROWSER_API_ROOT = "/hub/api/browser";
```

Handle `/hub/api/browser/read` before the existing `GITHUB_TOKEN` requirement. Browser capability must not inherit source-control authority.

- [ ] **Step 4: Run browser Worker tests and existing workstation tests**

Run:

```bash
node --test tests/go-hub-browser-worker.test.cjs tests/go-hub-worker-workstation.test.cjs
```

Expected: PASS.

---

### Task 3: Cloudflare Browser Run binding and repository gates

**Files:**
- Modify: `wrangler.go-hub.jsonc`
- Modify: `package.json`
- Test: `tests/go-hub-cloudflare-routing.test.cjs`

**Interfaces:**
- Produces: Cloudflare binding `env.BROWSER`
- Produces: worker-first routing for `/hub/api/browser/*`

- [ ] **Step 1: Extend the Cloudflare routing test to fail until browser routing/binding exists**

Assert the config contains:

```json
"browser": { "binding": "BROWSER" }
```

and `assets.run_worker_first` contains `/hub/api/browser/*`.

- [ ] **Step 2: Run the focused routing test and confirm RED**

Run:

```bash
node --test tests/go-hub-cloudflare-routing.test.cjs
```

Expected: FAIL on missing Browser binding/route.

- [ ] **Step 3: Update Wrangler and syntax coverage**

Add the Browser binding and route. Add `go-hub-browser-interface.js` to the `check:syntax` script using:

```bash
node --input-type=module --check < go-hub-browser-interface.js
```

Do not add a Browser Run API token or client-side secret.

- [ ] **Step 4: Run full repository gate**

Run:

```bash
npm run deploy:gate
```

Expected: all tests, syntax, UTF-8, and no-ride gates pass.

- [ ] **Step 5: Open PR with exact-head evidence**

Open a PR from `feat/go-browser-interface-v0` to `main`. Merge only after exact-head CI is green. Deployment success is not product verification; production Browser Run read remains a separate Reality smoke because it depends on the account Browser Run binding being available.
