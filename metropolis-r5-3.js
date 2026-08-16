"use strict";

/* YGPH STANDARD — retained live-selector compatibility wrappers only */

const METROPOLIS_R5_3_VERSION = "5.3.4-standard-live-authority";
const STATUS_SIGNALS = Object.freeze({ GREEN: "GREEN", YELLOW: "YELLOW", RED: "RED", HIDDEN: "HIDDEN" });

function statusSignal(item, today) {
  if (!item) return STATUS_SIGNALS.HIDDEN;
  const status = String(item.status || "").toUpperCase();
  if (status === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
  if (status === "COMPLETED") return STATUS_SIGNALS.GREEN;
  const due = String(item.due || "").slice(0, 10);
  const now = String(today || "").slice(0, 10);
  if (due && now && due < now) return STATUS_SIGNALS.RED;
  return STATUS_SIGNALS.YELLOW;
}

function liveStatusSignal(item, sourceStatus, today) {
  if (String(sourceStatus || "").toUpperCase() === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
  return statusSignal(item, today);
}

function selectLiveRecords(records) {
  return Array.isArray(records)
    ? records.filter(record => String(record?.status || "").toUpperCase() !== "CANCELLED")
    : [];
}

function selectLiveCalendar(calendar, sourceStatusOf = () => null, today = "") {
  return Array.isArray(calendar)
    ? calendar.filter(item => liveStatusSignal(item, sourceStatusOf(item), today) !== STATUS_SIGNALS.HIDDEN)
    : [];
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_R5_3_VERSION,
    STATUS_SIGNALS,
    statusSignal,
    liveStatusSignal,
    selectLiveRecords,
    selectLiveCalendar
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let queued = false;

    function todayKey() {
      return typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10);
    }

    function sourceStatusOf(item) {
      if (!item || typeof findSource !== "function") return null;
      return findSource(item.source, item.sourceId)?.status || null;
    }

    function renderLiveSourceLists() {
      if (typeof state === "undefined" || !state || typeof recordHtml !== "function" || typeof lastFive !== "function") return;

      const sales = selectLiveRecords(state.store?.sales);
      const purchases = selectLiveRecords(state.store?.purchases);
      const obligations = selectLiveRecords(state.ledger?.obligations);

      const saleList = document.getElementById("saleList");
      if (saleList) saleList.innerHTML = sales.length ? lastFive(sales).map(sale => recordHtml("🧾", `${sale.customer} · ${sale.qty} ชิ้น`, `${dateTH(sale.date)} · รับแล้ว ${money(sale.receivedSatang)} · ค้าง ${money(sale.outstandingSatang)}`, `${money(sale.totalSatang)} ฿`, queueFor("STORE", sale.id)?.status || sale.status, "STORE", sale.id)).join("") : '<div class="empty">ยังไม่มีรายการขาย</div>';

      const purchaseList = document.getElementById("purchaseList");
      if (purchaseList) purchaseList.innerHTML = purchases.length ? lastFive(purchases).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, queueFor("STORE", item.id)?.status || item.status, "STORE", item.id)).join("") : '<div class="empty">ยังไม่มีรายการรับสินค้า</div>';

      const debtList = document.getElementById("debtList");
      if (debtList) debtList.innerHTML = obligations.length ? lastFive(obligations).map(item => {
        const paidInstallments = (item.installments || []).filter(entry => entry.status === "COMPLETED").length;
        return recordHtml("🧷", item.name, `${item.installmentCount} งวด · จ่ายแล้ว ${paidInstallments}/${item.installmentCount} · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, queueFor("LEDGER", item.id)?.status || item.status, "LEDGER", item.id);
      }).join("") : '<div class="empty">ยังไม่มีภาระ</div>';

      const countButtons = [
        ["allSalesBtn", sales],
        ["allPurchasesBtn", purchases],
        ["allDebtsBtn", obligations]
      ];
      countButtons.forEach(([id, records]) => document.getElementById(id)?.classList.toggle("hidden", records.length <= 5));
      if (typeof bindGoCalendar === "function") bindGoCalendar();
    }

    function patchHistoryHtml() {
      if (globalThis.__YGPH_R53_HISTORY_SELECTOR_PATCHED__ || typeof historyHtml !== "function") return;
      const baseHistoryHtml = historyHtml;
      historyHtml = function(kind) {
        if (typeof state === "undefined" || !state) return baseHistoryHtml(kind);
        if (kind === "sales") return sortNewest(selectLiveRecords(state.store?.sales)).map(item => recordHtml("🧾", `${item.customer} · ${item.qty} ชิ้น`, `${dateTH(item.date)} · ค้าง ${money(item.outstandingSatang)}`, `${money(item.totalSatang)} ฿`, item.status, "STORE", item.id)).join("");
        if (kind === "purchases") return sortNewest(selectLiveRecords(state.store?.purchases)).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, item.status, "STORE", item.id)).join("");
        if (kind === "debts") return sortNewest(selectLiveRecords(state.ledger?.obligations)).map(item => recordHtml("🧷", item.name, `${item.installmentCount} งวด · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, item.status, "LEDGER", item.id)).join("");
        return baseHistoryHtml(kind);
      };
      globalThis.__YGPH_R53_HISTORY_SELECTOR_PATCHED__ = true;
    }

    function patchFlowCalendarItems() {
      if (globalThis.__YGPH_R53_FLOW_ITEMS_PATCHED__ || typeof flowCalendarItems !== "function") return;
      const baseFlowCalendarItems = flowCalendarItems;
      flowCalendarItems = function(...args) {
        return selectLiveCalendar(baseFlowCalendarItems(...args), sourceStatusOf, todayKey());
      };
      globalThis.__YGPH_R53_FLOW_ITEMS_PATCHED__ = true;
    }

    function apply() {
      document.documentElement.dataset.metropolisR53 = METROPOLIS_R5_3_VERSION;
      renderLiveSourceLists();
    }

    function queueApply() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        apply();
      });
    }

    function install() {
      if (globalThis.__YGPH_STANDARD_R53_RUNTIME__) return;
      globalThis.__YGPH_STANDARD_R53_RUNTIME__ = true;
      patchHistoryHtml();
      patchFlowCalendarItems();
      if (globalThis.YGPHRuntime?.register) {
        globalThis.YGPHRuntime.register("STANDARD_R53_LIVE_STATUS", {
          afterRender: queueApply,
          afterPageChange: queueApply
        });
      }
      apply();
      queueApply();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
