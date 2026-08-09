"use strict";

function standardUiModel(state, helpers = {}) {
  const today = helpers.today || new Date().toISOString().slice(0, 10);
  const recordDate = helpers.recordDate || (item => String(item?.date || item?.createdAt || "").slice(0, 10));
  const money = helpers.money || (satang => (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }));
  const salesToday = (state?.store?.sales || []).filter(item => item.status !== "CANCELLED" && recordDate(item) === today).reduce((sum, item) => sum + Number(item.totalSatang || 0), 0);
  const balance = Number(state?.ledger?.openingBalanceSatang || 0) + (state?.ledger?.transactions || []).reduce((sum, tx) => sum + (tx.direction === "IN" ? 1 : -1) * Number(tx.amountSatang || 0), 0);
  return {
    cards: [
      ["store", "STORE", "ร้านค้า", "ยอดขายวันนี้", money(salesToday), "🏪"],
      ["ledger", "LEDGER", "การเงิน", "เงินปัจจุบัน", money(balance), "📒"],
      ["calendar", "CALENDAR", "ปฏิทิน", "รายการคงค้าง", String((state?.calendar || []).filter(item => !["COMPLETED", "CANCELLED"].includes(item.status)).length), "📅"]
    ]
  };
}

if (typeof module === "object" && module.exports) module.exports = { standardUiModel };
