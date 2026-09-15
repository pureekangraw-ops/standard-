const CITY_ROUTE = Object.freeze({
  entry: Object.freeze({
    id: "optician",
    label: "ช่างแว่น",
    responsibilities: Object.freeze(["5W", "LENS", "GATE"]),
  }),
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
  exit: Object.freeze({
    id: "heimdall",
    responsibilities: Object.freeze(["EXIT_READINESS", "SAFETY"]),
  }),
  bridge: Object.freeze({ id: "bifrost" }),
  returnTo: "big-chat",
  destinations: Object.freeze({
    factory: Object.freeze({
      id: "factory",
      role: "building-entry",
      route: "destination://factory",
    }),
  }),
});

export function createCityRoute() {
  return CITY_ROUTE;
}

export function routeInformation({ question = "", resumeAt = "go-work-loop" } = {}) {
  return Object.freeze({
    destination: "mimir",
    purpose: "INFORMATION",
    resumeAt: String(resumeAt || "go-work-loop"),
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
