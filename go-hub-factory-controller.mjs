import { createHephaestusState, createMergeAdmissionTruth, evaluateFactoryAdmission, requestFactorySlot } from "./go-hub-hephaestus.js";
import { admitQueuedFactorySlot, releaseFactorySlot, retireQueuedFactoryWork } from "./go-hub-hephaestus-queue.js";
import { completeMergeAndReturn, parkMergedWork, completeWaitingRoomVerification } from "./go-hub-hephaestus-return.js";
import { reconcileLegacyWaitingRoom } from "./go-hub-maintenance-reconciliation.js";

const STATE_KEY = "state";
const FOREMAN_NAME = "factory";
const slots = new Set(["assembly", "merge"]);
const workKeys = ["workId", "checkpointId", "returnAddress", "destination", "task", "requestedResult", "lensReference"];

function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
function required(value, label) { const text = String(value || "").trim(); if (!text) throw new Error(`${label} is required`); return text; }
function validSlot(value) { const name = required(value, "slot"); if (!slots.has(name)) throw new Error(`unsupported slot: ${name}`); return name; }
function promotable(state, request) {
  const lane = state?.repositories?.[request.repository]?.[request.slot];
  const head = lane?.queue?.[0];
  return !lane?.active && head?.status === "NEEDS_RECHECK" && head.goId === request.goId && head.jobId === request.jobId;
}
function sameWork(left, right) {
  if (!left || !right) return false;
  return workKeys.every(key => String(left[key] || "") === String(right[key] || ""));
}
function bindWorkContext(result, request) {
  if (!request.workContext) return result;
  const state = structuredClone(result.state);
  const lane = state?.repositories?.[request.repository]?.[request.slot];
  const job = lane?.active?.goId === request.goId && lane?.active?.jobId === request.jobId
    ? lane.active
    : lane?.queue?.find(item => item.goId === request.goId && item.jobId === request.jobId);
  if (job) job.workContext = structuredClone(request.workContext);
  return { state: Object.freeze(state), outcome: result.outcome };
}
function assertClosedUnmergedCancellation(input = {}) {
  const cancellation = input.cancellation;
  const pr = cancellation?.pullRequest;
  if (String(cancellation?.reason || "") !== "PULL_REQUEST_CLOSED_UNMERGED" ||
      !String(cancellation?.observedAt || "").trim() ||
      String(pr?.state || "").toLowerCase() !== "closed" || pr?.merged !== false ||
      !Number.isInteger(pr?.number) || pr.number < 1 || !String(pr?.headSha || "").trim()) {
    throw new Error("closed unmerged pull request evidence is required");
  }
  return { reason: "PULL_REQUEST_CLOSED_UNMERGED", observedAt: String(cancellation.observedAt), pullRequest: structuredClone(pr) };
}

function assertIntegratedQueuedRecovery(input = {}) {
  const recovery = input.cancellation;
  const pr = recovery?.pullRequest;
  const comparison = recovery?.comparison;
  const mainSha = String(recovery?.mainSha || "").trim();
  const compareStatus = String(comparison?.status || "").toLowerCase();
  if (String(recovery?.reason || "") !== "PULL_REQUEST_HEAD_IN_MAIN" ||
      !String(recovery?.observedAt || "").trim() ||
      String(pr?.state || "").toLowerCase() !== "closed" ||
      !Number.isInteger(pr?.number) || pr.number < 1 || !String(pr?.headSha || "").trim() ||
      !mainSha || (compareStatus !== "ahead" && compareStatus !== "identical") ||
      String(comparison?.baseSha || "") !== String(pr.headSha) ||
      String(comparison?.headSha || "") !== mainSha ||
      Number(comparison?.behindBy) !== 0) {
    throw new Error("integrated queued pull request evidence is required");
  }
  return {
    reason: "PULL_REQUEST_HEAD_IN_MAIN",
    observedAt: String(recovery.observedAt),
    pullRequest: structuredClone(pr),
    mainSha,
    comparison: structuredClone(comparison),
  };
}

export class HephaestusForeman {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async loadState() { return (await this.ctx.storage.get(STATE_KEY)) || createHephaestusState(); }
  async saveState(state) { await this.ctx.storage.put(STATE_KEY, state); return state; }
  async getState() { return this.loadState(); }

  async requestSlot(input = {}) {
    const slot = validSlot(input.slot);
    const admission = evaluateFactoryAdmission(input);
    const request = {
      repository: required(input.repository, "repository"), slot,
      goId: required(input.goId, "goId"), jobId: required(input.jobId, "jobId"),
      admission, risk: input.risk || null,
      mergeAdmission: slot === "merge" && admission.decision === "ADMIT" ? createMergeAdmissionTruth(input) : null,
      workContext: input.workContext == null ? null : structuredClone(input.workContext),
    };
    const current = await this.loadState();
    let result = request.admission.decision === "ADMIT" && promotable(current, request)
      ? admitQueuedFactorySlot(current, request)
      : requestFactorySlot(current, request);
    result = bindWorkContext(result, request);
    await this.saveState(result.state);
    return result;
  }

