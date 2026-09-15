"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-worker.mjs")).href;
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;
const repository = "pureekangraw-ops/standard-";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Worker returns concise failure evidence for one workflow run", async () => {
  const fetchImpl = async url => {
    const value = String(url);
    if (value === `https://api.github.com/repos/${repository}/actions/runs/77/jobs?per_page=100`) {
      return jsonResponse({ jobs: [
        {
          id: 701,
          name: "STANDARD regression safety gate",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.test/job/701",
          steps: [
            { number: 1, name: "Check out repository", status: "completed", conclusion: "success" },
            { number: 4, name: "Run deploy gate", status: "completed", conclusion: "failure" },
          ],
        },
        {
          id: 702,
          name: "Unrelated success",
          status: "completed",
          conclusion: "success",
          steps: [],
        },
      ] });
    }
    if (value === `https://api.github.com/repos/${repository}/actions/jobs/701/logs`) {
      return new Response([
        "2026-09-15T04:00:00Z npm run deploy:gate",
        "2026-09-15T04:00:01Z not ok 3 - MIMIR PASS returns route to GO",
        "2026-09-15T04:00:01Z AssertionError [ERR_ASSERTION]: expected destination access envelope",
        "2026-09-15T04:00:01Z at tests/go-city-work-loop.test.cjs:88:10",
      ].join("\n"), { status: 200, headers: { "content-type": "text/plain" } });
    }
    throw new Error(`unexpected upstream ${value}`);
  };

  const { createWorkerHandler } = await import(`${workerUrl}?failure-evidence=${Date.now()}`);
  const handler = createWorkerHandler({ fetchImpl });
  const response = await handler.fetch(new Request(
    `https://hub.example/hub/api/github-workspace/failure-evidence?repository=${encodeURIComponent(repository)}&runId=77`
  ), { GITHUB_TOKEN: "token" });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    runId: 77,
    failedJobs: [{
      id: 701,
      name: "STANDARD regression safety gate",
      status: "completed",
      conclusion: "failure",
      url: "https://github.test/job/701",
      failedSteps: [{ number: 4, name: "Run deploy gate", conclusion: "failure" }],
      logExcerpt: [
        "not ok 3 - MIMIR PASS returns route to GO",
        "AssertionError [ERR_ASSERTION]: expected destination access envelope",
        "at tests/go-city-work-loop.test.cjs:88:10",
      ],
    }],
  });
});

test("MCP registry exposes failure evidence as a read-only lifecycle tool", async () => {
  const { createMcpRegistry } = await import(`${registryUrl}?failure-evidence=${Date.now()}`);
  const calls = [];
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => {
      calls.push({ name, input });
      return jsonResponse({ runId: input.runId, failedJobs: [] });
    },
  });
  const registry = createMcpRegistry({ lifecycle });
  const tool = registry.listTools().find(item => item.name === "go_hub_get_failure_evidence");
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);

  const result = await registry.callTool("go_hub_get_failure_evidence", { repository, runId: 77 });
  assert.deepEqual(result.structuredContent, { runId: 77, failedJobs: [] });
  assert.deepEqual(calls.at(-1), {
    name: "getFailureEvidence",
    input: { repository, runId: 77 },
  });
});
