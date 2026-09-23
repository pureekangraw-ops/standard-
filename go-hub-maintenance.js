import { planCloseout } from "./go-hub-housekeeper.js";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const ACTIONS = Object.freeze(["inspect", "plan_closeout"]);

export function createMaintenanceService() {
  return Object.freeze({
    maintenance(input = {}) {
      const target = String(input.target || "").trim().toLowerCase();
      const action = String(input.action || "").trim().toLowerCase();

      if (target !== "factory") {
        return json({ code: "MAINTENANCE_TARGET_UNAVAILABLE", target }, 404);
      }

      if (action === "inspect") {
        return json({
          status: "MAINTENANCE_READY",
          target: "factory",
          authority: "HEALTH_CLASSIFICATION_ROUTE_ONLY",
          actions: ACTIONS,
          mutates: false,
          nextRoute: "destination://factory",
        });
      }

      if (action === "plan_closeout") {
        try {
          return json({
            status: "MAINTENANCE_PLAN_READY",
            authority: "HEALTH_CLASSIFICATION_ROUTE_ONLY",
            delegatedAuthority: "factory",
            nextRoute: "destination://factory",
            plan: planCloseout(input.input || {}),
            mutates: false,
          });
        } catch (error) {
          return json({ code: "MAINTENANCE_PLAN_REFUSED", message: error?.message || "plan refused" }, 409);
        }
      }

      return json({ code: "MAINTENANCE_ACTION_UNAVAILABLE", target: "factory", action }, 400);
    },
  });
}
