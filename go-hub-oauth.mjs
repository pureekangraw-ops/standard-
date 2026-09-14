const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function base64url(bytes) {
  const value = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function timingSafeEqual(left, right) {
  const a = typeof left === "string" ? encoder.encode(left) : left;
  const b = typeof right === "string" ? encoder.encode(right) : right;
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  }
  return difference === 0;
}

async function signEnvelope(payload, signingKey) {
  const body = base64url(JSON.stringify(payload));
  return body + "." + base64url(await hmac(body, signingKey));
}

async function verifyEnvelope(value, signingKey) {
  const [body, signature, extra] = String(value || "").split(".");
  if (!body || !signature || extra) throw new Error("invalid signed envelope");
  const expected = await hmac(body, signingKey);
  if (!timingSafeEqual(fromBase64url(signature), expected)) throw new Error("invalid signed envelope");
  return JSON.parse(decoder.decode(fromBase64url(body)));
}

async function sha256Base64url(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function configured(config) {
  return Boolean(
    config.issuer && config.signingKey && config.ownerPasscodeHash &&
    config.clientId && config.clientSecret && config.redirectUri,
  );
}

function nowSeconds(config) {
  return Math.floor(Number(config.now ? config.now() : Date.now() / 1000));
}

function validateAuthorize(input, config) {
  if (input.get("response_type") !== "code") throw new Error("unsupported response type");
  if (input.get("client_id") !== config.clientId) throw new Error("invalid client");
  if (input.get("redirect_uri") !== config.redirectUri) throw new Error("invalid redirect uri");
  if (input.get("code_challenge_method") !== "S256") throw new Error("S256 PKCE is required");
  const challenge = String(input.get("code_challenge") || "");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) throw new Error("invalid code challenge");
  return {
    state: String(input.get("state") || ""),
    redirectUri: config.redirectUri,
    codeChallenge: challenge,
  };
}

export async function createTestAuthorizationCode(config = {}) {
  const issuedAt = nowSeconds(config);
  return signEnvelope({
    type: "code",
    iss: config.issuer,
    aud: config.clientId,
    sub: "big",
    redirect_uri: config.redirectUri,
    code_challenge: config.codeChallenge,
    scope: "go-hub",
    iat: issuedAt,
    exp: config.expiresAt ?? issuedAt + 300,
  }, config.signingKey);
}

export async function createTestAccessToken(config = {}) {
  const issuedAt = nowSeconds(config);
  return signEnvelope({
    type: "access",
    iss: config.issuer,
    aud: "go-hub-mcp",
    sub: "big",
    scope: "go-hub",
    iat: issuedAt,
    exp: config.expiresAt ?? issuedAt + 3600,
  }, config.signingKey);
}

export async function verifyAccessToken(request, config = {}) {
  if (!configured(config)) throw new Error("OAuth is not configured");
  const authorization = String(request.headers.get("authorization") || "");
  if (!authorization.startsWith("Bearer ")) throw new Error("missing bearer token");
  const payload = await verifyEnvelope(authorization.slice(7), config.signingKey);
  if (payload.type !== "access" || payload.iss !== config.issuer ||
      payload.aud !== "go-hub-mcp" || payload.sub !== "big" || payload.scope !== "go-hub") {
    throw new Error("invalid access token");
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds(config)) throw new Error("expired access token");
  return { subject: payload.sub, scope: payload.scope };
}

function metadata(config, path) {
  if (path === "/.well-known/oauth-authorization-server") {
    return json({
      issuer: config.issuer,
      authorization_endpoint: config.issuer + "/oauth/authorize",
      token_endpoint: config.issuer + "/oauth/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
    });
  }
  return json({
    resource: config.issuer + "/mcp",
    authorization_servers: [config.issuer],
    scopes_supported: ["go-hub"],
    bearer_methods_supported: ["header"],
  });
}

function authorizePage(values) {
  const hidden = Object.entries(values).map(([name, value]) =>
    `<input type="hidden" name="${name}" value="${String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character])}">`
  ).join("");
  return new Response(`<!doctype html><html><meta name="viewport" content="width=device-width"><title>GO Hub authorization</title><body><main><h1>GO Hub Factory</h1><p>Authorize BIG's ChatGPT connection.</p><form method="post">${hidden}<label>Owner passcode <input name="passcode" type="password" autocomplete="current-password" required></label><button type="submit">Authorize</button></form></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function readBasic(request) {
  const header = String(request.headers.get("authorization") || "");
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    return separator < 0 ? null : [decoded.slice(0, separator), decoded.slice(separator + 1)];
  } catch {
    return null;
  }
}

export function createOAuthHandler(config = {}) {
  return async function handleOAuth(request) {
    const url = new URL(request.url);
    if (!configured(config)) return json({ code: "OAUTH_NOT_CONFIGURED" }, 503);

    if (request.method === "GET" && [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ].includes(url.pathname)) return metadata(config, url.pathname);

    try {
      if (url.pathname === "/oauth/authorize" && request.method === "GET") {
        const values = validateAuthorize(url.searchParams, config);
        return authorizePage({
          response_type: "code",
          client_id: config.clientId,
          redirect_uri: values.redirectUri,
          code_challenge: values.codeChallenge,
          code_challenge_method: "S256",
          state: values.state,
        });
      }

      if (url.pathname === "/oauth/authorize" && request.method === "POST") {
        const form = await request.formData();
        const values = new URLSearchParams();
        for (const key of ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state"]) {
          values.set(key, String(form.get(key) || ""));
        }
        const checked = validateAuthorize(values, config);
        const suppliedHash = await sha256Hex(String(form.get("passcode") || ""));
        if (!timingSafeEqual(suppliedHash, config.ownerPasscodeHash)) return json({ code: "OWNER_AUTH_FAILED" }, 403);
        const code = await createTestAuthorizationCode({ ...config, codeChallenge: checked.codeChallenge });
        const redirect = new URL(checked.redirectUri);
        redirect.searchParams.set("code", code);
        if (checked.state) redirect.searchParams.set("state", checked.state);
        return Response.redirect(redirect.toString(), 302);
      }

      if (url.pathname === "/oauth/token" && request.method === "POST") {
        const credentials = readBasic(request);
        if (!credentials || !timingSafeEqual(credentials[0], config.clientId) ||
            !timingSafeEqual(credentials[1], config.clientSecret)) {
          return json({ error: "invalid_client" }, 401);
        }
        const form = await request.formData();
        if (form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== config.redirectUri) {
          return json({ error: "invalid_grant" }, 400);
        }
        const code = await verifyEnvelope(String(form.get("code") || ""), config.signingKey);
        const current = nowSeconds(config);
        if (code.type !== "code" || code.iss !== config.issuer || code.aud !== config.clientId ||
            code.sub !== "big" || code.redirect_uri !== config.redirectUri ||
            !Number.isFinite(code.exp) || code.exp <= current) {
          return json({ error: "invalid_grant" }, 400);
        }
        const verifier = String(form.get("code_verifier") || "");
        if (!timingSafeEqual(await sha256Base64url(verifier), code.code_challenge)) {
          return json({ error: "invalid_grant" }, 400);
        }
        return json({
          access_token: await createTestAccessToken(config),
          token_type: "Bearer",
          expires_in: 3600,
          scope: "go-hub",
        }, 200, { "cache-control": "no-store" });
      }
    } catch {
      return json({ code: "OAUTH_BAD_REQUEST" }, 400);
    }

    return json({ code: "NOT_FOUND" }, 404);
  };
}
