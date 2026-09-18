import { CENTRE_STATES, createCentrePassage } from "./go-hub-centre.js";
import { routeInterruptionReturn } from "./go-hub-city-route.js";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw Object.assign(new Error(label + " is required"), { status: 400 });
  return text;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stateView(state, extra = {}) {
  const work = clone(state.work);
  return {
    ok: true,
    phase: state.phase,
    work,
    workId: work.workId,
    checkpointId: work.checkpointId,
    returnAddress: work.checkpointId,
    realityExists: state.realityExists === true,
    realityEvidence: clone(state.realityEvidence || null),
    interruption: clone(state.interruption || null),
    ...extra,
  };
}

function assertIdentity(state, input = {}, { requireReturn = false } = {}) {
  const workId = required(input.workId, "Work ID");
  if (workId !== state.work.workId) throw Object.assign(new Error("Work ID does not match"), { status: 409 });
  if (input.checkpointId != null && String(input.checkpointId) !== state.work.checkpointId) {
    throw Object.assign(new Error("Checkpoint ID does not match"), { status: 409 });
  }
  if (requireReturn || input.returnAddress != null) {
    const returnAddress = required(input.returnAddress, "Return Address");
    if (returnAddress !== state.work.checkpointId) {
      throw Object.assign(new Error("Return Address does not match Checkpoint ID"), { status: 409 });
    }
  }
}

function assertRealityEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Reality evidence is required"), { status: 400 });
  }
  const kind = required(value.kind, "Reality evidence kind");
  const reference = required(value.reference, "Reality evidence reference");
  return { kind, reference, observedAt: String(value.observedAt || new Date().toISOString()) };
}

export class GoHubCentreState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.centre = createCentrePassage();
  }

  async load() {
    return (await this.ctx.storage.get("state")) || null;
  }

  async save(state) {
    await this.ctx.storage.put("state", clone(state));
    return state;
  }

  async act(input = {}) {
    const action = required(input.action, "Centre action");
    let state = await this.load();

    if (action === "start") {
      const workId = required(input.workId, "Work ID");
      const checkpointId = required(input.checkpointId, "Checkpoint ID");
      const returnAddress = required(input.returnAddress, "Return Address");
      if (checkpointId !== returnAddress) {
        throw Object.assign(new Error("Return Address does not match Checkpoint ID"), { status: 409 });
      }
      if (state) {
        if (state.work.workId !== workId || state.work.checkpointId !== checkpointId) {
          throw Object.assign(new Error("CENTRE_IDENTITY_CONFLICT"), { status: 409 });
        }
        return stateView(state, { resumed: true });
      }
      state = await this.save({
        work: this.centre.enter({ workId, checkpointId }),
        phase: "ARRIVED",
        realityExists: false,
        realityEvidence: null,
        interruption: null,
      });
      return stateView(state, { resumed: false });
    }

    if (!state) throw Object.assign(new Error("CENTRE_WORK_NOT_FOUND"), { status: 404 });
    assertIdentity(state, input);

    if (action === "inspect") return stateView(state, { resumed: true });

    if (action === "review") {
      state.work = this.centre.review(state.work, {
        task: input.task,
        requestedResult: input.requestedResult,
        authority: input.authority,
      });
      state.phase = "REVIEW";
      await this.save(state);
      return stateView(state);
    }

    if (action === "fit") {
      state.work = this.centre.fit(state.work, {
        lensId: input.lensId,
        lensReference: input.lensReference,
        fittedView: input.fittedView,
      });
      state.phase = "FIT";
      await this.save(state);
      return stateView(state);
    }

    if (action === "leave") {
      const result = this.centre.leave(state.work, {
        destination: required(input.destination, "Destination"),
      });
      state.work = result.work;
      state.phase = "AWAY";
      await this.save(state);
      return stateView(state, { envelope: result.envelope });
    }

    if (action === "return") {
      assertIdentity(state, input, { requireReturn: true });
      state.work = this.centre.return(state.work, {
        workId: state.work.workId,
        checkpointId: state.work.checkpointId,
        payload: clone(input.payload ?? null),
      });
      state.phase = "RETURNED";
      await this.save(state);
      return stateView(state);
    }

    if (action === "record_reality") {
      if (state.work.status !== CENTRE_STATES.AWAY) {
        throw Object.assign(new Error("Reality can only be recorded while work is AWAY"), { status: 409 });
      }
      state.realityExists = true;
      state.realityEvidence = assertRealityEvidence(input.evidence);
      state.phase = "REALITY";
      await this.save(state);
      return stateView(state);
    }

    if (action === "cancel") {
      assertIdentity(state, input, { requireReturn: true });
      const routed = routeInterruptionReturn({
        workId: state.work.workId,
        checkpointId: state.work.checkpointId,
        returnAddress: state.work.checkpointId,
        requested: "CANCEL",
        realityExists: state.realityExists === true,
      });
      state.interruption = routed.interruption;
      if (routed.interruption.state === "RECOVERY_REQUIRED") {
        state.phase = "RECOVERY_REQUIRED";
        await this.save(state);
        return stateView(state);
      }
      if (state.work.status === CENTRE_STATES.AWAY) {
        state.work = this.centre.return(state.work, {
          workId: state.work.workId,
          checkpointId: state.work.checkpointId,
          payload: { kind: "WORK_INTERRUPTION_RETURN", interruption: routed.interruption },
        });
      }
      state.phase = routed.interruption.state;
      await this.save(state);
      return stateView(state);
    }

    if (action === "resume") {
      if (state.work.status !== CENTRE_STATES.RETURNED) {
        throw Object.assign(new Error("Centre work must be RETURNED"), { status: 409 });
      }
      state.work = this.centre.resume(state.work, { reuseFit: input.reuseFit === true });
      state.phase = "RESUMED";
      state.interruption = null;
      await this.save(state);
      return stateView(state);
    }

    throw Object.assign(new Error("unsupported Centre live action"), { status: 400 });
  }

  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ code: "INVALID_JSON" }, 400);
      return json(await this.act(input), 200);
    } catch (error) {
      return json({ code: error?.message || "CENTRE_LIVE_ERROR" }, error?.status || 400);
    }
  }
}

function centreStub(namespace, workId) {
  if (!namespace || typeof namespace.getByName !== "function") return null;
  return namespace.getByName(workId);
}

export function createCentreLiveService({ namespace } = {}) {
  return Object.freeze({
    async action(input = {}) {
      const workId = required(input.workId, "Work ID");
      const stub = centreStub(namespace, workId);
      if (!stub || typeof stub.fetch !== "function") return json({ code: "CENTRE_STATE_NOT_CONFIGURED" }, 503);
      return stub.fetch(new Request("https://centre-state.internal/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }));
    },
  });
}
