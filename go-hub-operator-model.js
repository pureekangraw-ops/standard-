import { resolveEffectiveTaskAuthority } from "./go-hub-factory-authority.js";
import { resolveWorkInterruption } from "./go-hub-work-lifecycle.js";

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function interruptionFor(snapshot = {}) {
  const state = String(snapshot.state || "").toUpperCase();
  const factoryStage = String(snapshot.factoryStage || "").toUpperCase();
  if (factoryStage === "RECOVERY_REQUIRED") {
    return resolveWorkInterruption({ requested: "RECOVERY_REQUIRED", realityExists: true });
  }
  if (state === "VERIFY_FAILED") {
    return resolveWorkInterruption({ requested: "VERIFY_FAILED", realityExists: true });
  }
  if (state === "BLOCKED") {
    return resolveWorkInterruption({ requested: "BLOCKED" });
  }
  return null;
}

export function createOperatorView(taskSnapshot = {}) {
  const authority = resolveEffectiveTaskAuthority(taskSnapshot);
  const pullRequest = taskSnapshot.pullRequest || null;
  const ci = taskSnapshot.ci || null;
  const deployment = taskSnapshot.deployment || taskSnapshot.publication?.deployment || null;
  const verification = taskSnapshot.verification || taskSnapshot.verificationScan || null;
  return Object.freeze({
    state: text(authority.status) || text(taskSnapshot.factoryStage) || text(taskSnapshot.state) || "UNKNOWN",
    repository: text(taskSnapshot.repository),
    base: text(taskSnapshot.baseSha) || text(taskSnapshot.baseBranch),
    workBranch: text(taskSnapshot.workBranch) || text(taskSnapshot.assembly?.integrationBranch),
    head: text(taskSnapshot.headSha) || text(taskSnapshot.assembly?.integrationHeadSha),
    pullRequest: pullRequest?.number ? `#${pullRequest.number}` : null,
    ci: text(ci?.status),
    deploy: text(deployment?.status),
    verification: text(verification?.status),
    blocker: text(taskSnapshot.blocker),
    next: text(authority.nextAction),
    interruption: interruptionFor(taskSnapshot),
    readOnly: true,
  });
}
