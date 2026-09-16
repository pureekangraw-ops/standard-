import { verifyAccessToken } from "./go-hub-oauth.mjs";
import { createMcpRegistry } from "./go-hub-mcp-registry.mjs";
import { createMcpHandler } from "./go-hub-mcp.mjs";
import { createNotionCatalogService } from "./go-hub-notion-catalog.mjs";
import { createLinearService } from "./go-hub-linear-service.mjs";
import { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createFactoryControllerService } from "./go-hub-factory-controller.mjs";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function observerStatus(code) {
  if (code === "SCHEMA_REJECTED") return 400;
  if (code === "SESSION_EXPIRED") return 410;
  if (code === "STALE_PAGE") return 409;
  if (code === "HUB_UNAVAILABLE") return 503;
  return 403;
}

export function createObserverEvidenceService({ namespace } = {}) {
  function stub() {
    if (!namespace || typeof namespace.getByName !== "function") return null;
    return namespace.getByName("go-browser-observer-v1");
  }
  return Object.freeze({
    async latest() {
      const current = stub();
      if (!current || typeof current.latest !== "function") return json({ code: "HUB_UNAVAILABLE" }, 503);
      try {
        const result = await current.latest();
        if (!result?.ok) return json({ code: result?.code || "HUB_UNAVAILABLE" }, observerStatus(result?.code));
        return json(result, 200);
      } catch {
        return json({ code: "HUB_UNAVAILABLE" }, 503);
      }
    },
    async screenshot({ screenshotRef } = {}) {
      const ref = String(screenshotRef || "").trim();
      if (!ref) return json({ code: "SCHEMA_REJECTED" }, 400);
      const current = stub();
      if (!current || typeof current.screenshot !== "function") return json({ code: "HUB_UNAVAILABLE" }, 503);
      try {
        const result = await current.screenshot({ screenshotRef: ref });
        if (!result?.ok) return json({ code: result?.code || "HUB_UNAVAILABLE" }, observerStatus(result?.code));
        return json(result, 200);
      } catch {
        return json({ code: "HUB_UNAVAILABLE" }, 503);
      }
    },
  });
}

export function createFactoryGuardedLifecycle({ lifecycle, factory } = {}) {
  if (!lifecycle) throw new Error("GitHub lifecycle service is required");
  if (!factory) throw new Error("Factory controller service is required");

  return Object.freeze({
    ...lifecycle,
    factoryForeman(input = {}) {
      return factory.foreman(input);
    },
    async mergePullRequest(input = {}) {
      const ownership = await factory.assertActiveMerge(input);
      if (!ownership.ok) return ownership;
      const proof = await ownership.json().catch(() => ({ active: false }));
      if (proof.active !== true) return json({ code: "FACTORY_MERGE_SLOT_REQUIRED" }, 409);
      return lifecycle.mergePullRequest(input);
    },
  });
}

export function createFactoryMcpWorker({ fetchImpl = fetch } = {}) {
  return Object.freeze({
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== "/mcp") return json({ code: "NOT_FOUND" }, 404);
      if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);

      const oauthConfig = {
        issuer: url.origin,
        signingKey: env?.GOHUB_MASTER_KEY,
        ownerPasscode: env?.GOHUB_OWNER_PASSCODE,
        clientId: "go-hub-chatgpt",
        clientSecret: env?.GOHUB_OWNER_PASSCODE,
        redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
      };
      const github = createGithubLifecycleService({ fetchImpl, token: env.GITHUB_TOKEN });
      const factory = createFactoryControllerService({ namespace: env?.HEPHAESTUS });
      const lifecycle = createFactoryGuardedLifecycle({ lifecycle: github, factory });
      const catalog = createNotionCatalogService({
        fetchImpl,
        token: env?.NOTION_TOKEN,
        dataSourceId: env?.NOTION_CATALOG_DATA_SOURCE_ID,
      });
      const linear = createLinearService({
        fetchImpl,
        token: env?.LINEAR_API_KEY,
        teamId: env?.LINEAR_TEAM_ID,
      });
      const observer = createObserverEvidenceService({ namespace: env?.OBSERVER_SESSIONS });
      const registry = createMcpRegistry({
        lifecycle: Object.freeze({
          ...lifecycle,
          searchCatalog: input => catalog.searchCatalog(input),
          observerLatest: () => observer.latest(),
          observerScreenshot: input => observer.screenshot(input),
          linearListProjects: input => linear.listProjects(input),
          linearGetIssue: input => linear.getIssue(input),
          linearCreateIssue: input => linear.createIssue(input),
          linearUpdateIssue: input => linear.updateIssue(input),
        }),
      });

      return createMcpHandler({
        registry,
        issuer: url.origin,
        authenticate: current => verifyAccessToken(current, oauthConfig),
      })(request);
    },
  });
}

export default createFactoryMcpWorker();
