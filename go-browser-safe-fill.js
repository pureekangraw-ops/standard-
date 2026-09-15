import { scanLocalDocument } from "./go-browser-local-reader.js";

const CANDIDATE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const FILL_ASSIGNMENT_KEYS = new Set(["fieldId", "value", "valueKind"]);
const MIN_RESOLUTION_SCORE = 60;

function frozen(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen));
  if (!value || typeof value !== "object") return value;
  const copy = {};
  for (const [key, item] of Object.entries(value)) copy[key] = frozen(item);
  return Object.freeze(copy);
}

function sameArray(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  return a.length === b.length && a.every((value, index) => String(value) === String(b[index]));
}

function sameText(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function assignmentHasOnlyAllowedKeys(assignment) {
  return assignment && typeof assignment === "object" && !Array.isArray(assignment) &&
    Object.keys(assignment).every(key => FILL_ASSIGNMENT_KEYS.has(key));
}

export function buildFillPlan(scan, assignments) {
  if (!scan?.fingerprint?.id || !Array.isArray(scan?.fields) || !Array.isArray(assignments)) {
    throw new Error("INVALID_FILL_PLAN");
  }

  const planned = assignments.map(assignment => {
    if (!assignmentHasOnlyAllowedKeys(assignment) || !Object.hasOwn(assignment, "fieldId") || !Object.hasOwn(assignment, "value")) {
      throw new Error("INVALID_FILL_PLAN");
    }
    const expectedField = scan.fields.find(field => field.fieldId === assignment.fieldId);
    if (!expectedField) throw new Error("FIELD_NOT_FOUND");
    if (assignment.valueKind != null && assignment.valueKind !== expectedField.valueKind) {
      throw new Error("INVALID_FILL_PLAN");
    }
    return frozen({
      fieldId: expectedField.fieldId,
      semanticRole: expectedField.semanticRole,
      valueKind: expectedField.valueKind,
      expectedField,
      value: assignment.value,
    });
  });

  return frozen({
    fingerprintId: scan.fingerprint.id,
    assignments: planned,
  });
}

export function guardAssignment(field, profile) {
  if (!field || !profile) return { allowed: false, code: "UNSUPPORTED_FIELD_KIND" };
  if (field.sensitive === true || ["password", "otp", "payment"].includes(field.semanticRole)) {
    return { allowed: false, code: "FIELD_SENSITIVE_BLOCKED" };
  }
  if (field.semanticRole === "unknown") {
    return { allowed: false, code: "FIELD_UNKNOWN_BLOCKED" };
  }
  if (field.hidden === true || field.disabled === true || field.readOnly === true) {
    return { allowed: false, code: "FIELD_READONLY_BLOCKED" };
  }
  const actionEvidence = [field.name, field.semanticRole, field.signature?.accessibleName]
    .filter(Boolean)
    .join(" ");
  if (profile.blockedActionPattern instanceof RegExp && profile.blockedActionPattern.test(actionEvidence)) {
    return { allowed: false, code: "FIELD_ACTION_BLOCKED" };
  }
  if (!Array.isArray(profile.writableSemantics) || !profile.writableSemantics.includes(field.semanticRole)) {
    return { allowed: false, code: "UNSUPPORTED_FIELD_KIND" };
  }
  if (!["text", "number", "boolean", "choice"].includes(field.valueKind)) {
    return { allowed: false, code: "UNSUPPORTED_FIELD_KIND" };
  }
  return { allowed: true };
}

export function scoreCandidate(expected, candidate) {
  if (!expected || !candidate) return 0;
  if (expected.semanticRole !== candidate.semanticRole) return 0;

  let score = 40;
  if (expected.role === candidate.role) score += 20;

  const expectedSignature = expected.signature || {};
  const candidateSignature = candidate.signature || {};
  if (expectedSignature.accessibleName && sameText(expectedSignature.accessibleName, candidateSignature.accessibleName)) score += 20;
  if (expectedSignature.name && sameText(expectedSignature.name, candidateSignature.name)) score += 15;
  if (expectedSignature.autocomplete && sameText(expectedSignature.autocomplete, candidateSignature.autocomplete)) score += 10;
  if (expectedSignature.inputType && sameText(expectedSignature.inputType, candidateSignature.inputType)) score += 5;
  if (sameArray(expectedSignature.options, candidateSignature.options)) score += 5;
  return score;
}

export function resolveField(currentScan, expectedField) {
  if (!Array.isArray(currentScan?.fields)) return { error: "FIELD_NOT_FOUND" };
  const ranked = currentScan.fields
    .map((field, index) => ({ field, index, score: scoreCandidate(expectedField, field) }))
    .filter(item => item.score >= MIN_RESOLUTION_SCORE)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return { error: "FIELD_NOT_FOUND" };
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return { error: "FIELD_RESOLUTION_AMBIGUOUS" };
  }
  return { field: ranked[0].field, index: ranked[0].index };
}

