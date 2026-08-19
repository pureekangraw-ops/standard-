"use strict";

function normalPocketStateSnapshot() {
  if (typeof state === "undefined" || state == null) return null;
  return structuredClone(state);
}

function normalPocketFindSourceInSnapshot(snapshot, source, id) {
  if (!snapshot || !id) return null;
  const groups = source === "STORE"
    ? [snapshot.store?.sales, snapshot.store?.purchases, snapshot.store?.withdrawals]
    : source === "LEDGER"
      ? [snapshot.ledger?.obligations, snapshot.ledger?.transactions]
      : source === "CALENDAR"
        ? [snapshot.calendar]
        : [];
  return groups.flatMap(items => Array.isArray(items) ? items : []).find(item => item?.id === id) || null;
}

function normalPocketFindSourceSnapshot(source, id) {
  const snapshot = normalPocketStateSnapshot();
  const found = normalPocketFindSourceInSnapshot(snapshot, source, id);
  return found ? structuredClone(found) : null;
}

function normalPocketFindQueueSnapshot(id) {
  const snapshot = normalPocketStateSnapshot();
  const found = snapshot?.calendar?.find(item => item?.id === id) || null;
  return found ? structuredClone(found) : null;
}

function normalPocketCalendarProjectionSnapshot() {
  const snapshot = normalPocketStateSnapshot();
  if (!Array.isArray(snapshot?.calendar)) return [];
  return snapshot.calendar.map(item => {
    const source = normalPocketFindSourceInSnapshot(snapshot, item.source, item.sourceId);
    let direction = "OTHER";
    let integrityState = "TRUSTED";
    try {
      if (typeof queueDirection === "function") direction = queueDirection(item);
    } catch {}
    try {
      if (typeof integrityGate === "function") integrityState = integrityGate(item)?.state || "TRUSTED";
    } catch {}
    return {
      item: structuredClone(item),
      sourceStatus: source?.status || null,
      direction,
      integrityState
    };
  });
}

window.NormalPocketRuntimePort = Object.freeze({
  getStateSnapshot: normalPocketStateSnapshot,
  findSourceSnapshot: normalPocketFindSourceSnapshot,
  findQueueSnapshot: normalPocketFindQueueSnapshot,
  getCalendarProjectionSnapshot: normalPocketCalendarProjectionSnapshot
});
