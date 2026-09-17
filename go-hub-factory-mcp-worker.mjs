import { verifyAccessToken } from "./go-hub-oauth.mjs";
import { createMcpRegistry } from "./go-hub-mcp-registry.mjs";
import { createMcpHandler } from "./go-hub-mcp.mjs";
import { createNotionCatalogService } from "./go-hub-notion-catalog.mjs";
import { createNotionKnowledgeService } from "./go-hub-notion-knowledge.mjs";
import { createLinearService } from "./go-hub-linear-service.mjs";
import { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createFactoryControllerService } from "./go-hub-factory-controller.mjs";
import { createFactoryActionService } from "./go-hub-factory-service.mjs";

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
    async cancelStaleFactoryWork(input = {}) {
      const observed = await lifecycle.getPullRequest({
        repository: input.repository,
        number: input.number,
      });
      if (!observed.ok) return observed;
      const proof = await observed.clone().json().catch(() => null);
      if (!proof || String(proof.state || "").toLowerCase() !== "closed" || proof.merged !== false ||
          Number(proof.number) !== Number(input.number) || !String(proof.headSha || "").trim()) {
        return json({ code: "FACTORY_STALE_WORK_CANCELLATION_REFUSED" }, 409);
      }
      return factory.foreman({
        action: "cancel",
        repository: input.repository,
        slot: "merge",
        goId: input.goId,
        jobId: input.jobId,
        cancellation: {
          reason: "PULL_REQUEST_CLOSED_UNMERGED",
          observedAt: new Date().toISOString(),
          pullRequest: {
            number: Number(proof.number),
            state: String(proof.state),
            merged: false,
            headSha: String(proof.headSha),
          },
        },
        workContext: input.workContext,
      });
    },
    async mergePullRequest(input = {}) {
      const ownership = await factory.assertActiveMerge(input);
      if (!ownership.ok) return ownership;
      const proof = await ownership.json().catch(() => ({ active: false }));
      if (proof.active !== true) return json({ code: "FACTORY_MERGE_SLOT_REQUIRED" }, 409);

      const merged = await lifecycle.mergePullRequest(input);
      if (!merged.ok) return merged;
      const mergeProof = await merged.clone().json().catch(() => null);
      const mergedHeadSha = String(mergeProof?.headSha || input.expectedHeadSha || "").trim();
      if (mergeProof?.merged !== true || !String(mergeProof.mergeSha || "").trim() || !mergedHeadSha) {
        return json({ code: "MERGE_RESULT_MISSING_EVIDENCE" }, 500);
      }
      if (typeof factory.recordMergeResult !== "function") {
        return json({ code: "FACTORY_MERGE_RESULT_NOT_RECORDED" }, 502);
      }
      const recorded = await factory.recordMergeResult({
        repository: input.repository,
        goId: input.goId,
        jobId: input.jobId,
        workContext: input.workContext,
        pullRequestNumber: Number(input.number),
        headSha: mergedHeadSha,
        mergeSha: String(mergeProof.mergeSha),
      });
      if (!recorded.ok) {
        const detail = await recorded.json().catch(() => ({}));
        return json({
          code: "FACTORY_MERGE_RESULT_NOT_RECORDED",
          merged: true,
          mergeSha: mergeProof.mergeSha,
          headSha: mergedHeadSha,
          factoryCode: detail.code || "FACTORY_RECORD_MERGE_FAILED",
        }, 502);
      }

      const parked = await factory.foreman({
        action: "park",
        repository: input.repository,
        goId: input.goId,
        jobId: input.jobId,
        mainSha: mergeProof.mergeSha,
        mergedAt: new Date().toISOString(),
        workContext: input.workContext,
      });
      const parkProof = await parked.clone().json().catch(() => null);
      if (!parked.ok || parkProof?.outcome?.status !== "PARKED_FOR_VERIFICATION") {
        return json({
          code: "MERGED_BUT_WAITING_ROOM_FAILED",
          merged: true,
          mergeSha: mergeProof.mergeSha,
          waitingRoom: parkProof || null,
        }, 500);
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
      const factoryAction = env?.GO_HUB_FACTORY_STATE
        ? createFactoryActionService({ lifecycle, binding: env.GO_HUB_FACTORY_STATE })
        : async () => json({ code: "FACTORY_STATE_NOT_CONFIGURED" }, 503);
      const catalog = createNotionCatalogService({
        fetchImpl,
        token: env?.NOTION_TOKEN,
        dataSourceId: env?.NOTION_CATALOG_DATA_SOURCE_ID,
      });
      const knowledge = createNotionKnowledgeService({
        fetchImpl,
        token: env?.NOTION_TOKEN,
        dataSourceId: env?.NOTION_KNOWLEDGE_DATA_SOURCE_ID,
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
          factoryAction: input => factoryAction(input),
          searchCatalog: input => catalog.searchCatalog(input),
          searchKnowledge: input => knowledge.searchKnowledge(input),
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
