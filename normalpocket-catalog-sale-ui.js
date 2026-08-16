"use strict";

(() => {
  if (typeof document === "undefined") return;
  let installed = false;
  const operationReady = import("./src/store/sale-operations.mjs");

  function catalog() {
    if (!globalThis.NormalPocketCatalog) throw new Error("Catalog runtime ยังไม่พร้อม");
    return globalThis.NormalPocketCatalog;
  }

  function port() {
    if (!globalThis.NormalPocketStorePort) throw new Error("Store port ยังไม่พร้อม");
    return globalThis.NormalPocketStorePort;
  }

  function activeProducts() {
    return (state.store?.products || []).filter(product => product.active !== false);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function productOptions() {
    const api = catalog();
    return activeProducts().map(product => `<option value="${esc(product.id)}">${esc(product.name)} · คงเหลือ ${api.productStockQty(product)}</option>`).join("");
  }

  function populateVariants(productId) {
    const api = catalog();
    const product = activeProducts().find(item => item.id === productId);
    const select = byId("npFinalSaleVariant");
    if (!product || !select) return;
    const variants = (product.variants || []).filter(item => item.active !== false);
    select.innerHTML = variants.length
      ? '<option value="">เลือกตัวเลือก</option>' + variants.map(variant => `<option value="${esc(variant.id)}">${esc(api.optionLabel(variant))} · คงเหลือ ${Number(variant.stockQty || 0)}</option>`).join("")
      : '<option value="">ไม่มีตัวเลือก</option>';
    select.disabled = !variants.length;
    const variant = variants.find(item => item.id === select.value) || null;
    byId("npFinalSaleUnitPrice").value = satangToBaht(api.effectiveSalePriceSatang(product, variant));
  }

  function updateSelectedPrice() {
    const api = catalog();
    const product = activeProducts().find(item => item.id === byId("npFinalSaleProduct")?.value);
    if (!product) return;
    const variant = (product.variants || []).find(item => item.id === byId("npFinalSaleVariant")?.value) || null;
    byId("npFinalSaleUnitPrice").value = satangToBaht(api.effectiveSalePriceSatang(product, variant));
  }

  async function openCatalogSale() {
    if (!activeProducts().length) return toast("เพิ่มสินค้าในรายการสินค้าก่อน");
    const operation = await operationReady;
    openModal({
      title: "ขายสินค้า",
      text: "เลือกสินค้าที่ขายจริง ระบบจะตัดสต็อกและบันทึกเงิน/ค่าจัดส่งตามเจ้าของข้อมูล",
      body: `<div class="form-grid">
        <div class="field full"><label>สินค้า</label><select id="npFinalSaleProduct">${productOptions()}</select></div>
        <div class="field full"><label>สี / ขนาด</label><select id="npFinalSaleVariant"></select></div>
        <div class="field"><label>จำนวน</label><input id="npFinalSaleQty" type="number" min="1" value="1"></div>
        <div class="field"><label>รับเงินจริงครั้งนี้</label><input id="npFinalSaleReceived" type="number" min="0" step="0.01" value="0"></div>
        <div class="field full"><label class="r5-check"><input id="saleHasShippingCost" type="checkbox"> ร้านออกค่าจัดส่ง</label><input id="npFinalSaleShippingCost" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="ค่าจัดส่ง" disabled></div>
      </div>
      <details class="np-sale-advanced">
        <summary>ข้อมูลเพิ่มเติม</summary>
        <div class="form-grid">
          <div class="field"><label>ราคาต่อหน่วย</label><input id="npFinalSaleUnitPrice" type="number" min="0" step="0.01"></div>
          <div class="field"><label>ลูกค้า</label><input id="npFinalSaleCustomer" maxlength="80"></div>
          <div class="field full"><label>ช่องทางติดต่อ</label><input id="npFinalSaleContact" maxlength="100"></div>
          <div class="field full"><label>วันนัดยอดค้าง</label><input id="npFinalSaleDue" type="date" value="${localISO()}"></div>
          <div class="field full"><label>หมายเหตุ</label><input id="npFinalSaleNote" maxlength="200"></div>
        </div>
      </details>`,
      confirm: "บันทึกขาย",
      onConfirm: async () => {
        try {
          const qty = parseQuantity(byId("npFinalSaleQty").value, { label: "จำนวนขาย" });
          const productId = byId("npFinalSaleProduct").value;
          const variantId = byId("npFinalSaleVariant").disabled ? null : byId("npFinalSaleVariant").value;
          const context = port().catalogSaleContext(productId, variantId, qty);
          const unitPriceSatang = parseMoneyToSatang(byId("npFinalSaleUnitPrice").value, { allowZero: true, label: "ราคาต่อหน่วย" });
          const receivedSatang = parseMoneyToSatang(byId("npFinalSaleReceived").value, { allowZero: true, label: "เงินรับ" });
          const shippingCostSatang = byId("saleHasShippingCost").checked
            ? parseMoneyToSatang(byId("npFinalSaleShippingCost").value, { allowZero: false, label: "ค่าจัดส่ง" })
            : 0;
          const totalSatang = qty * unitPriceSatang;
          const due = byId("npFinalSaleDue").value;
          if (receivedSatang > totalSatang) throw new Error("เงินรับเกินยอดขาย");
          if (receivedSatang < totalSatang && !validISODate(due)) throw new Error("รายการค้างต้องมีวันนัด");
          const id = uid("SALE"), at = nowIso();
          const result = operation.buildSaleEffects({
            id, qty, unitPriceSatang, receivedSatang, shippingCostSatang, costSatang: context.costSatang,
            customer: byId("npFinalSaleCustomer").value.trim(), contact: byId("npFinalSaleContact").value.trim(),
            due, note: byId("npFinalSaleNote").value.trim(), date: localISO(), at,
            productId: context.productId, variantId: context.variantId, optionSnapshot: context.optionSnapshot, productName: context.productName
          });
          const sale = port().applySaleEffects(result);
          closeModal();
          await persistAndRender(`สร้างบิลขายแล้ว · สุทธิ ${money(sale.netCashEffectSatang)} บาท`, {
            eventType: "NORMALPOCKET_CATALOG_SALE_RECORDED",
            sourceDomain: "STORE",
            sourceOwner: "STORE",
            targetDomain: ["STORE", "LEDGER", "CALENDAR"],
            idempotencyKey: `normalpocket-catalog-sale:${id}`,
            timestamp: at
          });
        } catch (error) {
          toast(error.message || "บันทึกขายไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });

    const product = byId("npFinalSaleProduct");
    const variant = byId("npFinalSaleVariant");
    const shippingToggle = byId("saleHasShippingCost");
    const shipping = byId("npFinalSaleShippingCost");
    const syncShipping = () => { shipping.disabled = !shippingToggle.checked; if (!shippingToggle.checked) shipping.value = ""; };
    product.onchange = () => populateVariants(product.value);
    variant.onchange = updateSelectedPrice;
    shippingToggle.addEventListener("change", syncShipping);
    populateVariants(product.value);
    syncShipping();
  }

  function install() {
    if (installed) return;
    const button = typeof byId === "function" ? byId("addSaleBtn") : null;
    if (!button || !globalThis.NormalPocketCatalog || !globalThis.NormalPocketStorePort) {
      setTimeout(install, 40);
      return;
    }
    installed = true;
    button.onclick = openCatalogSale;
    document.documentElement.dataset.normalpocketStoreSaleAuthority = "catalog-current";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
