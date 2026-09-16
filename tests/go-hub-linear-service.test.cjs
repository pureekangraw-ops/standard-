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

test("Linear service normalizes team project listing", async () => {
  const { createLinearService } = await loadService("projects");
  const fetchImpl = async () => new Response(JSON.stringify({
    data: {
      team: {
        id: "team-a",
        projects: {
          nodes: [{
            id: "project-a",
            name: "Alpha",
            url: "https://linear.app/x",
            status: { name: "In Progress" },
          }],
        },
      },
    },
  }), { headers: { "content-type": "application/json" } });
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.listProjects();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    projects: [{
      id: "project-a",
      name: "Alpha",
      status: "In Progress",
      url: "https://linear.app/x",
    }],
  });
});

test("Linear service returns normalized in-team issue", async () => {
  const { createLinearService } = await loadService("issue-read");
  let capturedBody;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      data: {
        issue: {
          id: "issue-a",
          identifier: "PUR-5",
          title: "Bridge",
          description: "desc",
          url: "https://linear.app/x/issue/PUR-5",
          updatedAt: "2026-09-16T00:00:00.000Z",
          priority: 2,
          state: { id: "state-a", name: "In Progress" },
          team: { id: "team-a" },
          project: { id: "project-a", name: "Alpha" },
        },
      },
    }), { headers: { "content-type": "application/json" } });
  };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.getIssue({ identifier: "PUR-5" });
  assert.equal(response.status, 200);
  assert.equal(capturedBody.variables.identifier, "PUR-5");
  assert.deepEqual(await response.json(), {
    issue: {
      id: "issue-a",
      identifier: "PUR-5",
      title: "Bridge",
      description: "desc",
      status: { id: "state-a", name: "In Progress" },
      priority: 2,
      project: { id: "project-a", name: "Alpha" },
      url: "https://linear.app/x/issue/PUR-5",
      updatedAt: "2026-09-16T00:00:00.000Z",
    },
  });
});

test("Linear service rejects issue outside configured team", async () => {
  const { createLinearService } = await loadService("scope");
  const fetchImpl = async () => new Response(JSON.stringify({
    data: {
      issue: {
        id: "issue-b",
        identifier: "OTHER-1",
        title: "Other",
        description: null,
        url: "https://linear.app/x/issue/OTHER-1",
        updatedAt: "2026-09-16T00:00:00.000Z",
        priority: 0,
        state: { id: "state-b", name: "Todo" },
        team: { id: "team-b" },
        project: null,
      },
    },
  }), { headers: { "content-type": "application/json" } });
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.getIssue({ identifier: "OTHER-1" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "LINEAR_TEAM_SCOPE_VIOLATION" });
});

test("Linear service returns not found for missing issue", async () => {
  const { createLinearService } = await loadService("not-found");
  const fetchImpl = async () => new Response(JSON.stringify({ data: { issue: null } }), {
    headers: { "content-type": "application/json" },
  });
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.getIssue({ identifier: "PUR-404" });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: "LINEAR_ISSUE_NOT_FOUND" });
});

test("Linear service validates issue identifier before upstream call", async () => {
  const { createLinearService } = await loadService("invalid-id");
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call upstream"); };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  for (const input of [undefined, {}, { identifier: "" }, { identifier: "   " }]) {
    const response = await service.getIssue(input);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "LINEAR_INVALID_INPUT" });
  }
  assert.equal(calls, 0);
});

