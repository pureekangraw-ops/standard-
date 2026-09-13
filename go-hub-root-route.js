export function chooseRootDestination({
  canInspectLegacy = false,
  legacyData = false,
  forceHub = false,
  forceLegacy = false,
} = {}) {
  if (forceLegacy) return "LEGACY";
  if (forceHub) return "HUB";
  if (!canInspectLegacy) return "LEGACY";
  return legacyData ? "LEGACY" : "HUB";
}
