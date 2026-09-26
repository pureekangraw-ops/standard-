function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

/**
 * Universal completion mark.
 *
 * The mark deliberately contains only the two values BIG chose:
 *   1) the finished item's name
 *   2) the version currently being produced
 *
 * Verification is an admission condition, not part of the stamp itself.
 */
export function stampCompletedItem({ name, version, verified = false } = {}) {
  if (verified !== true) throw new Error("verified completion is required before stamp");
  return deepFreeze({
    name: required(name, "completion stamp name"),
    version: required(version, "completion stamp version"),
  });
}

export function assertCompletionStamp(stamp, { name = null, version = null } = {}) {
  if (!stamp || typeof stamp !== "object" || Array.isArray(stamp)) {
    throw new Error("completion stamp is required");
  }
  const actualName = required(stamp.name, "completion stamp name");
  const actualVersion = required(stamp.version, "completion stamp version");
  if (name != null && actualName !== required(name, "expected completion stamp name")) {
    throw new Error("completion stamp name mismatch");
  }
  if (version != null && actualVersion !== required(version, "expected completion stamp version")) {
    throw new Error("completion stamp version mismatch");
  }
  const keys = Object.keys(stamp).sort();
  if (keys.length !== 2 || keys[0] !== "name" || keys[1] !== "version") {
    throw new Error("completion stamp must contain only name and version");
  }
  return true;
}
