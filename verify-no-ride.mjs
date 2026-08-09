import fs from "node:fs";
import path from "node:path";

const roots = [
  "index.html", "app.js", "core.js", "domain.js", "controller.js", "vault.js", "ui-model.js",
  "highway-gate.js", "flow-era.js", "metropolis-v4.js", "metropolis-r5.js", "metropolis-r5-1.js",
  "metropolis-r5-2.js", "metropolis-r5-3.js", "metropolis-r5-4.js", "sw-bootstrap.js", "sw.js"
];
const banned = /\bRIDE\b|\bride\b|state\.ride|ridePage|renderRide|วิ่งงาน/;
const bad = [];
for (const file of roots) {
  const text = fs.readFileSync(path.resolve(file), "utf8");
  if (banned.test(text)) bad.push(file);
}
if (bad.length) {
  console.error(`RIDE references remain: ${bad.join(", ")}`);
  process.exit(1);
}
console.log("No executable RIDE references in STANDARD runtime.");
