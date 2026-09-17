"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const mimirUrl = pathToFileURL(path.join(root, "go-hub-mimir-destination.js")).href;
const directoryUrl = pathToFileURL(path.join(root, "go-hub-mimir-directory.js")).href;
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

test("MIMIR structured retriever accepts an explicit tokenizer so catalog matching can preserve its contract", async () => {
  const module = await import(knowledgeUrl + "?tokenizer=" + Date.now());
  const retrieve = module.createMimirStructuredRetriever({
    coreText: record => record.text,
    tokenize: query => String(query).split("|").filter(Boolean),
  });

  const result = retrieve({
    records: [{ id: "single-letter", text: "a registry route" }],
    query: "a|z",
  });

  assert.deepEqual(result.map(item => item.record.id), ["single-letter"]);
});

test("MIMIR library invokes only the department chosen by the route-only directory", async () => {
  const module = await import(directoryUrl + "?library=" + Date.now());
  assert.equal(typeof module.createMimirLibrary, "function");

  const calls = [];
  const library = module.createMimirLibrary({
    routes: [
      { id: "catalog", intents: ["CATALOG"], route: "mimir://catalog", status: "ACTIVE", permission: "ALLOWED" },
      { id: "knowledge", intents: ["KNOWLEDGE"], route: "mimir://knowledge", status: "ACTIVE", permission: "ALLOWED" },
    ],
    departments: {
      catalog: async query => {
        calls.push(["catalog", query]);
        return { status: "PASS", records: [{ id: "catalog-record" }], route: "catalog://notion" };
      },
      knowledge: async query => {
        calls.push(["knowledge", query]);
        return { status: "PASS", records: [{ id: "knowledge-record" }], route: "knowledge://notion" };
      },
    },
  });

  const result = await library.query({
    intent: "KNOWLEDGE",
    task: "Find knowledge even if this sentence says catalog",
    requestedResult: "Verified fact",
    lensReference: "lens://knowledge",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "knowledge");
  assert.equal(result.status, "PASS");
  assert.equal(result.departmentId, "knowledge");
  assert.equal(result.directoryRoute, "mimir://knowledge");
  assert.equal(result.departmentRoute, "knowledge://notion");
  assert.deepEqual(result.records, [{ id: "knowledge-record" }]);
});