test("Linear service creates an issue in the configured team and normalizes the result", async () => {
  const { createLinearService } = await loadService("issue-create");
  let capturedBody;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: "issue-new",
            identifier: "PUR-6",
            title: "New bridge work",
            description: "details",
            url: "https://linear.app/x/issue/PUR-6",
            updatedAt: "2026-09-16T01:00:00.000Z",
            priority: 1,
            state: { id: "state-todo", name: "Todo" },
            team: { id: "team-a" },
            project: { id: "project-a", name: "Alpha" },
          },
        },
      },
    }), { headers: { "content-type": "application/json" } });
  };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.createIssue({
    title: "  New bridge work  ",
    description: "details",
    projectId: "project-a",
    priority: 1,
  });
  assert.equal(response.status, 200);
  assert.equal(capturedBody.variables.input.teamId, "team-a");
  assert.equal(capturedBody.variables.input.title, "New bridge work");
  assert.equal(capturedBody.variables.input.projectId, "project-a");
  assert.equal(capturedBody.variables.input.priority, 1);
  assert.deepEqual((await response.json()).issue, {
    id: "issue-new",
    identifier: "PUR-6",
    title: "New bridge work",
    description: "details",
    status: { id: "state-todo", name: "Todo" },
    priority: 1,
    project: { id: "project-a", name: "Alpha" },
    url: "https://linear.app/x/issue/PUR-6",
    updatedAt: "2026-09-16T01:00:00.000Z",
  });
});

test("Linear service validates createIssue before upstream call", async () => {
  const { createLinearService } = await loadService("issue-create-invalid");
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call upstream"); };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  for (const input of [undefined, {}, { title: "" }, { title: "   " }]) {
    const response = await service.createIssue(input);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "LINEAR_INVALID_INPUT" });
  }
  assert.equal(calls, 0);
});

test("Linear service updates only an issue that belongs to the configured team", async () => {
  const { createLinearService } = await loadService("issue-update");
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        data: {
          issue: {
            id: "issue-a",
            identifier: "PUR-5",
            title: "Bridge",
            description: "desc",
            url: "https://linear.app/x/issue/PUR-5",
            updatedAt: "2026-09-16T00:00:00.000Z",
            priority: 2,
            state: { id: "state-a", name: "In Progress" },
            team: { id: "team-a" },
            project: { id: "project-a", name: "Alpha" },
          },
        },
      }), { headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: {
        issueUpdate: {
          success: true,
          issue: {
            id: "issue-a",
            identifier: "PUR-5",
            title: "Bridge updated",
            description: null,
            url: "https://linear.app/x/issue/PUR-5",
            updatedAt: "2026-09-16T02:00:00.000Z",
            priority: 3,
            state: { id: "state-done", name: "Done" },
            team: { id: "team-a" },
            project: null,
          },
        },
      },
    }), { headers: { "content-type": "application/json" } });
  };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.updateIssue({
    identifier: "PUR-5",
    title: "Bridge updated",
    description: null,
    priority: 3,
    stateId: "state-done",
    projectId: null,
  });
  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].variables.issueId, "issue-a");
  assert.deepEqual(requests[1].variables.input, {
    title: "Bridge updated",
    description: null,
    priority: 3,
    stateId: "state-done",
    projectId: null,
  });
  assert.equal((await response.json()).issue.status.name, "Done");
});

test("Linear service blocks update after an out-of-team preflight", async () => {
  const { createLinearService } = await loadService("issue-update-scope");
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      data: {
        issue: {
          id: "issue-b",
          identifier: "OTHER-1",
          title: "Other",
          description: null,
          url: null,
          updatedAt: null,
          priority: 0,
          state: null,
          team: { id: "team-b" },
          project: null,
        },
      },
    }), { headers: { "content-type": "application/json" } });
  };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  const response = await service.updateIssue({ identifier: "OTHER-1", title: "must not write" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "LINEAR_TEAM_SCOPE_VIOLATION" });
  assert.equal(calls, 1);
});

test("Linear service validates updateIssue patch before upstream call", async () => {
  const { createLinearService } = await loadService("issue-update-invalid");
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call upstream"); };
  const service = createLinearService({ fetchImpl, token: "token-a", teamId: "team-a" });
  for (const input of [undefined, {}, { identifier: "PUR-5" }, { identifier: "", title: "x" }]) {
    const response = await service.updateIssue(input);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "LINEAR_INVALID_INPUT" });
  }
  assert.equal(calls, 0);
});
