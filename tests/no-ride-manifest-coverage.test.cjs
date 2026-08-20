"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("no-ride gate scans every executable JavaScript file in production manifest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "normalpocket-no-ride-"));
  try {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), "scripts", "verify-no-ride.mjs"), path.join(root, "scripts", "verify-no-ride.mjs"));
    fs.writeFileSync(path.join(root, "RELEASE_MANIFEST.json"), JSON.stringify({
      productionFiles: [
        { path: "index.html" },
        { path: "extra-runtime.js" },
        { path: "styles.css" }
      ]
    }));
    fs.writeFileSync(path.join(root, "index.html"), "<main>NormalPocket</main>\n");
    fs.writeFileSync(path.join(root, "extra-runtime.js"), "const forbiddenDomain = 'RIDE';\n");
    fs.writeFileSync(path.join(root, "styles.css"), "body{}\n");

    const result = spawnSync(process.execPath, [path.join(root, "scripts", "verify-no-ride.mjs")], {
      cwd: root,
      encoding: "utf8"
    });

    assert.notEqual(result.status, 0, "gate must reject a forbidden token in a manifest-declared runtime file");
    assert.match(result.stderr, /extra-runtime\.js/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
