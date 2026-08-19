"use strict";

(() => {
  if (typeof document === "undefined") return;

  const modulesReady = Promise.all([
    import("./src/finance/installment-operations.mjs"),
    import("./src/finance/installment-schedule.mjs")
  ]).then(([operations, schedule]) => ({ operations, schedule }));

  let installed = false;
  let runtimeQueued = false;
  let reconcileBusy = false;

  const port = () => {
    if (!globalThis.NormalPocketFinancePort) throw new Error("Finance port ยังไม่พร้อม");
    return globalThis.NormalPocketFinancePort;
  };

  const displayMoney = satang => typeof money === "function"
    ? `${money(satang)} บาท`
    : `${(Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

  const displayDate = value => typeof dateTH === "function" ? dateTH(value) : value;

  async function persist(message, eventType = "NORMALPOCKET_INSTALLMENT_UPDATED") {
    await persistAndRender(message, {
      eventType,
      sourceDomain: "LEDGER",
      sourceOwner: "FINANCE",
      targetDomain: ["LEDGER", "CALENDAR"],
      idempotencyKey: `normalpocket-installment:${Date.now()}`,
      timestamp: typeof nowIso === "function" ? nowIso() : new Date().toISOString()
    });
  }

  async function openDebtCreator() {
    const { schedule } = await modulesReady;
    openModal({
      title: "เพิ่มภาระ",
      text: "กำหนดยอดต่องวดและวันครบกำหนด ระบบจะสร้างตารางจ่ายให้อัตโนมัติ",
      body: `<div class="form-grid">
        <div class="field full"><label>รายละเอียด</label><input id="debtName" maxlength="120" placeholder="เช่น ค่ารถ"></div>
        <div class="field full"><label>หมายเหตุเพิ่มเติม</label><input id="debtDetail" maxlength="180"></div>
        <div class="field"><label>ยอดต่องวด</label><input id="debtInstallmentAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div>
        <div class="field"><label>จำนวนงวด</label><input id="debtInstallments" type="number" min="1" max="120" step="1" value="1"></div>
        <div class="field"><label>ความถี่</label><select id="debtFrequency"><option value="MONTHLY">รายเดือน</option><option value="WEEKLY">รายสัปดาห์</option></select></div>
        <div class="field"><label>วันครบกำหนดงวดแรก</label><input id="debtDue" type="date" value="${localISO()}"></div>
        <div class="field full"><div id="debtSchedulePreview" class="r52-schedule-preview"><small>กรอกยอดต่องวดเพื่อดูตารางก่อนบันทึก</small></div></div>
      </div>`,
      confirm: "เพิ่มภาระ",
      onConfirm: async () => {
        try {
          const installmentAmountSatang = parseMoneyToSatang(byId("debtInstallmentAmount").value, { allowZero: false, label: "ยอดต่องวด" });
          const installmentCount = Number(byId("debtInstallments").value);
          const scheduleFrequency = String(byId("debtFrequency").value || "MONTHLY");
          const firstDue = byId("debtDue").value;
          const dues = schedule.scheduleDueDates(firstDue, installmentCount, scheduleFrequency);
          port().createInstallmentObligation({
            name: byId("debtName").value,
            detail: byId("debtDetail").value,
            installmentAmountSatang,
            installmentCount,
            scheduleFrequency,
            firstDue,
            dues
          });
          closeModal();
          await persist(`เพิ่ม ${installmentCount} งวด · รวม ${displayMoney(schedule.totalFromInstallment(installmentAmountSatang, installmentCount))}`, "NORMALPOCKET_INSTALLMENT_CREATED");
        } catch (error) {
          toast(error.message || "เพิ่มภาระไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });

    const updatePreview = () => {
      const preview = byId("debtSchedulePreview");
      if (!preview) return;
      try {
        const raw = byId("debtInstallmentAmount")?.value;
        if (!raw) {
          preview.innerHTML = "<small>กรอกยอดต่องวดเพื่อดูตารางก่อนบันทึก</small>";
          return;
        }
        const amount = parseMoneyToSatang(raw, { allowZero: false, label: "ยอดต่องวด" });
        const count = Number(byId("debtInstallments")?.value || 0);
        const frequency = String(byId("debtFrequency")?.value || "MONTHLY");
        const firstDue = byId("debtDue")?.value;
        const dues = schedule.scheduleDueDates(firstDue, count, frequency);
        const total = schedule.totalFromInstallment(amount, count);
        preview.innerHTML = `<b>${count} งวด × ${displayMoney(amount)} = รวม ${displayMoney(total)}</b><div class="r52-preview-list">${dues.map((due, index) => `<span><strong>${index + 1}</strong><em>${displayDate(due)}</em><b>${displayMoney(amount)}</b></span>`).join("")}</div>`;
      } catch (_) {
        preview.innerHTML = "<small>กรอกยอด จำนวนงวด ความถี่ และวันแรกให้ครบ</small>";
      }
    };

    ["debtInstallmentAmount", "debtInstallments", "debtFrequency", "debtDue"].forEach(id => {
      byId(id)?.addEventListener("input", updatePreview);
      byId(id)?.addEventListener("change", updatePreview);
    });
    updatePreview();
  }

  async function openInstallmentManager(queueId) {
    const { operations } = await modulesReady;
    let context;
    try {
      context = port().contextForQueue(queueId);
    } catch (error) {
      return toast(error.message || "ไม่พบตารางงวด");
    }
    const installmentNumber = Number(context.queues.find(item => item.id === queueId)?.installmentNumber || 1);
    const installment = context.obligation.installments?.find(item => Number(item.number) === installmentNumber);
    if (!installment) return toast("ไม่พบข้อมูลงวด");

    openModal({
      title: `จัดการงวด ${installment.number}/${context.obligation.installmentCount}`,
      text: `${context.obligation.name} · จ่ายแล้ว ${displayMoney(installment.paidSatang || 0)}`,
      body: `<div class="form-grid r52-manager">
        <div class="field"><label>ยอดงวด</label><input id="manageInstallmentAmount" type="number" min="0.01" step="0.01" value="${satangToBaht(installment.amountSatang)}"></div>
        <div class="field"><label>วันกำหนด</label><input id="manageInstallmentDue" type="date" value="${installment.due}"></div>
        <div class="field"><label>ความถี่ต่อจากนี้</label><select id="manageInstallmentFrequency"><option value="MONTHLY" ${context.obligation.scheduleFrequency === "MONTHLY" ? "selected" : ""}>รายเดือน</option><option value="WEEKLY" ${context.obligation.scheduleFrequency === "WEEKLY" ? "selected" : ""}>รายสัปดาห์</option></select></div>
        <div class="field"><label>แก้ขอบเขต</label><select id="manageInstallmentScope"><option value="EDIT_THIS">เฉพาะงวดนี้</option><option value="EDIT_FUTURE">งวดนี้และงวดถัดไป</option></select></div>
        <div class="field full r52-manager-actions"><button type="button" class="edit" id="npSkipInterval">ข้ามรอบนี้</button><button type="button" class="cancel" id="npEarlySettle">ปิดภาระทั้งหมด</button></div>
      </div>`,
      confirm: "บันทึกงวด",
      onConfirm: async () => {
        try {
          const fresh = port().contextForQueue(queueId);
          const result = operations.editInstallmentSchedule({
            obligation: fresh.obligation,
            queues: fresh.queues,
            queueId,
            scope: byId("manageInstallmentScope").value,
            amountSatang: parseMoneyToSatang(byId("manageInstallmentAmount").value, { allowZero: false, label: "ยอดงวด" }),
            due: byId("manageInstallmentDue").value,
            frequency: byId("manageInstallmentFrequency").value
          });
          port().applyScheduleResult(result);
          closeModal();
          await persist("บันทึกตารางงวดแล้ว");
        } catch (error) {
          toast(error.message || "แก้งวดไม่สำเร็จ");
          if (typeof modalBusy !== "undefined") modalBusy = false;
        }
      }
    });

    byId("npSkipInterval")?.addEventListener("click", () => {
      openModal({
        title: "ข้ามรอบนี้",
        text: "เลื่อนงวดนี้และงวดถัดไปหนึ่งรอบ โดยยอดหนี้ไม่ลด",
        confirm: "ยืนยันข้ามรอบ",
        onConfirm: async () => {
          try {
            const fresh = port().contextForQueue(queueId);
            port().applyScheduleResult(operations.skipInstallmentInterval({ obligation: fresh.obligation, queues: fresh.queues, queueId }));
            closeModal();
            await persist("ข้ามรอบนี้แล้ว · ยอดหนี้ไม่เปลี่ยน");
          } catch (error) {
            toast(error.message || "เลื่อนงวดไม่สำเร็จ");
            if (typeof modalBusy !== "undefined") modalBusy = false;
          }
        }
      });
    });

    byId("npEarlySettle")?.addEventListener("click", () => {
      openModal({
        title: "ปิดภาระทั้งหมด",
        text: `จ่ายยอดคงเหลือของ ${context.obligation.name} ตอนนี้และปิดทุกงวดที่ยังเปิดอยู่`,
        confirm: "ยืนยันจ่ายทั้งหมด",
        onConfirm: async () => {
          try {
            const fresh = port().contextForQueue(queueId);
            const result = operations.settleInstallmentsEarly({ obligation: fresh.obligation, queues: fresh.queues });
            port().applyEarlySettlement(result);
            closeModal();
            const paidNow = result.transactions.reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
            await persist(`ปิดภาระทั้งหมดแล้ว · −${displayMoney(paidNow)}`, "NORMALPOCKET_INSTALLMENT_EARLY_SETTLED");
          } catch (error) {
            toast(error.message || "ปิดภาระไม่สำเร็จ");
            if (typeof modalBusy !== "undefined") modalBusy = false;
          }
        }
      });
    });
  }

  function decorateInstallmentActions() {
    document.querySelectorAll("[data-move]").forEach(button => {
      if (button.dataset.normalpocketInstallment === "true") return;
      try {
        const context = port().contextForQueue(button.dataset.move);
        const queue = context.queues.find(item => item.id === button.dataset.move);
        if (context.obligation.scheduleMode !== "PER_INSTALLMENT" || !queue || !["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(queue.actionType)) return;
        if (["COMPLETED", "CANCELLED"].includes(queue.status)) return;
        button.textContent = "จัดการงวด";
        button.dataset.normalpocketInstallment = "true";
        button.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          openInstallmentManager(queue.id);
        };
      } catch (_) {}
    });
  }

  async function reconcileAll() {
    if (reconcileBusy || !globalThis.NormalPocketRuntimePort?.getStateSnapshot) return;
    reconcileBusy = true;
    try {
      const { operations } = await modulesReady;
      const snapshot = globalThis.NormalPocketRuntimePort.getStateSnapshot();
      let changed = false;
      for (const obligation of snapshot?.ledger?.obligations || []) {
        if (obligation.scheduleMode !== "PER_INSTALLMENT" || obligation.status === "CANCELLED") continue;
        const current = port().contextForObligation(obligation.id);
        const result = operations.reconcileInstallmentSchedule({ obligation: current.obligation, queues: current.queues, idFactory: prefix => `${prefix}-NP-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}` });
        if (result.calendarEffects.length || JSON.stringify(result.obligation) !== JSON.stringify(current.obligation)) {
          port().applyReconciliation(result);
          changed = true;
        }
      }
      if (changed) await persist("", "NORMALPOCKET_INSTALLMENT_RECONCILED");
    } catch (error) {
      console.error("NORMALPOCKET_INSTALLMENT_RECONCILE_FAILED", error);
    } finally {
      reconcileBusy = false;
    }
  }

  function queueRuntimeWork() {
    if (runtimeQueued) return;
    runtimeQueued = true;
    requestAnimationFrame(() => {
      runtimeQueued = false;
      decorateInstallmentActions();
      reconcileAll();
    });
  }

  function install() {
    if (installed) return;
    if (typeof byId !== "function" || typeof openModal !== "function" || typeof persistAndRender !== "function" || !globalThis.NormalPocketFinancePort) {
      setTimeout(install, 40);
      return;
    }
    installed = true;
    const addDebtButton = byId("addDebtBtn");
    if (addDebtButton) addDebtButton.onclick = openDebtCreator;
    if (globalThis.YGPHRuntime?.register) {
      globalThis.YGPHRuntime.register("NORMALPOCKET_INSTALLMENT_UI", {
        afterRender: queueRuntimeWork,
        afterPageChange: queueRuntimeWork
      });
    }
    queueRuntimeWork();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
