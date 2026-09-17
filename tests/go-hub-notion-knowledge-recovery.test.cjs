"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serviceUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-notion-knowledge.mjs")).href;
const canonicalKnowledgeTitle = "MIMIR — KNOWLEDGE";

function page() {
  const text = value => ({ type: "rich_text", rich_text: [{ type: "text", plain_text: value, text: { content: value } }] });
  return {
    object: "page", id: "knowledge-page", url: "https://www.notion.so/knowledge-page",
    properties: {
      Title: { type: "title", title: [{ type: "text", plain_text: "Software quality model", text: { content: "Software quality model" } }] },
      Topic: text("software quality"), Claim: text("Quality requires explicit acceptance characteristics"),
      Summary: text("Use quality characteristics as acceptance evidence"),
      "Knowledge Status": { type: "select", select: { name: "CURRENT" } },
      "Verification State": { type: "select", select: { name: "VERIFIED" } },
      "Source ID": text("ISO-25010"), "Source URL": { type: "url", url: "https://example.test/iso-25010" },
      Evidence: text("Primary source checked"),
      "Verified Date": { type: "date", date: { start: "2026-09-16", end: null } },
      "Review By": { type: "date", date: { start: "2026-12-31", end: null } },
      Rating: text("4.0"), Tags: text("quality standard"),
    },
  };
}

function searchResult(id, title = canonicalKnowledgeTitle) {
  return { object: "data_source", id, title: [{ plain_text: title }] };
}

test("Knowledge recovers the canonical MIMIR — KNOWLEDGE source when the configured id is stale", async () => {
  const { createNotionKnowledgeService } = await import(serviceUrl + "?recover=" + Date.now());
  const calls = [];
  const service = createNotionKnowledgeService({
    token: "secret", dataSourceId: "stale-id",
    now: () => new Date("2026-09-17T00:00:00Z"),
    async fetchImpl(url, init) {
      calls.push({ url, init });
      if (url.endsWith("/data_sources/stale-id/query")) return new Response(JSON.stringify({ code: "object_not_found" }), { status: 404 });
      if (url.endsWith("/search")) return new Response(JSON.stringify({ results: [searchResult("fresh-id")], has_more: false, next_cursor: null }), { status: 200 });
      if (url.endsWith("/data_sources/fresh-id/query")) return new Response(JSON.stringify({ results: [page()], has_more: false, next_cursor: null }), { status: 200 });
      throw new Error("unexpected URL " + url);
    },
  });
  const response = await service.searchKnowledge({ task: "software quality", requestedResult: "acceptance evidence" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, "PASS");
  assert.equal(payload.knowledge.dataSourceId, "fresh-id");
  assert.equal(payload.knowledge.bindingRecovery, "SEARCH_EXACT_TITLE");
  const searchCall = calls.find(call => call.url.endsWith("/search"));
  assert.ok(searchCall);
  assert.equal(JSON.parse(searchCall.init.body).query, canonicalKnowledgeTitle);
  assert.deepEqual(JSON.parse(searchCall.init.body).filter, { property: "object", value: "data_source" });
});

test("Knowledge recovery fails closed when canonical source search is ambiguous", async () => {
  const { createNotionKnowledgeService } = await import(serviceUrl + "?ambiguous=" + Date.now());
  const service = createNotionKnowledgeService({
    token: "secret", dataSourceId: "stale-id",
    async fetchImpl(url) {
      if (url.endsWith("/data_sources/stale-id/query")) return new Response(JSON.stringify({}), { status: 404 });
      if (url.endsWith("/search")) return new Response(JSON.stringify({ results: [searchResult("a"), searchResult("b")], has_more: false }), { status: 200 });
      throw new Error("unexpected URL " + url);
    },
  });
  const response = await service.searchKnowledge({ task: "software quality" });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { code: "NOTION_KNOWLEDGE_SOURCE_AMBIGUOUS" });
});
