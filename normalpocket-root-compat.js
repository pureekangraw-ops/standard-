import { chooseRootDestination } from "./go-hub-root-route.js";

const LEGACY_DB_NAME = "ygph-standard-secure";
const LEGACY_PATH = "./normalpocket.html";

function rootRoute() {
  const path = window.location.pathname;
  return path === "/" || path.endsWith("/index.html");
}

async function inspectLegacyDatabase() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    return { canInspectLegacy: false, legacyData: false };
  }

  try {
    const databases = await indexedDB.databases();
    return {
      canInspectLegacy: true,
      legacyData: databases.some(database => database?.name === LEGACY_DB_NAME),
    };
  } catch {
    return { canInspectLegacy: false, legacyData: false };
  }
}

async function routeRoot() {
  if (!rootRoute()) return;

  const params = new URLSearchParams(window.location.search);
  const inspected = await inspectLegacyDatabase();
  const destination = chooseRootDestination({
    ...inspected,
    forceHub: params.get("hub") === "1",
    forceLegacy: params.get("legacy") === "1",
  });

  if (destination === "LEGACY") {
    window.location.replace(LEGACY_PATH);
  }
}

routeRoot();
