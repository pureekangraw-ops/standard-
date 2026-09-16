import { createHephaestusState, createMergeAdmissionTruth, evaluateFactoryAdmission, requestFactorySlot } from "./go-hub-hephaestus.js";
import { admitQueuedFactorySlot, releaseFactorySlot } from "./go-hub-hephaestus-queue.js";
import { completeMergeAndReturn } from "./go-hub-hephaestus-return.js";

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
    if (!admission || admission.pullRequestNumber !== pullRequestNumber || admission.pullRequestHeadSha !== headSha || admission.sourceHeadSha !== headSha) {
      throw new Error("merge result does not match sealed admission truth");
    }
    const state = structuredClone(current);
    state.repositories[repository].merge.active.mergeResult = {
      pullRequestNumber,
      headSha,
      mergeSha,
      recordedAt: new Date().toISOString(),
    };
    await this.saveState(state);
    return Object.freeze({
      state: Object.freeze(state),
      outcome: Object.freeze({ status: "MERGE_RECORDED", mergeSha }),
    });
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
      if (input.action === "release") return call(namespace, "/release", input);
      if (input.action === "state") return call(namespace, "/state", null, "GET");
      return Promise.resolve(json({ code: "unsupported Factory foreman action" }, 400));
    },
    recordMergeResult(input = {}) {
      return String(input.repository || "").trim() ? call(namespace, "/record-merge", input) : Promise.resolve(json({ code: "repository is required" }, 400));
    },
    getState(input = {}) {
      return String(input.repository || "").trim() ? call(namespace, "/state", null, "GET") : Promise.resolve(json({ code: "repository is required" }, 400));
    },
    assertActiveMerge(input = {}) {
      return String(input.repository || "").trim() ? call(namespace, "/assert-merge", input) : Promise.resolve(json({ code: "repository is required" }, 400));
    },
  });
}
