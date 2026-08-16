"use strict";

(() => {
  if (typeof document === "undefined") return;
  let installed = false;

  function port() {
    if (!globalThis.NormalPocketFinancePort) throw new Error("Finance port ยังไม่พร้อม");
    return globalThis.NormalPocketFinancePort;
  }

  function openOtherIncome() {
    openModal({
      title: "รายรับช่องทางอื่น",
      text: "ใช้เมื่อเงินจริงเข้ามาแล้ว และระบุแหล่งที่มาเพื่อให้ตรวจย้อนหลังได้",
      body: `<div class="form-grid">
        <div class="field full"><label>รายละเอียดรายรับ</label><input id="npOtherIncomeName" maxlength="120" placeholder="เช่น รับจ้างพิเศษ หรือเงินคืน"></div>
        <div class="field"><label>จำนวนเงิน</label><input id="npOtherIncomeAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div>
        <div class="field"><label>แหล่งรายรับ</label><select id="npOtherIncomeSource"><option value="FREELANCE">งานรับจ้าง</option><option value="REFUND">เงินคืน</option><option value="SALE_OTHER">ขายของอื่น</option><option value="GIFT">ได้รับเงิน</option><option value="OTHER">อื่น ๆ</option></select></div>
        <div class="field"><label>ช่องทางเงินเข้า</label><select id="npOtherIncomeChannel"><option value="TRANSFER">เงินโอน</option><option value="CASH">เงินสด</option><option value="OTHER">ช่องทางอื่น</option></select></div>
        <div class="field full"><label>หมายเหตุ</label><input id="npOtherIncomeNote" maxlength="180"></div>
      </div>`,
      confirm: "เพิ่มเงินเข้าการเงิน",
      onConfirm: async () => {
        try {
          const amountSatang = parseMoneyToSatang(byId("npOtherIncomeAmount").value, { allowZero: false, label: "รายรับอื่น" });
          const name = byId("npOtherIncomeName").value.trim();
          if (!name) throw new Error("กรอกรายละเอียดรายรับ");
          const sourceType = byId("npOtherIncomeSource").value;
          const channel = byId("npOtherIncomeChannel").value;
          const note = byId("npOtherIncomeNote").value.trim();
          const id = uid("OIN"), at = nowIso();
          port().recordDirectTransaction({ direction: "IN", amountSatang, label: name, source: "OTHER_INCOME", sourceId: id, subtype: `DIRECT_OTHER_INCOME:${sourceType}:${channel}${note ? `:${note}` : ""}`, actionKey: `${id}:income` });
          closeModal();
          await persistAndRender("เพิ่มรายรับช่องทางอื่นเข้าการเงินแล้ว", { eventType: "NORMALPOCKET_OTHER_INCOME_RECORDED", sourceDomain: "LEDGER", sourceOwner: "FINANCE", targetDomain: ["LEDGER"], idempotencyKey: `${id}:income`, timestamp: at });
        } catch (error) {
          toast(error.message || "เพิ่มรายรับไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });
  }

  function openExpense() {
    openModal({
      title: "เพิ่มรายจ่าย",
      text: "รายการที่จ่ายแล้วจะหักเงินจริงทันทีและไม่สร้างคิวปฏิทิน",
      body: `<div class="form-grid">
        <div class="field full"><label>รายการ</label><input id="npExpenseName" maxlength="120"></div>
        <div class="field"><label>จำนวนเงิน</label><input id="npExpenseAmount" type="number" min="0.01" step="0.01"></div>
        <div class="field"><label>หมวด</label><select id="npExpenseCategory"><option value="GENERAL">ทั่วไป</option><option value="STORE">ร้านค้า</option></select></div>
      </div>`,
      confirm: "หักเงินทันที",
      onConfirm: async () => {
        try {
          const amountSatang = parseMoneyToSatang(byId("npExpenseAmount").value, { allowZero: false, label: "รายจ่าย" });
          const source = byId("npExpenseCategory").value;
          const id = uid("EXP"), at = nowIso();
          port().recordDirectTransaction({ direction: "OUT", amountSatang, label: byId("npExpenseName").value.trim() || "รายจ่าย", source, sourceId: id, subtype: "DIRECT_EXPENSE", actionKey: `${id}:expense` });
          closeModal();
          await persistAndRender("หักรายจ่ายแล้ว", { eventType: "NORMALPOCKET_EXPENSE_RECORDED", sourceDomain: "LEDGER", sourceOwner: "FINANCE", targetDomain: ["LEDGER"], idempotencyKey: `${id}:expense`, timestamp: at });
        } catch (error) {
          toast(error.message || "บันทึกรายจ่ายไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });
  }

  function install() {
    if (installed) return;
    const income = typeof byId === "function" ? byId("addOtherIncomeBtn") : null;
    const expense = typeof byId === "function" ? byId("addExpenseBtn") : null;
    if (!income || !expense || !globalThis.NormalPocketFinancePort) { setTimeout(install, 40); return; }
    installed = true;
    income.onclick = openOtherIncome;
    expense.onclick = openExpense;
    document.documentElement.dataset.normalpocketFinanceDirectAuthority = "current";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();
