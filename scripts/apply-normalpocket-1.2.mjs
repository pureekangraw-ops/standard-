import fs from "node:fs";

const read = file => fs.readFileSync(file, "utf8");
const write = (file, text) => fs.writeFileSync(file, text);

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) {
    if (text.includes(to)) return text;
    throw new Error(`Missing ${label || from}`);
  }
  return text.split(from).join(to);
}

let index = read("index.html");
index = replaceRequired(index, "<title>YGPH STANDARD v1.0.0</title>", "<title>NormalPocket 1.2.0</title>", "old title");
index = replaceRequired(index, "YGPH STANDARD", "NormalPocket", "old public brand");
index = replaceRequired(index, "NormalPocket v1.0.0", "NormalPocket 1.2.0", "old visible version");
index = replaceRequired(index, "STANDARD v1.0.0", "NormalPocket 1.2.0", "old status version");
index = replaceRequired(index, "Store • Ledger • Calendar — ฐานงานส่วนตัว", "ร้านค้า • เงิน • งานประจำวัน", "personal subtitle");
index = replaceRequired(index, "• 3 แอป • ออฟไลน์ • เข้ารหัส", "• ออฟไลน์ • เข้ารหัส • ใช้ในเครื่อง", "old status detail");
index = replaceRequired(index, "รับ–ส่งข้อมูลกับโก", "รับ–ส่งข้อมูลสำรอง", "owner exchange title");
index = replaceRequired(index, "ส่งไฟล์ให้โกตรวจ", "ส่งไฟล์ออกเพื่อตรวจหรือสำรอง", "owner export copy");
index = index.split("🌳").join("◒").split("🌿").join("◒");
write("index.html", index);

