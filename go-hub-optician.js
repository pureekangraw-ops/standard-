const REQUIRED_CONTEXT = Object.freeze(["who", "what", "where", "when", "why"]);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function fingerprint(context, reality) {
  return stable({ context: context || {}, reality: reality || {} });
}

export function fitWork({ context = {}, reality = {}, lens = {}, destination = {} } = {}) {
  const missing = REQUIRED_CONTEXT.filter(key => !String(context?.[key] ?? "").trim());
  if (missing.length) {
    return Object.freeze({
      gate: "WAIT",
      missing: Object.freeze(missing),
      lensReference: null,
      route: null,
      fingerprint: fingerprint(context, reality),
    });
  }

  const lensReference = String(lens.reference || "").trim();
  const route = String(destination.route || "").trim();
  if (!lensReference || !route) {
    return Object.freeze({
      gate: "WAIT",
      missing: Object.freeze([
        ...(!lensReference ? ["lens"] : []),
        ...(!route ? ["route"] : []),
      ]),
      lensReference: lensReference || null,
      route: route || null,
      fingerprint: fingerprint(context, reality),
    });
  }

  return Object.freeze({
    gate: "PASS",
    missing: Object.freeze([]),
    lensReference,
    route,
    destinationId: String(destination.id || "").trim() || null,
    fingerprint: fingerprint(context, reality),
  });
}

export function fitFromInformation({ context = {}, reality = {}, lens = {}, information = {} } = {}) {
  const status = String(information.status || "").toUpperCase();
  const route = String(information.route || "").trim();
  if (status !== "PASS" || !route) {
    return Object.freeze({
      gate: "WAIT",
      reason: String(information.waitReason || "NO_USABLE_ROUTE"),
      route: null,
      informationSource: "mimir",
      evidence: information.evidence ?? null,
      fingerprint: fingerprint(context, reality),
    });
  }

  const destinationId = Array.isArray(information.records) && information.records.length
    ? String(information.records[0]?.id || "").trim() || null
    : null;
  const fitted = fitWork({
    context,
    reality,
    lens,
    destination: { id: destinationId, route },
  });
  return Object.freeze({
    ...fitted,
    informationSource: "mimir",
    evidence: information.evidence ?? null,
  });
}

export function checkRound(fit, { context = {}, reality = {} } = {}) {
  const current = fingerprint(context, reality);
  return Object.freeze({
    decision: fit?.gate === "PASS" && fit.fingerprint === current ? "REUSE_FIT" : "REFIT",
    fingerprint: current,
  });
}
