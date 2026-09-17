"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const oauthUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-oauth.mjs")).href;
const issuer = "https://hub.example";
let now = 1_789_391_000;
const config = {
  issuer,
  signingKey: "test-signing-key-with-enough-entropy",
  ownerPasscode: "owner-passcode",
  clientId: "chatgpt-go-hub",
  clientSecret: "client-secret",
  redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
  now: () => now,
};
const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

async function challengeFor(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(bytes).toString("base64url");
}

function basicAuth() {
  return "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
}

async function initialToken(handler, createTestAuthorizationCode) {
  const code = await createTestAuthorizationCode({
    ...config,
    codeChallenge: await challengeFor(verifier),
    resource: issuer + "/mcp",
  });
  return handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: {
      authorization: basicAuth(),
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
}

test("OAuth metadata advertises refresh_token grant support", async () => {
  now = 1_789_391_000;
  const { createOAuthHandler } = await import(oauthUrl + "?refresh-metadata=" + Date.now());
  const handler = createOAuthHandler(config);
  const response = await handler(new Request(issuer + "/.well-known/oauth-authorization-server"));
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.deepEqual(metadata.grant_types_supported, ["authorization_code", "refresh_token"]);
});

test("authorization exchange returns a refresh token that renews access without owner authorization", async () => {
  now = 1_789_391_000;
  const { createOAuthHandler, createTestAuthorizationCode, verifyAccessToken } =
    await import(oauthUrl + "?refresh-flow=" + Date.now());
  const handler = createOAuthHandler(config);

  const initial = await initialToken(handler, createTestAuthorizationCode);
  assert.equal(initial.status, 200);
  const first = await initial.json();
  assert.equal(typeof first.refresh_token, "string");
  assert.ok(first.refresh_token.length > 20);

  now += 3601;
  const refreshed = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: {
      authorization: basicAuth(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
      resource: issuer + "/mcp",
    }),
  }));
  assert.equal(refreshed.status, 200);
  const second = await refreshed.json();
  assert.equal(second.token_type, "Bearer");
  assert.equal(second.expires_in, 3600);
  assert.equal(typeof second.access_token, "string");

  const identity = await verifyAccessToken(
    new Request(issuer + "/mcp", { headers: { authorization: "Bearer " + second.access_token } }),
    config,
  );
  assert.deepEqual(identity, { subject: "big", scope: "go-hub" });
});

test("refresh grant fails closed for wrong resource and expired refresh tokens", async () => {
  now = 1_789_391_000;
  const { createOAuthHandler, createTestAuthorizationCode } =
    await import(oauthUrl + "?refresh-fail=" + Date.now());
  const handler = createOAuthHandler(config);
  const initial = await initialToken(handler, createTestAuthorizationCode);
  assert.equal(initial.status, 200);
  const first = await initial.json();
  assert.equal(typeof first.refresh_token, "string");

  const wrongResource = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
      resource: issuer + "/other",
    }),
  }));
  assert.equal(wrongResource.status, 400);
  assert.deepEqual(await wrongResource.json(), { error: "invalid_grant" });

  now += 30 * 24 * 60 * 60 + 1;
  const expired = await handler(new Request(issuer + "/oauth/token", {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
      resource: issuer + "/mcp",
    }),
  }));
  assert.equal(expired.status, 400);
  assert.deepEqual(await expired.json(), { error: "invalid_grant" });
});