function normalizeValue(valueKind, value) {
  if (valueKind === "boolean") return Boolean(value);
  if (valueKind === "number") return String(value == null ? "" : value);
  return String(value == null ? "" : value);
}

function readElementValue(element, field) {
  if (field.valueKind === "boolean") return Boolean(element?.checked);
  if (field.signature?.contenteditable === true) return String(element?.textContent || "");
  return String(element?.value == null ? "" : element.value);
}

function writeElementValue(element, field, value) {
  if (field.valueKind === "boolean") {
    element.checked = Boolean(value);
    return;
  }
  if (field.signature?.contenteditable === true) {
    element.textContent = String(value == null ? "" : value);
    return;
  }
  element.value = String(value == null ? "" : value);
}

function dispatchNormalEvents(element, windowObject) {
  const EventCtor = windowObject?.Event || globalThis.Event;
  if (typeof EventCtor !== "function" || typeof element?.dispatchEvent !== "function") return;
  element.dispatchEvent(new EventCtor("input", { bubbles: true }));
  element.dispatchEvent(new EventCtor("change", { bubbles: true }));
}

function blockedReceipt(assignment, field, code) {
  return frozen({
    fieldId: field?.fieldId || assignment.fieldId,
    semanticRole: assignment.semanticRole,
    expectedValue: normalizeValue(assignment.valueKind, assignment.value),
    actualValue: field?.value == null ? null : normalizeValue(assignment.valueKind, field.value),
    state: "BLOCKED",
    code,
  });
}

function currentElements(document) {
  return Array.from(document.querySelectorAll(CANDIDATE_SELECTOR));
}

export function executeFillPlan({ document, location, title = "", profile, plan, window } = {}) {
  if (!plan?.fingerprintId || !Array.isArray(plan?.assignments)) {
    return frozen({ ok: false, code: "INVALID_FILL_PLAN", receipts: [], pageFingerprint: null });
  }

  let initialScan;
  try {
    initialScan = scanLocalDocument({ document, location, title, profile });
  } catch {
    return frozen({ ok: false, code: "SITE_NOT_ALLOWED", receipts: [], pageFingerprint: null });
  }

  if (initialScan.fingerprint.id !== plan.fingerprintId) {
    return frozen({
      ok: false,
      code: "PAGE_CHANGED_RESCAN_REQUIRED",
      receipts: [],
      pageFingerprint: initialScan.fingerprint,
    });
  }

  const receipts = [];
  let latestScan = initialScan;

  for (const assignment of plan.assignments) {
    latestScan = scanLocalDocument({ document, location, title, profile });
    if (latestScan.fingerprint.id !== plan.fingerprintId) {
      receipts.push(blockedReceipt(assignment, null, "PAGE_CHANGED_RESCAN_REQUIRED"));
      break;
    }

    const resolved = resolveField(latestScan, assignment.expectedField);
    if (resolved.error) {
      receipts.push(blockedReceipt(assignment, null, resolved.error));
      continue;
    }

    const guard = guardAssignment(resolved.field, profile);
    if (!guard.allowed) {
      receipts.push(blockedReceipt(assignment, resolved.field, guard.code));
      continue;
    }

    const elements = currentElements(document);
    const element = elements[resolved.index];
    if (!element) {
      receipts.push(blockedReceipt(assignment, resolved.field, "FIELD_NOT_FOUND"));
      continue;
    }

    const expectedValue = normalizeValue(assignment.valueKind, assignment.value);
    try {
      writeElementValue(element, resolved.field, assignment.value);
      dispatchNormalEvents(element, window);
    } catch {
      receipts.push(frozen({
        fieldId: resolved.field.fieldId,
        semanticRole: assignment.semanticRole,
        expectedValue,
        actualValue: readElementValue(element, resolved.field),
        state: "FAILED",
        code: "FIELD_WRITE_FAILED",
      }));
      continue;
    }

    const actualValue = normalizeValue(assignment.valueKind, readElementValue(element, resolved.field));
    receipts.push(frozen({
      fieldId: resolved.field.fieldId,
      semanticRole: assignment.semanticRole,
      expectedValue,
      actualValue,
      state: Object.is(actualValue, expectedValue) ? "VERIFIED" : "FAILED",
      ...(Object.is(actualValue, expectedValue) ? {} : { code: "FIELD_VERIFY_MISMATCH" }),
    }));
  }

  const ok = receipts.length === plan.assignments.length && receipts.every(receipt => receipt.state === "VERIFIED");
  return frozen({
    ok,
    receipts,
    pageFingerprint: latestScan.fingerprint,
  });
}
