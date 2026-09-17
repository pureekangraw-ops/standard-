const DESTINATIONS = Object.freeze({
  factory: Object.freeze({
    id: "factory",
    role: "building-entry",
    route: "destination://factory",
  }),
  mimir: Object.freeze({
    id: "mimir",
    role: "information-entry",
    route: "destination://mimir",
  }),
  linear: Object.freeze({
    id: "linear",
    role: "work-tracking-entry",
    route: "destination://linear",
  }),
  browser: Object.freeze({
    id: "browser",
    role: "reality-entry",
    route: "destination://browser",
  }),
});

export const CITY_DESTINATIONS = DESTINATIONS;

export function getCityDestination(value) {
  const target = String(value || "").trim();
  if (!target) return null;
  return Object.values(DESTINATIONS).find(destination =>
    destination.id === target || destination.route === target
  ) || null;
}
