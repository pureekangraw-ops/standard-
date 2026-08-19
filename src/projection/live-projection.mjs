import {
  STATUS_SIGNALS,
  deriveLiveCounters,
  liveStatusSignal,
  selectLiveCalendar
} from "./live-records.mjs";

let queued = false;

function runtimePort() {
  return globalThis.NormalPocketRuntimePort || null;
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function sourceStatusOf(item) {
  const port = runtimePort();
  if (!port || !item) return null;
  return port.findSourceSnapshot(item.source, item.sourceId)?.status || null;
}

function queueSignal(item) {
  if (!item) return STATUS_SIGNALS.HIDDEN;
  return liveStatusSignal(item, sourceStatusOf(item), todayKey());
}

function signalClass(signal) {
  return `r53-status-${String(signal || "").toLowerCase()}`;
}

function signalLabel(signal) {
  if (signal === STATUS_SIGNALS.GREEN) return "เสร็จแล้ว";
  if (signal === STATUS_SIGNALS.RED) return "เกินกำหนด";
  return "รอดำเนินการ";
}

function queueIdFromCard(card) {
  const action = card.querySelector("[data-history],[data-cancel],[data-move],[data-full],[data-partial],[data-complete],[data-refresh],[data-verify-edit]");
  if (!action) return null;
  return action.dataset.history || action.dataset.cancel || action.dataset.move || action.dataset.full || action.dataset.partial || action.dataset.complete || action.dataset.refresh || action.dataset.verifyEdit || null;
}

function ensureInlineDot(container, signal) {
  if (!container) return;
  let dot = container.querySelector(":scope > .r53-status-dot");
  if (!dot) {
    dot = document.createElement("span");
    dot.className = "r53-status-dot";
    dot.setAttribute("aria-hidden", "true");
    container.prepend(dot);
  }
  dot.className = `r53-status-dot ${signalClass(signal)}`;
  dot.title = signalLabel(signal);
}

function paintMonthGrid() {
  const snapshot = runtimePort()?.getStateSnapshot();
  if (!Array.isArray(snapshot?.calendar)) return;
  const today = todayKey();
  const selected = selectLiveCalendar(snapshot.calendar, sourceStatusOf, today);
  document.querySelectorAll("#monthGrid .day-cell[data-date]").forEach(cell => {
    const date = cell.dataset.date;
    const items = selected.filter(item => item.due === date);
    let count = cell.querySelector(".day-count");
    if (items.length) {
      if (!count) {
        count = document.createElement("span");
        count.className = "day-count";
        cell.querySelector(".day-num")?.after(count);
      }
      count.textContent = String(items.length);
    } else {
      count?.remove();
    }
  });
}

function paintQueueCards() {
  const port = runtimePort();
  if (!port) return;
  document.querySelectorAll("#queueList .queue-item").forEach(card => {
    const queue = port.findQueueSnapshot(queueIdFromCard(card));
    const signal = queueSignal(queue);
    if (signal === STATUS_SIGNALS.HIDDEN) {
      card.remove();
      return;
    }
    ensureInlineDot(card.querySelector(".queue-title > b"), signal);
    const status = card.querySelector(".status");
    if (status) {
      status.classList.remove("r53-status-green", "r53-status-yellow", "r53-status-red");
      status.classList.add(signalClass(signal));
    }
  });
}

function paintHomeTasks() {
  const port = runtimePort();
  if (!port) return;
  document.querySelectorAll(".flow-task-row[data-flow-task]").forEach(row => {
    const queue = port.findQueueSnapshot(row.dataset.flowTask);
    const signal = queueSignal(queue);
    if (signal === STATUS_SIGNALS.HIDDEN) {
      row.remove();
      return;
    }
    ensureInlineDot(row, signal);
  });
}

function hideCancelledRecordCards() {
  document.querySelectorAll(".record .status.cancelled").forEach(status => status.closest(".record")?.remove());
}

function syncLiveCounters() {
  const rows = runtimePort()?.getCalendarProjectionSnapshot?.() || [];
  const counters = deriveLiveCounters(rows, todayKey());
  const values = {
    homeWaitIn: counters.incoming,
    homeWaitOut: counters.outgoing,
    homeVerify: counters.verify,
    calWaitIn: counters.incoming,
    calWaitOut: counters.outgoing,
    calVerify: counters.verify,
    ledgerPendingCount: `${counters.outgoing} รายการ`
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    const text = String(value);
    if (element && element.textContent !== text) element.textContent = text;
  });
}

function applyProjection() {
  paintMonthGrid();
  paintQueueCards();
  paintHomeTasks();
  hideCancelledRecordCards();
  syncLiveCounters();
}

function queueApply() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    applyProjection();
  });
}

function install() {
  globalThis.YGPHRuntime?.register("NORMALPOCKET_LIVE_PROJECTION", {
    afterRender: queueApply,
    afterPageChange: queueApply
  });
  applyProjection();
  queueApply();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
