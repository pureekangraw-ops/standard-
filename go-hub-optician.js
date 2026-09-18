const REQUIRED_CONTEXT = Object.freeze(["purpose", "successCondition"]);

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

export function fitWork({ context = {}, reality = {}, role = {}, destination = {} } = {}) {
  const missing = REQUIRED_CONTEXT.filter(key => !String(context?.[key] ?? "").trim());
  if (missing.length) {
    return Object.freeze({
      gate: "WAIT",
      missing: Object.freeze(missing),
      roleReference: null,
      route: null,
      fingerprint: fingerprint(context, reality),
    });
  }

  const roleReference = String(role.reference || "").trim();
  const route = String(destination.route || "").trim();
  if (!roleReference || !route) {
    return Object.freeze({
      gate: "WAIT",
      missing: Object.freeze([
        ...(!roleReference ? ["role"] : []),
        ...(!route ? ["route"] : []),
      ]),
      roleReference: roleReference || null,
      route: route || null,
      fingerprint: fingerprint(context, reality),
    });
  }

  return Object.freeze({
    gate: "PASS",
    missing: Object.freeze([]),
    roleReference,
    route,
    destinationId: String(destination.id || "").trim() || null,
    fingerprint: fingerprint(context, reality),
  });
}

export function fitFromInformation({ context = {}, reality = {}, role = {}, information = {} } = {}) {
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
    role,
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
