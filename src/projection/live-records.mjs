export const STATUS_SIGNALS = Object.freeze({
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  HIDDEN: "HIDDEN"
});

export function statusSignal(item, today) {
  if (!item) return STATUS_SIGNALS.HIDDEN;
  const status = String(item.status || "").toUpperCase();
  if (status === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
  if (status === "COMPLETED") return STATUS_SIGNALS.GREEN;
  const due = String(item.due || "").slice(0, 10);
  const now = String(today || "").slice(0, 10);
  if (due && now && due < now) return STATUS_SIGNALS.RED;
  return STATUS_SIGNALS.YELLOW;
}

export function liveStatusSignal(item, sourceStatus, today) {
  if (String(sourceStatus || "").toUpperCase() === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
  return statusSignal(item, today);
}

export function selectLiveRecords(records) {
  return Array.isArray(records)
    ? records.filter(record => String(record?.status || "").toUpperCase() !== "CANCELLED")
    : [];
}

export function selectLiveCalendar(calendar, sourceStatusOf = () => null, today = "") {
  return Array.isArray(calendar)
    ? calendar.filter(item => liveStatusSignal(item, sourceStatusOf(item), today) !== STATUS_SIGNALS.HIDDEN)
    : [];
}
