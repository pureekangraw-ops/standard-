import { assertCommandOwner, commandContract } from "./command-authority.mjs";

export function createWorkflowCoordinator({ execute } = {}) {
  if (typeof execute !== "function") throw new Error("Workflow coordinator requires execute");
  return Object.freeze({
    execute(state, command, options = {}) {
      const normalized = assertCommandOwner(command);
      const workflow = commandContract(normalized.type);
      return execute(state, normalized, { ...options, workflow });
    }
  });
}
