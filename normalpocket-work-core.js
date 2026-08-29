"use strict";

(function normalPocketWorkCore(root) {
  const STATUS = Object.freeze(["OPEN", "COMPLETED", "CANCELLED"]);
  const EDITABLE_FIELDS = Object.freeze(["title", "due", "note"]);
  const QUERY_FIELDS = Object.freeze(["id", "status", "dueFrom", "dueTo"]);

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function isDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function isIsoDateTime(value) {
    if (typeof value !== "string" || !value.includes("T")) return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed);
  }

  function resolveContext(context = {}) {
    const now = context.now || new Date().toISOString();
    if (!isIsoDateTime(now)) throw new Error("context.now ต้องเป็น ISO datetime");
    const idFactory = typeof context.idFactory === "function"
      ? context.idFactory
      : prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return { now, idFactory };
  }

  function normalizeDue(value) {
    if (value == null || value === "") return null;
    const due = String(value).trim();
    if (!isDateOnly(due)) throw new Error("due ต้องเป็น YYYY-MM-DD หรือ null");
    return due;
  }

  function validateTask(task) {
    const errors = [];
    if (!task || typeof task !== "object" || Array.isArray(task)) return { ok: false, errors: ["task ต้องเป็น object"] };
    if (!cleanText(task.id)) errors.push("id ต้องมีค่า");
    if (!cleanText(task.title)) errors.push("title ต้องมีค่า");
    if (!STATUS.includes(task.status)) errors.push("status ไม่ถูกต้อง");
    if (task.due != null && !isDateOnly(task.due)) errors.push("due ไม่ถูกต้อง");
    if (typeof task.note !== "string") errors.push("note ต้องเป็น string");
    if (!Number.isSafeInteger(task.revision) || task.revision < 1) errors.push("revision ไม่ถูกต้อง");
    if (!isIsoDateTime(task.createdAt)) errors.push("createdAt ไม่ถูกต้อง");
    if (!isIsoDateTime(task.updatedAt)) errors.push("updatedAt ไม่ถูกต้อง");
    if (!Array.isArray(task.history)) errors.push("history ต้องเป็น array");
    else {
      task.history.forEach((entry, index) => {
        if (!entry || typeof entry !== "object" || !isIsoDateTime(entry.at) || !cleanText(entry.event) || typeof entry.note !== "string") {
          errors.push(`history[${index}] ไม่ถูกต้อง`);
        }
      });
    }
    return { ok: errors.length === 0, errors };
  }

  function assertTask(task) {
    const result = validateTask(task);
    if (!result.ok) throw new Error(result.errors.join("\n"));
  }

  function assertOpen(task) {
    if (task.status !== "OPEN") throw new Error("แก้หรือปิดได้เฉพาะ task สถานะ OPEN");
  }

  function createTask(input = {}, context = {}) {
    const { now, idFactory } = resolveContext(context);
    const title = cleanText(input.title);
    if (!title) throw new Error("title ต้องมีค่า");
    const task = {
      id: cleanText(input.id) || cleanText(idFactory("TASK")),
      title,
      status: "OPEN",
      due: normalizeDue(input.due),
      note: cleanText(input.note),
      history: [{ at: now, event: "CREATED", note: "" }],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    assertTask(task);
    return clone(task);
  }

  function editTask(task, patch = {}, context = {}) {
    assertTask(task);
    assertOpen(task);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("patch ต้องเป็น object");
    const keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !EDITABLE_FIELDS.includes(key))) throw new Error("patch รองรับเฉพาะ title, due และ note");
    const { now } = resolveContext(context);
    const next = clone(task);
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      const title = cleanText(patch.title);
      if (!title) throw new Error("title ต้องมีค่า");
      next.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "due")) next.due = normalizeDue(patch.due);
    if (Object.prototype.hasOwnProperty.call(patch, "note")) next.note = cleanText(patch.note);
    const changed = EDITABLE_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(patch, key));
    next.revision += 1;
    next.updatedAt = now;
    next.history.push({ at: now, event: "EDITED", note: changed.join(",") });
    assertTask(next);
    return clone(next);
  }

  function closeTask(task, status, event, context = {}) {
    assertTask(task);
    assertOpen(task);
    const { now } = resolveContext(context);
    const next = clone(task);
    next.status = status;
    next.revision += 1;
    next.updatedAt = now;
    next.history.push({ at: now, event, note: cleanText(context.note) });
    assertTask(next);
    return clone(next);
  }

  function completeTask(task, context = {}) {
    return closeTask(task, "COMPLETED", "COMPLETED", context);
  }

  function cancelTask(task, context = {}) {
    return closeTask(task, "CANCELLED", "CANCELLED", context);
  }

  function getTask(tasks, id) {
    const found = (Array.isArray(tasks) ? tasks : []).find(task => task?.id === id);
    return found ? clone(found) : null;
  }

  function queryTasks(tasks, filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new Error("filter ต้องเป็น object");
    const keys = Object.keys(filter);
    if (keys.some(key => !QUERY_FIELDS.includes(key))) throw new Error("filter รองรับเฉพาะ id, status, dueFrom และ dueTo");

    let output = (Array.isArray(tasks) ? tasks : []).map(task => {
      assertTask(task);
      return clone(task);
    });

    if (Object.prototype.hasOwnProperty.call(filter, "id")) {
      const id = cleanText(filter.id);
      if (!id) throw new Error("filter.id ต้องมีค่า");
      output = output.filter(task => task.id === id);
    }

    if (Object.prototype.hasOwnProperty.call(filter, "status")) {
      if (!STATUS.includes(filter.status)) throw new Error("filter.status ไม่ถูกต้อง");
      output = output.filter(task => task.status === filter.status);
    }

    const dueFrom = filter.dueFrom == null ? null : normalizeDue(filter.dueFrom);
    const dueTo = filter.dueTo == null ? null : normalizeDue(filter.dueTo);
    if (dueFrom != null && dueTo != null && dueFrom > dueTo) throw new Error("filter.dueFrom ต้องไม่มากกว่า dueTo");
    if (dueFrom != null) output = output.filter(task => task.due != null && task.due >= dueFrom);
    if (dueTo != null) output = output.filter(task => task.due != null && task.due <= dueTo);

    output.sort((a, b) => {
      if (a.due == null && b.due != null) return 1;
      if (a.due != null && b.due == null) return -1;
      const dueOrder = String(a.due || "").localeCompare(String(b.due || ""));
      if (dueOrder) return dueOrder;
      const createdOrder = a.createdAt.localeCompare(b.createdAt);
      if (createdOrder) return createdOrder;
      return a.id.localeCompare(b.id);
    });
    return output;
  }

  const api = Object.freeze({ STATUS, createTask, editTask, completeTask, cancelTask, getTask, queryTasks, validateTask });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NormalPocketWorkCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