write("manifest.webmanifest", JSON.stringify({
  name: "NormalPocket",
  short_name: "NormalPocket",
  description: "ร้านค้า เงิน สต็อก และงานประจำวันแบบเรียบง่าย ข้อมูลเข้ารหัสเก็บในเครื่องและใช้งานออฟไลน์ได้",
  lang: "th",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f2f6f4",
  theme_color: "#176b4f",
  icons: [
    { src: "app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ],
  id: "/index.html"
}, null, 2) + "\n");

let metro = read("metropolis-v4.js");
metro = replaceRequired(metro, "YGPH STANDARD", "NormalPocket", "metropolis public brand");
metro = replaceRequired(metro, 'const METROPOLIS_VERSION = "1.0.0";', 'const METROPOLIS_VERSION = "1.2.0";', "metropolis version");
metro = replaceRequired(metro, "แอปของบิ๊ก", "งานหลัก", "owner launcher title");
metro = replaceRequired(metro, "คิวรวม รายงาน และการรับ–ส่งข้อมูลกับโก", "คิว รายงาน และเครื่องมือข้อมูลเพิ่มเติม", "owner drawer copy");
metro = replaceRequired(metro, "Store • Ledger • Calendar — ฐานงานส่วนตัว", "ร้านค้า • เงิน • งานประจำวัน", "owner brand subtitle");
metro = replaceRequired(metro, "`STANDARD v${METROPOLIS_VERSION}`", "`NormalPocket ${METROPOLIS_VERSION}`", "old metropolis status");
metro = replaceRequired(metro, "• 3 แอป • ออฟไลน์ • เข้ารหัส", "• ออฟไลน์ • เข้ารหัส • ใช้ในเครื่อง", "old metropolis detail");
metro = metro.split('english: "STANDARD"').join('english: "NORMALPOCKET"');
write("metropolis-v4.js", metro);

let r51 = read("metropolis-r5-1.js");
r51 = replaceRequired(r51, 'const METROPOLIS_PRODUCT_VERSION = "1.0.0";', 'const METROPOLIS_PRODUCT_VERSION = "1.2.0";', "r51 version");
r51 = replaceRequired(r51, 'document.title = `YGPH STANDARD v${METROPOLIS_PRODUCT_VERSION}`;', 'document.title = `NormalPocket ${METROPOLIS_PRODUCT_VERSION}`;', "r51 title");
r51 = replaceRequired(r51, 'statusVersion.textContent = `STANDARD v${METROPOLIS_PRODUCT_VERSION}`;', 'statusVersion.textContent = `NormalPocket ${METROPOLIS_PRODUCT_VERSION}`;', "r51 status");
write("metropolis-r5-1.js", r51);

let r54 = read("metropolis-r5-4.js");
r54 = replaceRequired(r54, 'const STANDARD_PRODUCT_VERSION = "1.0.0";', 'const STANDARD_PRODUCT_VERSION = "1.2.0";', "r54 version");
r54 = replaceRequired(r54, 'const expectedTitle = `YGPH STANDARD v${STANDARD_PRODUCT_VERSION}`;', 'const expectedTitle = `NormalPocket ${STANDARD_PRODUCT_VERSION}`;', "r54 title");
r54 = replaceRequired(r54, 'const expectedVersion = `STANDARD v${STANDARD_PRODUCT_VERSION}`;', 'const expectedVersion = `NormalPocket ${STANDARD_PRODUCT_VERSION}`;', "r54 status");
r54 = replaceRequired(r54, 'statusVersion.textContent = `STANDARD v${STANDARD_PRODUCT_VERSION}`;', 'statusVersion.textContent = `NormalPocket ${STANDARD_PRODUCT_VERSION}`;', "r54 status write");
write("metropolis-r5-4.js", r54);

const pkg = JSON.parse(read("package.json"));
pkg.name = "normalpocket";
pkg.version = "1.2.0";
if (!pkg.scripts["check:syntax"].includes("normalpocket-simple-flow.js")) {
  pkg.scripts["check:syntax"] = pkg.scripts["check:syntax"].replace("node --check normalpocket-reconcile.js", "node --check normalpocket-reconcile.js && node --check normalpocket-simple-flow.js");
}
write("package.json", JSON.stringify(pkg, null, 2) + "\n");

let bootstrap = read("normalpocket-bootstrap.js");
bootstrap = replaceRequired(bootstrap, 'ensureStyle("normalpocket-products.css");', 'ensureStyle("normalpocket-products.css");\n    ensureStyle("normalpocket-simple-flow.css");', "simple flow css loader");
bootstrap = replaceRequired(bootstrap, 'await loadScript("normalpocket-reconcile.js");', 'await loadScript("normalpocket-reconcile.js");\n    await loadScript("normalpocket-simple-flow.js");', "simple flow runtime loader");
write("normalpocket-bootstrap.js", bootstrap);

let sw = read("sw.js");
sw = replaceRequired(sw, 'const RELEASE_ID = "v1.1.0-20260812-r3-product-catalog";', 'const RELEASE_ID = "v1.2.0-20260812-r4-simple-shop-flow";', "service worker release");
if (!sw.includes('"normalpocket-simple-flow.css"')) sw = sw.replace('"normalpocket-products.css",', '"normalpocket-products.css",\n  "normalpocket-simple-flow.css",');
if (!sw.includes('"normalpocket-simple-flow.js"')) sw = sw.replace('"normalpocket-reconcile.js",', '"normalpocket-reconcile.js",\n  "normalpocket-simple-flow.js",');
if (!sw.includes('"app-icon.svg"')) sw = sw.replace('"icon-192.png",', '"app-icon.svg",\n  "icon-192.png",');
write("sw.js", sw);

const release = JSON.parse(read("RELEASE_MANIFEST.json"));
release.release = "1.2.0-simple-shop-flow";
release.product = "NormalPocket";
release.releaseDate = "2026-08-12";
release.features = [
  "simple daily home actions",
  "general product catalog",
  "optional color and size variants",
  "quick cash sale without catalog stock mutation",
  "simple stock adjustment",
  "day-close summary without destructive reset",
  "neutral public branding"
];
release.serviceWorker.releaseId = "v1.2.0-20260812-r4-simple-shop-flow";
release.validation.scope = [
  "NormalPocket simple shop flow contracts",
  "neutral public branding contract",
  "product catalog and stock-owner contracts",
  "publication contract",
  "STANDARD regression contracts",
  "syntax",
  "utf8",
  "no executable ride references"
];
release.note = "NormalPocket 1.2.0 simplifies daily shop work and removes owner-specific visible identity while preserving the encrypted local Store/Ledger/Calendar foundation.";
const production = new Set(release.productionFiles.map(item => typeof item === "string" ? item : item.path));
for (const file of ["normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg"]) production.add(file);
release.productionFiles = [...production].map(path => ({ path }));
write("RELEASE_MANIFEST.json", JSON.stringify(release, null, 2) + "\n");

let assets = read(".assetsignore");
for (const file of ["normalpocket-simple-flow.js", "normalpocket-simple-flow.css", "app-icon.svg"]) {
  const line = `!/${file}`;
  if (!assets.split(/\r?\n/).includes(line)) assets = assets.trimEnd() + `\n${line}\n`;
}
write(".assetsignore", assets);

write("app-icon.svg", `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title">\n  <title id="title">NormalPocket pocket icon</title>\n  <rect width="512" height="512" rx="112" fill="#176B4F"/>\n  <rect x="28" y="28" width="456" height="456" rx="94" fill="none" stroke="#FFFFFF" stroke-opacity=".28" stroke-width="10"/>\n  <path d="M116 132h280v206c0 42-34 76-76 76H192c-42 0-76-34-76-76V132Z" fill="#F7FAF8"/>\n  <path d="M132 225c58 47 190 47 248 0" fill="none" stroke="#176B4F" stroke-width="22" stroke-linecap="round"/>\n  <circle cx="256" cy="302" r="20" fill="#176B4F"/>\n</svg>\n`);

console.log("NormalPocket 1.2 files prepared");
