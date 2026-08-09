import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const executableFiles = [
  "index.html",
  "core.js",
  "domain.js",
  "controller.js",
  "vault.js",
  "ui-model.js",
  "highway-gate.js",
  "app.js",
  "flow-era.js",
  "metropolis-v4.js",
  "metropolis-r5.js",
  "metropolis-r5-1.js",
  "metropolis-r5-2.js",
  "metropolis-r5-3.js",
  "metropolis-r5-4.js"
].filter(file => fs.existsSync(path.join(root, file)));

const forbidden = [
  { name: "RIDE source/domain token", re: /\bRIDE\b/ },
  { name: "RIDE action token", re: /(?:^|[^A-Z])RIDE_[A-Z_]+/ },
  { name: "ride state", re: /\bstate\s*\.\s*ride\b/i },
  { name: "ride page", re: /\bridePage\b/i },
  { name: "ride renderer", re: /\brenderRide\b/i },
  { name: "ride runtime identifier", re: /\bride(?:Round|Job|Jobs|Expense|Expenses|Credit|Withdrawal|Withdrawals|Balance|Income|Cash|Amount|Payment|Distance|Km|Note|List|Source|Data)\b/i },
  { name: "ride UI route", re: /data-page=["']ride["']/i }
];

const failures = [];
for (const file of executableFiles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of forbidden) {
      if (rule.re.test(line)) {
        failures.push(`${file}:${index + 1}: ${rule.name}: ${line.trim().slice(0, 180)}`);
        break;
      }
    }
  });
}

if (failures.length) {
  console.error("STANDARD still contains executable RIDE dependencies:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`No executable RIDE dependency found in ${executableFiles.length} STANDARD runtime files.`);
