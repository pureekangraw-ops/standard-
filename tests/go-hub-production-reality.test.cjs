"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const hephaestusUrl = pathToFileURL(path.join(root, "go-hub-hephaestus.js")).href;
const returnUrl = pathToFileURL(path.join(root, "go-hub-hephaestus-return.js")).href;
const edgeUrl = pathToFileURL(path.join(root, "go-hub-edge-worker.mjs")).href;

function verification(overrides = {}) {
  return {
    status: "pass",
    mainSha: "main-after-merge",
    checkedAt: "2026-09-16T03:30:00+07:00",
    evidence: {
      deploymentSha: "main-after-merge",
      root: { status: "pass", httpStatus: 200 },
      mcp: { status: "pass", httpStatus: 401 },
    },
    ...overrides,
  };
}

test("Hephaestus return requires structured production evidence bound to the verified main SHA", async () => {
  const { createHephaestusState, requestFactorySlot } = await import(hephaestusUrl + `?${Date.now()}`);
  const { completeMergeAndReturn } = await import(returnUrl + `?${Date.now()}`);
  const active = requestFactorySlot(createHephaestusState(), {
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    goId: "go-a",
    jobId: "job-a",
    admission: { decision: "ADMIT", reasons: [] },
  });

  assert.throws(() => completeMergeAndReturn(active.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: {
      status: "pass",
      mainSha: "main-after-merge",
      checkedAt: "2026-09-16T03:30:00+07:00",
    },
  }), /production verification evidence/i);

  assert.throws(() => completeMergeAndReturn(active.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: verification({
      evidence: { ...verification().evidence, deploymentSha: "different-sha" },
    }),
  }), /deployment sha/i);

  const evidence = verification();
  const completed = completeMergeAndReturn(active.state, {
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-a",
    postMergeVerification: evidence,
  });
  assert.deepEqual(completed.returnPacket.postMergeVerification, evidence);
  assert.equal(completed.returnPacket.mainSha, "main-after-merge");
});

test("live edge exposes a read-only deployment SHA reality endpoint without delegating", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + `?${Date.now()}`);
  let delegateCalls = 0;
  const delegate = {
    async fetch() {
      delegateCalls += 1;
      return new Response("delegate");
    },
  };
  const factoryMcp = { async fetch() { return new Response("mcp"); } };
  const handler = createEdgeWorkerHandler({ delegate, factoryMcp });

  const response = await handler.fetch(
    new Request("https://hub.example/hub/api/version"),
    { GOHUB_DEPLOY_SHA: "exact-deploy-sha" },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.deepEqual(await response.json(), {
    product: "GO Hub",
    deploymentSha: "exact-deploy-sha",
  });
  assert.equal(delegateCalls, 0);

  const missing = await handler.fetch(
    new Request("https://hub.example/hub/api/version"),
    {},
  );
  assert.equal(missing.status, 503);
});

test("deploy workflow publishes exact SHA then performs post-deploy root MCP and version smoke", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/go-hub-deploy.yml"), "utf8");
  const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.go-hub.jsonc"), "utf8"));

  assert.match(workflow, /id:\s*deploy/);
  assert.match(workflow, /GOHUB_DEPLOY_SHA:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /Post-deploy smoke/);
  assert.match(workflow, /\/hub\/api\/version/);
  assert.match(workflow, /deploymentSha/);
  assert.match(workflow, /GITHUB_SHA/);
  assert.ok(wrangler.assets.run_worker_first.includes("/hub/api/version"));
});
