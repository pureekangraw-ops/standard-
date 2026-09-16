import { flattenNotionPage } from "./go-hub-notion-catalog.mjs";
import { createMimirKnowledgeSearchPort } from "./go-hub-mimir-knowledge.js";

const NOTION_API_ROOT = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const MAX_PAGES = 1000;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function notionHeaders(token) {
  return {
    authorization: "Bearer " + token,
    "content-type": "application/json",
    "notion-version": NOTION_VERSION,
    "user-agent": "go-hub-mimir-knowledge",
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
      const error = new Error("NOTION_KNOWLEDGE_UPSTREAM_ERROR");
      error.status = response.status;
      throw error;
    }
    const results = Array.isArray(payload.results) ? payload.results : [];
    rows.push(...results.map(flattenNotionPage));
    if (rows.length > MAX_PAGES) throw new Error("NOTION_KNOWLEDGE_LIMIT_EXCEEDED");
    startCursor = payload.has_more ? String(payload.next_cursor || "") : null;
    if (payload.has_more && !startCursor) throw new Error("NOTION_KNOWLEDGE_CURSOR_MISSING");
  } while (startCursor);

  return rows;
}

export function createNotionKnowledgeService({
  fetchImpl = fetch,
  token,
  dataSourceId,
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    async searchKnowledge(input = {}) {
      if (!token || !dataSourceId) {
        return json({ code: "NOTION_KNOWLEDGE_NOT_CONFIGURED" }, 503);
      }
      try {
        const search = createMimirKnowledgeSearchPort({
          readKnowledge: () => readAllRows(fetchImpl, token, dataSourceId),
          now,
        });
        const result = await search({
          task: String(input.task || ""),
          requestedResult: String(input.requestedResult || ""),
          lensReference: input.lensReference == null ? null : String(input.lensReference),
        });
        return json({
          ...result,
          workContext: input.workContext == null ? null : structuredClone(input.workContext),
          knowledge: {
            source: "notion",
            dataSourceId,
            liveRead: true,
            readOnly: true,
          },
        });
      } catch (error) {
        if (error?.message === "NOTION_KNOWLEDGE_UPSTREAM_ERROR") {
          return json({
            code: "NOTION_KNOWLEDGE_UPSTREAM_ERROR",
            upstreamStatus: error.status,
          }, 502);
        }
        return json({ code: error?.message || "NOTION_KNOWLEDGE_ERROR" }, 502);
      }
    },
  });
}
