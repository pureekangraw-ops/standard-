"use strict";

(() => {
  if (typeof flowCalendarItems !== "function") return;
  if (globalThis.__NORMALPOCKET_FLOW_CALENDAR_BRIDGE__) return;

  const baseFlowCalendarItems = flowCalendarItems;

  function sourceStatus(item) {
    const port = globalThis.NormalPocketRuntimePort;
    if (!port || !item) return null;
    return port.findSourceSnapshot(item.source, item.sourceId)?.status || null;
  }

  function isLive(item) {
    if (!item) return false;
    if (String(item.status || "").toUpperCase() === "CANCELLED") return false;
    return String(sourceStatus(item) || "").toUpperCase() !== "CANCELLED";
  }

  flowCalendarItems = function(...args) {
    const items = baseFlowCalendarItems(...args);
    return Array.isArray(items) ? items.filter(isLive) : [];
  };

  globalThis.__NORMALPOCKET_FLOW_CALENDAR_BRIDGE__ = true;
})();
