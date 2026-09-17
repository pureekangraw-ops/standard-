"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const mimirUrl = pathToFileURL(path.join(root, "go-hub-mimir-destination.js")).href;

test("MIMIR directory resolves an explicit collection intent without returning content records", async () => {
  const module = await import(mimirUrl + "?directory=" + Date.now());
  assert.equal(typeof module.createMimirDirectoryResolver, "function");

  const resolve = module.createMimirDirectoryResolver({
    routes: [
      {
        id: "catalog",
        intents: ["CATALOG", "CAPABILITY"],
        route: "mimir://catalog",
        status: "ACTIVE",
        permission: "ALLOWED",
      },
      {
        id: "knowledge",
        intents: ["KNOWLEDGE", "FACT"],
        route: "mimir://knowledge",
        status: "ACTIVE",
        permission: "ALLOWED",
      },
    ],
  });

  const result = resolve({
    intent: "KNOWLEDGE",
    task: "Find factory build records that happen to mention catalog",
    requestedResult: "Verified knowledge",
  });

  assert.deepEqual(result, {
    status: "PASS",
    waitReason: null,
    departmentId: "knowledge",
    route: "mimir://knowledge",
  });
  assert.equal(Object.hasOwn(result, "records"), false);
});
