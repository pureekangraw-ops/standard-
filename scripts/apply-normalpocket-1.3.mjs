import fs from "node:fs";

const read = file => fs.readFileSync(file, "utf8");
const write = (file, text) => fs.writeFileSync(file, text);

function replaceOne(file, from, to) {
  const source = read(file);
  if (!source.includes(from)) throw new Error(`${file}: missing expected source: ${from.slice(0, 80)}`);
  write(file, source.replace(from, to));
}

replaceOne("package.json", '"version": "1.2.0"', '"version": "1.3.0"');
replaceOne("index.html", "<title>NormalPocket 1.2.0</title>", "<title>NormalPocket 1.3.0</title>");
replaceOne("index.html", "<b>NormalPocket 1.2.0</b><span>• ออฟไลน์ • เข้ารหัส • ใช้ในเครื่อง</span>", "<b>v1.3.0</b><span>• ออฟไลน์ • เข้ารหัส</span>");
replaceOne("sw.js", 'const RELEASE_ID = "v1.2.0-20260812-r4-simple-shop-flow";', 'const RELEASE_ID = "v1.3.0-20260812-r5-one-hand-mobile";');

const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
manifest.release = "1.3.0-one-hand-mobile";
manifest.features = [
  "one-hand mobile home flow",
  "compact mobile header and action grid",
  "first-run catalog guidance without blocking quick sale",
  ...manifest.features.filter(item => !item.startsWith("one-hand ") && !item.startsWith("compact mobile") && !item.startsWith("first-run "))
];
manifest.serviceWorker.releaseId = "v1.3.0-20260812-r5-one-hand-mobile";
manifest.validation.scope = [
  "NormalPocket one-hand mobile contracts",
  ...manifest.validation.scope.filter(item => item !== "NormalPocket one-hand mobile contracts")
];
manifest.note = "NormalPocket 1.3.0 makes the 1.2 daily shop flow faster to scan and easier to operate one-handed on mobile while preserving encrypted local Store/Ledger/Calendar data ownership.";
write("RELEASE_MANIFEST.json", JSON.stringify(manifest, null, 2) + "\n");

replaceOne("normalpocket-simple-flow.js", 'const VERSION = "1.2.0";', 'const VERSION = "1.3.0";');
replaceOne(
  "normalpocket-simple-flow.js",
  '  function buildQuickSale({ qty, unitPriceSatang, receivedSatang, date, id, at } = {}) {',
  '  function firstRunHint({ productCount = 0 } = {}) {\n    const count = Number(productCount || 0);\n    return count < 1\n      ? { empty: true, message: "ยังไม่มีสินค้า เพิ่มสินค้าแรกหรือใช้ขายด่วนได้ทันที" }\n      : { empty: false, message: "" };\n  }\n\n  function buildQuickSale({ qty, unitPriceSatang, receivedSatang, date, id, at } = {}) {'
);
replaceOne(
  "normalpocket-simple-flow.js",
  'const api = Object.freeze({ VERSION, STOCK_ADJUST_REASONS, buildQuickSale, daySummary, stockAdjustmentDelta });',
  'const api = Object.freeze({ VERSION, STOCK_ADJUST_REASONS, firstRunHint, buildQuickSale, daySummary, stockAdjustmentDelta });'
);
replaceOne(
  "normalpocket-simple-flow.js",
  '  function applyNeutralBranding() {\n    document.title = `NormalPocket ${VERSION}`;',
  '  function applyNeutralBranding() {\n    document.body.classList.add("np-one-hand");\n    document.title = `NormalPocket ${VERSION}`;'
);
replaceOne(
  "normalpocket-simple-flow.js",
  'if (statusVersion) statusVersion.textContent = `NormalPocket ${VERSION}`;\n    if (statusDetail) statusDetail.textContent = "• ออฟไลน์ • เข้ารหัส • ใช้ในเครื่อง";',
  'if (statusVersion) statusVersion.textContent = `v${VERSION}`;\n    if (statusDetail) statusDetail.textContent = "• ออฟไลน์ • เข้ารหัส";'
);
replaceOne(
  "normalpocket-simple-flow.js",
  'if (typeof state === "undefined" || !state) return { sales: 0, cash: 0, stock: 0, tasks: 0 };',
  'if (typeof state === "undefined" || !state) return { sales: 0, cash: 0, stock: 0, tasks: 0, productCount: 0 };'
);
replaceOne(
  "normalpocket-simple-flow.js",
  'return { sales: summary.salesSatang, cash, stock: Number(state.store?.stockQty || 0), tasks: summary.openTasks };',
  'const productCount = (state.store?.products || []).filter(item => item.active !== false).length;\n    return { sales: summary.salesSatang, cash, stock: Number(state.store?.stockQty || 0), tasks: summary.openTasks, productCount };'
);
replaceOne(
  "normalpocket-simple-flow.js",
  '<div class="np-quick-head"><div><small>วันนี้ทำอะไร</small><h2>เริ่มงานได้เลย</h2></div><span>NormalPocket</span></div>',
  '<div class="np-quick-head"><div><small>วันนี้ทำอะไร</small><h2>เริ่มงานได้เลย</h2></div></div>\n        <div class="np-first-run" id="npFirstRun" hidden><span id="npFirstRunText"></span><div><button type="button" data-np-first="add">เพิ่มสินค้าแรก</button><button type="button" data-np-first="quick">ขายด่วน</button></div></div>'
);
replaceOne(
  "normalpocket-simple-flow.js",
  '      home.prepend(panel);\n      panel.querySelector(\'[data-np-action="sale"]\').onclick',
  '      home.prepend(panel);\n      panel.querySelector(\'[data-np-first="add"]\').onclick = () => { show("store"); setTimeout(() => document.getElementById("normalpocketAddProductBtn")?.click(), 0); };\n      panel.querySelector(\'[data-np-first="quick"]\').onclick = openQuickSale;\n      panel.querySelector(\'[data-np-action="sale"]\').onclick'
);
replaceOne(
  "normalpocket-simple-flow.js",
  '    const metrics = quickMetrics();\n    const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };',
  '    const metrics = quickMetrics();\n    const hint = firstRunHint({ productCount: metrics.productCount });\n    const hintBox = document.getElementById("npFirstRun");\n    const hintText = document.getElementById("npFirstRunText");\n    if (hintBox) hintBox.hidden = !hint.empty;\n    if (hintText) hintText.textContent = hint.message;\n    const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };'
);
replaceOne("normalpocket-simple-flow.js", "__NORMALPOCKET_SIMPLE_FLOW_12__", "__NORMALPOCKET_SIMPLE_FLOW_13__");
replaceOne("normalpocket-simple-flow.js", "__NORMALPOCKET_SIMPLE_FLOW_12__", "__NORMALPOCKET_SIMPLE_FLOW_13__");
replaceOne("normalpocket-simple-flow.js", '"NORMALPOCKET_SIMPLE_FLOW_12"', '"NORMALPOCKET_SIMPLE_FLOW_13"');

