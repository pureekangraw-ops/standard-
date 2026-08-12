# NormalPocket 1.3.1 Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a presentation-only 1.3.1 patch that removes duplicated first-run UI, hides empty summary cards, and tightens quick-sale helper typography on mobile.

**Architecture:** Keep all behavior in the existing `normalpocket-simple-flow.js` home authority and `normalpocket-simple-flow.css`. Do not change durable state, catalog ownership, Store/Ledger/Calendar/Vault semantics, or Worker targeting. Release metadata is bumped consistently to 1.3.1.

**Tech Stack:** Vanilla JavaScript, CSS, Node test runner, GitHub Actions, Cloudflare Workers Builds.

## Global Constraints
- Product version: `1.3.1`.
- Service-worker release: `v1.3.1-20260812-r6-mobile-polish`.
- Worker target remains `normalpocket`.
- `ygph-metropolis` remains read-only and untouched.
- Stop at READY AT GATE; do not merge `main` in this phase.

---

### Task 1: Lock the mobile polish contract with RED tests

**Files:**
- Modify: `tests/one-hand-mobile-flow.test.cjs`
- Modify: `tests/publication-contract.test.cjs`

**Interfaces:**
- Consumes: rendered source contract in `normalpocket-simple-flow.js` and `normalpocket-simple-flow.css`.
- Produces: regression assertions for first-run de-duplication, empty summary visibility, one-line helper copy, and 1.3.1 identity.

- [ ] **Step 1: Write failing tests**

Add assertions equivalent to:
```js
assert.doesNotMatch(source, /data-np-first="quick"/);
assert.match(source, /npTodayStrip\.hidden\s*=\s*!summaryVisible/);
assert.match(source, /ราคา · จำนวน · รับเงิน/);
assert.match(css, /\.np-action small\{[^}]*white-space:nowrap/);
assert.match(source, /const VERSION = "1\.3\.1"/);
```

- [ ] **Step 2: Run the deploy gate and verify RED**

Run: `npm run deploy:gate`
Expected: FAIL only on the new 1.3.1 assertions while existing behavior remains green.

- [ ] **Step 3: Commit the RED contract**

Commit message: `test: lock NormalPocket 1.3.1 mobile polish`

### Task 2: Implement the minimal home-screen polish

**Files:**
- Modify: `normalpocket-simple-flow.js`
- Modify: `normalpocket-simple-flow.css`

**Interfaces:**
- Consumes: `quickMetrics()` output `{ sales, cash, stock, tasks, productCount }`.
- Produces: compact first-run markup and `summaryVisible` UI state only; no durable state mutation.

- [ ] **Step 1: Remove the duplicate first-run quick-sale button**

First-run markup must contain only:
```html
<button type="button" data-np-first="add">เพิ่มสินค้าแรก</button>
```
Remove the `data-np-first="quick"` event binding.

- [ ] **Step 2: Make the empty summary conditional**

After `quickMetrics()`:
```js
const summaryVisible = metrics.productCount > 0 || metrics.sales !== 0 || metrics.cash !== 0 || metrics.stock !== 0 || metrics.tasks > 0;
const npTodayStrip = document.getElementById("npTodayStrip");
if (npTodayStrip) npTodayStrip.hidden = !summaryVisible;
```
Give the strip `id="npTodayStrip"` in markup.

- [ ] **Step 3: Tighten quick-sale helper copy and typography**

Use:
```html
<small>ราคา · จำนวน · รับเงิน</small>
```
and ensure `.np-action small` has `white-space:nowrap` on normal phone widths, with a safe small font size that fits the two-column action cards.

- [ ] **Step 4: Run the deploy gate and verify GREEN**

Run: `npm run deploy:gate`
Expected: all tests pass, syntax/UTF-8/no-RIDE pass.

- [ ] **Step 5: Commit implementation**

Commit message: `fix: compact empty NormalPocket home`

### Task 3: Publish 1.3.1 consistently

**Files:**
- Modify: `package.json`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`
- Modify any version-locking tests or visible version copy required by the existing publication contract.

**Interfaces:**
- Produces: one release identity, `NormalPocket 1.3.1`, with service-worker release `v1.3.1-20260812-r6-mobile-polish`.

- [ ] **Step 1: Update release metadata**

Set package/app release to `1.3.1` and SW release to `v1.3.1-20260812-r6-mobile-polish` without changing state schema or Worker name.

- [ ] **Step 2: Run full deploy gate**

Run: `npm run deploy:gate`
Expected: PASS.

- [ ] **Step 3: Commit release metadata**

Commit message: `chore: publish NormalPocket 1.3.1 metadata`

### Task 4: Finalize checksum and gate evidence

**Files:**
- Modify: `SHA256SUMS.txt`
- Create no permanent workflow or trigger files.

**Interfaces:**
- Produces: final tracked release tree with matching checksums and a single final head SHA.

- [ ] **Step 1: Regenerate `SHA256SUMS.txt` from the final tracked tree**
- [ ] **Step 2: Verify checksums and run `npm run deploy:gate` on the final tree**
- [ ] **Step 3: Open a Draft PR against `main`**
- [ ] **Step 4: Wait for `STANDARD regression safety gate` and `Workers Builds: normalpocket` to both succeed on the exact same final head SHA**
- [ ] **Step 5: Audit changed filenames for temporary files and verify `wrangler.jsonc` still targets `normalpocket`**
- [ ] **Step 6: Report `READY AT GATE` and stop without merge**
