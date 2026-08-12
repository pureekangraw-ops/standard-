# NormalPocket Product Catalog + Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general-purpose product catalog to NormalPocket with optional color/size variants, one quantity owner per sellable item, backward-compatible STANDARD data, and GitHub-only deployment to `normalpocket`.

**Architecture:** Keep State Schema 4 and Vault format 1. Add a pure private-IIFE catalog core that is both CommonJS-testable and browser-global, then add a thin Store runtime adapter loaded after `app.js`; the adapter reuses existing durable Store/Ledger/Calendar helpers rather than creating a second ledger or persistence path. Existing aggregate stock becomes a derived compatibility total; legacy unallocated stock is migrated into one deterministic `PRODUCT-LEGACY-STOCK` product so quantity has exactly one owner.

**Tech Stack:** Vanilla JavaScript classic scripts, Node 22 built-in test runner, existing encrypted IndexedDB Vault, Service Worker offline shell, GitHub Actions, Cloudflare Wrangler.

## Global Constraints

- Write only to `pureekangraw-ops/standard-`; `pureekangraw-ops/ygph-metropolis` is read-only reference.
- Deploy target is only Cloudflare Worker `normalpocket`.
- No executable RIDE domain may return.
- State Schema remains `4`; DB remains `ygph-standard-secure` version `1`; Vault format remains `1`.
- Existing simple products and old aggregate stock must continue to load.
- A product with variants owns quantity only at variant level; base product quantity is derived.
- Ledger transaction ownership, Calendar ownership, encrypted Vault, rollback/readback, and existing durable commit path remain authoritative.
- Product images are metadata/reference only in this pass.
- NormalPocket remains a basic reusable shop app; no supplier, purchase-order, tax, shipping, marketplace, or multi-location subsystem.

## File map

- Create `normalpocket-catalog-core.js` — pure normalization, option combination, stock-owner, price and catalog-total rules.
- Create `normalpocket-products.js` — Store UI/runtime adapter that uses existing app helpers and durable persistence.
- Create `normalpocket-products.css` — compact progressive product/variant UI.
- Create `tests/product-catalog.test.cjs` — behavioral catalog contracts.
- Create `tests/product-runtime-contract.test.cjs` — publication/runtime integration contracts.
- Modify `index.html` — load product runtime after `app.js` and product CSS.
- Modify `sw.js` — cache new production assets under a new NormalPocket release generation.
- Modify `RELEASE_MANIFEST.json` — publish NormalPocket 1.1 catalog release and exact upstream reference.
- Modify `package.json` — syntax-gate the new runtime files and advance product version.
- Modify `.github/workflows/standard-safety-gate.yml` — install locked dependencies when lockfile is present and deploy `main` only after gate success.
- Modify `UPLOAD_GUIDE.md` / `README_TH.md` — document single GitHub deployment authority and general-purpose catalog.

---

### Task 1: Catalog core contracts

**Files:**
- Create: `tests/product-catalog.test.cjs`
- Create: `normalpocket-catalog-core.js`

**Interfaces:**
- Produces `NormalPocketCatalog.normalizeStore(store)`, `generateVariants(optionValues)`, `productStockQty(product)`, `catalogStockQty(store)`, `resolveStockOwner(product, variantId)`, `effectiveSalePriceSatang(product, variant)`, `adjustStock(product, variantId, delta)`.

- [ ] **Step 1: Write RED tests** covering legacy stock migration, simple product normalization, color-only, size-only, color × size generation, duplicate option removal, variant stock totals, price fallback/override and required variant selection.
- [ ] **Step 2: Commit RED tests and observe the PR safety gate fail because `normalpocket-catalog-core.js` is missing.**
- [ ] **Step 3: Implement the smallest pure IIFE/CommonJS core.** The browser export must be `globalThis.NormalPocketCatalog`; internal names must not leak.
- [ ] **Step 4: Re-run the PR gate and require all catalog tests to pass.**

Core normalization rules:

```js
store.products = Array.isArray(store.products) ? store.products : [];
if (store.products.length === 0 && Number(store.stockQty || 0) > 0) {
  store.products.push({
    id: "PRODUCT-LEGACY-STOCK",
    name: "สินค้าคงเหลือเดิม",
    salePriceSatang: 0,
    costSatang: null,
    stockQty: Number(store.stockQty),
    variants: [],
    active: true,
    legacyImported: true
  });
}
store.stockQty = catalogStockQty(store);
```

`generateVariants({ color: ["ดำ", "ขาว"], size: ["S", "M"] })` must return four unique combinations. If only one dimension is supplied, it returns that dimension only. Empty options return `[]`.

---

### Task 2: Store runtime adapter and progressive product UI

**Files:**
- Create: `normalpocket-products.js`
- Create: `normalpocket-products.css`
- Create: `tests/product-runtime-contract.test.cjs`