write("normalpocket-simple-flow.css", `.np-brand-svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.np-quick-home{margin:10px 0;padding:12px;border-radius:20px;background:var(--card,#fff);box-shadow:0 10px 24px rgba(15,35,45,.07)}
.np-quick-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:10px}.np-quick-head small{display:block;color:var(--muted,#677);margin-bottom:1px}.np-quick-head h2{margin:0;font-size:1.35rem;line-height:1.15}
.np-first-run{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:9px 10px;border-radius:14px;background:rgba(23,107,79,.07);font-size:.78rem}.np-first-run[hidden]{display:none}.np-first-run>div{display:flex;gap:6px}.np-first-run button{border:0;border-radius:10px;padding:7px 9px;background:#fff;font-weight:750;white-space:nowrap}
.np-daily-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.np-action{min-height:72px;border:1px solid rgba(20,50,60,.12);border-radius:16px;background:#fff;padding:11px 12px;text-align:left;display:flex;flex-direction:column;justify-content:center;gap:3px;touch-action:manipulation}.np-action span{font-weight:800;font-size:.98rem}.np-action small{color:var(--muted,#677);line-height:1.3}.np-action.np-primary{grid-column:1/-1;background:rgba(23,107,79,.09);border-color:rgba(23,107,79,.25)}.np-action.np-close{background:rgba(74,83,94,.06)}
.np-today-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}.np-today-strip>div{padding:8px 10px;border-radius:12px;background:rgba(90,110,120,.06)}.np-today-strip small{display:block;color:var(--muted,#677);font-size:.72rem}.np-today-strip b{display:block;margin-top:2px;font-size:.9rem}
.np-secondary-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.np-secondary-actions button{border:0;background:transparent;padding:7px 8px;border-radius:10px;text-decoration:underline;text-underline-offset:3px;touch-action:manipulation}
.np-day-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.np-day-summary>div{padding:10px;border-radius:12px;background:rgba(90,110,120,.06)}.np-day-summary small{display:block;color:var(--muted,#677);margin-bottom:3px}.np-day-summary b{font-size:.95rem}
.np-one-hand .topbar{padding:calc(9px + env(safe-area-inset-top)) 12px 8px}.np-one-hand .brand{gap:8px}.np-one-hand .brand-mark{width:40px;height:40px;border-radius:13px}.np-one-hand .brand-copy h1{font-size:19px;margin:0 0 1px}.np-one-hand .home-btn{width:38px;height:38px;border-radius:12px}.np-one-hand .status-line{margin-top:5px;gap:6px}.np-one-hand main{padding-bottom:calc(82px + env(safe-area-inset-bottom))}
#homePage>.metropolis-city-hero,#homePage>.section,#homePage>.metro-owner-dashboard{display:none}.metropolis-system-drawer{margin-top:10px}
@media(max-width:520px){.np-daily-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.np-action.np-primary{grid-column:1/-1}.np-today-strip,.np-day-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.np-quick-home{margin:8px 0;padding:10px 12px}.np-action{min-height:72px;padding:10px}.np-action small{font-size:.74rem}.np-one-hand .brand-copy p{display:none}.np-one-hand .status-line span:not(.dot){display:none}.np-secondary-actions{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.np-secondary-actions::-webkit-scrollbar{display:none}.np-first-run{align-items:flex-start;flex-direction:column}.np-first-run>div{width:100%}.np-first-run button{flex:1}}
`);
