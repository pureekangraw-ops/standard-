import { CITY_DESTINATIONS, getCityDestination } from "./go-hub-route-contract.js";

const HEIMDALL = Object.freeze({
  id: "heimdall",
  responsibilities: Object.freeze(["SAFETY", "PERMISSION", "STOP"]),
});

const CITY_ROUTE = Object.freeze({
  bridge: Object.freeze({ id: "bifrost", role: "CHAT_HUB_TRANSPORT" }),
  entry: Object.freeze({
    id: "optician",
    label: "ช่างแว่น",
    responsibilities: Object.freeze(["INTAKE", "LENS", "ROUTE"]),
  }),
  guardian: HEIMDALL,
  loop: Object.freeze({
    id: "go-work-loop",
    cycle: Object.freeze(["GO", "ACTION", "REALITY", "PROGRESS"]),
    roundGate: "optician",
  }),
  information: Object.freeze({
    id: "mimir",
    role: "INFORMATION",
    scope: "city-wide",
  }),
  exit: HEIMDALL,
  returnTo: "big-chat",
  destinations: CITY_DESTINATIONS,
});

function heimdallDecision(heimdall = {}) {
  const decision = String(heimdall.decision || "").toUpperCase();
  return {
    decision,
    reason: String(heimdall.reason || "HEIMDALL_REVIEW_REQUIRED"),
  };
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function snapshot(value) {
  const copy = structuredClone(value);
  const freeze = current => {
    if (current && typeof current === "object" && !Object.isFrozen(current)) {
      Object.values(current).forEach(freeze);
      Object.freeze(current);
    }
    return current;
  };
  return freeze(copy);
}

function canonicalFitDestination(fit = {}) {
  const byRoute = getCityDestination(fit.route);
  const byId = getCityDestination(fit.destinationId);
  if (!byRoute || !byId || byRoute.id !== byId.id) return null;
  return byRoute;
}

export function createCityRoute() {
  return CITY_ROUTE;
}

export function crossBifrost(packet = {}, { direction = "" } = {}) {
  const bridgeDirection = required(direction, "Bifrost direction").toUpperCase();
  if (!["CHAT_TO_HUB", "HUB_TO_CHAT"].includes(bridgeDirection)) {
    throw new Error("unsupported Bifrost direction");
  }
  const workId = required(packet.workId, "Work ID");
  const checkpointId = required(packet.checkpointId, "Checkpoint ID");
  const returnAddress = required(packet.returnAddress, "Return Address");
  if (checkpointId !== returnAddress) {
    throw new Error("Bifrost packet Return Address does not match Checkpoint ID");
  }
  return Object.freeze({
    bridge: "bifrost",
    direction: bridgeDirection,
    packet: snapshot({ ...packet, workId, checkpointId, returnAddress }),
  });
}

export function enterWorkLoop(fit = {}) {
  if (fit.gate !== "PASS") {
    return Object.freeze({
      destination: "optician",
      via: "optician",
      reason: "GATE_NOT_PASSED",
    });
  }
  return Object.freeze({
    destination: "go-work-loop",
    via: "optician",
    workRoute: String(fit.route || "") || null,
    destinationId: String(fit.destinationId || "") || null,
  });
}

export function routeInbound({ fit = {} } = {}) {
  if (fit.gate !== "PASS") {
    return Object.freeze({ destination: "optician", reason: "FIT_NOT_READY" });
  }
  const target = canonicalFitDestination(fit);
  if (!target) {
    return Object.freeze({
      destination: "optician",
      reason: "DESTINATION_NOT_CANONICAL",
    });
  }
  return Object.freeze({
    destination: "go-work-loop",
    via: "optician",
    workRoute: target.route,
    destinationId: target.id,
  });
}

export function routeOutbound({ heimdall = {}, needsOptician = false } = {}) {
  const passage = heimdallDecision(heimdall);
  if (passage.decision !== "PASS") {
    return Object.freeze({ destination: "heimdall", reason: passage.reason });
  }
  if (needsOptician) {
    return Object.freeze({
      destination: "optician",
      via: "heimdall",
      reason: "REFIT_OR_SUMMARY_REQUIRED",
    });
  }
  return Object.freeze({
    destination: "bifrost",
    via: "heimdall",
    next: "big-chat",
    reason: "PASSAGE_ALLOWED",
  });
}

export function routeInformation({ question = "", resumeAt = "optician" } = {}) {
  return Object.freeze({
    destination: "mimir",
    purpose: "INFORMATION",
    resumeAt: String(resumeAt || "optician"),
    question: String(question || ""),
  });
}

export function routeExit({ done = false, exitReady = false } = {}) {
  if (!done) {
    return Object.freeze({
      destination: "go-work-loop",
      via: "heimdall",
      reason: "WORK_NOT_DONE",
    });
  }
  if (!exitReady) {
    return Object.freeze({
      destination: "go-work-loop",
      via: "heimdall",
      reason: "EXIT_NOT_READY",
    });
  }
  return Object.freeze({
    destination: "big-chat",
    via: "bifrost",
    reason: "READY_TO_RETURN",
  });
}
