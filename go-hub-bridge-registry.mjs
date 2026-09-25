function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function handlers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const normalized = {};
  for (const [name, handler] of Object.entries(value)) {
    const operation = text(name);
    if (!operation || typeof handler !== "function") continue;
    normalized[operation] = handler;
  }
  return Object.freeze(normalized);
}

function normalizeProvider(provider = {}) {
  const id = text(provider.id);
  if (!id) throw new Error("bridge provider id is required");
  return Object.freeze({
    id,
    label:text(provider.label) || id,
    reads:handlers(provider.reads),
    actions:handlers(provider.actions),
  });
}

function summary(provider) {
  return {
    id:provider.id,
    label:provider.label,
    readOperations:Object.keys(provider.reads).sort(),
    actionOperations:Object.keys(provider.actions).sort(),
    access:{ GO:"READ_ACTION", LIGHT:"READ_ONLY" },
  };
}

export function createBridgeRegistry({ providers = [] } = {}) {
  const table = new Map();
  for (const rawProvider of providers) {
    const provider = normalizeProvider(rawProvider);
    if (table.has(provider.id)) throw new Error("duplicate bridge provider: " + provider.id);
    table.set(provider.id, provider);
  }

  function resolve(input = {}, kind) {
    const bridgeId = text(input.bridgeId);
    const operation = text(input.operation);
    if (!bridgeId || !operation) {
      return { response:json({ code:"BRIDGE_INVALID_INPUT", required:["bridgeId","operation"] }, 400) };
    }
    const provider = table.get(bridgeId);
    if (!provider) return { response:json({ code:"BRIDGE_NOT_FOUND", bridgeId }, 404) };
    const collection = kind === "action" ? provider.actions : provider.reads;
    const handler = collection[operation];
    if (typeof handler !== "function") {
      return {
        response:json({
          code:"BRIDGE_OPERATION_NOT_SUPPORTED",
          bridgeId,
          operation,
          kind,
        }, 400),
      };
    }
    const payload = input.input && typeof input.input === "object" && !Array.isArray(input.input)
      ? input.input
      : {};
    return { provider, handler, payload };
  }

  return Object.freeze({
    catalog() {
      return json({
        interfaceVersion:"go-hub-bridge/v1",
        bridgeCount:table.size,
        bridges:[...table.values()].map(summary).sort((a, b) => a.id.localeCompare(b.id)),
      });
    },

    async read(input = {}) {
      const target = resolve(input, "read");
      if (target.response) return target.response;
      return target.handler(target.payload, input);
    },

    async action(input = {}) {
      const target = resolve(input, "action");
      if (target.response) return target.response;
      return target.handler(target.payload, input);
    },
  });
}
