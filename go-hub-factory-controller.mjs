import {
  createHephaestusState,
  evaluateFactoryAdmission,
  requestFactorySlot,
} from "./go-hub-hephaestus.js";
import {
  admitQueuedFactorySlot,
  releaseFactorySlot,
} from "./go-hub-hephaestus-queue.js";
import { completeMergeAndReturn } from "./go-hub-hephaestus-return.js";

const STATE_KEY = "state";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function slot(value) {
  const name = required(value, "slot");
  if (!new Set(["assembly", "merge"]).has(name)) throw new Error(`unsupported slot: ${name}`);
  return name;
}

function canPromoteQueued(state, input) {
  const lane = state?.repositories?.[input.repository]?.[input.slot];
  const head = lane?.queue?.[0];
  return !lane?.active && head?.status === "NEEDS_RECHECK" &&
    head.goId === input.goId && head.jobId === input.jobId;
}

export class HephaestusForeman {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async loadState() {
    const stored = await this.ctx.storage.get(STATE_KEY);
    return stored || createHephaestusState();
  }

  async saveState(state) {
    await this.ctx.storage.put(STATE_KEY, state);
    return state;
  }

  async getState() {
    return this.loadState();
  }

  async requestSlot(input = {}) {
    const repository = required(input.repository, "repository");
    const targetSlot = slot(input.slot);
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const current = await this.loadState();
    const admission = evaluateFactoryAdmission({ ...input, slot: targetSlot });

    const request = {
      repository,
      slot: targetSlot,
      goId,
      jobId,
      admission,
      risk: input.risk || null,
    };

    const result = admission.decision === "ADMIT" && canPromoteQueued(current, request)
      ? admitQueuedFactorySlot(current, request)
      : requestFactorySlot(current, request);

    await this.saveState(result.state);
    return result;
  }

  async releaseSlot(input = {}) {
    const repository = required(input.repository, "repository");
    const targetSlot = slot(input.slot);
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const current = await this.loadState();

    const result = targetSlot === "merge"
      ? completeMergeAndReturn(current, {
          repository,
          goId,
          jobId,
          postMergeVerification: input.postMergeVerification,
        })
      : releaseFactorySlot(current, { repository, slot: targetSlot, goId, jobId });

    await this.saveState(result.state);
    return result;
  }

  async assertActiveMerge(input = {}) {
    const repository = required(input.repository, "repository");
    const goId = required(input.goId, "goId");
    const jobId = required(input.jobId, "jobId");
    const state = await this.loadState();
    const active = state?.repositories?.[repository]?.merge?.active;
    return Boolean(active && active.goId === goId && active.jobId === jobId && active.status === "ACTIVE");
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const body = request.method === "GET"
        ? {}
        : await request.json().catch(() => null);
      if (request.method !== "GET" && (!body || typeof body !== "object" || Array.isArray(body))) {
        return json({ code: "INVALID_JSON" }, 400);
      }

      if (request.method === "POST" && url.pathname === "/request") {
        return json(await this.requestSlot(body));
      }
      if (request.method === "POST" && url.pathname === "/release") {
        return json(await this.releaseSlot(body));
      }
      if (request.method === "POST" && url.pathname === "/assert-merge") {
        return json({ active: await this.assertActiveMerge(body) });
      }
      if (request.method === "GET" && url.pathname === "/state") {
        return json(await this.getState());
      }
      return json({ code: "NOT_FOUND" }, 404);
    } catch (error) {
      return json({ code: error?.message || "FACTORY_FOREMAN_ERROR" }, 400);
    }
  }
}

function foremanStub(namespace, repository) {
  if (!namespace) return null;
  if (typeof namespace.getByName === "function") return namespace.getByName(repository);
  if (typeof namespace.idFromName === "function" && typeof namespace.get === "function") {
    return namespace.get(namespace.idFromName(repository));
  }
  return null;
}

async function callForeman(namespace, repository, pathname, input = null, method = "POST") {
  const stub = foremanStub(namespace, repository);
  if (!stub || typeof stub.fetch !== "function") {
    return json({ code: "FACTORY_FOREMAN_NOT_CONFIGURED" }, 503);
  }
  return stub.fetch(new Request(`https://hephaestus.internal${pathname}`, {
    method,
    headers: method === "GET" ? undefined : { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(input || {}),
  }));
}

export function createFactoryControllerService({ namespace } = {}) {
  return Object.freeze({
    async foreman(input = {}) {
      const repository = String(input.repository || "").trim();
      if (!repository) return json({ code: "repository is required" }, 400);
      const action = String(input.action || "").trim();
      if (action === "request") return callForeman(namespace, repository, "/request", input);
      if (action === "release") return callForeman(namespace, repository, "/release", input);
      if (action === "state") return callForeman(namespace, repository, "/state", null, "GET");
      return json({ code: "unsupported Factory foreman action" }, 400);
    },
    async getState(input = {}) {
      const repository = String(input.repository || "").trim();
      if (!repository) return json({ code: "repository is required" }, 400);
      return callForeman(namespace, repository, "/state", null, "GET");
    },
    async assertActiveMerge(input = {}) {
      const repository = String(input.repository || "").trim();
      if (!repository) return json({ code: "repository is required" }, 400);
      return callForeman(namespace, repository, "/assert-merge", input);
    },
  });
}
