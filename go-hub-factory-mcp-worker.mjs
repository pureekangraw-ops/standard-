import { verifyAccessToken } from "./go-hub-oauth.mjs";
import { createMcpRegistry } from "./go-hub-mcp-registry.mjs";
import { createMcpHandler } from "./go-hub-mcp.mjs";
import { createLinearService } from "./go-hub-linear-service.mjs";
import { createGithubLifecycleService } from "./go-hub-worker.mjs";
import { createFactoryControllerService } from "./go-hub-factory-controller.mjs";
import { createFactoryActionService, createFactoryAutoService, createFactoryV4Service } from "./go-hub-factory-service.mjs";
import { createMaintenanceService } from "./go-hub-maintenance.js";
import { createMaintenanceRealityReader } from "./go-hub-maintenance-reader.mjs";
import { createMaintenanceDurableStorage } from "./go-hub-maintenance-state.mjs";
import { createBroadcastService } from "./go-hub-broadcast-state.mjs";
import { createCentreLiveService } from "./go-hub-centre-live.mjs";
import { routeReadOnlyFastLane } from "./go-hub-city-route.js";
import { createLighthouseControlPortMcpService } from "./go-hub-lighthouse-control-port-service.mjs";
import { createGoogleDriveService } from "./go-hub-google-drive-service.mjs";
import { createGoogleWorkspaceService } from "./go-hub-google-workspace-service.mjs";
import { createWorkflowArtifactService } from "./go-hub-workflow-artifact-service.mjs";
import { createProjectStatusReadService } from "./go-hub-project-status-service.mjs";
import { createBoardPinRouteReadService } from "./go-hub-board-pin-route.js";
import { createGlobalAuditService } from "./go-hub-global-audit.mjs";
import { createCounterService } from "./go-hub-counter.mjs";
import { createCounterDispatchService } from "./go-hub-counter-dispatcher.mjs";
import { createNotionLightService } from "./go-hub-notion-light.mjs";
import { sealReadyGate } from "./go-hub-ready-gate.js";

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

const LIGHT_MUTATION_TOOL_NAMES = new Set([
  "go_hub_create_branch",
  "go_hub_put_file",
  "go_hub_open_pull_request",
  "go_hub_light_centre_v4_action",
  "go_hub_counter_create",
  "go_hub_counter_seen",
  "go_hub_counter_pickup",
  "go_hub_counter_answer",
  "go_hub_counter_readback",
  "go_hub_gmail_send_message",
  "go_hub_calendar_create_event",
  "go_hub_drive_create_folder",
  "go_hub_drive_upload_file",
  "go_hub_drive_move_item",
  "go_hub_drive_rename_item",
]);

function lightAllowedTools(registry) {
  const allowed = new Set(LIGHT_MUTATION_TOOL_NAMES);
  for (const tool of registry.listTools()) {
    if (tool?.annotations?.readOnlyHint === true) allowed.add(tool.name);
  }
  return allowed;
}

