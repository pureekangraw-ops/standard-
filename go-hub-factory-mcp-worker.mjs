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

      const merged = await lifecycle.mergePullRequest(input);
      if (!merged.ok) return merged;
      const payload = await merged.clone().json().catch(() => ({}));
      if (payload.merged !== true || !String(payload.mergeSha || "").trim() || !String(payload.headSha || "").trim()) {
        return json({ code: "FACTORY_MERGE_RESULT_INVALID" }, 502);
      }
      if (typeof factory.recordMergeResult !== "function") {
        return json({
          code: "FACTORY_MERGE_RESULT_NOT_RECORDED",
          merged: true,
          mergeSha: payload.mergeSha,
          headSha: payload.headSha,
          factoryCode: "FACTORY_RECORD_MERGE_UNAVAILABLE",
        }, 502);
      }
      const recorded = await factory.recordMergeResult({
        repository: input.repository,
        goId: input.goId,
        jobId: input.jobId,
        workContext: input.workContext,
        pullRequestNumber: Number(input.number),
        headSha: String(payload.headSha),
        mergeSha: String(payload.mergeSha),
      });
      if (!recorded.ok) {
        const detail = await recorded.json().catch(() => ({}));
        return json({
          code: "FACTORY_MERGE_RESULT_NOT_RECORDED",
          merged: true,
          mergeSha: payload.mergeSha,
          headSha: payload.headSha,
          factoryCode: detail.code || "FACTORY_RECORD_MERGE_FAILED",
        }, 502);
      }
      return merged;
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
        token: env?.LINEAR_API_KEY || env?.["linear-API"],
        teamId: env?.LINEAR_TEAM_ID,
        teamKey: env?.LINEAR_TEAM_KEY,
      });
      const registry = createMcpRegistry({
        lifecycle: Object.freeze({
          ...lifecycle,
          searchCatalog: input => catalog.searchCatalog(input),
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
