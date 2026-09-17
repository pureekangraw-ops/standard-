"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const libraryUrl = pathToFileURL(path.join(root, "go-hub-mimir-library.js")).href;

test("MIMIR Memory results keep MEMORY identity and cannot override current communication", async () => {
  const module = await import(libraryUrl + "?memory-contract=" + Date.now());
  assert.equal(typeof module.createMimirMemorySearchPort, "function");

  const searchMemory = module.createMimirMemorySearchPort({
    readMemory: async () => [{
      id: "memory-1",
      topic: "preferred route",
      content: "use the old direct route",
      sourceContext: "chat://older-context",
      recordedAt: "2026-09-15T10:00:00Z",
      tags: "route preference",
    }],
  });

  const result = await searchMemory({
    task: "preferred route",
    requestedResult: "Relevant prior context",
    currentCommunication: "Use GO Hub first",
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].collection, "MEMORY");
  assert.equal(result.records[0].canOverrideCurrentCommunication, false);
  assert.equal(result.records[0].sourceContext, "chat://older-context");
  assert.equal(result.records[0].recordedAt, "2026-09-15T10:00:00Z");
});
