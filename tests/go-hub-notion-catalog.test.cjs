"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serviceUrl = pathToFileURL(
  path.resolve(__dirname, "..", "go-hub-notion-catalog.mjs"),
).href;

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

function notionPage(overrides = {}) {
  return {
    object: "page",
    id: overrides.id || "python-page",
    url: overrides.url || "https://www.notion.so/python-page",
    properties: {
      "ชื่อ": textProperty("title", overrides.name || "Python"),
      "ประเภท": selectProperty("Tool"),
      "คุณสมบัติ": textProperty(
        "rich_text",
        overrides.capability || "Python calculate analyze data",
      ),
      "สถานะ": selectProperty("พร้อมใช้"),
      "สถานะปัจจุบัน": selectProperty(overrides.current || "Active"),
      "Permission": selectProperty(overrides.permission || "Allowed"),
      "Callable Action / Tool Exposure": selectProperty(
        overrides.callable || "Available",
      ),
      "GO Rating": textProperty("rich_text", overrides.rating || "N/A"),
      "Route": textProperty("rich_text", overrides.route || "GO -> Python"),
      "Verified Date": dateProperty(overrides.verified || "2026-09-13"),
      "Modified Date": dateProperty(overrides.modified || "2026-09-13"),
    },
  };
}

test("Notion bridge reads only its configured data source and returns live MIMIR PASS", async () => {
  const { createNotionCatalogService } = await import(
    serviceUrl + "?live=" + Date.now()
  );
  const calls = [];
  const service = createNotionCatalogService({
    token: "notion-secret",
    dataSourceId: "catalog-source-id",
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        object: "list",
        results: [notionPage()],
        has_more: false,
        next_cursor: null,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const response = await service.searchCatalog({
    task: "Use Python to calculate",
    requestedResult: "Analyze data",
    lensReference: "lens://tool-fit",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "PASS");
  assert.equal(payload.records[0].name, "Python");
  assert.equal(payload.route, "GO -> Python");
  assert.equal(payload.catalog.source, "notion");
  assert.equal(payload.catalog.dataSourceId, "catalog-source-id");
  assert.equal(payload.catalog.liveRead, true);
  assert.equal(
    calls[0].url,
    "https://api.notion.com/v1/data_sources/catalog-source-id/query",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer notion-secret");
  assert.equal(calls[0].init.headers["notion-version"], "2026-03-11");
});

test("Notion bridge follows pagination before MIMIR chooses a product", async () => {
  const { createNotionCatalogService } = await import(
    serviceUrl + "?pages=" + Date.now()
  );
  const bodies = [];
  const service = createNotionCatalogService({
    token: "notion-secret",
    dataSourceId: "catalog-source-id",
    async fetchImpl(_url, init) {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const first = !body.start_cursor;
      return new Response(JSON.stringify(first ? {
        results: [notionPage({
          id: "blocked",
          name: "Python Old",
          current: "Blocked",
          permission: "Blocked",
          rating: "5.0",
        })],
        has_more: true,
        next_cursor: "page-2",
      } : {
        results: [notionPage({
          id: "usable",
          name: "Python",
          rating: "1.0",
        })],
        has_more: false,
        next_cursor: null,
      }), { headers: { "content-type": "application/json" } });
    },
  });

  const payload = await (
    await service.searchCatalog({
      task: "Python calculate",
      requestedResult: "Analyze data",
    })
  ).json();

  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].start_cursor, undefined);
  assert.equal(bodies[1].start_cursor, "page-2");
  assert.equal(payload.status, "PASS");
  assert.equal(payload.records[0].name, "Python");
  assert.equal(payload.evidence.gateBeforeRating, true);
});

test("Notion bridge fails closed when secret configuration or upstream access is missing", async () => {
  const { createNotionCatalogService } = await import(
    serviceUrl + "?closed=" + Date.now()
  );
  const unconfigured = createNotionCatalogService();
  const missing = await unconfigured.searchCatalog({
    task: "Python",
    requestedResult: "Calculate",
  });
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), {
    code: "NOTION_CATALOG_NOT_CONFIGURED",
  });

  const upstream = createNotionCatalogService({
    token: "notion-secret",
    dataSourceId: "catalog-source-id",
    fetchImpl: async () => new Response(
      JSON.stringify({ code: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    ),
  });
  const failed = await upstream.searchCatalog({
    task: "Python",
    requestedResult: "Calculate",
  });
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), {
    code: "NOTION_UPSTREAM_ERROR",
    upstreamStatus: 401,
  });
});
