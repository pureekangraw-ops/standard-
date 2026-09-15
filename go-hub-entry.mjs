import baseWorker, { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createOAuthHandler, verifyAccessToken } from "./go-hub-oauth.mjs";
import { createMcpRegistry } from "./go-hub-mcp-registry.mjs";
import { createMcpHandler } from "./go-hub-mcp.mjs";
import { createNotionCatalogService } from "./go-hub-notion-catalog.mjs";
import { createFactoryActionService } from "./go-hub-factory-service.mjs";
export { GoHubFactoryState } from "./go-hub-factory-state.mjs";

const FACTORY_ACTION_PATH = "/hub/api/github-workspace/factory-action";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function oauthConfig(origin, env) {
  return {
    issuer: origin,
    signingKey: env?.GOHUB_MASTER_KEY,
    ownerPasscode: env?.GOHUB_OWNER_PASSCODE,
    clientId: "go-hub-chatgpt",
    clientSecret: env?.GOHUB_OWNER_PASSCODE,
    redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
  };
}

export function createEntryHandler({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === "/mcp") {
        if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);
        try {
          const lifecycle = createGithubLifecycleService({ fetchImpl, token: env.GITHUB_TOKEN });
          const factoryAction = createFactoryActionService({ lifecycle, binding: env?.GO_HUB_FACTORY_STATE });
          const catalog = createNotionCatalogService({
            fetchImpl,
            token: env?.NOTION_TOKEN,
            dataSourceId: env?.NOTION_CATALOG_DATA_SOURCE_ID,
          });
          const registry = createMcpRegistry({
            lifecycle: Object.freeze({
              ...lifecycle,
              factoryAction,
              searchCatalog: input => catalog.searchCatalog(input),
            }),
          });
          const config = oauthConfig(url.origin, env);
          return createMcpHandler({
            registry,
            issuer: url.origin,
            authenticate: current => verifyAccessToken(current, config),
          })(request);
        } catch (error) {
          return json({ code: error?.message || "FACTORY_MCP_ERROR" }, error?.status || 500);
        }
      }

      if (request.method === "POST" && url.pathname === FACTORY_ACTION_PATH) {
        if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);
        try {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          const lifecycle = createGithubLifecycleService({ fetchImpl, token: env.GITHUB_TOKEN });
          const factoryAction = createFactoryActionService({ lifecycle, binding: env?.GO_HUB_FACTORY_STATE });
          return factoryAction(body);
        } catch (error) {
          return json({ code: error?.message || "FACTORY_ACTION_ERROR" }, error?.status || 400);
        }
      }

      return baseWorker.fetch(request, env);
    },
  };
}

export default createEntryHandler();
