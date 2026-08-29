"use strict";

(function normalPocketWorkAdapter(root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./normalpocket-work-core.js")
      : root.NormalPocketWorkCore
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NormalPocketWorkAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildWorkAdapter(core) {
  if (!core) throw new Error("NormalPocketWorkCore is required");

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function ensureWorkState(sourceState = {}) {
    const state = clone(sourceState || {});
    const existing = state.work && typeof state.work === "object" && !Array.isArray(state.work) ? state.work : {};
    const tasks = Array.isArray(existing.tasks) ? existing.tasks.map(task => clone(task)) : [];
    for (const task of tasks) {
      const validation = core.validateTask(task);
      if (!validation.ok) throw new Error(validation.errors.join("\n"));
    }
    state.work = { ...existing, tasks };
    return state;
  }

  function findTaskIndex(tasks, id) {
    const index = tasks.findIndex(task => task.id === id);
    if (index < 0) throw new Error(`ไม่พบ task ${id}`);
    return index;
  }

  function createTaskInState(sourceState, input, context = {}) {
    const state = ensureWorkState(sourceState);
    const task = core.createTask(input, context);
    if (state.work.tasks.some(existing => existing.id === task.id)) throw new Error(`task id ซ้ำ ${task.id}`);
    state.work.tasks.push(clone(task));
    return { state, task: clone(task) };
  }

  function editTaskInState(sourceState, id, patch, context = {}) {
    const state = ensureWorkState(sourceState);
    const index = findTaskIndex(state.work.tasks, id);
    const task = core.editTask(state.work.tasks[index], patch, context);
    state.work.tasks[index] = clone(task);
    return { state, task: clone(task) };
  }

  function queryTasksInState(sourceState, filter = {}) {
    const state = ensureWorkState(sourceState);
    return core.queryTasks(state.work.tasks, filter);
  }

  return Object.freeze({
    ensureWorkState,
    createTaskInState,
    editTaskInState,
    queryTasksInState,
  });
});
