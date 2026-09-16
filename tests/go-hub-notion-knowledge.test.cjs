"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serviceUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-notion-knowledge.mjs")).href;

function textProperty(type, value) {
  return {
    type,
    [type]: [{ type: "text", plain_text: value, text: { content: value } }],
  };
}

function selectProperty(value) {
  return { type: "select", select: value ? { name: value } : null };
}

function dateProperty(value) {
  return { type: "date", date: value ? { start: value, end: null } : null };
}

function notionKnowledgePage(overrides = {}) {
  return {
    object: "page",
    id: overrides.id || "knowledge-page",
    url: overrides.url || "https://www.notion.so/knowledge-page",
    properties: {
      Title: textProperty("title", overrides.title || "Software quality model"),
      Topic: textProperty("rich_text", overrides.topic || "software quality"),
      Claim: textProperty("rich_text", overrides.claim || "Quality requires explicit acceptance characteristics"),
      Summary: textProperty("rich_text", overrides.summary || "Use quality characteristics as acceptance evidence"),
      "Knowledge Status": selectProperty(overrides.status || "CURRENT"),
      "Verification State": selectProperty(overrides.verification || "VERIFIED"),
      "Source ID": textProperty("rich_text", overrides.sourceId || "ISO-25010"),
      "Source URL": { type: "url", url: overrides.sourceUrl || "https://example.test/iso-25010" },
      Evidence: textProperty("rich_text", overrides.evidence || "Primary source checked"),
      "Verified Date": dateProperty(overrides.verifiedAt || "2026-09-16"),
      "Review By": dateProperty(overrides.reviewBy || "2026-12-31"),
      Rating: textProperty("rich_text", overrides.rating || "4.0"),
      Tags: textProperty("rich_text", overrides.tags || "quality standard"),
    },
  };
}

test("Notion knowledge bridge uses a dedicated source and returns gated knowledge", async () => {
  const { createNotionKnowledgeService } = await import(serviceUrl + "?live=" + Date.now());
  const calls = [];
  const service = createNotionKnowledgeService({
    token: "notion-secret",
    dataSourceId: "knowledge-source-id",
    now: () => new Date("2026-09-17T00:00:00Z"),
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        object: "list",
        results: [notionKnowledgePage()],
        has_more: false,
        next_cursor: null,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const response = await service.searchKnowledge({
    task: "software quality",
    requestedResult: "acceptance evidence",
    lensReference: "lens://knowledge",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "PASS");
  assert.equal(payload.records[0].knowledgeStatus, "CURRENT");
  assert.equal(payload.knowledge.source, "notion");
  assert.equal(payload.knowledge.dataSourceId, "knowledge-source-id");
  assert.equal(payload.knowledge.liveRead, true);
  assert.equal(payload.knowledge.readOnly, true);
  assert.match(calls[0].url, /data_sources\/knowledge-source-id\/query$/);
});

test("Notion knowledge bridge fails closed when the knowledge source is not configured", async () => {
  const { createNotionKnowledgeService } = await import(serviceUrl + "?closed=" + Date.now());
  const response = await createNotionKnowledgeService().searchKnowledge({ task: "quality" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "NOTION_KNOWLEDGE_NOT_CONFIGURED" });
});
