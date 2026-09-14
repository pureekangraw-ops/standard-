"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-worker.mjs")).href;
const repository = "pureekangraw-ops/standard-";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Worker maps stale update/delete blob conflicts to STALE_FILE_SHA", async () => {
  for (const [method, upstreamStatus] of [["PUT", 409], ["DELETE", 422]]) {
    const fetchImpl = async (url) => {
      const value = String(url);
      if (value === `https://api.github.com/repos/${repository}`) {
        return jsonResponse({ default_branch: "main" });
      }
      if (value === `https://api.github.com/repos/${repository}/contents/src/app.js`) {
        return jsonResponse({ message: "sha does not match" }, upstreamStatus);
      }
      throw new Error(`unexpected upstream ${value}`);
    };

    const { createWorkerHandler } = await import(`${workerUrl}?stale=${method}-${Date.now()}-${Math.random()}`);
    const handler = createWorkerHandler({ fetchImpl });
    const request = new Request("https://hub.example/hub/api/github-workspace/file", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository,
        path: "src/app.js",
        branch: "feature-stale",
        expectedSha: "blob-old",
        ...(method === "PUT" ? { content: "next" } : {}),
      }),
    });

    const response = await handler.fetch(request, { GITHUB_TOKEN: "token" });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "STALE_FILE_SHA" });
  }
});
