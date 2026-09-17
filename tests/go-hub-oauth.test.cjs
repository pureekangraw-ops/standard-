"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const oauthUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-oauth.mjs")).href;
const issuer = "https://hub.example";
const config = {
  issuer,
  signingKey: "test-signing-key-with-enough-entropy",
  ownerPasscode: "owner-passcode",
  clientId: "chatgpt-go-hub",
  clientSecret: "client-secret",
  redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
  now: () => 1_789_391_000,
};

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

test("OAuth publishes issuer-bound authorization and protected-resource metadata", async () => {
  const { createOAuthHandler } = await import(oauthUrl + "?metadata=" + Date.now());
  const handler = createOAuthHandler(config);

  const authorization = await handler(new Request(issuer + "/.well-known/oauth-authorization-server"));
  assert.equal(authorization.status, 200);
  assert.deepEqual(await authorization.json(), {
    issuer,
    authorization_endpoint: issuer + "/oauth/authorize",
    token_endpoint: issuer + "/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic"],
    authorization_response_iss_parameter_supported: true,
  });

  const resource = await handler(new Request(issuer + "/.well-known/oauth-protected-resource"));
  assert.equal(resource.status, 200);
  assert.deepEqual(await resource.json(), {
    resource: issuer + "/mcp",
    authorization_servers: [issuer],
    scopes_supported: ["go-hub"],
    bearer_methods_supported: ["header"],
  });
});

test("OAuth exchanges a short-lived PKCE code for an audience-bound access token", async () => {
  const { createOAuthHandler, verifyAccessToken, createTestAuthorizationCode } =
    await import(oauthUrl + "?exchange=" + Date.now());
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(challengeBytes).toString("base64url");
  const handler = createOAuthHandler(config)
  const code = await createTestAuthorizationCode({ ...config, codeChallenge: challenge });

  const basic = Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
  const token = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: {
      authorization: "Basic " + basic,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
      resource: issuer + "/mcp",
    }),
  }));
  assert.equal(token.status, 200);
  const payload = await token.json();
  assert.equal(payload.token_type, "Bearer");
  assert.equal(payload.expires_in, 3600);
  assert.equal(typeof payload.access_token, "string");

  const identity = await verifyAccessToken(
    new Request(issuer + "/mcp", { headers: { authorization: "Bearer " + payload.access_token } }),
    config,
  );
  assert.deepEqual(identity, { subject: "big", scope: "go-hub" });
});

test("OAuth fails closed for wrong PKCE, expired tokens, and missing configuration", async () => {
  const { createOAuthHandler, verifyAccessToken, createTestAccessToken } =
    await import(oauthUrl + "?fail=" + Date.now());
  const handler = createOAuthHandler({ ...config, signingKey: "" });
  const missing = await handler(new Request(issuer + "/.well-known/oauth-authorization-server"));
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { code: "OAUTH_NOT_CONFIGURED" });

  const expired = await createTestAccessToken({ ...config, expiresAt: config.now() - 1 });
  await assert.rejects(
    verifyAccessToken(
      new Request(issuer + "/mcp", { headers: { authorization: "Bearer " + expired } }),
      config,
    ),
    /expired access token/,
  );
});


test("OAuth binds authorization and tokens to the requested MCP resource", async () => {
  const { createOAuthHandler, createTestAuthorizationCode } = await import(oauthUrl + "?resource=" + Date.now());
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(challengeBytes).toString("base64url");
  const handler = createOAuthHandler(config);
  const code = await createTestAuthorizationCode({ ...config, codeChallenge: challenge, resource: issuer + "/mcp" });
  const basic = Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
  const missingResource = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: { authorization: "Basic " + basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri, code_verifier: verifier }),
  }));
  assert.equal(missingResource.status, 400);
});
