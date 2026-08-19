"use strict";

(() => {
  if (typeof document === "undefined") return;
  let installed = false;
  const operationsReady = import("./src/store/inventory-operations.mjs");

  const api = () => globalThis.NormalPocketCatalog;
  const port = () => globalThis.NormalPocketStorePort;
  const products = () => (state.store?.products || []).filter(item => item.active !== false);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  function selectionFields(prefix) {
    return `<div class="field full"><label>สินค้า</label><select id="${prefix}Product">${products().map(product => `<option value="${esc(product.id)}">${esc(product.name)} · คงเหลือ ${api().productStockQty(product)}</option>`).join("")}</select></div>
      <div class="field full"><label>สี / ขนาด</label><select id="${prefix}Variant"></select></div>`;
  }

  function populateVariants(prefix) {
    const product = products().find(item => item.id === byId(`${prefix}Product`)?.value);
    const select = byId(`${prefix}Variant`);
    if (!product || !select) return;
    const variants = (product.variants || []).filter(item => item.active !== false);
    select.innerHTML = variants.length
      ? '<option value="">เลือกตัวเลือก</option>' + variants.map(item => `<option value="${esc(item.id)}">${esc(api().optionLabel(item))} · คงเหลือ ${Number(item.stockQty || 0)}</option>`).join("")
      : '<option value="">ไม่มีตัวเลือก</option>';
    select.disabled = !variants.length;
  }

  function wire(prefix) {
    const product = byId(`${prefix}Product`);
    product.onchange = () => populateVariants(prefix);
    populateVariants(prefix);
  }

  function selected(prefix) {
    return {
      productId: byId(`${prefix}Product`).value,
      variantId: byId(`${prefix}Variant`).disabled ? null : byId(`${prefix}Variant`).value || null
    };
  }

  async function openPurchase() {
    if (!products().length) return toast("เพิ่มสินค้าในรายการสินค้าก่อน");
    const operations = await operationsReady;
    openModal({
      title: "รับสินค้าเข้า",
      text: "เลือกสินค้าที่รับจริง แล้วบันทึกต้นทุนและช่วงตรวจสินค้า",
      body: `<div class="form-grid">${selectionFields("npCurrentBuy")}
        <div class="field"><label>จำนวน</label><input id="npCurrentBuyQty" type="number" min="1"></div>
        <div class="field"><label>ต้นทุนรวม</label><input id="npCurrentBuyCost" type="number" min="0" step="0.01"></div>
        <div class="field full"><label>วันตรวจ/คืนของ (ไม่บังคับ)</label><input id="npCurrentBuyDue" type="date"></div>
      </div>`,
      confirm: "ซื้อและรับเข้า",
      onConfirm: async () => {
        try {
          const choice = selected("npCurrentBuy");
          const context = port().catalogSelectionContext(choice.productId, choice.variantId);
          const qty = parseQuantity(byId("npCurrentBuyQty").value, { label: "จำนวนรับเข้า" });
          const costSatang = parseMoneyToSatang(byId("npCurrentBuyCost").value, { allowZero: true, label: "ต้นทุน" });
          const due = byId("npCurrentBuyDue").value;
          if (due && !validISODate(due)) throw new Error("วันตรวจ/คืนของไม่ถูกต้อง");
          const id = uid("BUY"), at = nowIso();
          const result = operations.buildPurchaseEffects({ id, qty, costSatang, due, date: localISO(), at, ...context });
          port().applyPurchaseEffects(result);
          closeModal();
          await persistAndRender("รับสินค้าเข้าแล้ว", { eventType: "NORMALPOCKET_PURCHASE_RECORDED", sourceDomain: "STORE", sourceOwner: "STORE", targetDomain: ["STORE", "LEDGER", "CALENDAR"], idempotencyKey: `normalpocket-purchase:${id}`, timestamp: at });
        } catch (error) {
          toast(error.message || "รับสินค้าไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });
    wire("npCurrentBuy");
  }

  async function openWithdrawal() {
    if (!products().length) return toast("เพิ่มสินค้าในรายการสินค้าก่อน");
    const operations = await operationsReady;
    openModal({
      title: "เบิกสินค้า",
      text: "เลือกสินค้าที่นำออกจริง",
      body: `<div class="form-grid">${selectionFields("npCurrentWithdraw")}
        <div class="field"><label>จำนวน</label><input id="npCurrentWithdrawQty" type="number" min="1"></div>
        <div class="field"><label>เหตุผล</label><select id="npCurrentWithdrawReason"><option>ใช้เอง</option><option>แจก</option><option>ชำรุด</option><option>ตัวอย่างสินค้า</option><option>อื่น ๆ</option></select></div>
        <div class="field full"><label>หมายเหตุ</label><input id="npCurrentWithdrawNote" maxlength="160"></div>
      </div>`,
      confirm: "บันทึกการเบิก",
      onConfirm: async () => {
        try {
          const choice = selected("npCurrentWithdraw");
          const qty = parseQuantity(byId("npCurrentWithdrawQty").value, { label: "จำนวนเบิก" });
          const context = port().catalogWithdrawalContext(choice.productId, choice.variantId, qty);
          const id = uid("WD"), at = nowIso();
          const record = operations.buildWithdrawalRecord({ id, qty, costSatang: context.costSatang, reason: byId("npCurrentWithdrawReason").value, note: byId("npCurrentWithdrawNote").value.trim(), date: localISO(), at, ...context });
          port().applyWithdrawalRecord(record);
          closeModal();
          await persistAndRender("บันทึกการเบิกแล้ว", { eventType: "NORMALPOCKET_STOCK_WITHDRAWN", sourceDomain: "STORE", sourceOwner: "STORE", targetDomain: ["STORE"], idempotencyKey: `normalpocket-withdraw:${id}`, timestamp: at });
        } catch (error) {
          toast(error.message || "เบิกสินค้าไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });
    wire("npCurrentWithdraw");
  }

  function install() {
    if (installed) return;
    const purchase = typeof byId === "function" ? byId("addPurchaseBtn") : null;
    const withdraw = typeof byId === "function" ? byId("withdrawStockBtn") : null;
    if (!purchase || !withdraw || !api() || !port()) { setTimeout(install, 40); return; }
    installed = true;
    purchase.onclick = openPurchase;
    withdraw.onclick = openWithdrawal;
    document.documentElement.dataset.normalpocketStoreInventoryAuthority = "catalog-current";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();
