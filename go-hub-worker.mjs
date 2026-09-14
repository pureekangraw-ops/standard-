const RESERVED_PREFIX = "/hub/api/workspace";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function createWorkerHandler() {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      if (url.pathname.startsWith(RESERVED_PREFIX)) {
        return json({ code: "WORKSPACE_BACKEND_NOT_CONFIGURED" }, 503);
      }
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return new Response("Not found", { status: 404 });
    },
  };
}

export default createWorkerHandler();
