# NormalPocket 1.3.1 Mobile Polish Design

## Goal
Reduce vertical waste on the real mobile home screen without adding features or changing durable data ownership.

## Approved UI changes
- Keep the five daily actions and their current order.
- Keep `ขายสินค้า` as the full-width primary action.
- When there are no products, show one compact first-run hint with one button: `เพิ่มสินค้าแรก`.
- Do not duplicate `ขายด่วน` inside first-run; the normal `ขายด่วน` action remains directly below.
- Shorten the quick-sale helper copy to `ราคา · จำนวน · รับเงิน` and keep it on one line on normal phone widths.
- Hide the four-card today summary only while the shop is genuinely empty: no active products and all four displayed metrics are zero. Show it as soon as a product exists or any metric is non-zero.

## Architecture
This is a presentation-only patch in the existing NormalPocket simple-flow layer. `normalpocket-simple-flow.js` remains the authority for home markup and visibility state; `normalpocket-simple-flow.css` handles compact layout and typography. No Store, Ledger, Calendar, Vault, catalog, migration, schema, or transaction rules change.

## Release contract
- Product version: `1.3.1`.
- Service-worker release: `v1.3.1-20260812-r6-mobile-polish`.
- Worker target remains `normalpocket`.
- `ygph-metropolis` remains read-only and untouched.

## Verification
Use RED → GREEN tests for first-run de-duplication, empty-summary visibility, quick-sale helper typography/copy, and 1.3.1 publication metadata. Run the complete deploy gate plus Cloudflare branch preview on the same final head. Stop at READY AT GATE; do not merge `main` in this phase.