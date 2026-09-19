import githubWorker, { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createBrowserInterface } from "./go-hub-browser-interface.js";
import { createFactoryMcpWorker } from "./go-hub-factory-mcp-worker.mjs";
import { createFactoryActionService } from "./go-hub-factory-service.mjs";
import { ObserverSessionRegistry } from "./go-hub-browser-observer-session.js";
import { createCentreLiveService } from "./go-hub-centre-live.mjs";
import {
  createLighthouseControlPortHttpService,
  LIGHTHOUSE_CONTROL_PORT_API_ROOT,
  LIGHTHOUSE_CONTROL_PORT_OWNER_PATH,
} from "./go-hub-lighthouse-control-port-service.mjs";
export { HephaestusForeman } from "./go-hub-factory-controller.mjs";
export { GoHubFactoryState } from "./go-hub-factory-state.mjs";
export { ObserverSessionRegistry } from "./go-hub-browser-observer-session.js";
export { GoHubCentreState } from "./go-hub-centre-live.mjs";
export { GoHubGlobalAuditLog } from "./go-hub-global-audit.mjs";
export { LighthouseControlPortSessionRegistry } from "./go-hub-lighthouse-control-port-session.js";

const CENTRE_API_ROOT = "/hub/api/centre";
const BROWSER_API_ROOT = "/hub/api/browser";
const OBSERVER_API_ROOT = `${BROWSER_API_ROOT}/observer`;
const FACTORY_ACTION_PATH = "/hub/api/github-workspace/factory-action";
const encoder = new TextEncoder();

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
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

function isObserverApiPath(pathname) {
  return pathname === OBSERVER_API_ROOT || pathname.startsWith(`${OBSERVER_API_ROOT}/`);
}

function gumroadOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "gumroad.com" || host.endsWith(".gumroad.com"))
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function corsFor(request) {
  const origin = gumroadOrigin(request.headers.get("origin"));
  if (!origin) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-go-observer-session-id, x-go-observer-session-token",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

function ownerAuthFailure(request, env, policy) {
  if (!policy.requireOwnerPasscode) return null;
  const configuredPasscode = String(env?.GOHUB_OWNER_PASSCODE || "");
  if (!configuredPasscode) return json({ code: "BROWSER_OWNER_AUTH_NOT_CONFIGURED" }, 503);
  const suppliedPasscode = String(request.headers.get("x-go-owner-passcode") || "");
  if (!timingSafeEqual(suppliedPasscode, configuredPasscode)) {
    return json({ code: "BROWSER_OWNER_AUTH_FAILED" }, 403);
  }
  return null;
}

function observerSessionsFor(injected, env) {
  if (injected) return injected;
  if (env?.OBSERVER_SESSIONS && typeof env.OBSERVER_SESSIONS.getByName === "function") {
    return env.OBSERVER_SESSIONS.getByName("go-browser-observer-v1");
  }
  return null;
}

function sessionCredentials(request) {
  return {
    sessionId: String(request.headers.get("x-go-observer-session-id") || ""),
    sessionToken: String(request.headers.get("x-go-observer-session-token") || ""),
  };
}

function observerStatus(code) {
  if (code === "SCHEMA_REJECTED") return 400;
  if (code === "SESSION_EXPIRED") return 410;
  if (code === "STALE_PAGE") return 409;
  if (code === "HUB_UNAVAILABLE") return 503;
  return 403;
}

function observerOwnerPage() {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GO Eye Session</title></head><body><h1>GO Browser Eye</h1><p>Create Eye Session on GO Hub, then copy the bootstrap code into the Firefox Observer. The owner passcode stays on this GO Hub page and is never stored by the Observer.</p><form id="eye-form"><label>Owner passcode<input id="passcode" type="password" autocomplete="current-password" required></label><label>Allowed Gumroad origin<input id="origin" value="https://gumroad.com" required></label><button type="submit">Create Eye Session</button></form><label>GO Hub bootstrap<textarea id="bootstrap" readonly placeholder="Bootstrap appears here"></textarea></label><p id="status"></p><script>const form=document.getElementById('eye-form'),out=document.getElementById('bootstrap'),status=document.getElementById('status');form.addEventListener('submit',async e=>{e.preventDefault();out.value='';status.textContent='Creating…';try{const r=await fetch('/hub/api/browser/observer/session/start',{method:'POST',headers:{'content-type':'application/json','x-go-owner-passcode':document.getElementById('passcode').value},body:JSON.stringify({allowed_origin:document.getElementById('origin').value})});const body=await r.json();if(!r.ok)throw new Error(body.code||'SESSION_START_FAILED');out.value=JSON.stringify(body);document.getElementById('passcode').value='';status.textContent='Bootstrap ready. Copy it into GO Eye.';}catch(err){document.getElementById('passcode').value='';status.textContent=err.message||'SESSION_START_FAILED';}});</script></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export function createEdgeWorkerHandler({ delegate = githubWorker, factoryMcp = createFactoryMcpWorker(), fetchImpl = fetch, observerSessions = null } = {}) {
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
      if (request.method === "GET" && url.pathname === "/hub/observer") {
        return observerOwnerPage();
      }
      if (url.pathname === LIGHTHOUSE_CONTROL_PORT_OWNER_PATH ||
          url.pathname.startsWith(LIGHTHOUSE_CONTROL_PORT_API_ROOT + "/")) {
        return createLighthouseControlPortHttpService({
          namespace:env?.LIGHTHOUSE_CONTROL_PORT_SESSIONS,
          ownerPasscode:env?.GOHUB_OWNER_PASSCODE,
        }).fetch(request);
      }
      if (url.pathname === `${CENTRE_API_ROOT}/action`) {
        if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code: "INVALID_JSON" }, 400);
        return createCentreLiveService({ namespace: env?.GO_HUB_CENTRE_STATE }).action(body);
      }
      if (request.method === "POST" && url.pathname === FACTORY_ACTION_PATH) {
        if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);
        if (!env?.GO_HUB_FACTORY_STATE) return json({ code: "FACTORY_STATE_NOT_CONFIGURED" }, 503);
        try {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code: "INVALID_JSON" }, 400);
          assertFactoryWorkContext(body.workContext);
          const lifecycle = createGithubLifecycleService({ fetchImpl, token: env.GITHUB_TOKEN });
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

      if (isObserverApiPath(url.pathname)) {
        const cors = corsFor(request);
        if (request.method === "OPTIONS") {
          return cors ? new Response(null, { status: 204, headers: cors }) : json({ code: "HOST_BLOCKED" }, 403);
        }
        if (request.method !== "POST") return json({ code: "NOT_FOUND" }, 404, cors || {});

        const sessions = observerSessionsFor(observerSessions, env);
        if (!sessions) return json({ code: "HUB_UNAVAILABLE" }, 503, cors || {});

        if (url.pathname === `${OBSERVER_API_ROOT}/session/start`) {
          const policy = browserPolicy(env?.BROWSER_POLICY);
          if (policy.allowedHostnames.length === 0) return json({ code: "BROWSER_POLICY_NOT_CONFIGURED" }, 503);
          const authFailure = ownerAuthFailure(request, env, policy);
          if (authFailure) return authFailure;
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code: "INVALID_JSON" }, 400);
          const result = await sessions.start({
            allowedOrigin: String(body.allowed_origin || ""),
            ttlMs: 10 * 60 * 1000,
          });
          if (!result?.ok) return json({ code: result?.code || "HUB_UNAVAILABLE" }, observerStatus(result?.code));
          return json({ ...result, hub_origin: url.origin }, 200);
        }

        const credentials = sessionCredentials(request);
        if (!credentials.sessionId || !credentials.sessionToken) {
          return json({ code: "SESSION_INACTIVE" }, 403, cors || {});
        }

        if (url.pathname === `${OBSERVER_API_ROOT}/snapshot`) {
          const packet = await request.json().catch(() => null);
          if (!packet || typeof packet !== "object" || Array.isArray(packet)) return json({ code: "INVALID_JSON" }, 400, cors || {});
          const result = await sessions.acceptSnapshot({ ...credentials, packet });
          return json(result?.ok ? { ok: true, code: null } : { code: result?.code || "HUB_UNAVAILABLE" },
            result?.ok ? 200 : observerStatus(result?.code), cors || {});
        }

        if (url.pathname === `${OBSERVER_API_ROOT}/session/stop`) {
          const result = await sessions.stop(credentials);
          return json(result?.ok ? { ok: true, code: null } : { code: result?.code || "HUB_UNAVAILABLE" },
            result?.ok ? 200 : observerStatus(result?.code), cors || {});
        }

        if (url.pathname === `${OBSERVER_API_ROOT}/screenshot/consent`) {
          const result = await sessions.grantScreenshot(credentials);
          return json(result?.ok ? { ok: true, code: null } : { code: result?.code || "HUB_UNAVAILABLE" },
            result?.ok ? 200 : observerStatus(result?.code), cors || {});
        }

        if (url.pathname === `${OBSERVER_API_ROOT}/screenshot`) {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code: "INVALID_JSON" }, 400, cors || {});
          const result = await sessions.storeScreenshot({
            ...credentials,
            dataUrl: body.data_url,
            pageFingerprint: body.page_fingerprint,
          });
          return json(result?.ok
            ? { ok: true, code: null, screenshot_ref: result.screenshot_ref }
            : { code: result?.code || "HUB_UNAVAILABLE" },
          result?.ok ? 200 : observerStatus(result?.code), cors || {});
        }

        return json({ code: "NOT_FOUND" }, 404, cors || {});
      }

      if (request.method !== "POST" || url.pathname !== `${BROWSER_API_ROOT}/read`) {
        return json({ code: "NOT_FOUND" }, 404);
      }

      const policy = browserPolicy(env?.BROWSER_POLICY);
      if (policy.allowedHostnames.length === 0) {
        return json({ code: "BROWSER_POLICY_NOT_CONFIGURED" }, 503);
      }

      const authFailure = ownerAuthFailure(request, env, policy);
      if (authFailure) return authFailure;

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
