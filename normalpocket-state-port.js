"use strict";

function normalPocketStateSnapshot() {
  if (typeof state === "undefined" || state == null) return null;
  return structuredClone(state);
}

function normalPocketFindSourceSnapshot(source, id) {
  const snapshot = normalPocketStateSnapshot();
  if (!snapshot || !id) return null;
  const groups = source === "STORE"
    ? [snapshot.store?.sales, snapshot.store?.purchases, snapshot.store?.withdrawals]
    : source === "LEDGER"
      ? [snapshot.ledger?.obligations, snapshot.ledger?.transactions]
      : source === "CALENDAR"
        ? [snapshot.calendar]
        : [];
  const found = groups.flatMap(items => Array.isArray(items) ? items : []).find(item => item?.id === id) || null;
  return found ? structuredClone(found) : null;
}

function normalPocketFindQueueSnapshot(id) {
  const snapshot = normalPocketStateSnapshot();
  const found = snapshot?.calendar?.find(item => item?.id === id) || null;
  return found ? structuredClone(found) : null;
}

window.NormalPocketRuntimePort = Object.freeze({
  getStateSnapshot: normalPocketStateSnapshot,
  findSourceSnapshot: normalPocketFindSourceSnapshot,
  findQueueSnapshot: normalPocketFindQueueSnapshot
});