  async recordMergeResult(input = {}) {
    const repository = required(input.repository, "repository");
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const pullRequestNumber = Number(input.pullRequestNumber || 0);
    if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) throw new Error("pullRequestNumber is required");
    const headSha = required(input.headSha, "merge headSha");
    const mergeSha = required(input.mergeSha, "mergeSha");
    const current = await this.loadState();
    const active = current?.repositories?.[repository]?.merge?.active;
    if (!active || active.status !== "ACTIVE" || active.goId !== goId || active.jobId !== jobId) {
      throw new Error("active merge slot owner does not match result");
    }
    if (input.workContext && !sameWork(active.workContext, input.workContext)) {
      throw new Error("Factory work context does not match active merge slot");
    }
    const admission = active.mergeAdmission;
    if (!admission || admission.pullRequestNumber !== pullRequestNumber ||
        admission.pullRequestHeadSha !== headSha || admission.sourceHeadSha !== headSha) {
      throw new Error("merge result does not match sealed admission truth");
    }
    const state = structuredClone(current);
    state.repositories[repository].merge.active.mergeResult = {
      pullRequestNumber, headSha, mergeSha, recordedAt: new Date().toISOString(),
    };
    await this.saveState(state);
    return Object.freeze({
      state: Object.freeze(state),
      outcome: Object.freeze({ status: "MERGE_RECORDED", mergeSha }),
    });
  }

  async cancelWork(input = {}) {
    const repository = required(input.repository, "repository");
    const slot = validSlot(input.slot);
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const current = await this.loadState();

    if (String(input.cancellation?.reason || "") === "PULL_REQUEST_HEAD_IN_MAIN") {
      const recovery = assertIntegratedQueuedRecovery(input);
      if (slot !== "merge") throw new Error("integrated queue recovery is merge-only");
      const target = current?.repositories?.[repository]?.merge;
      if (target?.active) throw new Error("integrated queued work cannot retire while merge slot is active");
      const head = target?.queue?.[0];
      if (!head || head.goId !== goId || head.jobId !== jobId) {
        throw new Error("integrated recovery must match merge queue head");
      }
      if (Number(head?.jobId?.match(/\d+/)?.[0] || 0) !== recovery.pullRequest.number) {
        throw new Error("integrated recovery pull request does not match queued merge work");
      }
      if (input.workContext && !sameWork(head.workContext, input.workContext)) {
        throw new Error("Factory work context does not match queued merge work");
      }
      const retired = retireQueuedFactoryWork(current, { repository, slot, goId, jobId });
      const result = {
        state: retired.state,
        outcome: Object.freeze({
          status: "RECOVERY_REQUIRED",
          reason: recovery.reason,
          realityExists: true,
          observedAt: recovery.observedAt,
          mainSha: recovery.mainSha,
          retiredJobId: retired.outcome.retiredJobId,
          promotedJobId: retired.outcome.promotedJobId,
          nextAction: retired.outcome.nextAction,
        }),
      };
      await this.saveState(result.state);
      return result;
    }

    const cancellation = assertClosedUnmergedCancellation(input);
    const active = current?.repositories?.[repository]?.[slot]?.active;
    if (!active || active.goId !== goId || active.jobId !== jobId) {
      throw new Error("active slot owner does not match cancellation");
    }
    if (slot !== "merge" || Number(active?.jobId?.match(/\d+/)?.[0] || 0) !== cancellation.pullRequest.number) {
      throw new Error("cancellation pull request does not match active merge work");
    }
    const released = releaseFactorySlot(current, { repository, slot, goId, jobId });
    const result = {
      state: released.state,
      outcome: Object.freeze({
        status: "CANCELLED",
        reason: cancellation.reason,
        observedAt: cancellation.observedAt,
        promotedJobId: released.outcome.promotedJobId,
        nextAction: released.outcome.nextAction,
      }),
    };
    await this.saveState(result.state);
    return result;
  }

  async parkMerged(input = {}) {
    const repository = required(input.repository, "repository");
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const current = await this.loadState();
    const active = current?.repositories?.[repository]?.merge?.active;
    if (input.workContext && (!active || !sameWork(active.workContext, input.workContext))) {
      throw new Error("Factory work context does not match active slot");
    }
    const result = parkMergedWork(current, {
      repository,
      goId,
      jobId,
      mainSha: required(input.mainSha, "main sha"),
      mergedAt: required(input.mergedAt, "merged at"),
    });
    await this.saveState(result.state);
    return result;
  }

  async verifyWaitingRoom(input = {}) {
    const result = completeWaitingRoomVerification(await this.loadState(), {
      repository: required(input.repository, "repository"),
      goId: required(input.goId, "goId"),
      jobId: required(input.jobId, "jobId"),
      postMergeVerification: input.postMergeVerification,
    });
    await this.saveState(result.state);
    return result;
  }

  async reconcileLegacy(input = {}) {
    const result = reconcileLegacyWaitingRoom(await this.loadState(), input.evidence || {});
    await this.saveState(result.state);
    return result;
  }

  async releaseSlot(input = {}) {
    const repository = required(input.repository, "repository");
    const slot = validSlot(input.slot);
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const current = await this.loadState();
    const active = current?.repositories?.[repository]?.[slot]?.active;
    if (input.workContext && (!active || !sameWork(active.workContext, input.workContext))) {
      throw new Error("Factory work context does not match active slot");
    }
    const result = slot === "merge"
      ? completeMergeAndReturn(current, { repository, goId, jobId, postMergeVerification: input.postMergeVerification })
      : releaseFactorySlot(current, { repository, slot, goId, jobId });
    await this.saveState(result.state);
    return result;
  }

  async assertActiveMerge(input = {}) {
    const repository = required(input.repository, "repository");
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const active = (await this.loadState())?.repositories?.[repository]?.merge?.active;
    const owned = Boolean(active && active.status === "ACTIVE" && active.goId === goId && active.jobId === jobId);
    return input.workContext == null ? owned : owned && sameWork(active?.workContext, input.workContext);
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const body = request.method === "GET" ? {} : await request.json().catch(() => null);
      if (request.method !== "GET" && (!body || typeof body !== "object" || Array.isArray(body))) return json({ code: "INVALID_JSON" }, 400);
      if (request.method === "POST" && url.pathname === "/request") return json(await this.requestSlot(body));
      if (request.method === "POST" && url.pathname === "/record-merge") return json(await this.recordMergeResult(body));
      if (request.method === "POST" && url.pathname === "/cancel") return json(await this.cancelWork(body));
      if (request.method === "POST" && url.pathname === "/park") return json(await this.parkMerged(body));
      if (request.method === "POST" && url.pathname === "/verify") return json(await this.verifyWaitingRoom(body));
      if (request.method === "POST" && url.pathname === "/reconcile-legacy") return json(await this.reconcileLegacy(body));
      if (request.method === "POST" && url.pathname === "/release") return json(await this.releaseSlot(body));
      if (request.method === "POST" && url.pathname === "/assert-merge") return json({ active: await this.assertActiveMerge(body) });
      if (request.method === "GET" && url.pathname === "/state") return json(await this.getState());
      return json({ code: "NOT_FOUND" }, 404);
    } catch (error) { return json({ code: error?.message || "FACTORY_FOREMAN_ERROR" }, 400); }
  }
}

