export function createHubRuntime() {
  const entries = new Map();

  return {
    register(name, capability) {
      const key = String(name || '').trim();
      if (!key) throw new Error('capability name is required');
      if (!capability || typeof capability !== 'object') throw new TypeError('capability must be an object');
      if (entries.has(key)) throw new Error(`capability already registered: ${key}`);
      entries.set(key, capability);
      return capability;
    },

    get(name) {
      return entries.get(String(name || '').trim()) || null;
    },

    list() {
      return [...entries.entries()].map(([name, capability]) => ({ name, capability }));
    },

    unregister(name) {
      return entries.delete(String(name || '').trim());
    },
  };
}
