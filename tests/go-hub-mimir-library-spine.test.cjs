"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const mimirUrl = pathToFileURL(path.join(root, "go-hub-mimir-destination.js")).href;
const knowledgeUrl = pathToFileURL(path.join(root, "go-hub-mimir-knowledge.js")).href;

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

test("MIMIR structured retriever ranks records by query relevance without applying lifecycle gates", async () => {
  const module = await import(knowledgeUrl + "?retriever=" + Date.now());
  assert.equal(typeof module.createMimirStructuredRetriever, "function");

  const retrieve = module.createMimirStructuredRetriever({
    coreText: record => `${record.title} ${record.claim}`,
    helperText: record => record.tags,
  });

  const records = [
    { id: "candidate", title: "Factory release knowledge", claim: "release evidence", tags: "build", status: "CANDIDATE" },
    { id: "current", title: "Factory notes", claim: "general notes", tags: "release", status: "CURRENT" },
  ];
  const result = retrieve({ records, query: "factory release evidence" });

  assert.deepEqual(result.map(item => item.record.id), ["candidate", "current"]);
  assert.equal(Object.hasOwn(result[0], "gate"), false);
  assert.equal(Object.hasOwn(result[0], "rating"), false);
});
