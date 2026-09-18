import { createFactoryStatePort } from "./go-hub-factory-state-core.mjs";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class GoHubFactoryState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.port = createFactoryStatePort({ storage: ctx.storage });
  }

  async load() {
    return this.port.load();
  }

  async save(input) {
    return this.port.save(input);
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/load") {
        return json(await this.load());
      }
      if (request.method === "POST" && url.pathname === "/save") {
        const input = await request.json().catch(() => null);
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          return json({ code: "INVALID_JSON" }, 400);
        }
        return json(await this.save(input));
      }
      return json({ code: "NOT_FOUND" }, 404);
    } catch (error) {
      return json({ code: error?.message || "FACTORY_STATE_ERROR" }, 400);
    }
  }
}