function stub(namespace) {
  if (!namespace) return null;
  if (typeof namespace.getByName === "function") return namespace.getByName(FOREMAN_NAME);
  if (typeof namespace.idFromName === "function" && typeof namespace.get === "function") return namespace.get(namespace.idFromName(FOREMAN_NAME));
  return null;
}
async function call(namespace, pathname, input, method = "POST") {
  const target = stub(namespace);
  if (!target || typeof target.fetch !== "function") return json({ code: "FACTORY_FOREMAN_NOT_CONFIGURED" }, 503);
  return target.fetch(new Request(`https://hephaestus.internal${pathname}`, {
    method, headers: method === "GET" ? undefined : { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(input || {}),
  }));
}

export function createFactoryControllerService({ namespace } = {}) {
  return Object.freeze({
    foreman(input = {}) {
      const repository = String(input.repository || "").trim();
      if (!repository) return Promise.resolve(json({ code: "repository is required" }, 400));
      if (input.action === "request") return call(namespace, "/request", input);
      if (input.action === "cancel") return call(namespace, "/cancel", input);
      if (input.action === "park") return call(namespace, "/park", input);
      if (input.action === "verify") return call(namespace, "/verify", input);
      if (input.action === "reconcile_legacy") return call(namespace, "/reconcile-legacy", input);
      if (input.action === "release") return call(namespace, "/release", input);
      if (input.action === "state") return call(namespace, "/state", null, "GET");
      return Promise.resolve(json({ code: "unsupported Factory foreman action" }, 400));
    },
    recordMergeResult(input = {}) {
      return String(input.repository || "").trim()
        ? call(namespace, "/record-merge", input)
        : Promise.resolve(json({ code: "repository is required" }, 400));
    },
    getState(input = {}) {
      return String(input.repository || "").trim() ? call(namespace, "/state", null, "GET") : Promise.resolve(json({ code: "repository is required" }, 400));
    },
    assertActiveMerge(input = {}) {
      return String(input.repository || "").trim() ? call(namespace, "/assert-merge", input) : Promise.resolve(json({ code: "repository is required" }, 400));
    },
  });
}
