"use strict";

(() => {
  if (typeof document === "undefined") return;
  let installed = false;

  function install() {
    if (installed) return;
    if (typeof receivableAt !== "function" || typeof buildReportData !== "function") { setTimeout(install, 40); return; }
    installed = true;
    receivableAt = function(end) {
      return state.store.sales.filter(sale => activeAt(sale, end)).reduce((sum, sale) => {
        const received = state.ledger.transactions
          .filter(tx => tx.source === "STORE" && tx.sourceId === sale.id && tx.direction === "IN" && ["SALE_INITIAL_RECEIPT", "SALE_RECEIPT"].includes(tx.subtype) && recordDate(tx) <= end && !tx.reversedBy && !(typeof isReclassifiedReceipt === "function" && isReclassifiedReceipt(tx)))
          .reduce((value, tx) => value + Number(tx.amountSatang || 0), 0);
        return sum + Math.max(0, Number(sale.totalSatang || 0) - received);
      }, 0);
    };
    const baseReport = buildReportData;
    buildReportData = function(start, end) {
      const report = baseReport(start, end);
      const shippingOut = state.ledger.transactions
        .filter(tx => tx.source === "STORE" && tx.subtype === "SALE_SHIPPING_COST" && tx.direction === "OUT" && recordDate(tx) >= start && recordDate(tx) <= end && !tx.reversedBy)
        .reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
      report.store.cashInSatang = Number(report.store.cashInSatang || 0) - shippingOut;
      return report;
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();
