import { createMimirCatalogSearchPort } from "./go-hub-mimir-destination.js";

const NOTION_API_ROOT = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const MAX_PAGES = 1000;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function plainText(items) {
  return Array.isArray(items)
    ? items.map(item => item?.plain_text || "").join("")
    : "";
}

function propertyValue(property) {
  if (!property || typeof property !== "object") return null;
  switch (property.type) {
    case "title":
    case "rich_text":
      return plainText(property[property.type]);
    case "select":
    case "status":
      return property[property.type]?.name || null;
    case "date":
      return property.date?.start || null;
    case "number":
    case "checkbox":
    case "url":
    case "email":
    case "phone_number":
      return property[property.type] ?? null;
    case "multi_select":
      return Array.isArray(property.multi_select)
        ? property.multi_select.map(option => option?.name).filter(Boolean)
        : [];
    default:
      return null;
  }
}

export function flattenNotionPage(page) {
  const row = {
    id: String(page?.id || ""),
    url: String(page?.url || ""),
  };
  for (const [name, property] of Object.entries(page?.properties || {})) {
    const value = propertyValue(property);
    if (property?.type === "date") {
      row["date:" + name + ":start"] = value;
    } else {
      row[name] = value;
    }
  }
  return row;
}

function notionHeaders(token) {
  return {
    authorization: "Bearer " + token,
    "content-type": "application/json",
    "notion-version": NOTION_VERSION,
    "user-agent": "go-hub-mimir-catalog",
  };
}

async function readAllRows(fetchImpl, token, dataSourceId) {
  const rows = [];
  let startCursor = null;

  do {
    const response = await fetchImpl(
      NOTION_API_ROOT + "/data_sources/" + encodeURIComponent(dataSourceId) + "/query",
      {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({
          page_size: 100,
          ...(startCursor ? { start_cursor: startCursor } : {}),
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("NOTION_UPSTREAM_ERROR");
      error.status = response.status;
      throw error;
    }
    const results = Array.isArray(payload.results) ? payload.results : [];
    rows.push(...results.map(flattenNotionPage));
    if (rows.length > MAX_PAGES) throw new Error("NOTION_CATALOG_LIMIT_EXCEEDED");
    startCursor = payload.has_more ? String(payload.next_cursor || "") : null;
    if (payload.has_more && !startCursor) throw new Error("NOTION_CURSOR_MISSING");
  } while (startCursor);

  return rows;
}

export function createNotionCatalogService({
  fetchImpl = fetch,
  token,
  dataSourceId,
} = {}) {
  return Object.freeze({
    async searchCatalog(input = {}) {
      if (!token || !dataSourceId) {
        return json({ code: "NOTION_CATALOG_NOT_CONFIGURED" }, 503);
      }
      try {
        const search = createMimirCatalogSearchPort({
          readCatalog: () => readAllRows(fetchImpl, token, dataSourceId),
        });
        const result = await search({
          task: String(input.task || ""),
          requestedResult: String(input.requestedResult || ""),
          lensReference: input.lensReference == null
            ? null
            : String(input.lensReference),
        });
        return json({
          ...result,
          catalog: {
            source: "notion",
            dataSourceId,
            liveRead: true,
          },
        });
      } catch (error) {
        if (error?.message === "NOTION_UPSTREAM_ERROR") {
          return json({
            code: "NOTION_UPSTREAM_ERROR",
            upstreamStatus: error.status,
          }, 502);
        }
        return json({ code: error?.message || "NOTION_CATALOG_ERROR" }, 502);
      }
    },
  });
}
