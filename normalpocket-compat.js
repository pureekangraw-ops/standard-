import { applyCommand as applyNormalPocketCommand } from './domain.js';
import { commitState as commitNormalPocketState } from './vault.js';

/**
 * Legacy NormalPocket adapter for the neutral GO Hub controller.
 *
 * This is intentionally the only boundary that knows both the Hub port shape
 * and NormalPocket's domain/persistence implementation. New Hub code must not
 * import domain.js or vault.js directly.
 */
export function createNormalPocketPorts({ store, commandOptions = {} } = {}) {
  if (!store) throw new TypeError('NormalPocket store is required');

  return {
    applyCommand(state, command) {
      return applyNormalPocketCommand(state, command, commandOptions);
    },

    commitState({ proposed, command }) {
      return commitNormalPocketState({
        store,
        proposed,
        action: command?.type || 'UNKNOWN',
      });
    },
  };
}
