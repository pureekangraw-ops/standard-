"use strict";

(() => {
  if (typeof document === "undefined") return;
  const copy = value => structuredClone(value);

  function requireRuntime() {
    if (typeof state === "undefined" || !state || typeof addTransaction !== "function" || typeof addQueue !== "function") throw new Error("Store runtime ยังไม่พร้อม");
  }

  function catalogApi() {
    const catalog = globalThis.NormalPocketCatalog;
    if (!catalog || typeof catalog.resolveStockOwner !== "function" || typeof catalog.adjustStock !== "function") throw new Error("Catalog runtime ยังไม่พร้อม");
    return catalog;
  }

  function selectedCatalog(productId, variantId) {
    requireRuntime();
    const catalog = catalogApi();
    const product = (state.store?.products || []).find(item => item.id === productId && item.active !== false);
    if (!product) throw new Error("กรุณาเลือกสินค้า");
    const owner = catalog.resolveStockOwner(product, variantId || null);
    const selectedVariant = owner === product ? null : owner;
    const snapshot = typeof catalog.snapshotSelection === "function"
      ? catalog.snapshotSelection(product, selectedVariant?.id || null)
      : { productId: product.id, variantId: selectedVariant?.id || null, options: {}, productName: product.name };
    return { catalog, product, owner, selectedVariant, snapshot };
  }

  function metaFromSelection(selection) {
    const { catalog, product, selectedVariant, snapshot } = selection;
    return {
      productId: snapshot.productId || product.id,
      variantId: snapshot.variantId || selectedVariant?.id || null,
      optionSnapshot: snapshot.options || {},
      productName: snapshot.productName || product.name,
      optionLabel: typeof catalog.optionLabel === "function" && selectedVariant ? catalog.optionLabel(selectedVariant) : ""
    };
  }

  function syncCatalogStock(catalog) {
    if (typeof catalog.catalogStockQty === "function") state.store.stockQty = catalog.catalogStockQty(state.store);
  }

  function stockContext(qty) {
    requireRuntime();
    if (Number(qty) > Number(state.store?.stockQty || 0)) throw new Error("สินค้าในสต็อกไม่พอ");
    const shadow = copy(state);
    const costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(shadow, Number(qty)) : 0;
    return { costSatang };
  }

  function catalogSelectionContext(productId, variantId) {
    return metaFromSelection(selectedCatalog(productId, variantId));
  }

  function catalogSaleContext(productId, variantId, qty) {
    const selection = selectedCatalog(productId, variantId);
    if (!selection.owner || Number(qty) > Number(selection.owner.stockQty || 0)) throw new Error("สต็อกตัวเลือกนี้ไม่พอ");
    const unitPriceSatang = typeof selection.catalog.effectiveSalePriceSatang === "function"
      ? selection.catalog.effectiveSalePriceSatang(selection.product, selection.selectedVariant)
      : Number(selection.product.salePriceSatang || 0);
    const shadow = copy(state);
    const costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(shadow, Number(qty)) : 0;
    return { costSatang, unitPriceSatang, ...metaFromSelection(selection) };
  }

  function catalogWithdrawalContext(productId, variantId, qty) {
    const selection = selectedCatalog(productId, variantId);
    if (!selection.owner || Number(qty) > Number(selection.owner.stockQty || 0)) throw new Error("สต็อกตัวเลือกนี้ไม่พอ");
    const shadow = copy(state);
    const costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(shadow, Number(qty)) : 0;
    return { costSatang, ...metaFromSelection(selection) };
  }

  function applySaleEffects(result) {
    requireRuntime();
    const sale = copy(result.sale);
    const catalog = sale.productId ? catalogApi() : null;
    if (catalog) {
      const product = (state.store?.products || []).find(item => item.id === sale.productId && item.active !== false);
      if (!product) throw new Error("ไม่พบสินค้าที่ขาย");
      const owner = catalog.resolveStockOwner(product, sale.variantId || null);
      if (!owner || Number(sale.qty) > Number(owner.stockQty || 0)) throw new Error("สต็อกตัวเลือกนี้ไม่พอ");
      catalog.adjustStock(product, sale.variantId || null, -Number(sale.qty));
    } else if (Number(sale.qty) > Number(state.store?.stockQty || 0)) {
      throw new Error("สินค้าในสต็อกไม่พอ");
    }
    sale.costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(state, Number(sale.qty)) : Number(sale.costSatang || 0);
    if (catalog) syncCatalogStock(catalog);
    state.store.sales.push(sale);
    for (const intent of result.transactions || []) {
      if (intent.owner !== "FINANCE") throw new Error("transaction owner ไม่ถูกต้อง");
      addTransaction({
        direction: intent.direction,
        amountSatang: intent.amountSatang,
        label: intent.subtype === "SALE_SHIPPING_COST" ? `ค่าจัดส่งบิล ${sale.id}` : `รับเงินจริงจากบิล ${sale.id}`,
        source: "STORE", sourceId: sale.id, subtype: intent.subtype, actionKey: intent.actionKey
      });
    }
    for (const effect of result.calendarEffects || []) {
      if (effect.owner !== "CALENDAR" || effect.type !== "CREATE_RECEIVABLE_QUEUE") throw new Error("Calendar effect ไม่ถูกต้อง");
      addQueue({ source: effect.source, sourceId: sale.id, actionType: effect.actionType, status: effect.status, amountSatang: effect.amountSatang, due: effect.due,
        effects: { complete: "เพิ่มเงินจริงและลดยอดค้าง", cancel: "ยกเลิกบิล คืนสต็อกไปสินค้าตัวเดิม และย้อนเงิน" } });
    }
    return copy(sale);
  }

  function applyPurchaseEffects(result) {
    requireRuntime();
    const purchase = copy(result.purchase);
    const selection = selectedCatalog(purchase.productId, purchase.variantId);
    selection.catalog.adjustStock(selection.product, purchase.variantId || null, Number(purchase.qty));
    state.store.stockValueSatang = Number(state.store.stockValueSatang || 0) + Number(purchase.costSatang || 0);
    syncCatalogStock(selection.catalog);
    state.store.purchases.push(purchase);
    for (const intent of result.transactions || []) {
      if (intent.owner !== "FINANCE") throw new Error("transaction owner ไม่ถูกต้อง");
      addTransaction({ direction: intent.direction, amountSatang: intent.amountSatang, label: `ซื้อสินค้า ${purchase.id}`, source: "STORE", sourceId: purchase.id, subtype: intent.subtype, actionKey: intent.actionKey });
    }
    for (const effect of result.calendarEffects || []) {
      if (effect.owner !== "CALENDAR" || effect.type !== "CREATE_PURCHASE_RETURN_QUEUE") throw new Error("Calendar effect ไม่ถูกต้อง");
      addQueue({ source: "STORE", sourceId: purchase.id, actionType: effect.actionType, amountSatang: effect.amountSatang, due: effect.due,
        effects: { complete: "ปิดช่วงตรวจและเก็บสินค้า", cancel: "คืนสินค้าตัวเดิมและย้อนเงิน" } });
    }
    return copy(purchase);
  }

  function applyWithdrawalRecord(record) {
    requireRuntime();
    const withdrawal = copy(record);
    const selection = selectedCatalog(withdrawal.productId, withdrawal.variantId);
    if (Number(withdrawal.qty) > Number(selection.owner.stockQty || 0)) throw new Error("สต็อกตัวเลือกนี้ไม่พอ");
    withdrawal.costSatang = typeof takeStockFromPool === "function" ? takeStockFromPool(state, Number(withdrawal.qty)) : Number(withdrawal.costSatang || 0);
    selection.catalog.adjustStock(selection.product, withdrawal.variantId || null, -Number(withdrawal.qty));
    syncCatalogStock(selection.catalog);
    state.store.withdrawals.push(withdrawal);
    if (typeof addAudit === "function") addAudit("STOCK_WITHDRAWN", `${withdrawal.productName} · ${withdrawal.qty}`);
    return copy(withdrawal);
  }

  globalThis.NormalPocketStorePort = Object.freeze({
    stockContext,
    catalogSelectionContext,
    catalogSaleContext,
    catalogWithdrawalContext,
    applySaleEffects,
    applyPurchaseEffects,
    applyWithdrawalRecord
  });
})();
