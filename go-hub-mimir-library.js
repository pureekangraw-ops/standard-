export { createMimirMemorySearchPort } from "./go-hub-mimir-memory.js";
export { createMimirExperienceSearchPort, proposeKnowledgeCandidateFromExperience } from "./go-hub-mimir-experience.js";
export { createMimirVerificationDesk, evaluateMimirTrust } from "./go-hub-mimir-verify.js";

const DIRECTORY_ADVISORY_REASONS = new Set([
  "ROUTE_INTENT_REQUIRED",
  "NO_ROUTE",
  "AMBIGUOUS_ROUTE",
  "MISSING_ROUTE",
]);

function wait(reason, directory = null) {
  return Object.freeze({
    status: "WAIT",
    waitReason: reason,
    departmentId: directory?.departmentId || null,
    directoryRoute: directory?.route || null,
    departmentRoute: null,
    records: Object.freeze([]),
    evidence: null,
  });
}

export function assessMimirLibraryRelevance({ currentWork = "", searchFor = "", related = null } = {}) {
  const relationship = related === true ? true : related === false ? false : null;
  return Object.freeze({
    currentWork: String(currentWork || ""),
    searchFor: String(searchFor || ""),
    related: relationship,
    status: relationship === false ? "WARNING" : relationship === true ? "ALIGNED" : "UNKNOWN",
    warning: relationship === false ? "WEAK_RELEVANCE" : null,
  });
}

function chooseDepartment(directory = {}, explicitDepartment = "") {
  const explicit = String(explicitDepartment || "").trim();
  const directoryStatus = String(directory?.status || "").trim().toUpperCase();
  const reason = String(directory?.waitReason || "").trim().toUpperCase();

  if (!explicit) {
    if (directoryStatus !== "PASS") return { allowed: false, reason: reason || "NO_ROUTE", departmentId: null, warning: null };
    return { allowed: true, reason: null, departmentId: String(directory.departmentId || "").trim(), warning: null };
  }

  if (directoryStatus === "PASS") {
    const advised = String(directory.departmentId || "").trim();
    return {
      allowed: true,
      reason: null,
      departmentId: explicit,
      warning: advised && advised !== explicit ? "DIRECTORY_ADVICE_OVERRIDDEN" : null,
    };
  }

  if (DIRECTORY_ADVISORY_REASONS.has(reason)) {
    return { allowed: true, reason: null, departmentId: explicit, warning: reason };
  }

  return { allowed: false, reason: reason || "NO_ROUTE", departmentId: null, warning: null };
}

export function createMimirLibraryCore({ resolveDirectory, departments = {} } = {}) {
  if (typeof resolveDirectory !== "function") throw new TypeError("MIMIR library directory resolver is required");
  if (!departments || typeof departments !== "object" || Array.isArray(departments)) {
    throw new TypeError("MIMIR library departments must be an object");
  }

  return Object.freeze({
    async query(input = {}) {
      const directory = resolveDirectory({ intent: input.intent });
      const selection = chooseDepartment(directory, input.departmentId);
      if (!selection.allowed) return wait(selection.reason, directory);

      const department = departments[selection.departmentId];
      if (typeof department !== "function") return wait("DEPARTMENT_UNAVAILABLE", directory);

      const departmentResult = await department({
        task: String(input.task || ""),
        requestedResult: String(input.requestedResult || ""),
        lensReference: input.lensReference == null ? null : String(input.lensReference),
      });
      if (!departmentResult || typeof departmentResult !== "object" || Array.isArray(departmentResult)) {
        return wait("DEPARTMENT_INVALID_RESULT", directory);
      }

      const hasRelevanceInput = input.currentWork != null || input.searchFor != null || input.related != null;
      const response = {
        ...structuredClone(departmentResult),
        departmentId: selection.departmentId,
        directoryRoute: directory?.route || null,
        departmentRoute: String(departmentResult.route || "").trim() || null,
      };
      if (selection.warning) response.directoryWarning = selection.warning;
      if (hasRelevanceInput) {
        response.relevance = assessMimirLibraryRelevance({
          currentWork: input.currentWork,
          searchFor: input.searchFor == null ? input.task : input.searchFor,
          related: input.related,
        });
      }
      return Object.freeze(response);
    },
  });
}
