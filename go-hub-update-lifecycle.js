export function lifecycleBase(value = {}) {
  return {
    version: 1,
    current: value.current || null,
    serving: value.serving || value.current || null,
    previous: value.previous || null,
    rolledBack: Boolean(value.rolledBack),
    updatedAt: value.updatedAt || null,
  };
}

export function planActivation(existing, installedVersion, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!installedVersion) throw new Error("installed version is required");
  if (before.current === installedVersion) {
    return { ...before, serving: before.serving || installedVersion, updatedAt: at };
  }
  const previous = before.serving && before.serving !== installedVersion
    ? before.serving
    : before.current && before.current !== installedVersion
      ? before.current
      : before.previous && before.previous !== installedVersion
        ? before.previous
        : null;
  return {
    version: 1,
    current: installedVersion,
    serving: installedVersion,
    previous,
    rolledBack: false,
    updatedAt: at,
  };
}

export function planRollback(existing, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!before.previous || before.previous === before.current) throw new Error("previous version is unavailable");
  return { ...before, serving: before.previous, rolledBack: true, updatedAt: at };
}

export function planUseCurrent(existing, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!before.current) throw new Error("current version is unavailable");
  return { ...before, serving: before.current, rolledBack: false, updatedAt: at };
}

export function obsoleteCaches(cacheNames, lifecycle, prefix) {
  const safePrefix = String(prefix || "");
  if (!safePrefix) throw new Error("cache prefix is required");
  const keep = new Set([lifecycle?.current, lifecycle?.serving, lifecycle?.previous].filter(Boolean));
  return cacheNames.filter(name => String(name).startsWith(safePrefix) && !keep.has(name));
}
