import githubWorker, { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createBrowserInterface } from "./go-hub-browser-interface.js";
import { createFactoryMcpWorker } from "./go-hub-factory-mcp-worker.mjs";
import { createFactoryActionService } from "./go-hub-factory-service.mjs";
export { HephaestusForeman } from "./go-hub-factory-controller.mjs";
export { GoHubFactoryState } from "./go-hub-factory-state.mjs";

const BROWSER_API_ROOT = "/hub/api/browser";
const FACTORY_ACTION_PATH = "/hub/api/github-workspace/factory-action";
const encoder = new TextEncoder();

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function browserPolicy(policy) {
  if (typeof policy === "string") {
    try {
      return browserPolicy(JSON.parse(policy));
    } catch {
      return { allowedHostnames: [], requireOwnerPasscode: false };
    }
  }
  if (!policy || typeof policy !== "object") {
    return { allowedHostnames: [], requireOwnerPasscode: false };
  }
  return {
    allowedHostnames: Array.isArray(policy.allowedHostnames)
      ? policy.allowedHostnames.filter(value => typeof value === "string" && value.trim())
      : [],
    requireOwnerPasscode: policy.requireOwnerPasscode === true,
  };
}

function timingSafeEqual(left, right) {
  const a = encoder.encode(String(left || ""));
  const b = encoder.encode(String(right || ""));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length, 1);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % Math.max(a.length, 1)] || 0) ^
      (b[index % Math.max(b.length, 1)] || 0);
  }
  return difference === 0;
}

function assertFactoryWorkContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workContext is required");
  for (const field of ["workId", "checkpointId", "returnAddress", "destination", "task", "requestedResult", "lensReference"]) {
    if (!String(value[field] || "").trim()) throw new Error("workContext missing field: " + field);
  }
  if (String(value.checkpointId) !== String(value.returnAddress)) throw new Error("workContext Return Address must match Checkpoint ID");
  if (String(value.destination) !== "destination://factory") throw new Error("workContext destination must be destination://factory");
  return value;
}

function isBrowserApiPath(pathname) {
  return pathname === BROWSER_API_ROOT || pathname.startsWith(`${BROWSER_API_ROOT}/`);
}

export function createEdgeWorkerHandler({ delegate = githubWorker, factoryMcp = createFactoryMcpWorker() } = {}) {
  if (!delegate || typeof delegate.fetch !== "function") {
    throw new Error("edge delegate fetch is required");
  }
  if (!factoryMcp || typeof factoryMcp.fetch !== "function") {
    throw new Error("Factory MCP handler is required");
  }

  return Object.freeze({
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/mcp") {
        return factoryMcp.fetch(request, env);
      }
      if (request.method === "POST" && url.pathname === FACTORY_ACTION_PATH) {
        if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);
        if (!env?.GO_HUB_FACTORY_STATE) return json({ code: "FACTORY_STATE_NOT_CONFIGURED" }, 503);
        try {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code: "INVALID_JSON" }, 400);
          assertFactoryWorkContext(body.workContext);
          const lifecycle = createGithubLifecycleService({ fetchImpl: fetch, token: env.GITHUB_TOKEN });
          const factoryAction = createFactoryActionService({ lifecycle, binding: env.GO_HUB_FACTORY_STATE });
          return factoryAction({
            taskId: body.taskId,
            action: body.action,
            input: body.input || {},
            expectedRevision: body.expectedRevision,
          });
        } catch (error) {
          return json({ code: error?.message || "FACTORY_ACTION_ERROR" }, error?.status || 400);
        }
      }
      if (!isBrowserApiPath(url.pathname)) {
        return delegate.fetch(request, env);
      }

      if (request.method !== "POST" || url.pathname !== `${BROWSER_API_ROOT}/read`) {
        return json({ code: "NOT_FOUND" }, 404);
      }

      const policy = browserPolicy(env?.BROWSER_POLICY);
      if (policy.allowedHostnames.length === 0) {
        return json({ code: "BROWSER_POLICY_NOT_CONFIGURED" }, 503);
      }

      if (policy.requireOwnerPasscode) {
        const configuredPasscode = String(env?.GOHUB_OWNER_PASSCODE || "");
        if (!configuredPasscode) {
          return json({ code: "BROWSER_OWNER_AUTH_NOT_CONFIGURED" }, 503);
        }
        const suppliedPasscode = String(request.headers.get("x-go-owner-passcode") || "");
        if (!timingSafeEqual(suppliedPasscode, configuredPasscode)) {
          return json({ code: "BROWSER_OWNER_AUTH_FAILED" }, 403);
        }
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ code: "INVALID_JSON" }, 400);
      }

      return createBrowserInterface({ browser: env?.BROWSER }).readPage({
        url: body.url,
        waitUntil: body.waitUntil,
        allowedHostnames: policy.allowedHostnames,
      });
    },
  });
}

export default createEdgeWorkerHandler();
