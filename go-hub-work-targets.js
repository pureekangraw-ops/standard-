const TARGETS = Object.freeze({
  lighthouse: Object.freeze({
    id: "lighthouse",
    label: "LIGHTHOUSE",
    repository: "pureekangraw-ops/ygph-metropolis",
    projectRoot: "lighthouse-next",
  }),
  standard: Object.freeze({
    id: "standard",
    label: "STANDARD / GO Hub",
    repository: "pureekangraw-ops/standard-",
    projectRoot: null,
  }),
});

export const WORK_TARGETS = TARGETS;

export function getWorkTarget(value) {
  const id = String(value || "").trim().toLowerCase();
  return TARGETS[id] || null;
}

export function requireWorkTarget(value) {
  const target = getWorkTarget(value);
  if (!target) throw new Error("WORK_TARGET_REQUIRED");
  return target;
}
