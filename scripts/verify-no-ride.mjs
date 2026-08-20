import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "RELEASE_MANIFEST.json");
if (!fs.existsSync(manifestPath)) {
  console.error("RELEASE_MANIFEST.json is required for no-RIDE coverage.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`Invalid RELEASE_MANIFEST.json: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(manifest.productionFiles)) {
  console.error("RELEASE_MANIFEST.json must declare productionFiles.");
  process.exit(1);
}

const executableFiles = [...new Set(manifest.productionFiles
  .map(entry => String(entry?.path || "").trim())
  .filter(Boolean)
  .filter(file => file === "index.html" || /\.m?js$/i.test(file)))];

const missingFiles = executableFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missingFiles.length) {
  console.error("Manifest-declared executable files are missing:\n" + missingFiles.join("\n"));
  process.exit(1);
}

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

console.log(`No executable RIDE dependency found in ${executableFiles.length} manifest-declared STANDARD runtime files.`);
