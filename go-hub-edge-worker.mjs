import githubWorker from "./go-hub-worker.mjs";
import { createBrowserInterface } from "./go-hub-browser-interface.js";

const BROWSER_API_ROOT = "/hub/api/browser";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function allowedHostnamesFromPolicy(policy) {
  if (policy && typeof policy === "object" && Array.isArray(policy.allowedHostnames)) {
    return policy.allowedHostnames.filter(value => typeof value === "string" && value.trim());
  }
  if (typeof policy === "string") {
    try {
      return allowedHostnamesFromPolicy(JSON.parse(policy));
    } catch {
      return [];
    }
  }
  return [];
}

export function createEdgeWorkerHandler({ delegate = githubWorker } = {}) {
  if (!delegate || typeof delegate.fetch !== "function") {
    throw new Error("edge delegate fetch is required");
  }

  return Object.freeze({
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(BROWSER_API_ROOT)) {
        return delegate.fetch(request, env);
      }

      if (request.method !== "POST" || url.pathname !== `${BROWSER_API_ROOT}/read`) {
        return json({ code: "NOT_FOUND" }, 404);
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ code: "INVALID_JSON" }, 400);
      }

      const allowedHostnames = allowedHostnamesFromPolicy(env?.BROWSER_POLICY);
      if (allowedHostnames.length === 0) {
        return json({ code: "BROWSER_POLICY_NOT_CONFIGURED" }, 503);
      }

      return createBrowserInterface({ browser: env?.BROWSER }).readPage({
        url: body.url,
        waitUntil: body.waitUntil,
        allowedHostnames,
      });
    },
  });
}

export default createEdgeWorkerHandler();
