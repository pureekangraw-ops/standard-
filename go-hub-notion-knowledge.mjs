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

function notionTitle(value = {}) {
  return (Array.isArray(value?.title) ? value.title : [])
    .map(item => String(item?.plain_text ?? item?.text?.content ?? ""))
    .join("")
    .trim();
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

async function locateKnowledgeDataSource(fetchImpl, token, knowledgeTitle) {
  const response = await fetchImpl(NOTION_API_ROOT + "/search", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      query: knowledgeTitle,
      filter: { property: "object", value: "data_source" },
      page_size: 100,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("NOTION_KNOWLEDGE_DISCOVERY_UPSTREAM_ERROR");
    error.status = response.status;
    throw error;
  }
  const exact = (Array.isArray(payload.results) ? payload.results : [])
    .filter(item => item?.object === "data_source" && notionTitle(item) === knowledgeTitle && String(item?.id || "").trim());
  if (!exact.length) throw new Error("NOTION_KNOWLEDGE_SOURCE_NOT_FOUND");
  if (exact.length !== 1) throw new Error("NOTION_KNOWLEDGE_SOURCE_AMBIGUOUS");
  return String(exact[0].id);
}

export function createNotionKnowledgeService({
  fetchImpl = fetch,
  token,
  dataSourceId,
  knowledgeTitle = "MIMIR Knowledge",
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    async searchKnowledge(input = {}) {
      if (!token || !dataSourceId) {
        return json({ code: "NOTION_KNOWLEDGE_NOT_CONFIGURED" }, 503);
      }
      let resolvedDataSourceId = String(dataSourceId);
      let bindingRecovery = null;
      try {
        let rows;
        try {
          rows = await readAllRows(fetchImpl, token, resolvedDataSourceId);
        } catch (error) {
          if (error?.message !== "NOTION_KNOWLEDGE_UPSTREAM_ERROR" || error?.status !== 404) throw error;
          resolvedDataSourceId = await locateKnowledgeDataSource(fetchImpl, token, String(knowledgeTitle || "MIMIR Knowledge").trim());
          bindingRecovery = "SEARCH_EXACT_TITLE";
          rows = await readAllRows(fetchImpl, token, resolvedDataSourceId);
        }
        const search = createMimirKnowledgeSearchPort({ readKnowledge: async () => rows, now });
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
            dataSourceId: resolvedDataSourceId,
            liveRead: true,
            readOnly: true,
            ...(bindingRecovery ? { bindingRecovery } : {}),
          },
        });
      } catch (error) {
        if (error?.message === "NOTION_KNOWLEDGE_UPSTREAM_ERROR" || error?.message === "NOTION_KNOWLEDGE_DISCOVERY_UPSTREAM_ERROR") {
          return json({ code: error.message, upstreamStatus: error.status }, 502);
        }
        if (error?.message === "NOTION_KNOWLEDGE_SOURCE_NOT_FOUND" || error?.message === "NOTION_KNOWLEDGE_SOURCE_AMBIGUOUS") {
          return json({ code: error.message }, 502);
        }
        return json({ code: error?.message || "NOTION_KNOWLEDGE_ERROR" }, 502);
      }
    },
  });
}
