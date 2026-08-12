"use strict";

(function normalPocketSimpleFlow(root) {
  const VERSION = "1.2.0";
  const STOCK_ADJUST_REASONS = Object.freeze(["นับใหม่", "เสีย", "หาย", "ใช้เอง", "คืนสินค้า", "อื่นๆ"]);

  const int = (value, label = "จำนวน") => {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`${label}ต้องเป็นจำนวนเต็ม`);
    return number;
  };

  function buildQuickSale({ qty, unitPriceSatang, receivedSatang, date, id, at } = {}) {
    const quantity = int(qty, "จำนวน");
    const price = int(unitPriceSatang, "ราคา");
    const received = int(receivedSatang, "เงินรับ");
    if (quantity < 1) throw new Error("จำนวนต้องมากกว่า 0");
    if (price < 0 || received < 0) throw new Error("ยอดเงินต้องไม่ติดลบ");
    const totalSatang = quantity * price;
    if (!Number.isSafeInteger(totalSatang)) throw new Error("ยอดขายเกินขอบเขต");
    if (received !== totalSatang) throw new Error("ขายด่วนต้องรับเงินครบ");
    const createdAt = at || new Date().toISOString();
    const saleDate = date || createdAt.slice(0, 10);
    return {
      id: id || `QSALE-${Date.now().toString(36)}`,
      customer: "ขายเงินสด",
      contact: "",
      qty: quantity,
      unitPriceSatang: price,
      totalSatang,
      receivedSatang: received,
      outstandingSatang: 0,
      costSatang: 0,
      status: "COMPLETED",
      note: "ขายด่วน",
      date: saleDate,
      createdAt,
      updatedAt: createdAt,
      revision: 1,
      cancelledAt: null,
      stockRestored: true,
      quickSale: true,
      productId: null,
      variantId: null,
      optionSnapshot: {},
      productName: "ขายด่วน"
    };
  }

  function recordDay(record) {
    return String(record?.date || record?.due || record?.createdAt || "").slice(0, 10);
  }

  function daySummary(targetState = {}, date) {
    const day = String(date || new Date().toISOString().slice(0, 10));
    const sales = (targetState.store?.sales || []).filter(item => recordDay(item) === day && String(item.status || "").toUpperCase() !== "CANCELLED");
    const transactions = (targetState.ledger?.transactions || []).filter(item => recordDay(item) === day && String(item.status || "").toUpperCase() !== "CANCELLED");
    const tasks = (targetState.calendar || []).filter(item => recordDay(item) === day && !["COMPLETED", "CANCELLED"].includes(String(item.status || "").toUpperCase()));
    const salesSatang = sales.reduce((sum, item) => sum + Number(item.totalSatang || 0), 0);
    const costSatang = sales.reduce((sum, item) => sum + Number(item.costSatang || 0) + Number(item.shippingCostSatang || 0), 0);
    return {
      date: day,
      salesCount: sales.length,
      salesSatang,
      cashInSatang: transactions.filter(item => item.direction === "IN").reduce((sum, item) => sum + Number(item.amountSatang || 0), 0),
      cashOutSatang: transactions.filter(item => item.direction === "OUT").reduce((sum, item) => sum + Number(item.amountSatang || 0), 0),
      estimatedGrossSatang: salesSatang - costSatang,
      openTasks: tasks.length,
      stockQty: Number(targetState.store?.stockQty || 0)
    };
  }

  function stockAdjustmentDelta(reason, value, currentStock = 0) {
    if (!STOCK_ADJUST_REASONS.includes(reason)) throw new Error("เหตุผลไม่ถูกต้อง");
    const current = int(currentStock, "สต็อก");
    const amount = int(value, "จำนวน");
    if (reason === "นับใหม่") {
      if (amount < 0) throw new Error("จำนวนหลังนับต้องไม่ติดลบ");
      return amount - current;
    }
    if (reason === "คืนสินค้า") {
      if (amount < 1) throw new Error("จำนวนต้องมากกว่า 0");
      return amount;
    }
    if (["เสีย", "หาย", "ใช้เอง"].includes(reason)) {
      if (amount < 1) throw new Error("จำนวนต้องมากกว่า 0");
      return -amount;
    }
    if (amount === 0) throw new Error("จำนวนต้องไม่เป็น 0");
    return amount;
  }

  const api = Object.freeze({ VERSION, STOCK_ADJUST_REASONS, buildQuickSale, daySummary, stockAdjustmentDelta });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NormalPocketSimpleFlow = api;

  if (typeof document === "undefined") return;

  function baht(satang) {
    try { return typeof money === "function" ? money(satang) : (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }
    catch (_) { return (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }
  }

  function escapeText(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function show(page) {
    if (typeof showPage === "function") showPage(page);
    else if (typeof metropolisShowPage === "function") metropolisShowPage(page);
  }

  function pocketMark() {
    return `<svg class="np-brand-svg" viewBox="0 0 48 48" aria-hidden="true"><path d="M9 13h30v22a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7V13Z"/><path d="M9 22c7 5 23 5 30 0"/><circle cx="24" cy="29" r="3"/></svg>`;
  }

  function applyNeutralBranding() {
    document.title = `NormalPocket ${VERSION}`;
    const setupTitle = document.querySelector("#setupScreen h1");
    const unlockTitle = document.querySelector("#unlockScreen h1");
    const brandTitle = document.querySelector(".brand-copy h1");
    const brandSub = document.querySelector(".brand-copy p");
    if (setupTitle) setupTitle.textContent = "ตั้งค่า NormalPocket";
    if (unlockTitle) unlockTitle.textContent = "NormalPocket";
    if (brandTitle) brandTitle.textContent = "NormalPocket";
    if (brandSub) brandSub.textContent = "ร้านค้า • เงิน • งานประจำวัน";
    const mark = document.querySelector(".brand-mark");
    if (mark) mark.innerHTML = pocketMark();
    const statusVersion = document.querySelector(".status-line b");
    const statusDetail = document.querySelector(".status-line span:not(.dot)");
    if (statusVersion) statusVersion.textContent = `NormalPocket ${VERSION}`;
    if (statusDetail) statusDetail.textContent = "• ออฟไลน์ • เข้ารหัส • ใช้ในเครื่อง";
    const sectionTitle = document.querySelector("#homePage .section-title h2");
    if (sectionTitle) sectionTitle.textContent = "งานหลัก";
    const drawer = document.querySelector(".metropolis-system-drawer summary small");
    if (drawer) drawer.textContent = "คิว รายงาน และเครื่องมือข้อมูลเพิ่มเติม";
    const exchangeTitle = document.querySelector(".exchange-card h3");
    if (exchangeTitle) exchangeTitle.textContent = "รับ–ส่งข้อมูลสำรอง";
    const homeExport = document.querySelector("#homeExportBtn b");
    const syncExport = document.querySelector("#exportJsonBtn b");
    if (homeExport) homeExport.textContent = "ส่งไฟล์ออกเพื่อตรวจหรือสำรอง";
    if (syncExport) syncExport.textContent = "ส่งไฟล์ออกเพื่อตรวจหรือสำรอง";
    const settingsHero = document.querySelector("#settingsPage .hero-value");
    if (settingsHero) settingsHero.textContent = `NormalPocket ${VERSION}`;
  }

  function quickMetrics() {
    if (typeof state === "undefined" || !state) return { sales: 0, cash: 0, stock: 0, tasks: 0 };
    const today = typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10);
    const summary = daySummary(state, today);
    let cash = 0;
    try { cash = typeof currentBalanceSatang === "function" ? currentBalanceSatang() : 0; } catch (_) {}
    return { sales: summary.salesSatang, cash, stock: Number(state.store?.stockQty || 0), tasks: summary.openTasks };
  }

  function normalpocketQuickHome() {
    const home = document.getElementById("homePage");
    if (!home) return null;
    let panel = document.getElementById("normalpocketQuickHome");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "normalpocketQuickHome";
      panel.className = "np-quick-home";
      panel.innerHTML = `
        <div class="np-quick-head"><div><small>วันนี้ทำอะไร</small><h2>เริ่มงานได้เลย</h2></div><span>NormalPocket</span></div>
        <div class="np-daily-actions">
          <button type="button" class="np-action np-primary" data-np-action="sale"><span>ขายสินค้า</span><small>เลือกสินค้าแล้วขาย</small></button>
          <button type="button" class="np-action" data-np-action="quick"><span>ขายด่วน</span><small>ราคา + จำนวน + รับเงิน</small></button>
          <button type="button" class="np-action" data-np-action="receive"><span>รับสินค้า</span><small>เพิ่มของเข้าสต็อก</small></button>
          <button type="button" class="np-action" data-np-action="money"><span>เงิน</span><small>ดูเงินเข้าออก</small></button>
          <button type="button" class="np-action np-close" data-np-action="close"><span>จบวัน</span><small>สรุปก่อนปิดร้าน</small></button>
        </div>
        <div class="np-today-strip">
          <div><small>ยอดขายวันนี้</small><b id="npTodaySales">0 บาท</b></div>
          <div><small>เงินปัจจุบัน</small><b id="npTodayCash">0 บาท</b></div>
          <div><small>สต็อก</small><b id="npTodayStock">0</b></div>
          <div><small>งานค้างวันนี้</small><b id="npTodayTasks">0</b></div>
        </div>
        <div class="np-secondary-actions">
          <button type="button" data-np-page="store">รายการสินค้า</button>
          <button type="button" data-np-action="adjust">ปรับสต็อก</button>
          <button type="button" data-np-page="calendar">งานค้าง</button>
          <button type="button" data-np-page="report">รายงาน</button>
          <button type="button" data-np-page="settings">ตั้งค่า</button>
        </div>`;
      home.prepend(panel);
      panel.querySelector('[data-np-action="sale"]').onclick = () => { show("store"); setTimeout(() => document.getElementById("addSaleBtn")?.click(), 0); };
      panel.querySelector('[data-np-action="quick"]').onclick = openQuickSale;
      panel.querySelector('[data-np-action="receive"]').onclick = () => { show("store"); setTimeout(() => document.getElementById("addPurchaseBtn")?.click(), 0); };
      panel.querySelector('[data-np-action="money"]').onclick = () => show("ledger");
      panel.querySelector('[data-np-action="close"]').onclick = openDayClose;
      panel.querySelector('[data-np-action="adjust"]').onclick = openStockAdjust;
      panel.querySelectorAll("[data-np-page]").forEach(button => button.onclick = () => show(button.dataset.npPage));
    }
    const metrics = quickMetrics();
    const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    set("npTodaySales", `${baht(metrics.sales)} บาท`);
    set("npTodayCash", `${baht(metrics.cash)} บาท`);
    set("npTodayStock", metrics.stock.toLocaleString("th-TH"));
    set("npTodayTasks", metrics.tasks.toLocaleString("th-TH"));
    return panel;
  }

  function openQuickSale() {
    if (typeof openModal !== "function") return;
    openModal({
      title: "ขายด่วน",
      text: "ใช้กับของที่ยังไม่ได้สร้างเป็นสินค้า รับเงินครบและไม่ตัดสต็อกสินค้าในรายการ",
      body: `<div class="form-grid">
        <div class="field"><label>จำนวน</label><input id="npQuickQty" type="number" min="1" step="1" value="1"></div>
        <div class="field"><label>ราคาต่อชิ้น</label><input id="npQuickPrice" type="number" min="0" step="0.01"></div>
        <div class="field"><label>รับเงินจริง</label><input id="npQuickReceived" type="number" min="0" step="0.01"></div>
        <div class="field full"><label>หมายเหตุ</label><input id="npQuickNote" maxlength="160" placeholder="ไม่บังคับ"></div>
      </div>`,
      confirm: "บันทึกขายด่วน",
      onConfirm: async () => {
        try {
          const qty = parseQuantity(document.getElementById("npQuickQty").value, { label: "จำนวน" });
          const unitPriceSatang = parseMoneyToSatang(document.getElementById("npQuickPrice").value, { allowZero: true, label: "ราคา" });
          const receivedSatang = parseMoneyToSatang(document.getElementById("npQuickReceived").value, { allowZero: true, label: "เงินรับ" });
          const sale = buildQuickSale({ qty, unitPriceSatang, receivedSatang, date: localISO(), id: uid("QSALE"), at: nowIso() });
          sale.note = document.getElementById("npQuickNote").value.trim() || "ขายด่วน";
          state.store.sales.push(sale);
          if (receivedSatang > 0) addTransaction({ direction: "IN", amountSatang: receivedSatang, label: `ขายด่วน ${sale.id}`, source: "STORE", sourceId: sale.id, subtype: "QUICK_SALE_CASH", actionKey: `${sale.id}:cash` });
          closeModal();
          await persistAndRender("บันทึกขายด่วนแล้ว");
        } catch (error) {
          toast(error.message || String(error));
          modalBusy = false;
        }
      }
    });
  }

  function productOptions() {
    return (state?.store?.products || []).filter(item => item.active !== false).map(item => `<option value="${escapeText(item.id)}">${escapeText(item.name)}</option>`).join("");
  }

  function fillAdjustVariants() {
    const productId = document.getElementById("npAdjustProduct")?.value;
    const select = document.getElementById("npAdjustVariant");
    if (!select) return;
    const product = (state?.store?.products || []).find(item => item.id === productId);
    const variants = (product?.variants || []).filter(item => item.active !== false);
    select.innerHTML = variants.length
      ? variants.map(item => `<option value="${escapeText(item.id)}">${escapeText(root.NormalPocketCatalog?.optionLabel(item) || "ตัวเลือก")}</option>`).join("")
      : '<option value="">ไม่มีตัวเลือก</option>';
    select.disabled = !variants.length;
  }

  function openStockAdjust() {
    if (!state?.store?.products?.length || !root.NormalPocketProducts || !root.NormalPocketCatalog) {
      toast("เพิ่มสินค้าในรายการสินค้าก่อน");
      return;
    }
    openModal({
      title: "ปรับสต็อก",
      text: "เลือกเหตุผล แล้วกรอกจำนวน ระบบจะเก็บประวัติการปรับไว้",
      body: `<div class="form-grid">
        <div class="field full"><label>สินค้า</label><select id="npAdjustProduct">${productOptions()}</select></div>
        <div class="field full"><label>สี / ขนาด</label><select id="npAdjustVariant"></select></div>
        <div class="field"><label>เหตุผล</label><select id="npAdjustReason">${STOCK_ADJUST_REASONS.map(reason => `<option>${reason}</option>`).join("")}</select></div>
        <div class="field"><label>จำนวน</label><input id="npAdjustQty" type="number" step="1" value="0"></div>
        <div class="field full"><small>“นับใหม่” = ใส่จำนวนที่นับได้จริง · “อื่นๆ” = ใช้ + หรือ - ได้</small></div>
      </div>`,
      confirm: "บันทึกการปรับ",
      onConfirm: async () => {
        try {
          const productId = document.getElementById("npAdjustProduct").value;
          const variantId = document.getElementById("npAdjustVariant").disabled ? "" : document.getElementById("npAdjustVariant").value;
          const selection = root.NormalPocketProducts.resolveSelection(productId, variantId);
          const reason = document.getElementById("npAdjustReason").value;
          const value = int(document.getElementById("npAdjustQty").value, "จำนวน");
          const current = Number(selection.owner.stockQty || 0);
          const delta = stockAdjustmentDelta(reason, value, current);
          if (current + delta < 0) throw new Error("สต็อกไม่พอสำหรับการปรับนี้");
          const totalAfter = Number(state.store.stockQty || 0) + delta;
          if (totalAfter < 0 || totalAfter > MAX_QUANTITY) throw new Error("จำนวนสต็อกเกินขอบเขต");
          const unitCost = Number(root.NormalPocketCatalog.effectiveCostSatang(selection.product, selection.variant) || 0);
          root.NormalPocketCatalog.adjustStock(selection.product, selection.variantId, delta);
          state.store.stockValueSatang = Math.max(0, Number(state.store.stockValueSatang || 0) + (delta * unitCost));
          root.NormalPocketProducts.syncStoreStock();
          addAudit("STOCK_ADJUSTED", `${selection.productName} · ${selection.optionLabel || "ไม่มีตัวเลือก"} · ${reason} · ${delta >= 0 ? "+" : ""}${delta}`);
          closeModal();
          await persistAndRender("ปรับสต็อกแล้ว");
        } catch (error) {
          toast(error.message || String(error));
          modalBusy = false;
        }
      }
    });
    const product = document.getElementById("npAdjustProduct");
    if (product) product.onchange = fillAdjustVariants;
    fillAdjustVariants();
  }

  function alreadyClosed(date) {
    return (state?.events || []).some(item => item?.type === "DAY_CLOSED" && item.date === date);
  }

  function openDayClose() {
    const date = typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10);
    const summary = daySummary(state || {}, date);
    openModal({
      title: "จบวัน",
      text: alreadyClosed(date) ? "วันนี้บันทึกสรุปไว้แล้ว ข้อมูลจริงยังอยู่ครบ" : "ตรวจตัวเลขก่อนปิดวัน ระบบจะเก็บสรุปโดยไม่ลบสินค้า เงิน หรือประวัติ",
      body: `<div class="np-day-summary">
        <div><small>ยอดขาย</small><b>${baht(summary.salesSatang)} บาท</b></div>
        <div><small>เงินเข้า</small><b>${baht(summary.cashInSatang)} บาท</b></div>
        <div><small>เงินออก</small><b>${baht(summary.cashOutSatang)} บาท</b></div>
        <div><small>กำไรคร่าว ๆ</small><b>${baht(summary.estimatedGrossSatang)} บาท</b></div>
        <div><small>งานค้างวันนี้</small><b>${summary.openTasks}</b></div>
        <div><small>สต็อกคงเหลือ</small><b>${summary.stockQty}</b></div>
      </div>`,
      confirm: alreadyClosed(date) ? "ปิด" : "ยืนยันจบวัน",
      onConfirm: async () => {
        if (alreadyClosed(date)) { closeModal(); return; }
        const at = nowIso();
        state.events ||= [];
        state.events.push({ id: uid("DAY"), type: "DAY_CLOSED", date, summary, createdAt: at, updatedAt: at });
        addAudit("DAY_CLOSED", `จบวัน ${date} · ยอดขาย ${baht(summary.salesSatang)} บาท`);
        closeModal();
        await persistAndRender("บันทึกสรุปวันแล้ว");
      }
    });
  }

  function applySimpleUi() {
    applyNeutralBranding();
    normalpocketQuickHome();
    const withdraw = document.getElementById("withdrawStockBtn");
    if (withdraw) {
      withdraw.textContent = "ปรับสต็อก";
      withdraw.onclick = openStockAdjust;
    }
  }

  function queueApply() {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(applySimpleUi);
    else applySimpleUi();
  }

  const install = () => {
    if (root.__NORMALPOCKET_SIMPLE_FLOW_12__) return;
    root.__NORMALPOCKET_SIMPLE_FLOW_12__ = true;
    if (root.YGPHRuntime?.register) {
      root.YGPHRuntime.register("NORMALPOCKET_SIMPLE_FLOW_12", {
        afterRender: queueApply,
        afterPageChange: queueApply
      });
    }
    queueApply();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})(globalThis);
