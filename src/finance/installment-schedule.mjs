export const SCHEDULE_FREQUENCIES = Object.freeze(["WEEKLY", "MONTHLY"]);

function parseScheduleDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("วันที่ไม่ถูกต้อง");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("วันที่ไม่ถูกต้อง");
  return { year, month, day };
}

function isoFromUTCDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDaysIso(value, days) {
  const { year, month, day } = parseScheduleDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return isoFromUTCDate(date);
}

function addMonthsAnchored(value, offset) {
  const { year, month, day } = parseScheduleDate(value);
  const monthIndex = year * 12 + (month - 1) + Number(offset || 0);
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function normalizeScheduleFrequency(value) {
  const frequency = String(value || "").toUpperCase();
  if (!SCHEDULE_FREQUENCIES.includes(frequency)) throw new Error("ความถี่ไม่ถูกต้อง");
  return frequency;
}

export function scheduleDueDates(firstDue, count, frequency) {
  const total = Number(count);
  const cadence = normalizeScheduleFrequency(frequency);
  parseScheduleDate(firstDue);
  if (!Number.isInteger(total) || total < 1 || total > 120) throw new Error("จำนวนงวดไม่ถูกต้อง");
  return Array.from({ length: total }, (_, index) => cadence === "WEEKLY"
    ? addDaysIso(firstDue, index * 7)
    : addMonthsAnchored(firstDue, index));
}

export function shiftDueOneInterval(due, frequency) {
  const cadence = normalizeScheduleFrequency(frequency);
  return cadence === "WEEKLY" ? addDaysIso(due, 7) : addMonthsAnchored(due, 1);
}

export function totalFromInstallment(installmentSatang, count) {
  const amount = Number(installmentSatang);
  const installments = Number(count);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("ยอดต่องวดไม่ถูกต้อง");
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) throw new Error("จำนวนงวดไม่ถูกต้อง");
  const total = amount * installments;
  if (!Number.isSafeInteger(total)) throw new Error("ยอดรวมสูงเกินขอบเขตที่รองรับ");
  return total;
}

export function derivePerInstallmentSchedule(obligation) {
  if (!obligation || obligation.scheduleMode !== "PER_INSTALLMENT") throw new Error("ไม่ใช่ภาระแบบยอดต่องวด");
  const count = Number(obligation.installmentCount || 1);
  const amount = Number(obligation.installmentAmountSatang || 0);
  const dues = scheduleDueDates(obligation.firstDue, count, obligation.scheduleFrequency || "MONTHLY");
  const existing = Array.isArray(obligation.installments) ? obligation.installments : [];
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const saved = existing.find(item => Number(item.number) === number);
    return {
      number,
      amountSatang: Number(saved?.amountSatang ?? amount),
      due: saved?.due || dues[index]
    };
  });
}

export const INSTALLMENT_SCHEDULE = Object.freeze({
  scheduleDueDates,
  shiftDueOneInterval,
  totalFromInstallment,
  derivePerInstallmentSchedule
});
