"use strict";

(() => {
  if (typeof document === "undefined") return;
  const copy = value => structuredClone(value);

  function requireRuntime() {
    if (typeof state === "undefined" || !state || typeof addTransaction !== "function" || typeof addQueue !== "function") throw new Error("Store runtime ยังไม่พร้อม");
  }

  function stockContext(qty) {
    requireRuntime();
    if (Number(qty) > Number(state.store?.stockQty || 0)) throw new Error("สินค้าในสต็อกไม่พอ");
    const shadow = copy(state);
    const costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(shadow, Number(qty)) : 0;
    return { costSatang };
  }

  function applySaleEffects(result) {
    requireRuntime();
    const sale = copy(result.sale);
    if (Number(sale.qty) > Number(state.store?.stockQty || 0)) throw new Error("สินค้าในสต็อกไม่พอ");
    sale.costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(state, Number(sale.qty)) : Number(sale.costSatang || 0);
    state.store.sales.push(sale);
    for (const intent of result.transactions || []) {
      if (intent.owner !== "FINANCE") throw new Error("transaction owner ไม่ถูกต้อง");
      addTransaction({
        direction: intent.direction,
        amountSatang: intent.amountSatang,
        label: intent.subtype === "SALE_SHIPPING_COST" ? `ค่าจัดส่งบิล ${sale.id}` : `รับเงินจริงจากบิล ${sale.id}`,
        source: "STORE",
        sourceId: sale.id,
        subtype: intent.subtype,
        actionKey: intent.actionKey
      });
    }
    for (const effect of result.calendarEffects || []) {
      if (effect.owner !== "CALENDAR" || effect.type !== "CREATE_RECEIVABLE_QUEUE") throw new Error("Calendar effect ไม่ถูกต้อง");
      addQueue({
        source: effect.source,
        sourceId: sale.id,
        actionType: effect.actionType,
        status: effect.status,
        amountSatang: effect.amountSatang,
        due: effect.due,
        effects: { complete: "เพิ่มเงินจริงและลดยอดค้าง", cancel: "ยกเลิกบิล คืนสต็อก และย้อนเงิน" }
      });
    }
    return copy(sale);
  }

  globalThis.NormalPocketStorePort = Object.freeze({ stockContext, applySaleEffects });
})();
