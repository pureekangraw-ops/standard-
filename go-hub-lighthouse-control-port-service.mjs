import { DEFAULT_SESSION_TTL_MS } from "./go-hub-lighthouse-control-port-session.js";

export const LIGHTHOUSE_CONTROL_PORT_API_ROOT = "/hub/api/lighthouse-control-port";
export const LIGHTHOUSE_CONTROL_PORT_OWNER_PATH = "/hub/lighthouse";
const SESSION_NAME = "lighthouse-control-port-v1";
const encoder = new TextEncoder();

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers },
  });
}
function clean(value) { return String(value == null ? "" : value).trim(); }
function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left || ""));
  const b = encoder.encode(String(right || ""));
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length, 1);
  for (let i = 0; i < len; i += 1) {
    diff |= (a[i % Math.max(a.length, 1)] || 0) ^ (b[i % Math.max(b.length, 1)] || 0);
  }
  return diff === 0;
}
function statusFor(code) {
  if (code === "SCHEMA_REJECTED") return 400;
  if (code === "REQUEST_ID_CONFLICT") return 409;
  if (code === "COMMAND_NOT_FOUND") return 404;
  if (code === "SESSION_EXPIRED") return 410;
  if (code === "SESSION_INACTIVE") return 403;
  return 503;
}
function stub(namespace) {
  if (!namespace || typeof namespace.getByName !== "function") return null;
  const durable = namespace.getByName(SESSION_NAME);
  if (!durable || typeof durable.fetch !== "function") return null;

  async function call(path, input = {}) {
    const response = await durable.fetch(new Request(`https://lighthouse-control-port.internal/${path}`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify(input),
    }));
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error("DURABLE_OBJECT_NON_JSON"); }
    if (!response.ok) throw new Error(body?.code || "DURABLE_OBJECT_ERROR");
    return body;
  }

  return Object.freeze({
    start:input => call("start", input),
    enqueue:input => call("enqueue", input),
    pull:input => call("pull", input),
    pushReceipts:input => call("receipts", input),
    pushState:input => call("state", input),
    latest:() => call("latest"),
    stop:input => call("stop", input),
  });
}
function credentials(request) {
  return {
    sessionId:clean(request.headers.get("x-lighthouse-session-id")),
    sessionToken:clean(request.headers.get("x-lighthouse-session-token")),
  };
}
function nativeCors(request) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([requestOrigin, "https://localhost", "http://localhost", "capacitor://localhost"]);
  if (!allowed.has(origin)) return null;
  return {
    "access-control-allow-origin":origin,
    "access-control-allow-methods":"POST, OPTIONS",
    "access-control-allow-headers":"content-type, x-lighthouse-session-id, x-lighthouse-session-token",
    "access-control-max-age":"600",
    "vary":"Origin",
  };
}

