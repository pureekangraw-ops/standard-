"use strict";

(() => {
  if (typeof document === "undefined") return;
  let installed = false;
  let reconcileBusy = false;

  function imported(item) {
    return Boolean(item && Array.isArray(item.history) && item.history.some(entry => entry?.event === "IMPORTED"));
  }

  function splitSatang(totalSatang, count) {
    const total = Number(totalSatang), n = Number(count);
    if (!Number.isSafeInteger(total) || total < 1 || !Number.isInteger(n) || n < 1 || total < n) throw new Error("ข้อมูลงวดเดิมไม่ถูกต้อง");
    const base = Math.floor(total / n), remainder = total - base * n;
    return Array.from({ length: n }, (_, index) => base + (index === n - 1 ? remainder : 0));
  }

  function addMonthsClamped(value, offset) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) throw new Error("วันที่ไม่ถูกต้อง");
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const monthIndex = year * 12 + month - 1 + Number(offset || 0);
    const y = Math.floor(monthIndex / 12), m = ((monthIndex % 12) + 12) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  }

  function repairLegacyInstallments() {
    if (typeof state === "undefined" || !state?.ledger?.obligations || !Array.isArray(state.calendar) || typeof addQueue !== "function") return 0;
    let changed = 0;
    for (const obligation of state.ledger.obligations) {
      if (obligation.scheduleMode === "PER_INSTALLMENT" || obligation.status === "CANCELLED") continue;
      const count = Number(obligation.installmentCount || 1);
      if (count <= 1) continue;
      const firstDue = obligation.firstDue || obligation.installments?.[0]?.due;
      if (!firstDue) continue;
      let amounts;
      try { amounts = splitSatang(Number(obligation.originalSatang || 0), count); } catch (_) { continue; }
      const dues = Array.from({ length: count }, (_, index) => addMonthsClamped(firstDue, index));
      obligation.installments = Array.isArray(obligation.installments) ? obligation.installments : [];
      for (let index = 0; index < count; index++) {
        const number = index + 1, due = dues[index], amountSatang = amounts[index];
        let queue = state.calendar.find(item => item.source === "LEDGER" && item.sourceId === obligation.id && (Number(item.installmentNumber) === number || (item.installmentNumber == null && item.due === due && Number(item.amountSatang || 0) === amountSatang)));
        if (!queue) {
          queue = addQueue({ source: "LEDGER", sourceId: obligation.id, actionType: "PAY_OBLIGATION_INSTALLMENT", amountSatang, due, effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" } });
          changed++;
        }
        if (Number(queue.installmentNumber) !== number || Number(queue.installmentCount) !== count) {
          queue.installmentNumber = number; queue.installmentCount = count; changed++;
        }
        let installment = obligation.installments.find(item => Number(item.number) === number);
        if (!installment) {
          obligation.installments.push({ number, amountSatang, paidSatang: Number(queue.paidSatang || 0), due, status: queue.status === "COMPLETED" ? "COMPLETED" : Number(queue.paidSatang || 0) > 0 ? "PARTIAL" : "PENDING", queueId: queue.id, paidAt: queue.completedAt || null });
          changed++;
        } else if (!installment.queueId) { installment.queueId = queue.id; changed++; }
      }
    }
    return changed;
  }

  function acceptImportedQueues() {
    if (typeof state === "undefined" || !Array.isArray(state?.calendar)) return 0;
    let changed = 0;
    for (const item of state.calendar) {
      if (!imported(item) || ["COMPLETED", "CANCELLED"].includes(item.status)) continue;
      if (item.status !== "VERIFY" && !item.requiresRefreshBeforePayment) continue;
      item.status = Number(item.paidSatang || 0) > 0 ? "PARTIAL" : "OPEN";
      item.requiresRefreshBeforePayment = false;
      item.validUntil = null;
      item.verifiedAt ||= typeof nowIso === "function" ? nowIso() : new Date().toISOString();
      item.verifiedNote ||= "ยืนยันพร้อมกับการนำเข้าผ่าน Review Center";
      const source = typeof findSource === "function" ? findSource(item.source, item.sourceId) : null;
      if (source) item.expectedRevision = item.sourceRevision = Number(source.revision || 1);
      if (typeof addHistory === "function") addHistory(item, "IMPORT_ACCEPTED_AS_VERIFIED", item.verifiedNote);
      changed++;
    }
    return changed;
  }

  async function reconcile() {
    if (reconcileBusy || typeof state === "undefined" || !state || typeof cryptoKey === "undefined" || !cryptoKey) return;
    reconcileBusy = true;
    try {
      const repaired = repairLegacyInstallments();
      const accepted = acceptImportedQueues();
      if (repaired || accepted) await persistAndRender("", { eventType: "NORMALPOCKET_IMPORT_RECONCILED", sourceDomain: "CORE", sourceOwner: "IMPORT_BRIDGE", targetDomain: ["LEDGER", "CALENDAR"], idempotencyKey: `normalpocket-import:${state.revision}:${repaired}:${accepted}`, timestamp: nowIso() });
    } finally { reconcileBusy = false; }
  }

  function install() {
    if (installed) return;
    if (typeof needsLocalVerification !== "function" || typeof freshnessGate !== "function") { setTimeout(install, 40); return; }
    installed = true;
    const originalNeeds = needsLocalVerification;
    const originalFresh = freshnessGate;
    needsLocalVerification = item => imported(item) && typeof integrityGate === "function" && integrityGate(item).state === "TRUSTED" ? false : originalNeeds(item);
    freshnessGate = item => imported(item) ? { state: "FRESH", cls: "fresh" } : originalFresh(item);
    if (globalThis.YGPHRuntime?.register) globalThis.YGPHRuntime.register("NORMALPOCKET_IMPORT_BRIDGE", { afterRender: reconcile });
    reconcile();
  }

  globalThis.NormalPocketImportBridge = Object.freeze({ repairLegacyInstallments, acceptImportedQueues });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();
