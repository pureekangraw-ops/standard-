import { scheduleDueDates, shiftDueOneInterval } from "./installment-schedule.mjs";

const CLOSED = new Set(["COMPLETED", "CANCELLED"]);

function clone(value) {
  return structuredClone(value);
}

function dueFields(queue, due) {
  return {
    ...queue,
    due,
    dueAt: `${due}T09:00:00+07:00`,
    triggerAt: `${due}T09:00:00+07:00`
  };
}

export function recomputeObligation(obligation) {
  const next = clone(obligation);
  next.installments = Array.isArray(next.installments) ? next.installments : [];
  next.installments.sort((a, b) => Number(a.number) - Number(b.number));
  const total = next.installments.reduce((sum, installment) => sum + Number(installment.amountSatang || 0), 0);
  const paid = next.installments.reduce((sum, installment) => sum + Number(installment.paidSatang || 0), 0);
  next.originalSatang = total;
  next.paidSatang = paid;
  next.remainingSatang = Math.max(0, total - paid);
  next.firstDue = next.installments.find(item => Number(item.number) === 1)?.due || next.firstDue;
  next.status = next.remainingSatang === 0 ? "COMPLETED" : paid > 0 ? "PARTIAL" : "OPEN";
  return next;
}

function findSelection(obligation, queues, queueId) {
  if (!obligation || obligation.scheduleMode !== "PER_INSTALLMENT") throw new Error("ไม่พบตารางงวด");
  const queue = queues.find(item => item.id === queueId);
  if (!queue) throw new Error("ไม่พบคิวงวด");
  const selectedNumber = Number(queue.installmentNumber || obligation.installments?.find(item => item.queueId === queueId)?.number || 1);
  const installment = obligation.installments?.find(item => Number(item.number) === selectedNumber);
  if (!installment || CLOSED.has(queue.status) || CLOSED.has(installment.status)) throw new Error("งวดนี้ปิดแล้ว");
  return { queue, installment, selectedNumber };
}

function activePairs(obligation, queues, fromNumber) {
  return (obligation.installments || [])
    .filter(installment => Number(installment.number) >= Number(fromNumber) && !CLOSED.has(installment.status))
    .map(installment => ({ installment, queue: queues.find(item => item.id === installment.queueId) }))
    .filter(pair => pair.queue && !CLOSED.has(pair.queue.status))
    .sort((a, b) => Number(a.installment.number) - Number(b.installment.number));
}

export function editInstallmentSchedule({ obligation, queues, queueId, scope, amountSatang, due, frequency }) {
  const nextObligation = clone(obligation);
  let nextQueues = clone(queues || []);
  const { installment, selectedNumber } = findSelection(nextObligation, nextQueues, queueId);
  if (!Number.isSafeInteger(amountSatang) || amountSatang < 1) throw new Error("ยอดต่องวดไม่ถูกต้อง");

  if (scope === "EDIT_THIS") {
    if (amountSatang < Number(installment.paidSatang || 0)) throw new Error("ยอดใหม่ต่ำกว่ายอดที่จ่ายแล้ว");
    installment.amountSatang = amountSatang;
    installment.due = due;
    nextQueues = nextQueues.map(queue => queue.id === queueId ? dueFields({ ...queue, amountSatang }, due) : queue);
  } else if (scope === "EDIT_FUTURE") {
    const pairs = activePairs(nextObligation, nextQueues, selectedNumber);
    const cadence = frequency || nextObligation.scheduleFrequency || "MONTHLY";
    const dueMap = new Map(scheduleDueDates(due, Number(nextObligation.installmentCount) - selectedNumber + 1, cadence)
      .map((date, index) => [selectedNumber + index, date]));
    for (const pair of pairs) {
      if (amountSatang < Number(pair.installment.paidSatang || 0)) throw new Error(`งวด ${pair.installment.number} มียอดจ่ายแล้วสูงกว่ายอดใหม่`);
      const nextDue = dueMap.get(Number(pair.installment.number));
      pair.installment.amountSatang = amountSatang;
      pair.installment.due = nextDue;
      nextQueues = nextQueues.map(queue => queue.id === pair.queue.id ? dueFields({ ...queue, amountSatang }, nextDue) : queue);
    }
    nextObligation.scheduleFrequency = cadence;
    nextObligation.installmentAmountSatang = amountSatang;
  } else {
    throw new Error("ขอบเขตการแก้ไขไม่ถูกต้อง");
  }

  return { obligation: recomputeObligation(nextObligation), queues: nextQueues };
}

export function skipInstallmentInterval({ obligation, queues, queueId }) {
  const nextObligation = clone(obligation);
  let nextQueues = clone(queues || []);
  const { selectedNumber } = findSelection(nextObligation, nextQueues, queueId);
  const cadence = nextObligation.scheduleFrequency || "MONTHLY";
  const pairs = activePairs(nextObligation, nextQueues, selectedNumber);
  if (!pairs.length) throw new Error("ไม่มีงวดที่เลื่อนได้");
  for (const pair of pairs) {
    const nextDue = shiftDueOneInterval(pair.installment.due || pair.queue.due, cadence);
    pair.installment.due = nextDue;
    nextQueues = nextQueues.map(queue => queue.id === pair.queue.id ? dueFields(queue, nextDue) : queue);
  }
  return { obligation: recomputeObligation(nextObligation), queues: nextQueues };
}

export const INSTALLMENT_OPERATIONS = Object.freeze({
  recomputeObligation,
  editInstallmentSchedule,
  skipInstallmentInterval
});
