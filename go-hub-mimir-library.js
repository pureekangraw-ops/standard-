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

export function createMimirLibraryCore({ resolveDirectory, departments = {} } = {}) {
  if (typeof resolveDirectory !== "function") throw new TypeError("MIMIR library directory resolver is required");
  if (!departments || typeof departments !== "object" || Array.isArray(departments)) {
    throw new TypeError("MIMIR library departments must be an object");
  }

  return Object.freeze({
    async query(input = {}) {
      const directory = resolveDirectory({ intent: input.intent });
      if (directory.status !== "PASS") return wait(directory.waitReason || "NO_ROUTE", directory);

      const department = departments[directory.departmentId];
      if (typeof department !== "function") return wait("DEPARTMENT_UNAVAILABLE", directory);

      const departmentResult = await department({
        task: String(input.task || ""),
        requestedResult: String(input.requestedResult || ""),
        lensReference: input.lensReference == null ? null : String(input.lensReference),
      });
      if (!departmentResult || typeof departmentResult !== "object" || Array.isArray(departmentResult)) {
        return wait("DEPARTMENT_INVALID_RESULT", directory);
      }

      return Object.freeze({
        ...structuredClone(departmentResult),
        departmentId: directory.departmentId,
        directoryRoute: directory.route,
        departmentRoute: String(departmentResult.route || "").trim() || null,
      });
    },
  });
}
