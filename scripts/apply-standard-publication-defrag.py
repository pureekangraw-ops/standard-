from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
RELEASE_ID = "v1.0.0-20260809-r2-defrag-current"
UPSTREAM_COMMIT = "70600e5811ba266cb57a843bd5ae6a1732fbcb91"

production_files = [
    "index.html",
    "manifest.webmanifest",
    "styles.css",
    "flow-era.css",
    "metropolis-v4.css",
    "metropolis-r5.css",
    "metropolis-r5-1.css",
    "metropolis-r5-2.css",
    "metropolis-r5-3.css",
    "metropolis-r5-4.css",
    "sw-bootstrap.js",
    "highway-gate.js",
    "app.js",
    "flow-era.js",
    "metropolis-v4.js",
    "metropolis-r5.js",
    "metropolis-r5-1.js",
    "metropolis-r5-2.js",
    "metropolis-r5-3.js",
    "metropolis-r5-4.js",
    "sw.js",
    "icon-192.png",
    "icon-512.png",
]

sw_path = ROOT / "sw.js"
sw = sw_path.read_text(encoding="utf-8")
old_release = 'const RELEASE_ID = "v1.0.0-20260809-r1-standard-baseline";'
new_release = f'const RELEASE_ID = "{RELEASE_ID}";'
if sw.count(old_release) != 1:
    raise SystemExit(f"sw.js: expected one old release id, found {sw.count(old_release)}")
sw_path.write_text(sw.replace(old_release, new_release, 1), encoding="utf-8")

assets = "\n".join([
    "node_modules",
    "node_modules/**",
    ".wrangler",
    ".wrangler/**",
    ".git",
    ".git/**",
    "*",
    *[f"!/{file}" for file in production_files],
    "",
])
(ROOT / ".assetsignore").write_text(assets, encoding="utf-8")

manifest_path = ROOT / "RELEASE_MANIFEST.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["release"] = "1.0.0-defrag-current"
manifest["sourceProduct"] = "YGPH METROPOLIS 4.2.4"
manifest["sourceCommit"] = UPSTREAM_COMMIT
manifest.setdefault("serviceWorker", {})["releaseId"] = RELEASE_ID
manifest["productionFiles"] = [{"path": file} for file in production_files]
manifest["validation"] = {
    "command": "npm run deploy:gate",
    "scope": [
        "defrag runtime contracts",
        "publication contract",
        "syntax",
        "utf8",
        "no executable ride references",
    ],
}
manifest["note"] = "STANDARD Current follows the verified METROPOLIS shared-logic baseline, removes RIDE from executable contracts, and keeps its own product/data boundary. No owner runtime data is included."
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

for file in production_files:
    if not (ROOT / file).exists():
        raise SystemExit(f"missing production file: {file}")

print("STANDARD publication defrag applied")