function restrictRegistry(registry, allowedTools) {
  return Object.freeze({
    listTools() {
      return registry.listTools()
        .filter(tool => allowedTools.has(tool.name))
        .map(({ securitySchemes, ...tool }) => tool);
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

const CENTRE_INSPECT_FALLBACK_CODES = new Set([
  "unsupported Centre live action",
  "unsupported Centre V4 action",
]);

async function inspectCentreCompat(centreLive, input = {}) {
  const base = {
    workId: input.workId,
    checkpointId: input.checkpointId,
    returnAddress: input.returnAddress || input.checkpointId,
  };
  const v4 = await centreLive.action({ action: "v4_inspect", ...base });
  if (v4.ok) {
    const payload = await responsePayload(v4);
    if (payload?.v4 === true && payload?.work) {
      return json({
        ...payload,
        workId: payload.work.workId,
        checkpointId: payload.work.checkpointId,
        returnAddress: payload.work.checkpointId,
      });
    }
    return v4;
  }
  const payload = await responsePayload(v4);
  if (!CENTRE_INSPECT_FALLBACK_CODES.has(workText(payload.code))) return v4;
  return centreLive.action({ action: "inspect", ...base });
}

const CENTRE_AUDIT_PAGE_SIZE = 200;

function sequenceOf(record) {
  const sequence = Number(record?.sequence);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

function auditSequence(value, fallback = 0) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : fallback;
}

async function centreAuditHistory(globalAudit, input = {}) {
  const requestedLimit = input.limit == null ? 100 : Number(input.limit);
  const initialSequence = auditSequence(input.afterSequence);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
    return json({ code: "CENTRE_AUDIT_INVALID_QUERY" }, 400);
  }

  const events = [];
  let cursor = initialSequence;
  let lastSequence = initialSequence;
  while (events.length < requestedLimit) {
    const response = await globalAudit.history({
      ...input,
      afterSequence: cursor,
      limit: CENTRE_AUDIT_PAGE_SIZE,
    });
    const payload = await responsePayload(response);
    if (!response.ok) return response;

    lastSequence = Math.max(lastSequence, auditSequence(payload.lastSequence, cursor));
    const page = Array.isArray(payload.events) ? payload.events : [];
    const centreEvents = page.filter(record => String(record?.event?.type || "").startsWith("CENTRE_"));
    for (const record of centreEvents) {
      if (events.length >= requestedLimit) break;
      events.push(record);
    }

    const pageSequence = page.reduce((highest, record) => Math.max(highest, sequenceOf(record) ?? highest), cursor);
    if (events.length >= requestedLimit || page.length === 0 || pageSequence <= cursor) break;
    cursor = pageSequence;
    if (cursor >= lastSequence) break;
  }

  const nextSequence = events.length
    ? (sequenceOf(events[events.length - 1]) ?? initialSequence)
    : lastSequence;
  return json({
    ok: true,
    workId: input.workId || null,
    afterSequence: initialSequence,
    events,
    lastSequence,
    nextSequence,
    hasMore: nextSequence < lastSequence,
    source: "CENTRE_AUDIT",
  });
}

export function createCounterDispatchLifecycle({ counter, dispatch, notionLight = null, hubOrigin = null } = {}) {
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
        workContext:state.workContext || input.workContext || {},
        mode:state.mode || input.mode || "SEARCH",
        request:state.request,
        requestedResult:state.requestedResult || input.requestedResult || null,
        authority:state.authority || input.authority || null,
        target:state.target || input.target || null,
        projectRef:state.projectRef || input.projectRef || null,
        fromActor:state.from || input.fromActor || "GO",
        toActor:state.to || input.toActor || "LIGHT",
        context:state.context || {},
        sourceHints:state.sourceHints || [],
        doNotChange:state.doNotChange || [],
      });
      let dispatchPayload = await parsed(dispatchResponse);
      let dispatchCode = dispatchResponse.ok ? null : (dispatchPayload.code || "DISPATCH_FAILED");

      const dispatchMode = String(state.mode || input.mode || "SEARCH").toUpperCase();
      const lightState = dispatchPayload.dispatch?.legs?.LIGHT?.status || null;
      const waitingForLightAuth =
        dispatchMode === "SEARCH" &&
        (dispatchPayload.authRequired === true || lightState === "WAITING_AUTH");
      if (waitingForLightAuth && !dispatchPayload.authorizationUrl && notionLight && typeof notionLight.prepare === "function" && hubOrigin) {
        const prepareResponse = await notionLight.prepare({ hubOrigin });
        const prepared = await parsed(prepareResponse);
        if (prepareResponse.ok && prepared?.authorizationUrl) {
          dispatchPayload = {
            ...dispatchPayload,
            authRequired:true,
            authorizationUrl:prepared.authorizationUrl,
          };
        } else {
          dispatchPayload = {
            ...dispatchPayload,
            authRequired:true,
            authPrepareCode:prepared?.code || "NOTION_LIGHT_OAUTH_PREPARE_FAILED",
            authPrepareStatus:prepareResponse.status,
          };
        }
      }

      let finalPayload = payload;
      const mode = dispatchMode;
      const lightAnswer = dispatchPayload.lightAnswer || dispatchPayload.dispatch?.lightResult || null;
      if (lightAnswer && mode === "SEARCH") {
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
        lightAuthPrepareCode:dispatchPayload.authPrepareCode || null,
        lightAuthPrepareStatus:Number.isInteger(dispatchPayload.authPrepareStatus) ? dispatchPayload.authPrepareStatus : null,
        lightNotionStatus:dispatchPayload.notionStatus || null,
        lightCapabilityBlocked:dispatchPayload.capabilityBlocked === true,
        lightCapabilityStatus:dispatchPayload.capabilityStatus || null,
        lightUpgradeUrl:dispatchPayload.upgradeUrl || null,
      }, response.status);
    },

    async inbox(input = {}) {
      return counter.inbox(input);
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
      const dispatchInput = {
        counterId:state.counterId,
        workId:state.workId,
        checkpointId:state.checkpointId,
        status:state.currentState,
        answer:state.answer,
        sources:state.sources || [],
        evidence:state.evidence || [],
        confidence:state.confidence,
        nextRoute:state.nextRoute,
      };
      const handoff = String(state.mode || "").trim().toUpperCase() === "HANDOFF";
      const dispatchResponse = handoff && typeof dispatch.returnInline === "function"
        ? await dispatch.returnInline({
            ...dispatchInput,
            transport:"COUNTER_INBOX",
            receiptId:"go-counter-inbox",
          })
        : await dispatch.answer(dispatchInput);
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

    const inspected = await inspectCentreCompat(centreLive, workContext);
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
  async function call(method, input = {}) {
    const current = stub();
    if (!current) return { ok:false, code:"HUB_UNAVAILABLE" };
    try {
      if (typeof current.fetch === "function") {
        const path = method === "latest" ? "latest" : "screenshot";
        const response = await current.fetch(new Request("https://observer-session.internal/" + path, {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body:JSON.stringify(input),
        }));
        const body = await response.json().catch(() => ({ code:"HUB_UNAVAILABLE" }));
        return response.ok ? body : { ok:false, code:body?.code || "HUB_UNAVAILABLE" };
      }
      if (typeof current[method] === "function") return await current[method](input);
      return { ok:false, code:"HUB_UNAVAILABLE" };
    } catch {
      return { ok:false, code:"HUB_UNAVAILABLE" };
    }
  }
  return Object.freeze({
    async latest() {
      const result = await call("latest");
      if (!result?.ok) return json({ code: result?.code || "HUB_UNAVAILABLE" }, observerStatus(result?.code));
      return json(result, 200);
    },
    async screenshot({ screenshotRef } = {}) {
      const ref = String(screenshotRef || "").trim();
      if (!ref) return json({ code: "SCHEMA_REJECTED" }, 400);
      const result = await call("screenshot", { screenshotRef: ref });
      if (!result?.ok) return json({ code: result?.code || "HUB_UNAVAILABLE" }, observerStatus(result?.code));
      return json(result, 200);
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
    factoryReadyGate(input = {}) {
      try {
        const readyGate = sealReadyGate(input);
        return json({ ok: true, readyGate });
      } catch (error) {
        return json({ code: "READY_GATE_REJECTED", message: error?.message || "Ready Gate rejected" }, 409);
      }
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
      const lifecycle = github;
      const factoryV4 = env?.GO_HUB_FACTORY_STATE
        ? createFactoryV4Service({ binding: env.GO_HUB_FACTORY_STATE })
        : async () => json({ code: "FACTORY_STATE_NOT_CONFIGURED" }, 503);
      const heimdallPass = async (input = {}) => centreLive.action({
        action: input.action === "open" ? "v4_open_pass" : "v4_return",
        workId: input.workId, checkpointId: input.checkpointId, actor: input.actor || input.holder,
        holder: input.holder, kind: input.kind, scope: input.scope, destinations: input.destinations,
        expiresAt: input.expiresAt, closeCondition: input.closeCondition, returnAddress: input.returnAddress,
        reason: input.reason, audit: input.audit, status: input.status, result: input.result, evidence: input.evidence,
      });
      const v4ProjectBoard = input => centreLive.action({
        action: "v4_board", workId: input.workId, checkpointId: input.checkpointId, returnAddress: input.checkpointId,
      });
      const linear = createLinearService({
        fetchImpl,
        token: env?.LINEAR_API_KEY || env?.["linear-API"],
        teamId: env?.LINEAR_TEAM_ID,
        teamKey: env?.LINEAR_TEAM_KEY,
      });
      const observer = createObserverEvidenceService({ namespace: env?.OBSERVER_SESSIONS });
      const centreLive = createCentreLiveService({ namespace: env?.GO_HUB_CENTRE_STATE });
      const broadcast = createBroadcastService({ namespace: env?.GO_HUB_BROADCAST_STATE });
      const globalAudit = createGlobalAuditService({ namespace: env?.GO_HUB_GLOBAL_AUDIT });
      const counter = createCounterService({ namespace: env?.GO_HUB_COUNTER_STATE, inboxNamespace: env?.GO_HUB_COUNTER_INBOX });
      const dispatch = createCounterDispatchService({
        namespace: env?.GO_HUB_COUNTER_DISPATCH_STATE,
        hubOrigin: url.origin,
      });
      const notionLight = createNotionLightService({ namespace:env?.GO_HUB_NOTION_LIGHT_STATE });
      const counterDispatch = createCounterDispatchLifecycle({ counter, dispatch, notionLight, hubOrigin:url.origin });
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
      const googleWorkspace = createGoogleWorkspaceService({
        fetchImpl,
        accessToken: firstEnv(env, ["GOOGLE_WORKSPACE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_ACCESS_TOKEN"]),
        refreshToken: firstEnv(env, ["GOOGLE_WORKSPACE_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_DRIVE_REFRESH_TOKEN"]),
        clientId: firstEnv(env, ["GOOGLE_WORKSPACE_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_ID"]),
        clientSecret: firstEnv(env, ["GOOGLE_WORKSPACE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_DRIVE_CLIENT_SECRET"]),
        driveService: drive,
      });
      let registry = null;
      const maintenance = createMaintenanceService({
        storage:createMaintenanceDurableStorage({ namespace:env?.GO_HUB_MAINTENANCE_STATE }),
        readValue:createMaintenanceRealityReader({
          env,
          lifecycle,
          registryRef:() => registry,
          googleWorkspace,
          drive,
          linear,
          observer,
          lighthouseControlPort,
          projectStatus,
          boardRead:() => lighthouseControlPort.boardRead(),
          globalAudit,
          broadcast,
        }),
      });
      const artifactDelivery = createWorkflowArtifactService({ fetchImpl, token: env.GITHUB_TOKEN, drive });
      const runMutation = (env?.GO_HUB_CENTRE_STATE && env?.GO_HUB_GLOBAL_AUDIT)
        ? createGovernedMutationRunner({ centreLive, globalAudit })
        : async (_operation, _input, execute) => execute();
      registry = createMcpRegistry({
        lifecycle: Object.freeze({
          ...lifecycle,
          broadcastRead: () => broadcast.current(),
          broadcastActivate: input => lightMcp
            ? json({ code:"LIGHT_BROADCAST_ACTIVATE_FORBIDDEN" }, 403)
            : broadcast.activate(input),
          createBranch: input => runMutation("github.create_branch", input, () => lifecycle.createBranch(input)),
          putFile: input => runMutation("github.put_file", input, () => lifecycle.putFile(input)),
          deleteFile: input => runMutation("github.delete_file", input, () => lifecycle.deleteFile(input)),
          openPullRequest: input => runMutation("github.open_pull_request", input, () => lifecycle.openPullRequest(input)),
          rerunFailed: input => runMutation("github.rerun_failed", input, () => lifecycle.rerunFailed(input)),
          mergePullRequest: input => runMutation("github.merge_pull_request", input, () => lifecycle.mergePullRequest(input)),
          factoryV4: input => input.action === "inspect"
            ? factoryV4(input)
            : runMutation("factory.v4." + String(input.action || "unknown"), input, () => factoryV4(input)),
          maintenance: async input => {
            const workId = String(input?.workContext?.workId || "").trim();
            const checkpointId = String(input?.workContext?.checkpointId || "").trim();
            if (!workId || !checkpointId || input?.work?.workId !== workId) {
              return json({ code:"MAINTENANCE_V4_WORK_REQUIRED" }, 409);
            }
            const inspected = await centreLive.action({ action:"v4_inspect", workId });
            if (!inspected.ok) return inspected;
            const reality = await responsePayload(inspected);
            if (reality?.v4 !== true || reality?.work?.workId !== workId || reality.work.checkpointId !== checkpointId) {
              return json({ code:"MAINTENANCE_CENTRE_IDENTITY_MISMATCH" }, 409);
            }
            return maintenance.maintenance({ ...input, work:reality.work });
          },
          heimdallPass: input => runMutation("heimdall.pass." + String(input.action || "unknown"), input, () => heimdallPass(input)),
          v4ProjectBoard: input => v4ProjectBoard(input),
          lightCentreV4Action: async input => {
            if (!lightMcp || !["v4_inspect", "v4_claim", "v4_wait", "v4_resume"].includes(input?.action)) {
              return json({ code:"LIGHT_CENTRE_ACTION_NOT_ALLOWED" }, 403);
            }
            const routed = {
              action:input.action,
              workId:input.workId,
              checkpointId:input.checkpointId,
              returnAddress:input.checkpointId,
              actor:"LIGHT",
              ...(input.reason ? { reason:input.reason } : {}),
              ...(input.resumeFrom ? { resumeFrom:input.resumeFrom } : {}),
            };
            if (input.action === "v4_wait") {
              const inspected = await centreLive.action({ action:"v4_inspect", workId:input.workId });
              if (!inspected.ok) return inspected;
              const view = await responsePayload(inspected);
              if (view?.work?.checkpointId !== input.checkpointId || view?.work?.holder !== "LIGHT") {
                return json({ code:"LIGHT_CENTRE_HOLDER_REQUIRED" }, 403);
              }
            }
            return centreLive.action(routed);
          },
          observerLatest: () => observer.latest(),
          observerScreenshot: input => observer.screenshot(input),
          auditHistory: input => globalAudit.history(input),
          centreInspect: input => inspectCentreCompat(centreLive, input),
          centreAuditHistory: input => centreAuditHistory(globalAudit, input),
          centreLiveAction: async input => {
            const response = await centreLive.action(input);
            if (response.ok) {
              const view = await response.clone().json().catch(() => null);
              if (view?.ok) {
                const projectionView = view?.v4 === true && view?.work?.workId
                  ? {
                      ...view,
                      routingWorkId:String(input?.workId || "").trim() || null,
                      canonicalWorkId:String(view.work.workId || "").trim() || null,
                    }
                  : view;
                try { await lighthouseControlPort.projectCentre(projectionView); } catch {}
              }
            }
            return response;
          },
          centreReadOnlyFastLane: input => json(routeReadOnlyFastLane(input)),
          lighthouseControlPortState: input => lighthouseControlPort.state(input),
          lighthouseControlPortCommand: input => lighthouseControlPort.command(input),
          projectStatus: async input => json(await projectStatus.read(input)),
          boardRead: () => lighthouseControlPort.boardRead(),
          boardPinRoute: input => json(boardPinRoute.read(input)),
          counterCreate: input => {
            const fromActor = lightMcp ? "LIGHT" : "GO";
            const toActor = lightMcp ? "GO" : "LIGHT";
            const mode = String(input?.mode || "SEARCH").trim().toUpperCase();
            if (lightMcp && mode !== "HANDOFF") return json({ code:"LIGHT_COUNTER_CREATE_HANDOFF_ONLY" }, 400);
            const routed = { ...input, fromActor, toActor };
            return runMutation("counter.create." + fromActor.toLowerCase(), routed, () => counterDispatch.create(routed));
          },
          counterInbox: input => counter.inbox({ ...input, actor:lightMcp ? "LIGHT" : "GO" }),
          counterGet: input => counterDispatch.get(input),
          counterSeen: input => {
            const actor = lightMcp ? "LIGHT" : "GO";
            const routed = { ...input, actor };
            return runMutation("counter.seen." + actor.toLowerCase(), routed, () => counter.seen(routed));
          },
          counterPickup: input => {
            const actor = lightMcp ? "LIGHT" : "GO";
            const routed = { ...input, actor };
            return runMutation("counter.pickup." + actor.toLowerCase(), routed, () => counter.seen(routed));
          },
          counterAnswer: input => {
            const actor = lightMcp ? "LIGHT" : "GO";
            const routed = { ...input, actor };
            return runMutation("counter.answer." + actor.toLowerCase(), routed, () => counterDispatch.answer(routed));
          },
          counterReadback: input => {
            const actor = lightMcp ? "LIGHT" : "GO";
            const routed = { ...input, actor };
            return runMutation("counter.readback." + actor.toLowerCase(), routed, () => counter.readback(routed));
          },
          linearListProjects: input => linear.listProjects(input),
          linearGetIssue: input => linear.getIssue(input),
          linearCreateIssue: input => runMutation("linear.create_issue", input, () => linear.createIssue(input)),
          linearUpdateIssue: input => runMutation("linear.update_issue", input, () => linear.updateIssue(input)),
          gmailCapabilities: () => googleWorkspace.capabilities(),
          gmailDiagnostics: () => googleWorkspace.diagnostics(),
          gmailProfile: () => googleWorkspace.gmailProfile(),
          gmailSearch: input => googleWorkspace.gmailSearch(input),
          gmailGetMessage: input => googleWorkspace.gmailGetMessage(input),
          gmailSendMessage: input => runMutation("gmail.send_message", input, () => googleWorkspace.gmailSendMessage(input)),
          calendarCapabilities: () => googleWorkspace.capabilities(),
          calendarDiagnostics: () => googleWorkspace.diagnostics(),
          calendarList: input => googleWorkspace.calendarList(input),
          calendarEvents: input => googleWorkspace.calendarEvents(input),
          calendarCreateEvent: input => runMutation("calendar.create_event", input, () => googleWorkspace.calendarCreateEvent(input)),
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
          driveReadDocument: input => drive.readDocument(input),
          driveCreateFolder: input => runMutation("drive.create_folder", input, () => drive.createFolder(input)),
          driveUploadFile: input => runMutation("drive.upload_file", input, () => drive.uploadFile(input)),
          driveMoveItem: input => runMutation("drive.move_item", input, () => drive.moveItem(input)),
          driveRenameItem: input => runMutation("drive.rename_item", input, () => drive.renameItem(input)),
          listWorkflowArtifacts: input => artifactDelivery.listArtifacts(input),
          archiveWorkflowArtifact: input => runMutation("artifact.archive_workflow", input, () => artifactDelivery.archiveArtifact(input)),
        }),
        speaker: env?.GO_HUB_BROADCAST_STATE
          ? ({ area, observed }) => broadcast.speaker({ area, observed })
          : null,
      });

      return createMcpHandler({
        registry: lightMcp ? restrictRegistry(registry, lightAllowedTools(registry)) : registry,
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
