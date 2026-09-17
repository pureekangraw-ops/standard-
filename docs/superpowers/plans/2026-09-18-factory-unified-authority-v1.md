# Factory Unified Authority V1 — consolidation checklist

Base: main@37c135e6966a2fabce34ae72c8b50dfbd5271d67

## Scope decision
- Keep Factory-specific authority inside Factory.
- Keep Hub-wide lifecycle vocabulary/contracts outside Factory.
- Preserve current-main Foreman queue/cancel/waiting-room behavior from PR #82.
- Consolidate active Factory work from PR #46 and PR #68/#72 without merging stale branches wholesale.
- PR #43 is superseded by #46; PR #72 duplicates the #68 head and is not a separate feature set.

## Capability buckets
### Factory core
- server-authoritative task state and Reality Receipts
- Factory task/action controller
- global Factory stage authority
- Production -> Piece QC -> Ready Gate -> Assembly -> Merge Gate
- exact-head merge sealing/result binding
- Build -> APK Signing -> Product QC -> Publish -> Observe -> Verify -> Close/Learn

### Hub seams
- Code capability exposure
- MCP registry/action surface
- Worker/runtime binding
- shell/publication surfaces

Hub seams must be integrated separately and only after Factory core is green.

## Execution checklist
- [x] Analyze duplicate PRs and classify ownership
- [x] Create fresh consolidation branch from current main
- [ ] Import non-conflicting Global Sequence core
- [ ] Merge exact-head merge sealing into current Foreman without losing #82 cancellation/recovery
- [ ] Merge Factory MCP/return seams without losing current-main changes
- [ ] Separate #46 task/action controller from Foreman naming collision
- [ ] Import durable state + Reality Receipt core
- [ ] Add/port regression tests
- [ ] Run exact-head STANDARD Safety Gate
- [ ] Repair failures until green
- [ ] Open one consolidation PR to main
- [ ] Mark old PRs superseded only after consolidation evidence is green
