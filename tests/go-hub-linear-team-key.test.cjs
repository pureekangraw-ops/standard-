"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serviceUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-linear-service.mjs")).href;

async function loadService(tag) {
  return import(serviceUrl + "?" + tag + "=" + Date.now());
}

function response(payload) {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
}

test("Linear service resolves configured team key to UUID before listing projects", async () => {
  const { createLinearService } = await loadService("team-key-projects");
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return response({ data: { teams: { nodes: [
        { id: "team-a", key: "PUR", name: "Puree" },
        { id: "team-b", key: "OPS", name: "Ops" },
      ] } } });
    }
    return response({ data: { team: { id: "team-a", projects: { nodes: [
      { id: "project-a", name: "Alpha", url: "https://linear.app/p/alpha", status: { name: "In Progress" } },
    ] } } });
  };

  const service = createLinearService({ fetchImpl, token: "token-a", teamKey: " pur " });
  const result = await service.listProjects();
  assert.equal(result.status, 200);
  assert.equal(requests.length, 2);
  assert.match(requests[0].query, /teams/);
  assert.match(requests[0].query, /key/);
  assert.equal(requests[1].variables.teamId, "team-a");
  assert.deepEqual(await result.json(), {
    projects: [{ id: "project-a", name: "Alpha", status: "In Progress", url: "https://linear.app/p/alpha" }],
  });
});

test("Linear service uses resolved team UUID for issue scope and caches resolution", async () => {
  const { createLinearService } = await loadService("team-key-scope");
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return response({ data: { teams: { nodes: [{ id: "team-a", key: "PUR", name: "Puree" }] } } });
    }
    return response({ data: { issue: {
      id: "issue-a", identifier: "PUR-5", title: "Bridge", description: null,
      url: null, updatedAt: null, priority: 0, state: null,
      team: { id: "team-a" }, project: null,
    } } });
  };

  const service = createLinearService({ fetchImpl, token: "token-a", teamKey: "PUR" });
  const first = await service.getIssue({ identifier: "PUR-5" });
  const second = await service.getIssue({ identifier: "PUR-5" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(requests.filter(item => /teams/.test(item.query)).length, 1);
});

test("Linear service creates issue with resolved team UUID, never the configured key", async () => {
  const { createLinearService } = await loadService("team-key-create");
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return response({ data: { teams: { nodes: [{ id: "team-a", key: "PUR", name: "Puree" }] } } });
    }
    return response({ data: { issueCreate: { success: true, issue: {
      id: "issue-new", identifier: "PUR-6", title: "New", description: null,
      url: null, updatedAt: null, priority: 0, state: null,
      team: { id: "team-a" }, project: null,
    } } } });
  };

  const service = createLinearService({ fetchImpl, token: "token-a", teamKey: "PUR" });
  const result = await service.createIssue({ title: "New" });
  assert.equal(result.status, 200);
  assert.equal(requests[1].variables.input.teamId, "team-a");
  assert.notEqual(requests[1].variables.input.teamId, "PUR");
});

test("Linear service returns a sanitized configuration error when team key is not found", async () => {
  const { createLinearService } = await loadService("team-key-missing");
  const service = createLinearService({
    token: "token-a",
    teamKey: "PUR",
    fetchImpl: async () => response({ data: { teams: { nodes: [] } } }),
  });
  const result = await service.listProjects();
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { code: "LINEAR_TEAM_NOT_FOUND" });
});
