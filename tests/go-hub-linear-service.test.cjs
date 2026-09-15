"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serviceUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-linear-service.mjs")).href;

async function loadService(tag) {
  return import(serviceUrl + "?" + tag + "=" + Date.now());
}

test("Linear service fails closed without credential or team config", async () => {
  const { createLinearService } = await loadService("config");
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call upstream"); };

  for (const service of [
    createLinearService({ fetchImpl, token: "", teamId: "team-a" }),
    createLinearService({ fetchImpl, token: "token-a", teamId: "" }),
  ]) {
    const response = await service.listProjects();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "LINEAR_NOT_CONFIGURED" });
  }
  assert.equal(calls, 0);
});

test("Linear service sends personal API key only in Authorization header", async () => {
  const { createLinearService } = await loadService("auth");
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ data: { team: { projects: { nodes: [] } } } }), {
      headers: { "content-type": "application/json" },
    });
  };
  const service = createLinearService({ fetchImpl, token: "secret-token", teamId: "team-a" });
  const response = await service.listProjects();
  assert.equal(response.status, 200);
  assert.equal(captured.url, "https://api.linear.app/graphql");
  assert.equal(captured.init.headers.authorization, "secret-token");
  assert.doesNotMatch(captured.init.body, /secret-token/);
});

test("GraphQL errors are sanitized and do not echo authorization", async () => {
  const { createLinearService } = await loadService("errors");
  const fetchImpl = async () => new Response(JSON.stringify({
    errors: [{ message: "bad request secret-token", extensions: { code: "BAD_USER_INPUT" } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const service = createLinearService({ fetchImpl, token: "secret-token", teamId: "team-a" });
  const response = await service.listProjects();
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(payload.code, "LINEAR_UPSTREAM_ERROR");
  assert.equal(payload.category, "BAD_USER_INPUT");
  assert.doesNotMatch(JSON.stringify(payload), /secret-token/);
});
