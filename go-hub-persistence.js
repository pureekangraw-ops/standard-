import { nowIso, stableStringify } from "./go-hub-utils.js";

export function createMemoryKeyValueStore() {
  const values = new Map();

  return {
    async get(key) {
      return structuredClone(values.get(key) ?? null);
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
    async close() {},
  };
}

export function createStatePersistence({
  store,
  key = "state",
  validate = value => value,
  serialize = stableStringify,
  now = nowIso,
} = {}) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") {
    throw new TypeError("store with get/put ports is required");
  }
  if (typeof validate !== "function") throw new TypeError("validate must be a function");
  if (typeof serialize !== "function") throw new TypeError("serialize must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  async function loadState() {
    const stored = await store.get(key);
    if (stored == null) return null;
    return structuredClone(validate(structuredClone(stored)));
  }

  async function commitState({ proposed, command } = {}) {
    const safeState = structuredClone(validate(structuredClone(proposed)));
    await store.put(key, safeState);

    const durable = await loadState();
    if (serialize(durable) !== serialize(safeState)) {
      throw new Error("durable readback mismatch");
    }

    return {
      status: "COMMITTED",
      revision: Number.isSafeInteger(safeState?.revision) ? safeState.revision : null,
      commandType: command?.type || null,
      committedAt: now(),
    };
  }

  return { loadState, commitState };
}
