"use strict";

(function normalPocketReconcile(root) {
  if (typeof document === "undefined") return;
  if (!root.NormalPocketCatalog || !root.NormalPocketProducts) throw new Error("NormalPocket product runtime ไม่พร้อมใช้งาน");

  const originalPersistAndRender = persistAndRender;

  function productFor(record) {
    return (state?.store?.products || []).find(product => product.id === record?.productId) || null;
  }

  function reconcileCancelledSales() {
    for (const sale of state?.store?.sales || []) {
      if (!sale?.productId || sale.status !== "CANCELLED" || !sale.stockRestored || sale.productStockRestored) continue;
      const product = productFor(sale);
      if (!product) continue;
      root.NormalPocketCatalog.adjustStock(product, sale.variantId || null, Number(sale.qty || 0));
      sale.productStockRestored = true;
    }
  }

  function reconcileReturnedPurchases() {
    for (const purchase of state?.store?.purchases || []) {
      if (!purchase?.productId || purchase.status !== "CANCELLED" || !purchase.returnedAt || purchase.productStockRemoved) continue;
      const product = productFor(purchase);
      if (!product) continue;
      root.NormalPocketCatalog.adjustStock(product, purchase.variantId || null, -Number(purchase.qty || 0));
      purchase.productStockRemoved = true;
    }
  }

  function reconcileProductStockHistory() {
    if (!state?.store) return;
    reconcileCancelledSales();
    reconcileReturnedPurchases();
    root.NormalPocketProducts.syncStoreStock();
  }

  persistAndRender = async function normalPocketPersistAndRender(...args) {
    reconcileProductStockHistory();
    return originalPersistAndRender(...args);
  };

  root.NormalPocketProductReconcile = Object.freeze({ reconcileProductStockHistory });
})(globalThis);
