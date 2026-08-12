import fs from "node:fs";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.writeFileSync(file, content, "utf8"); }
function replaceOnce(file, from, to) {
  const source = read(file);
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`marker not found in ${file}: ${from.slice(0, 80)}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`marker not unique in ${file}: ${from.slice(0, 80)}`);
  write(file, source.slice(0, index) + to + source.slice(index + from.length));
}

const products = "normalpocket-products.js";

for (const line of [
  '        <div class="field"><label>หมวดหมู่</label><input id="productCategory" maxlength="100" value="${escProduct(product?.category || "")}"></div>\n',
  '        <div class="field"><label>หน่วย</label><input id="productUnit" maxlength="40" value="${escProduct(product?.unit || "ชิ้น")}"></div>\n',
  '        <div class="field"><label>ต้นทุนต่อหน่วย</label><input id="productCost" type="number" min="0" step="0.01" value="${product?.costSatang == null ? "" : satangToBaht(product.costSatang)}"></div>\n',
  '        <div class="field"><label>สถานะ</label><select id="productActive"><option value="1" ${product?.active === false ? "" : "selected"}>ขายอยู่</option><option value="0" ${product?.active === false ? "selected" : ""}>หยุดขาย</option></select></div>\n'
]) replaceOnce(products, line, "");

replaceOnce(
  products,
  '      <details class="normalpocket-product-advanced">\n        <summary>ข้อมูลเพิ่มเติม</summary>\n        <div class="form-grid">\n',
  '      <details class="normalpocket-product-advanced">\n        <summary>ข้อมูลเพิ่มเติม</summary>\n        <div class="form-grid">\n          <div class="field"><label>หมวดหมู่</label><input id="productCategory" maxlength="100" value="${escProduct(product?.category || "")}"></div>\n          <div class="field"><label>หน่วย</label><input id="productUnit" maxlength="40" value="${escProduct(product?.unit || "ชิ้น")}"></div>\n          <div class="field"><label>ต้นทุนต่อหน่วย</label><input id="productCost" type="number" min="0" step="0.01" value="${product?.costSatang == null ? "" : satangToBaht(product.costSatang)}"></div>\n          <div class="field"><label>สถานะ</label><select id="productActive"><option value="1" ${product?.active === false ? "" : "selected"}>ขายอยู่</option><option value="0" ${product?.active === false ? "selected" : ""}>หยุดขาย</option></select></div>\n'
);

const saleOld = [
  '      body: `<div class="form-grid">${selectionFields("npSale", true)}',
  '        <div class="field"><label>จำนวน</label><input id="npSaleQty" type="number" min="1" value="1"></div>',
  '        <div class="field"><label>รับเงินจริงครั้งนี้</label><input id="npSaleReceived" type="number" min="0" step="0.01" value="0"></div>',
  '        <div class="field"><label>ลูกค้า</label><input id="npSaleCustomer" maxlength="80"></div>',
  '        <div class="field full"><label>ช่องทางติดต่อ</label><input id="npSaleContact" maxlength="100"></div>',
  '        <div class="field full"><label>วันนัดยอดค้าง</label><input id="npSaleDue" type="date" value="${localISO()}"></div>',
  '        <div class="field full"><label>หมายเหตุ</label><input id="npSaleNote" maxlength="200"></div>',
  '      </div>`,'
].join("\n");
const saleNew = [
  '      body: `<div class="form-grid">${selectionFields("npSale")}',
  '        <div class="field"><label>จำนวน</label><input id="npSaleQty" type="number" min="1" value="1"></div>',
  '        <div class="field"><label>รับเงินจริงครั้งนี้</label><input id="npSaleReceived" type="number" min="0" step="0.01" value="0"></div>',
  '        <div class="field full"><small>ใช้ราคาขายของสินค้าอัตโนมัติ · ถ้ารับไม่ครบ ระบบจะเก็บยอดค้าง</small></div>',
  '      </div>',
  '      <details class="np-sale-advanced">',
  '        <summary>ข้อมูลเพิ่มเติม</summary>',
  '        <div class="form-grid">',
  '          <div class="field"><label>ราคาต่อหน่วย</label><input id="npSaleUnitPrice" type="number" min="0" step="0.01"></div>',
  '          <div class="field"><label>ลูกค้า</label><input id="npSaleCustomer" maxlength="80"></div>',
  '          <div class="field full"><label>ช่องทางติดต่อ</label><input id="npSaleContact" maxlength="100"></div>',
  '          <div class="field full"><label>วันนัดยอดค้าง</label><input id="npSaleDue" type="date" value="${localISO()}"></div>',
  '          <div class="field full"><label>หมายเหตุ</label><input id="npSaleNote" maxlength="200"></div>',
  '        </div>',
  '      </details>`,'
].join("\n");
replaceOnce(products, saleOld, saleNew);

