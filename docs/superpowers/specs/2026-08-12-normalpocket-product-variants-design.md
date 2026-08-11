# NormalPocket Product Catalog + Variants Design

Date: 2026-08-12
Status: Owner-approved direction, written design for implementation review
Source upstream (read-only): `pureekangraw-ops/ygph-metropolis`
Target repository: `pureekangraw-ops/standard-`
Deployment target: Cloudflare Worker `normalpocket`

## Goal

Evolve STANDARD into a general-purpose NormalPocket retail baseline that can be used by many kinds of small shops, while keeping the app simple for shops that do not need advanced inventory features.

The first product-catalog upgrade adds standard product fields and optional product variants. The primary variant dimensions are **color** and **size**, with a generic option model that can later support other attributes such as material, flavor, capacity, or style without another data-model rewrite.

## Product principle

NormalPocket is a basic, reusable store app — not a copy of one owner's METROPOLIS workflow.

Keep shared, proven engineering improvements from METROPOLIS only when they are generic to Store / Ledger / Calendar / persistence / safety / offline use. Do not copy RIDE, owner-specific dashboards, owner runtime data, personal defaults, or business-specific assumptions.

METROPOLIS is read-only upstream reference. All writes for this feature happen only in `pureekangraw-ops/standard-`.

## User model

A product has one stable product identity and may have zero or more sellable variants.

### Base product fields

Required:

- `id`
- `name`
- `salePriceSatang`
- `active`

Standard optional fields:

- `category`
- `costSatang`
- `unit`
- `sku`
- `barcode`
- `description`
- `imageRef` (metadata/reference only in this pass; no new image-upload subsystem)

Inventory:

- A simple product with no variants keeps one `stockQty`.
- A product with variants tracks stock at variant level; the base product stock is derived from the sum of active variant stock and is not an independent competing inventory truth.

## Variant model

Variants are optional. A shop that sells one undifferentiated item should see the same simple product flow it has today.

A variant contains:

- `id` — stable variant identity within the product
- `options` — normalized key/value map, initially `color` and/or `size`
- `sku` — optional per-variant SKU
- `barcode` — optional per-variant barcode
- `salePriceSatang` — optional override; when absent, inherit product sale price
- `costSatang` — optional override; when absent, inherit product cost
- `stockQty` — integer quantity owned by this variant
- `active`

Example:

```json
{
  "id": "product-shirt-basic",
  "name": "เสื้อยืด Basic",
  "salePriceSatang": 19900,
  "stockQty": 0,
  "variants": [
    {
      "id": "variant-black-s",
      "options": { "color": "ดำ", "size": "S" },
      "stockQty": 5,
      "active": true
    },
    {
      "id": "variant-black-m",
      "options": { "color": "ดำ", "size": "M" },
      "stockQty": 2,
      "active": true
    }
  ],
  "active": true
}
```

## UI design

### Product list

Each product row/card shows the minimum useful retail information:

- product name
- category when present
- sale price (or price range when variants have overrides)
- total available stock
- concise variant summary when variants exist, e.g. `2 สี · 4 ขนาด · 8 แบบ`
- active/inactive state

Do not show every optional metadata field in the main list.

### Add/edit product

The form is progressive:

1. Basic section is immediately visible:
   - name
   - category
   - sale price
   - cost
   - stock quantity
   - unit
2. `สินค้ามีตัวเลือก` toggle reveals variant controls.
3. Initial option controls are:
   - color values
   - size values
4. The app generates unique color × size combinations.
5. Each generated combination lets the user set stock and optional SKU/barcode/price override.
6. Advanced metadata (`description`, product SKU/barcode, image reference) stays in a collapsible/secondary section so the basic flow remains short.

When variants are enabled, the simple base stock input stops being the write owner and becomes a derived total/read-only display.

## Sales / stock behavior

A sale line must resolve exactly one inventory owner:

- no variants → product `stockQty`
- variants → selected variant `stockQty`

If a product has variants, selling the base product without selecting a required variant is invalid.

Stock changes must remain atomic with the existing retained Store/Ledger durable command path. The feature must not create a second transaction ledger or a second stock authority.

## Persistence and compatibility

Keep STANDARD's existing database identity and Vault format unless implementation evidence proves an unavoidable migration requirement.

Existing products without `variants` remain valid and normalize to `variants: []` at runtime. This should be backward-compatible within STANDARD's current state schema wherever possible.

Do not import METROPOLIS owner data or RIDE records. No executable RIDE references may be reintroduced.

## Generic METROPOLIS improvements to port

Use the current METROPOLIS implementation only as a source of proven generic patterns. Candidate improvements for this pass:

1. **Runtime composition safety** — avoid classic-script global collisions and keep extension internals private.
2. **Durable UI guard** — disable the actual initiating control before asynchronous durable writes and restore its prior state on success/failure.
3. **Storage-capacity preflight** — detect likely quota failure before Vault writes and preserve evidence rather than deleting history automatically.
4. **Progressive forms** — reveal optional details only when needed; keep the primary product flow short.
5. **Manifest-driven validation / locked dependency install** — CI uses a lockfile and `npm ci` before the deploy gate.
6. **Single deployment authority** — GitHub Actions is the only official deploy authority for `standard-`; Cloudflare Git integration must remain disconnected; deployment target is only `normalpocket`.

Only port a candidate after mapping it to a retained STANDARD owner and writing a regression test. Do not wholesale-copy METROPOLIS layers or RIDE-dependent files.

## Validation

The feature must add focused tests for:

- legacy/simple product normalization
- color-only variants
- size-only variants
- color × size combination generation
- duplicate option/combination rejection
- per-variant stock ownership
- product stock total derivation
- variant price fallback / override
- required variant selection during sale
- durable-write UI guard on product save / stock mutation
- import/export round-trip for retained product + variant data
- no executable RIDE references
- Service Worker / release manifest publication consistency

All existing `npm run deploy:gate` checks must remain green.

## Deployment design

The target repository is `pureekangraw-ops/standard-` and the only Worker target is `normalpocket`.

The deployment flow should match the proven METROPOLIS pattern while remaining product-specific:

`PR/push -> npm ci -> npm run deploy:gate -> (main push only) Cloudflare Wrangler deploy -> normalpocket`

Never deploy to, rename, write to, or change configuration for the METROPOLIS repository/Worker.

## Success criteria

- A new user can add a normal product without touching variants.
- A clothing-style shop can create color/size variants and track each combination separately.
- Variant stock cannot silently mutate base product stock as a second truth.
- Existing STANDARD products continue to load.
- Store, Ledger, Calendar, Vault, import/export, and offline behavior remain intact.
- Generic safety improvements are ported with tests, not by copying owner-specific METROPOLIS behavior.
- RIDE remains absent from executable STANDARD code.
- GitHub is the sole deployment authority for `normalpocket`.
- METROPOLIS is never modified by this work.

## Non-goals for this pass

- Supplier management
- purchase orders
- tax engines
- shipping rates or parcel dimensions
- marketplaces / online storefront synchronization
- multi-location inventory
- complex product bundles
- per-variant images
- RIDE
- copying personal METROPOLIS runtime data or owner-only behavior
