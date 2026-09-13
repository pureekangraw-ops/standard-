# GO Hub / NormalPocket Runtime Separation

Status: migration branch only; no merge or deploy implied.

- `sw-bootstrap.js` owns only service-worker registration and update-controller reload behavior.
- `index.html` remains the NormalPocket compatibility surface and explicitly loads its retained Metropolis R5 layers followed by `normalpocket-bootstrap.js`.
- GO Hub does not import or load these legacy runtime layers.
- Existing NormalPocket PWA, Worker, cache, database, and vault identities remain unchanged.

This seam makes legacy runtime ownership explicit before any later retirement or replacement decision.