const css = "normalpocket-simple-flow.css";
replaceOnce(css, '.np-first-run button{border:0;border-radius:10px;padding:7px 9px;background:#fff;font-weight:750;white-space:nowrap}', '.np-first-run button{min-height:44px;border:0;border-radius:10px;padding:7px 9px;background:#fff;font-weight:750;white-space:nowrap;touch-action:manipulation}');
replaceOnce(css, '.np-secondary-actions button{border:0;background:transparent;padding:7px 8px;border-radius:10px;text-decoration:underline;text-underline-offset:3px;touch-action:manipulation}', '.np-secondary-actions button{min-height:44px;border:0;background:transparent;padding:7px 8px;border-radius:10px;text-decoration:underline;text-underline-offset:3px;touch-action:manipulation}');
replaceOnce(css, '.np-one-hand .home-btn{width:38px;height:38px;border-radius:12px}', '.np-one-hand .home-btn{width:44px;height:44px;border-radius:12px}');
replaceOnce(css, '.np-day-summary{display:grid;', '.np-sale-advanced{margin-top:10px;padding-top:8px;border-top:1px solid rgba(20,50,60,.10)}.np-sale-advanced summary{min-height:44px;display:flex;align-items:center;font-size:.82rem;font-weight:750;cursor:pointer;touch-action:manipulation}\n.np-day-summary{display:grid;');

const flow = "normalpocket-simple-flow.js";
replaceOnce(
  flow,
  '  function buildQuickSale({ qty, unitPriceSatang, receivedSatang, date, id, at } = {}) {',
  '  function upsertDayCloseEvent(existing, summary, { id, at } = {}) {\n    const stamp = at || new Date().toISOString();\n    const snapshot = { ...(summary || {}) };\n    const date = String(snapshot.date || existing?.date || "");\n    if (existing) return { ...existing, type: "DAY_CLOSED", date, summary: snapshot, updatedAt: stamp };\n    return { id: id || `DAY-${Date.now().toString(36)}`, type: "DAY_CLOSED", date, summary: snapshot, createdAt: stamp, updatedAt: stamp };\n  }\n\n  function buildQuickSale({ qty, unitPriceSatang, receivedSatang, date, id, at } = {}) {'
);
replaceOnce(
  flow,
  '  const api = Object.freeze({ VERSION, STOCK_ADJUST_REASONS, firstRunHint, buildQuickSale, daySummary, stockAdjustmentDelta });',
  '  const api = Object.freeze({ VERSION, STOCK_ADJUST_REASONS, firstRunHint, upsertDayCloseEvent, buildQuickSale, daySummary, stockAdjustmentDelta });'
);
replaceOnce(
  flow,
  '  function alreadyClosed(date) {\n    return (state?.events || []).some(item => item?.type === "DAY_CLOSED" && item.date === date);\n  }',
  '  function dayCloseEvent(date) {\n    return (state?.events || []).find(item => item?.type === "DAY_CLOSED" && item.date === date) || null;\n  }'
);
replaceOnce(flow, '    const summary = daySummary(state || {}, date);\n    openModal({', '    const summary = daySummary(state || {}, date);\n    const existing = dayCloseEvent(date);\n    openModal({');
replaceOnce(flow, '      text: alreadyClosed(date) ? "วันนี้บันทึกสรุปไว้แล้ว ข้อมูลจริงยังอยู่ครบ" : "ตรวจตัวเลขก่อนปิดวัน ระบบจะเก็บสรุปโดยไม่ลบสินค้า เงิน หรือประวัติ",', '      text: existing ? "วันนี้มีสรุปแล้ว หากมีรายการเพิ่ม กดยืนยันเพื่ออัปเดตสรุปให้ตรงข้อมูลล่าสุด" : "ตรวจตัวเลขก่อนปิดวัน ระบบจะเก็บสรุปโดยไม่ลบสินค้า เงิน หรือประวัติ",');
replaceOnce(flow, '      confirm: alreadyClosed(date) ? "ปิด" : "ยืนยันจบวัน",', '      confirm: existing ? "อัปเดตสรุปวัน" : "ยืนยันจบวัน",');
replaceOnce(
  flow,
  '      onConfirm: async () => {\n        if (alreadyClosed(date)) { closeModal(); return; }\n        const at = nowIso();\n        state.events ||= [];\n        state.events.push({ id: uid("DAY"), type: "DAY_CLOSED", date, summary, createdAt: at, updatedAt: at });\n        addAudit("DAY_CLOSED", `จบวัน ${date} · ยอดขาย ${baht(summary.salesSatang)} บาท`);\n        closeModal();\n        await persistAndRender("บันทึกสรุปวันแล้ว");\n      }',
  '      onConfirm: async () => {\n        const at = nowIso();\n        state.events ||= [];\n        const event = upsertDayCloseEvent(existing, summary, { id: existing?.id || uid("DAY"), at });\n        if (existing) Object.assign(existing, event); else state.events.push(event);\n        addAudit(existing ? "DAY_CLOSED_UPDATED" : "DAY_CLOSED", `${existing ? "อัปเดต" : "จบ"}วัน ${date} · ยอดขาย ${baht(summary.salesSatang)} บาท`);\n        closeModal();\n        await persistAndRender(existing ? "อัปเดตสรุปวันแล้ว" : "บันทึกสรุปวันแล้ว");\n      }'
);

console.log("NormalPocket HADES 1.3 hardening applied");
