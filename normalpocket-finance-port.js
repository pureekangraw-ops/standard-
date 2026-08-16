"use strict";

(() => {
  if (typeof document === "undefined") return;

  const copy = value => structuredClone(value);

  function requireRuntime() {
    if (typeof state === "undefined" || !state || typeof findQueue !== "function" || typeof findSource !== "function") {
      throw new Error("Finance runtime ยังไม่พร้อม");
    }
  }

  function contextForQueue(queueId) {
    requireRuntime();
    const queue = findQueue(queueId);
    const obligation = queue && findSource(queue.source, queue.sourceId);
    if (!queue || !obligation || queue.source !== "LEDGER") throw new Error("ไม่พบตารางงวด");
    const queues = state.calendar.filter(item => item.source === "LEDGER" && item.sourceId === obligation.id);
    return { obligation: copy(obligation), queues: copy(queues), queueId };
  }

  function contextForObligation(sourceId) {
    requireRuntime();
    const obligation = findSource("LEDGER", sourceId);
    if (!obligation) throw new Error("ไม่พบภาระ");
    const queues = state.calendar.filter(item => item.source === "LEDGER" && item.sourceId === sourceId);
    return { obligation: copy(obligation), queues: copy(queues) };
  }

  function createInstallmentObligation({ name, detail, installmentAmountSatang, installmentCount, scheduleFrequency, firstDue, dues }) {
    requireRuntime();
    if (typeof uid !== "function" || typeof nowIso !== "function" || typeof addQueue !== "function") throw new Error("Finance create port ยังไม่พร้อม");
    const id = uid("OBL");
    const createdAt = nowIso();
    const originalSatang = Number(installmentAmountSatang) * Number(installmentCount);
    const obligation = {
      id,
      name: String(name || "ภาระ").trim() || "ภาระ",
      detail: String(detail || "").trim(),
      scheduleMode: "PER_INSTALLMENT",
      scheduleFrequency,
      installmentAmountSatang,
      originalSatang,
      paidSatang: 0,
      remainingSatang: originalSatang,
      installmentCount,
      firstDue,
      installments: [],
      status: "OPEN",
      createdAt,
      updatedAt: createdAt,
      revision: 1,
      cancelledAt: null
    };
    state.ledger.obligations.push(obligation);
    dues.forEach((due, index) => {
      const number = index + 1;
      const queue = addQueue({
        source: "LEDGER",
        sourceId: id,
        actionType: installmentCount >= 2 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION",
        status: "OPEN",
        amountSatang: installmentAmountSatang,
        due,
        effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" }
      });
      queue.installmentNumber = number;
      queue.installmentCount = installmentCount;
      obligation.installments.push({ number, amountSatang: installmentAmountSatang, paidSatang: 0, due, status: "PENDING", queueId: queue.id, paidAt: null });
    });
    if (typeof bumpSource === "function") bumpSource(obligation);
    return copy(obligation);
  }

  function replaceObligation(next) {
    const current = findSource("LEDGER", next?.id);
    if (!current) throw new Error("ไม่พบภาระสำหรับบันทึก");
    Object.assign(current, copy(next));
    if (typeof bumpSource === "function") bumpSource(current);
    return current;
  }

  function replaceKnownQueues(queues) {
    for (const next of queues || []) {
      const current = findQueue(next.id);
      if (!current) continue;
      Object.assign(current, copy(next));
      if (typeof bumpQueue === "function") bumpQueue(current);
    }
  }

  function applyScheduleResult(result) {
    requireRuntime();
    replaceObligation(result.obligation);
    replaceKnownQueues(result.queues);
    return true;
  }

  function applyReconciliation(result) {
    requireRuntime();
    const nextObligation = copy(result.obligation);
    for (const effect of result.calendarEffects || []) {
      if (effect?.owner !== "CALENDAR" || effect?.type !== "UPSERT_INSTALLMENT_QUEUE") continue;
      const spec = effect.queue;
      if (findQueue(spec.id)) continue;
      if (typeof addQueue !== "function") throw new Error("Calendar write port ยังไม่พร้อม");
      const actual = addQueue({
        source: "LEDGER",
        sourceId: nextObligation.id,
        actionType: spec.actionType,
        status: spec.status || "OPEN",
        amountSatang: Number(spec.amountSatang || 0),
        due: spec.due,
        effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" }
      });
      actual.paidSatang = Number(spec.paidSatang || 0);
      actual.installmentNumber = Number(spec.installmentNumber || 1);
      actual.installmentCount = Number(spec.installmentCount || nextObligation.installmentCount || 1);
      const installment = nextObligation.installments?.find(item => item.queueId === spec.id || Number(item.number) === Number(spec.installmentNumber));
      if (installment) installment.queueId = actual.id;
    }
    replaceObligation(nextObligation);
    replaceKnownQueues(result.queues);
    return true;
  }

  function applyEarlySettlement(result) {
    requireRuntime();
    if (typeof addTransaction !== "function") throw new Error("Finance transaction port ยังไม่พร้อม");
    for (const intent of result.transactions || []) {
      if (intent.owner !== "FINANCE" || intent.type !== "RECORD_INSTALLMENT_PAYMENT") throw new Error("Finance intent ไม่ถูกต้อง");
      const tx = addTransaction({
        direction: "OUT",
        amountSatang: intent.amountSatang,
        label: `ปิดภาระงวด ${intent.installmentNumber}`,
        source: "LEDGER",
        sourceId: intent.sourceId,
        subtype: "OBLIGATION_PAYMENT",
        actionKey: intent.actionKey
      });
      if (!tx) throw new Error(`บันทึกจ่ายงวด ${intent.installmentNumber} ไม่สำเร็จ`);
    }
    replaceObligation(result.obligation);
    replaceKnownQueues(result.queues);
    return true;
  }

  globalThis.NormalPocketFinancePort = Object.freeze({
    contextForQueue,
    contextForObligation,
    createInstallmentObligation,
    applyScheduleResult,
    applyReconciliation,
    applyEarlySettlement
  });
})();
