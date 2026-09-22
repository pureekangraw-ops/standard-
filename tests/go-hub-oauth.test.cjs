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
  redirectUris: ["https://app.notion.com/workflows/mcp/oauth/callback"],
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


test("OAuth accepts the pre-registered Notion Custom Agent callback without weakening redirect checks", async () => {
  const { createOAuthHandler, createTestAuthorizationCode } = await import(oauthUrl + "?notion=" + Date.now());
  const notionRedirect = "https://app.notion.com/workflows/mcp/oauth/callback";
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(challengeBytes).toString("base64url");
  const handler = createOAuthHandler(config);
  const code = await createTestAuthorizationCode({ ...config, redirectUri: notionRedirect, codeChallenge: challenge });
  const basic = Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
  const token = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: { authorization: "Basic " + basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: notionRedirect,
      code_verifier: verifier,
      resource: issuer + "/mcp",
    }),
  }));
  assert.equal(token.status, 200);

  const rejected = await handler(new Request(issuer + "/oauth/authorize?" + new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: "https://evil.example/callback",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: issuer + "/mcp",
  })));
  assert.equal(rejected.status, 400);
});

test("OAuth gives Notion a separate client identity and rejects crossed credentials", async () => {
  const { createOAuthHandler, verifyAccessToken } = await import(oauthUrl + "?multi-client=" + Date.now());
  const notionRedirect = "https://app.notion.com/workflows/mcp/oauth/callback";
  const multiClientConfig = {
    issuer,
    signingKey: config.signingKey,
    ownerPasscode: config.ownerPasscode,
    clients: [
      {
        clientId: "go-hub-chatgpt",
        clientSecret: "chatgpt-secret",
        redirectUris: [config.redirectUri],
        subject: "big",
        scope: "go-hub",
      },
      {
        clientId: "go-hub-notion",
        clientSecret: "notion-secret",
        redirectUris: [notionRedirect],
        subject: "notion",
        scope: "go-hub",
      },
    ],
    now: config.now,
  };
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(challengeBytes).toString("base64url");
  const handler = createOAuthHandler(multiClientConfig);

  const authorize = await handler(new Request(issuer + "/oauth/authorize?" + new URLSearchParams({
    response_type: "code",
    client_id: "go-hub-notion",
    redirect_uri: notionRedirect,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: issuer + "/mcp",
  })));
  assert.equal(authorize.status, 200);
  const body = await authorize.text();
  const codeResponse = await handler(new Request(issuer + "/oauth/authorize", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      response_type: "code",
      client_id: "go-hub-notion",
      redirect_uri: notionRedirect,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: issuer + "/mcp",
      passcode: config.ownerPasscode,
    }),
    redirect: "manual",
  }));
  assert.equal(codeResponse.status, 302);
  assert.match(body, /go-hub-notion/);
  const code = new URL(codeResponse.headers.get("location")).searchParams.get("code");

  const crossed = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from("go-hub-notion:chatgpt-secret").toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: notionRedirect,
      code_verifier: verifier,
      resource: issuer + "/mcp",
    }),
  }));
  assert.equal(crossed.status, 401);

  const token = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from("go-hub-notion:notion-secret").toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: notionRedirect,
      code_verifier: verifier,
      resource: issuer + "/mcp",
    }),
  }));
  assert.equal(token.status, 200);
  const tokenPayload = await token.json();
  const identity = await verifyAccessToken(
    new Request(issuer + "/mcp", { headers: { authorization: "Bearer " + tokenPayload.access_token } }),
    { ...multiClientConfig, subject: "notion", scope: "go-hub" },
  );
  assert.deepEqual(identity, { subject: "notion", scope: "go-hub" });

  const crossedRedirect = await handler(new Request(issuer + "/oauth/authorize?" + new URLSearchParams({
    response_type: "code",
    client_id: "go-hub-chatgpt",
    redirect_uri: notionRedirect,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: issuer + "/mcp",
  })));
  assert.equal(crossedRedirect.status, 400);
});
