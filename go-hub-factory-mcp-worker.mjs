import { verifyAccessToken } from "./go-hub-oauth.mjs";
import { createMcpRegistry } from "./go-hub-mcp-registry.mjs";
import { createMcpHandler } from "./go-hub-mcp.mjs";
import { createLinearService } from "./go-hub-linear-service.mjs";
import { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createFactoryControllerService } from "./go-hub-factory-controller.mjs";
import { createFactoryActionService } from "./go-hub-factory-service.mjs";
import { createMaintenanceService } from "./go-hub-maintenance.js";
import { createCentreLiveService } from "./go-hub-centre-live.mjs";
import { routeReadOnlyFastLane } from "./go-hub-city-route.js";
import { createLighthouseControlPortMcpService } from "./go-hub-lighthouse-control-port-service.mjs";
import { createGoogleDriveService } from "./go-hub-google-drive-service.mjs";
import { createWorkflowArtifactService } from "./go-hub-workflow-artifact-service.mjs";
import { createProjectStatusReadService } from "./go-hub-project-status-service.mjs";
import { createBoardPinRouteReadService } from "./go-hub-board-pin-route.js";
import { createGlobalAuditService } from "./go-hub-global-audit.mjs";
import { createCounterService } from "./go-hub-counter.mjs";
import { createCounterDispatchService } from "./go-hub-counter-dispatcher.mjs";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function firstEnv(env, names) {
  for (const name of names) {
    const value = env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

const LIGHT_CODE_TOOL_NAMES = new Set([
  "go_hub_inspect_repository",
  "go_hub_list_repositories",
  "go_hub_read_file",
  "go_hub_create_branch",
  "go_hub_put_file",
  "go_hub_compare_refs",
  "go_hub_open_pull_request",
  "go_hub_get_pull_request",
  "go_hub_get_ci",
  "go_hub_get_failure_evidence",
  "go_hub_centre_inspect",
  "go_hub_centre_audit_history",
]);

function restrictRegistry(registry, allowedTools) {
  return Object.freeze({
    listTools() {
      return registry.listTools().filter(tool => allowedTools.has(tool.name));
    },
    callTool(name, args = {}) {
      if (!allowedTools.has(name)) throw new Error("LIGHT_TOOL_NOT_ALLOWED");
      return registry.callTool(name, args);
    },
  });
}

function workText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function mutationEvent({ correlationId, stage, operation, workContext, result = null } = {}) {
  return {
    eventId: "MUTATION-" + correlationId + "-" + stage,
    type: "TOOL_MUTATION_" + stage,
    workId: workText(workContext?.workId),
    checkpointId: workText(workContext?.checkpointId),
    phase: "TOOL_MUTATION",
    at: new Date().toISOString(),
    details: {
      correlationId,
      operation,
      destination: workText(workContext?.destination) || null,
      ...(result ? {
        ok: result.ok === true,
        status: Number(result.status || 0),
        code: workText(result.code) || null,
      } : {}),
    },
  };
}

async function responsePayload(response) {
  return response.clone().json().catch(() => ({}));
}

async function centreAuditHistory(globalAudit, input = {}) {
  const response = await globalAudit.history(input);
  const payload = await responsePayload(response);
  if (!response.ok) return response;
  const events = Array.isArray(payload.events)
    ? payload.events.filter(record => String(record?.event?.type || "").startsWith("CENTRE_"))
    : [];
  return json({ ...payload, events, source: "CENTRE_AUDIT" });
}

export function createCounterDispatchLifecycle({ counter, dispatch } = {}) {
  if (!counter || !dispatch) throw new Error("Counter and dispatch services are required");

  async function parsed(response) {
    return response.clone().json().catch(() => ({}));
  }

  return Object.freeze({
    async create(input = {}) {
      const response = await counter.create(input);
      const payload = await parsed(response);
      if (!response.ok) return response;
      const state = payload.counter || {};
      const dispatchResponse = await dispatch.open({
        counterId:state.counterId,
        workId:state.workId,
        checkpointId:state.checkpointId,
        request:state.request,
        context:state.context || {},
        sourceHints:state.sourceHints || [],
        doNotChange:state.doNotChange || [],
      });
      let dispatchPayload = await parsed(dispatchResponse);
      let dispatchCode = dispatchResponse.ok ? null : (dispatchPayload.code || "DISPATCH_FAILED");

      let finalPayload = payload;
      const lightAnswer = dispatchPayload.lightAnswer || dispatchPayload.dispatch?.lightResult || null;
      if (lightAnswer) {
        const identity = {
          counterId:state.counterId,
          workContext:{
            workId:state.workId,
            checkpointId:state.checkpointId,
          },
        };
        const seenResponse = await counter.seen(identity);
        if (!seenResponse.ok) return seenResponse;
        const answerResponse = await counter.answer({
          ...identity,
          ...lightAnswer,
        });
        if (!answerResponse.ok) return answerResponse;
        const answerPayload = await parsed(answerResponse);
        finalPayload = {
          ...payload,
          counter:answerPayload.counter,
          lightResult:lightAnswer,
        };

        if (typeof dispatch.returnInline === "function") {
          const inlineResponse = await dispatch.returnInline({
            counterId:state.counterId,
            workId:state.workId,
            checkpointId:state.checkpointId,
            status:answerPayload.counter?.currentState || lightAnswer.status,
            answer:answerPayload.counter?.answer || lightAnswer.answer,
            sources:answerPayload.counter?.sources || lightAnswer.sources || [],
            evidence:answerPayload.counter?.evidence || lightAnswer.evidence || [],
            confidence:answerPayload.counter?.confidence || lightAnswer.confidence,
            nextRoute:answerPayload.counter?.nextRoute || lightAnswer.nextRoute || "GO",
          });
          const inlinePayload = await parsed(inlineResponse);
          if (inlineResponse.ok) {
            dispatchPayload = inlinePayload;
            dispatchCode = null;
          } else {
            dispatchCode = inlinePayload.code || "DISPATCH_INLINE_RETURN_FAILED";
          }
        }
      }

      return json({
        ...finalPayload,
        dispatch:dispatchPayload.dispatch || null,
        dispatchCode,
        lightAuthorizationUrl:dispatchPayload.authorizationUrl || null,
        lightAuthRequired:dispatchPayload.authRequired === true,
        lightCapabilityBlocked:dispatchPayload.capabilityBlocked === true,
        lightCapabilityStatus:dispatchPayload.capabilityStatus || null,
        lightUpgradeUrl:dispatchPayload.upgradeUrl || null,
      }, response.status);
    },

    async get(input = {}) {
      const response = await counter.get(input);
      const payload = await parsed(response);
      if (!response.ok) return response;
      const state = payload.counter || {};
      const dispatchResponse = await dispatch.get({
        counterId:state.counterId,
        workId:state.workId,
        checkpointId:state.checkpointId,
      });
      const dispatchPayload = await parsed(dispatchResponse);
      return json({
        ...payload,
        dispatch:dispatchPayload.dispatch || null,
        dispatchCode:dispatchResponse.ok ? null : (dispatchPayload.code || "DISPATCH_UNAVAILABLE"),
      }, response.status);
    },

    async answer(input = {}) {
      const response = await counter.answer(input);
      const payload = await parsed(response);
      if (!response.ok) return response;
      const state = payload.counter || {};
      const dispatchResponse = await dispatch.answer({
        counterId:state.counterId,
        workId:state.workId,
        checkpointId:state.checkpointId,
        status:state.currentState,
        answer:state.answer,
        sources:state.sources || [],
        evidence:state.evidence || [],
        confidence:state.confidence,
        nextRoute:state.nextRoute,
      });
      const dispatchPayload = await parsed(dispatchResponse);
      return json({
        ...payload,
        dispatch:dispatchPayload.dispatch || null,
        dispatchCode:dispatchResponse.ok ? null : (dispatchPayload.code || "DISPATCH_FAILED"),
      }, response.status);
    },
  });
}

export function createGovernedMutationRunner({ centreLive, globalAudit } = {}) {
  if (!centreLive || typeof centreLive.action !== "function") throw new Error("Centre live service is required");
  if (!globalAudit || typeof globalAudit.append !== "function") throw new Error("Global audit service is required");

  return async function runGovernedMutation(operation, input = {}, execute) {
    if (typeof execute !== "function") return json({ code: "MUTATION_EXECUTOR_REQUIRED" }, 500);
    const workContext = input?.workContext;
    if (!workContext || typeof workContext !== "object") return json({ code: "WORK_CONTEXT_REQUIRED" }, 400);

    const inspected = await centreLive.action({
      action: "inspect",
      workId: workContext.workId,
      checkpointId: workContext.checkpointId,
    });
    const centre = await responsePayload(inspected);
    if (!inspected.ok) return json({ code: centre.code || "CENTRE_WORK_UNAVAILABLE" }, inspected.status || 502);
    if (String(centre.checkpointId || "") !== String(workContext.checkpointId || "")) {
      return json({ code: "CENTRE_CHECKPOINT_MISMATCH" }, 409);
    }

    const ownership = centre.ownership || {};
    if (ownership.enforced === true) {
      if (ownership.active !== true) return json({ code: "CENTRE_WORK_LEASE_INACTIVE" }, 409);
      if (!workText(workContext.ownerId) || !workText(workContext.leaseId) ||
          !Number.isSafeInteger(workContext.ownershipRevision)) {
        return json({ code: "CENTRE_WORK_LEASE_REQUIRED" }, 409);
      }
      if (workText(workContext.ownerId) !== workText(ownership.ownerId) ||
          workText(workContext.leaseId) !== workText(ownership.leaseId)) {
        return json({ code: "CENTRE_WORK_OWNERSHIP_CONFLICT" }, 409);
      }
      if (Number(workContext.ownershipRevision) !== Number(ownership.revision)) {
        return json({ code: "CENTRE_OWNERSHIP_STALE_REVISION" }, 409);
      }
    }

    const correlationId = crypto.randomUUID();
    const intent = await globalAudit.append(mutationEvent({
      correlationId, stage: "INTENT", operation, workContext,
    }));
    const intentPayload = await responsePayload(intent);
    if (!intent.ok) {
      return json({
        code: "GLOBAL_AUDIT_INTENT_REQUIRED",
        auditCode: intentPayload.code || null,
      }, 502);
    }

    let result;
    try {
      result = await execute();
    } catch {
      result = json({ code: "MUTATION_EXECUTION_ERROR" }, 502);
    }
    const payload = await responsePayload(result);
    const outcome = {
      ok: result.ok,
      status: result.status,
      code: payload?.code || null,
    };
    const recorded = await globalAudit.append(mutationEvent({
      correlationId, stage: "RESULT", operation, workContext, result: outcome,
    }));
    const auditPayload = await responsePayload(recorded);
    if (!recorded.ok) {
      return json({
        code: "GLOBAL_AUDIT_RECONCILIATION_REQUIRED",
        operation,
        mutationObserved: true,
        upstreamStatus: result.status,
        upstreamCode: payload?.code || null,
        auditCode: auditPayload.code || null,
        correlationId,
      }, 502);
    }
    return result;
  };
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
      const lightMcp = url.pathname === "/mcp/light";
      if (url.pathname !== "/mcp" && !lightMcp) return json({ code: "NOT_FOUND" }, 404);
      if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);

      const oauthConfig = {
        issuer: url.origin,
        signingKey: env?.GOHUB_MASTER_KEY,
        ownerPasscode: env?.GOHUB_OWNER_PASSCODE,
        clientId: "go-hub-chatgpt",
        clientSecret: env?.GOHUB_OWNER_PASSCODE,
        redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
      };
      const accessConfig = lightMcp
        ? {
            ...oauthConfig,
            resource:url.origin + "/mcp/light",
            subject:"light",
            scope:"go-hub-light",
          }
        : oauthConfig;
      const github = createGithubLifecycleService({ fetchImpl, token: env.GITHUB_TOKEN });
      const factory = createFactoryControllerService({ namespace: env?.HEPHAESTUS });
      const lifecycle = createFactoryGuardedLifecycle({ lifecycle: github, factory });
      const factoryAction = env?.GO_HUB_FACTORY_STATE
        ? createFactoryActionService({ lifecycle, binding: env.GO_HUB_FACTORY_STATE })
        : async () => json({ code: "FACTORY_STATE_NOT_CONFIGURED" }, 503);
      const maintenance = createMaintenanceService();
      const linear = createLinearService({
        fetchImpl,
        token: env?.LINEAR_API_KEY || env?.["linear-API"],
        teamId: env?.LINEAR_TEAM_ID,
        teamKey: env?.LINEAR_TEAM_KEY,
      });
      const observer = createObserverEvidenceService({ namespace: env?.OBSERVER_SESSIONS });
      const centreLive = createCentreLiveService({ namespace: env?.GO_HUB_CENTRE_STATE });
      const globalAudit = createGlobalAuditService({ namespace: env?.GO_HUB_GLOBAL_AUDIT });
      const counter = createCounterService({ namespace: env?.GO_HUB_COUNTER_STATE });
      const dispatch = createCounterDispatchService({
        namespace: env?.GO_HUB_COUNTER_DISPATCH_STATE,
        hubOrigin: url.origin,
      });
      const counterDispatch = createCounterDispatchLifecycle({ counter, dispatch });
      const lighthouseControlPort = createLighthouseControlPortMcpService({ namespace:env?.LIGHTHOUSE_CONTROL_PORT_SESSIONS });
      const projectStatus = createProjectStatusReadService({ lifecycle, factoryBinding:env?.GO_HUB_FACTORY_STATE });
      const boardPinRoute = createBoardPinRouteReadService();
      const drive = createGoogleDriveService({
        fetchImpl,
        accessToken: firstEnv(env, ["GOOGLE_DRIVE_ACCESS_TOKEN", "DRIVE_ACCESS_TOKEN", "GDRIVE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_ACCESS_TOKEN", "GDRIVE_OAUTH_ACCESS_TOKEN"]),
        refreshToken: firstEnv(env, ["GOOGLE_DRIVE_REFRESH_TOKEN", "DRIVE_REFRESH_TOKEN", "GDRIVE_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN", "GDRIVE_OAUTH_REFRESH_TOKEN"]),
        clientId: firstEnv(env, ["GOOGLE_DRIVE_CLIENT_ID", "DRIVE_CLIENT_ID", "GDRIVE_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GDRIVE_OAUTH_CLIENT_ID"]),
        clientSecret: firstEnv(env, ["GOOGLE_DRIVE_CLIENT_SECRET", "DRIVE_CLIENT_SECRET", "GDRIVE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GDRIVE_OAUTH_CLIENT_SECRET"]),
        rootFolderId: firstEnv(env, ["GOOGLE_DRIVE_ROOT_FOLDER_ID", "DRIVE_ROOT_FOLDER_ID", "GDRIVE_ROOT_FOLDER_ID", "GOOGLE_DRIVE_FOLDER_ID", "DRIVE_FOLDER_ID", "GDRIVE_FOLDER_ID", "GOOGLE_ROOT_FOLDER_ID"]),
      });
      const artifactDelivery = createWorkflowArtifactService({ fetchImpl, token: env.GITHUB_TOKEN, drive });
      const runMutation = (env?.GO_HUB_CENTRE_STATE && env?.GO_HUB_GLOBAL_AUDIT)
        ? createGovernedMutationRunner({ centreLive, globalAudit })
        : async (_operation, _input, execute) => execute();
      const registry = createMcpRegistry({
        lifecycle: Object.freeze({
          ...lifecycle,
          createBranch: input => runMutation("github.create_branch", input, () => lifecycle.createBranch(input)),
          putFile: input => runMutation("github.put_file", input, () => lifecycle.putFile(input)),
          deleteFile: input => runMutation("github.delete_file", input, () => lifecycle.deleteFile(input)),
          openPullRequest: input => runMutation("github.open_pull_request", input, () => lifecycle.openPullRequest(input)),
          rerunFailed: input => runMutation("github.rerun_failed", input, () => lifecycle.rerunFailed(input)),
          mergePullRequest: input => runMutation("github.merge_pull_request", input, () => lifecycle.mergePullRequest(input)),
          factoryForeman: input => input.action === "state"
            ? lifecycle.factoryForeman(input)
            : runMutation("factory.foreman." + String(input.action || "unknown"), input, () => lifecycle.factoryForeman(input)),
          factoryAction: input => runMutation("factory.action." + String(input.action || "unknown"), input, () => factoryAction(input)),
          maintenance: input => maintenance.maintenance(input),
          observerLatest: () => observer.latest(),
          observerScreenshot: input => observer.screenshot(input),
          auditHistory: input => globalAudit.history(input),
          centreInspect: input => centreLive.action({
            action: "inspect",
            workId: input.workId,
            checkpointId: input.checkpointId,
            returnAddress: input.checkpointId,
          }),
          centreAuditHistory: input => centreAuditHistory(globalAudit, input),
          centreLiveAction: async input => {
            const response = await centreLive.action(input);
            if (response.ok) {
              const view = await response.clone().json().catch(() => null);
              if (view?.ok) {
                try { await lighthouseControlPort.projectCentre(view); } catch {}
              }
            }
            return response;
          },
          centreReadOnlyFastLane: input => json(routeReadOnlyFastLane(input)),
          lighthouseControlPortState: input => lighthouseControlPort.state(input),
          lighthouseControlPortCommand: input => lighthouseControlPort.command(input),
          projectStatus: async input => json(await projectStatus.read(input)),
          boardPinRoute: input => json(boardPinRoute.read(input)),
          counterCreate: input => runMutation("counter.create", input, () => counterDispatch.create(input)),
          counterGet: input => counterDispatch.get(input),
          counterSeen: input => runMutation("counter.seen", input, () => counter.seen(input)),
          counterAnswer: input => runMutation("counter.answer", input, () => counterDispatch.answer(input)),
          counterReadback: input => runMutation("counter.readback", input, () => counter.readback(input)),
          linearListProjects: input => linear.listProjects(input),
          linearGetIssue: input => linear.getIssue(input),
          linearCreateIssue: input => runMutation("linear.create_issue", input, () => linear.createIssue(input)),
          linearUpdateIssue: input => runMutation("linear.update_issue", input, () => linear.updateIssue(input)),
          driveCapabilities: () => drive.capabilities(),
          driveHealth: async () => {
            const response = await drive.health();
            const payload = await response.json().catch(() => ({}));
            return json({ ...payload, hubOrigin: url.origin });
          },
          driveDiagnostics: () => drive.diagnostics(),
          driveRoot: () => drive.root(),
          driveGetItem: input => drive.getItem(input),
          driveListChildren: input => drive.listChildren(input),
          driveCreateFolder: input => runMutation("drive.create_folder", input, () => drive.createFolder(input)),
          driveMoveItem: input => runMutation("drive.move_item", input, () => drive.moveItem(input)),
          driveRenameItem: input => runMutation("drive.rename_item", input, () => drive.renameItem(input)),
          listWorkflowArtifacts: input => artifactDelivery.listArtifacts(input),
          archiveWorkflowArtifact: input => runMutation("artifact.archive_workflow", input, () => artifactDelivery.archiveArtifact(input)),
        }),
      });

      return createMcpHandler({
        registry: lightMcp ? restrictRegistry(registry, LIGHT_CODE_TOOL_NAMES) : registry,
        issuer: url.origin,
        authenticate: current => verifyAccessToken(current, accessConfig),
        allowedOrigins: lightMcp
          ? ["https://www.notion.so", "https://notion.so", "https://app.notion.com"]
          : [],
      })(request);
    },
  });
}

export default createFactoryMcpWorker();