export function lighthouseControlPortOwnerPage() {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LIGHTHOUSE ↔ GO Hub</title></head><body><main><h1>LIGHTHOUSE ↔ GO Hub</h1><p>Create a device bootstrap, then paste it once into LIGHTHOUSE Settings. The owner passcode stays on GO Hub and is never stored in the APK.</p><form id="pair"><label>Owner passcode <input id="passcode" type="password" autocomplete="current-password" required></label><label>Device label <input id="label" value="LIGHTHOUSE Android" maxlength="120"></label><button type="submit">Create bootstrap</button></form><label>Bootstrap <textarea id="bootstrap" readonly rows="8"></textarea></label><p id="status"></p><script>const f=document.getElementById('pair'),o=document.getElementById('bootstrap'),s=document.getElementById('status');f.addEventListener('submit',async e=>{e.preventDefault();o.value='';s.textContent='Creating…';try{const r=await fetch('/hub/api/lighthouse-control-port/session/start',{method:'POST',headers:{'content-type':'application/json','x-go-owner-passcode':document.getElementById('passcode').value},body:JSON.stringify({device_label:document.getElementById('label').value})});const raw=await r.text();let b=null;try{b=raw?JSON.parse(raw):{};}catch{throw new Error('PAIRING_NON_JSON_'+r.status+': '+raw.slice(0,160));}document.getElementById('passcode').value='';if(!r.ok)throw new Error((b.code||'PAIRING_FAILED')+(b.reason?': '+b.reason:''));o.value=JSON.stringify(b);s.textContent='Bootstrap ready.';}catch(err){document.getElementById('passcode').value='';s.textContent=err.message||'PAIRING_FAILED';}});</script></main></body></html>`, {
    headers:{ "content-type":"text/html; charset=utf-8", "cache-control":"no-store" },
  });
}

export function createLighthouseControlPortHttpService({ namespace, ownerPasscode } = {}) {
  return Object.freeze({
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === LIGHTHOUSE_CONTROL_PORT_OWNER_PATH) {
        return lighthouseControlPortOwnerPage();
      }
      if (!url.pathname.startsWith(LIGHTHOUSE_CONTROL_PORT_API_ROOT + "/")) return json({ code:"NOT_FOUND" }, 404);

      const cors = nativeCors(request);
      if (request.method === "OPTIONS") {
        return cors === null ? json({ code:"ORIGIN_NOT_ALLOWED" }, 403) : new Response(null, { status:204, headers:cors });
      }
      if (request.method !== "POST") return json({ code:"METHOD_NOT_ALLOWED" }, 405, cors || {});
      if (cors === null) return json({ code:"ORIGIN_NOT_ALLOWED" }, 403);

      const sessions = stub(namespace);
      if (!sessions) return json({ code:"HUB_UNAVAILABLE" }, 503, cors || {});

      if (url.pathname === `${LIGHTHOUSE_CONTROL_PORT_API_ROOT}/session/start`) {
        const configured = clean(ownerPasscode);
        const supplied = clean(request.headers.get("x-go-owner-passcode"));
        if (!configured) return json({ code:"OWNER_AUTH_NOT_CONFIGURED" }, 503);
        if (!constantTimeEqual(supplied, configured)) return json({ code:"OWNER_AUTH_FAILED" }, 403);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code:"INVALID_JSON" }, 400);
        let result;
        try {
          result = await sessions.start({
            deviceLabel:clean(body.device_label) || "LIGHTHOUSE Android",
            ttlMs:DEFAULT_SESSION_TTL_MS,
          });
        } catch (error) {
          return json({
            code:"PAIRING_RUNTIME_ERROR",
            reason:clean(error?.message || error || "unknown").slice(0,160),
          }, 500);
        }
        if (!result?.ok) return json({ code:result?.code || "HUB_UNAVAILABLE" }, statusFor(result?.code));
        return json({
          ...result,
          hub_origin:url.origin,
          contract:"lighthouse-control-port-v1",
        }, 200);
      }

      const auth = credentials(request);
      if (!auth.sessionId || !auth.sessionToken) return json({ code:"SESSION_INACTIVE" }, 403, cors || {});

      if (url.pathname === `${LIGHTHOUSE_CONTROL_PORT_API_ROOT}/pull`) {
        const result = await sessions.pull(auth);
        return result?.ok ? json({ commands:result.commands || [] }, 200, cors || {}) : json({ code:result?.code || "HUB_UNAVAILABLE" }, statusFor(result?.code), cors || {});
      }

      if (url.pathname === `${LIGHTHOUSE_CONTROL_PORT_API_ROOT}/receipts`) {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code:"INVALID_JSON" }, 400, cors || {});
        const result = await sessions.pushReceipts({ ...auth, receipts:body.receipts });
        return result?.ok ? json({ accepted:result.accepted || 0 }, 200, cors || {}) : json({ code:result?.code || "HUB_UNAVAILABLE" }, statusFor(result?.code), cors || {});
      }

      if (url.pathname === `${LIGHTHOUSE_CONTROL_PORT_API_ROOT}/state`) {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ code:"INVALID_JSON" }, 400, cors || {});
        const result = await sessions.pushState({ ...auth, packet:body });
        return result?.ok ? json({ ok:true }, 200, cors || {}) : json({ code:result?.code || "HUB_UNAVAILABLE" }, statusFor(result?.code), cors || {});
      }

      if (url.pathname === `${LIGHTHOUSE_CONTROL_PORT_API_ROOT}/session/stop`) {
        const result = await sessions.stop(auth);
        return result?.ok ? json({ ok:true }, 200, cors || {}) : json({ code:result?.code || "HUB_UNAVAILABLE" }, statusFor(result?.code), cors || {});
      }

      return json({ code:"NOT_FOUND" }, 404, cors || {});
    },
  });
}

export function createLighthouseControlPortMcpService({ namespace } = {}) {
  function sessions() { return stub(namespace); }
  function requireTarget(value) {
    if (clean(value).toLowerCase() !== "lighthouse") throw Object.assign(new Error("WORK_TARGET_REQUIRED"), { status:400 });
  }
  return Object.freeze({
    async state({ targetId } = {}) {
      requireTarget(targetId);
      const current = sessions();
      if (!current || typeof current.latest !== "function") return json({ code:"HUB_UNAVAILABLE" }, 503);
      const result = await current.latest();
      return result?.ok ? json(result, 200) : json({ code:result?.code || "HUB_UNAVAILABLE", session:result?.session || null }, statusFor(result?.code));
    },
    async command({ targetId, requestId, capabilityId, payload = {} } = {}) {
      requireTarget(targetId);
      const current = sessions();
      if (!current || typeof current.enqueue !== "function") return json({ code:"HUB_UNAVAILABLE" }, 503);
      const result = await current.enqueue({ requestId, capabilityId, payload });
      return result?.ok ? json(result, 200) : json({ code:result?.code || "HUB_UNAVAILABLE" }, statusFor(result?.code));
    },
  });
}
