"use strict";

(() => {
  if (typeof document === "undefined") return;
  let installed = false;
  const operationReady = import("./src/store/sale-operations.mjs");

  function port() {
    if (!globalThis.NormalPocketStorePort) throw new Error("Store port ยังไม่พร้อม");
    return globalThis.NormalPocketStorePort;
  }

  async function openSale() {
    const operation = await operationReady;
    openModal({
      title: "ขายสินค้า",
      text: "บันทึกยอดขาย เงินที่รับ และค่าจัดส่งของร้านในครั้งเดียว",
      body: `<div class="form-grid">
        <div class="field"><label>จำนวนชิ้น</label><input id="saleQty" type="number" min="1" value="1"></div>
        <div class="field"><label>ราคาต่อชิ้น</label><input id="saleUnitPrice" type="number" min="0" step="0.01" value="${satangToBaht(state.settings.defaultPriceSatang)}"></div>
        <div class="field"><label>รับเงินจริง</label><input id="saleReceived" type="number" min="0" step="0.01" value="0"><small>ยอดที่ยังไม่รับจะเป็นลูกหนี้</small></div>
        <div class="field"><label class="r5-check"><input id="saleHasShippingCost" type="checkbox"> มีค่าจัดส่ง</label><input id="saleShippingCost" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="ค่าจัดส่งที่ร้านจ่าย" disabled></div>
        <div class="field"><label>ลูกค้า</label><input id="saleCustomer" maxlength="80"></div>
        <div class="field full"><label>ช่องทางติดต่อ</label><input id="saleContact" maxlength="100"></div>
        <div class="field full"><label>วันนัดยอดค้าง</label><input id="saleDue" type="date" value="${localISO()}"></div>
        <div class="field full"><label>หมายเหตุ</label><input id="saleNote" maxlength="200"></div>
      </div>`,
      confirm: "บันทึกขาย",
      onConfirm: async () => {
        try {
          const qty = parseQuantity(byId("saleQty").value, { label: "จำนวนขาย" });
          const unitPriceSatang = parseMoneyToSatang(byId("saleUnitPrice").value, { allowZero: true, label: "ราคาต่อชิ้น" });
          const receivedSatang = parseMoneyToSatang(byId("saleReceived").value, { allowZero: true, label: "เงินรับ" });
          const shippingCostSatang = byId("saleHasShippingCost").checked
            ? parseMoneyToSatang(byId("saleShippingCost").value, { allowZero: false, label: "ค่าจัดส่ง" }) : 0;
          const totalSatang = qty * unitPriceSatang;
          if (receivedSatang > totalSatang) throw new Error("เงินรับมากกว่ายอดขาย");
          const due = byId("saleDue").value;
          if (receivedSatang < totalSatang && !due) throw new Error("รายการค้างต้องมีวันนัด");
          const { costSatang } = port().stockContext(qty);
          const id = uid("SALE");
          const at = nowIso();
          const result = operation.buildSaleEffects({
            id, qty, unitPriceSatang, receivedSatang, shippingCostSatang, costSatang,
            customer: byId("saleCustomer").value.trim(), contact: byId("saleContact").value.trim(),
            due, note: byId("saleNote").value.trim(), date: localISO(), at
          });
          const sale = port().applySaleEffects(result);
          closeModal();
          await persistAndRender(`สร้างบิลขายแล้ว · สุทธิ ${money(sale.netCashEffectSatang)} บาท`, {
            eventType: "NORMALPOCKET_SALE_RECORDED", sourceDomain: "STORE", sourceOwner: "STORE",
            targetDomain: ["STORE", "LEDGER", "CALENDAR"], idempotencyKey: `normalpocket-sale:${id}`, timestamp: at
          });
        } catch (error) {
          toast(error.message || "บันทึกขายไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });
    const toggle = byId("saleHasShippingCost");
    const field = byId("saleShippingCost");
    const sync = () => { field.disabled = !toggle.checked; if (!toggle.checked) field.value = ""; };
    toggle?.addEventListener("change", sync);
    sync();
  }

  function install() {
    if (installed) return;
    const button = typeof byId === "function" ? byId("addSaleBtn") : null;
    if (!button || typeof openModal !== "function") { setTimeout(install, 40); return; }
    installed = true;
    button.onclick = openSale;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
