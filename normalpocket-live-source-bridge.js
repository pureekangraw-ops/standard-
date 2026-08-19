"use strict";

(() => {
  if (typeof document === "undefined") return;
  if (globalThis.__NORMALPOCKET_LIVE_SOURCE_BRIDGE__) return;

  function selectLiveRecords(records) {
    return Array.isArray(records)
      ? records.filter(record => String(record?.status || "").toUpperCase() !== "CANCELLED")
      : [];
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
    if (globalThis.__NORMALPOCKET_HISTORY_SELECTOR_PATCHED__ || typeof historyHtml !== "function") return;
    const baseHistoryHtml = historyHtml;
    historyHtml = function(kind) {
      if (typeof state === "undefined" || !state) return baseHistoryHtml(kind);
      if (kind === "sales") return sortNewest(selectLiveRecords(state.store?.sales)).map(item => recordHtml("🧾", `${item.customer} · ${item.qty} ชิ้น`, `${dateTH(item.date)} · ค้าง ${money(item.outstandingSatang)}`, `${money(item.totalSatang)} ฿`, item.status, "STORE", item.id)).join("");
      if (kind === "purchases") return sortNewest(selectLiveRecords(state.store?.purchases)).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, item.status, "STORE", item.id)).join("");
      if (kind === "debts") return sortNewest(selectLiveRecords(state.ledger?.obligations)).map(item => recordHtml("🧷", item.name, `${item.installmentCount} งวด · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, item.status, "LEDGER", item.id)).join("");
      return baseHistoryHtml(kind);
    };
    globalThis.__NORMALPOCKET_HISTORY_SELECTOR_PATCHED__ = true;
  }

  let queued = false;
  function apply() {
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
    patchHistoryHtml();
    globalThis.YGPHRuntime?.register("NORMALPOCKET_LIVE_SOURCE_BRIDGE", {
      afterRender: queueApply,
      afterPageChange: queueApply
    });
    apply();
    queueApply();
  }

  globalThis.__NORMALPOCKET_LIVE_SOURCE_BRIDGE__ = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
