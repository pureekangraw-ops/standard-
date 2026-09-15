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
  destinations: Object.freeze({
    factory: Object.freeze({
      id: "factory",
      role: "building-entry",
      route: "destination://factory",
    }),
  }),
});

function heimdallDecision(heimdall = {}) {
  const decision = String(heimdall.decision || "").toUpperCase();
  return {
    decision,
    reason: String(heimdall.reason || "HEIMDALL_REVIEW_REQUIRED"),
  };
}

export function createCityRoute() {
  return CITY_ROUTE;
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

export function routeInbound({ fit = {}, heimdall = {} } = {}) {
  if (fit.gate !== "PASS") {
    return Object.freeze({ destination: "optician", reason: "FIT_NOT_READY" });
  }
  const passage = heimdallDecision(heimdall);
  if (passage.decision !== "PASS") {
    return Object.freeze({ destination: "heimdall", reason: passage.reason });
  }
  return Object.freeze({
    destination: "go-work-loop",
    via: Object.freeze(["optician", "heimdall"]),
    workRoute: String(fit.route || "") || null,
    destinationId: String(fit.destinationId || "") || null,
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