**Interfaces:**
- Consumes global classic-script bindings from `app.js`: `state`, `defaultState`, `normalizeState`, `renderStore`, `openModal`, `closeModal`, `persistAndRender`, `toast`, `byId`, `money`, `satangToBaht`, `parseMoneyToSatang`, `parseQuantity`, `takeStockFromPool`, `addTransaction`, `addQueue`, `addAudit`, `uid`, `nowIso`, `localISO`.
- Produces product list UI, add/edit product flow, and enhanced sale/purchase/withdraw flows that write one selected stock owner and reuse the existing durable persistence route.

- [ ] **Step 1: Write RED source/runtime contract tests** requiring private-IIFE runtime, product-list renderer, variant-required sale validation, stock-owner adjustment, and wrappers for `defaultState`, `normalizeState`, and `renderStore`.
- [ ] **Step 2: Implement `normalpocket-products.js`** as an IIFE. Wrap `defaultState` and `normalizeState` so catalog normalization occurs before existing invariants/persistence. Wrap `renderStore` so catalog totals and product cards refresh with the rest of Store.
- [ ] **Step 3: Build product UI dynamically** inside `#storePage` so `index.html` needs no new permanent product markup. Add `รายการสินค้า` card, `เพิ่มสินค้า` button and per-product edit button.
- [ ] **Step 4: Add progressive product form** with name/category/sale price/cost/unit/stock visible first; `สินค้ามีตัวเลือก` reveals color and size; advanced SKU/barcode/description/imageRef stays collapsed.
- [ ] **Step 5: Override Store sale/purchase/withdraw button handlers** after app initialization. Each action requires a product; variant products require a variant. Quantity updates use `NormalPocketCatalog.adjustStock`; global `state.store.stockQty` is recomputed from catalog after the mutation. Existing global stock value/cost pool and Ledger/Calendar helpers remain unchanged.
- [ ] **Step 6: Persist `productId`, `variantId`, and option snapshot on sale/purchase/withdraw records** for auditability without changing historical records.

---

### Task 3: Publication, offline shell and compatibility

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `package.json`
- Test: `tests/product-runtime-contract.test.cjs`

**Interfaces:**
- New release identity: `NormalPocket / YGPH STANDARD 1.1.0`.
- New service worker release: `v1.1.0-20260812-r3-product-catalog`.
- Upstream engineering reference: METROPOLIS main `874cca49624a43a09b48c5155131f974e8d91b61` (read-only reference; no code write).

- [ ] **Step 1: Add RED publication tests** requiring `normalpocket-catalog-core.js`, `normalpocket-products.js`, and `normalpocket-products.css` in the manifest/offline shell and requiring catalog core to load before product runtime.
- [ ] **Step 2: Load catalog core before `app.js`, and product runtime after `app.js`; load product CSS.**
- [ ] **Step 3: Advance release metadata/version and add new files to `productionFiles` and Service Worker app shell.**
- [ ] **Step 4: Add both new JS files to `npm run check:syntax`.**
- [ ] **Step 5: Verify no executable RIDE references are introduced and existing deploy gate stays green.**

---

### Task 4: GitHub-only `normalpocket` deployment authority

**Files:**
- Modify: `.github/workflows/standard-safety-gate.yml`
- Modify: `UPLOAD_GUIDE.md`
- Modify: `README_TH.md`
- Test: `tests/product-runtime-contract.test.cjs`

**Interfaces:**
- PR: safety gate only.
- Push to `main`: safety gate, then Cloudflare Wrangler deploy.
- Worker is fixed by `wrangler.jsonc` as `normalpocket`.

- [ ] **Step 1: Add a RED workflow contract test** requiring deploy to depend on `safety-gate`, run only for pushes to `main`, use `cloudflare/wrangler-action@v3`, and consume only `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.
- [ ] **Step 2: Add deploy job** matching the proven METROPOLIS pattern but with STANDARD/NormalPocket naming.
- [ ] **Step 3: Document GitHub Actions as the sole deployment authority and require Cloudflare Builds Git integration to remain disconnected.**
- [ ] **Step 4: Do not merge/deploy until the PR gate is green and repository secrets are confirmed by a successful deploy run.**

---

### Task 5: Final verification and release handoff

**Files:**
- Modify: `SHA256SUMS.txt`
- Modify: `RELEASE_MANIFEST.json`
- Update this plan checkboxes/results.

- [ ] **Step 1: Run/observe complete PR safety gate:** `npm test`, syntax, UTF-8, no-RIDE.
- [ ] **Step 2: Verify focused product scenarios:** simple product, color only, size only, color × size, variant stock decrement, legacy stock migration, price override, product data backup JSON round-trip.
- [ ] **Step 3: Verify GitHub diff contains no changes to `ygph-metropolis` and no deployment target other than `normalpocket`.**
- [ ] **Step 4: Regenerate/check SHA256 publication list for production files.**
- [ ] **Step 5: Keep PR draft until verification is complete; then mark ready for owner merge decision.**
