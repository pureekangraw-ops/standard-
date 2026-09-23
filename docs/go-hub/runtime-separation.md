# GO Hub / NormalPocket Runtime Separation

**Status:** CURRENT SEPARATION CONTRACT  
**Updated:** 2026-09-23

- GO Hub and NormalPocket compatibility runtime are separate concerns.
- NormalPocket compatibility files may remain only while a proven dependency exists.
- GO Hub must not acquire new behavior by extending legacy NormalPocket/Metropolis runtime paths.
- When a GO Hub capability replaces a legacy path, migrate all active callers to the canonical GO Hub owner first; then retire or quarantine the old path after dependency proof.
- A compatibility facade may delegate to the canonical owner, but it must not make independent routing, lifecycle, evidence, permission, or mutation decisions.
- Existing legacy PWA/Worker/cache/database/vault identities remain unchanged until their explicit migration gate is satisfied.
- Historical branches and documents are evidence, not reusable authority. New work must target current canonical owners rather than stack another implementation on top.

This contract exists to drive convergence toward one live owner per concern, not permanent side-by-side accumulation.
