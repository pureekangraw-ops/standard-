import { applyCommand } from './domain.js';
import { commitState } from './vault.js';
import { createWorkflowCoordinator } from './src/workflows/workflow-coordinator.mjs';

const LEGACY_OWNER_BY_COMMAND = Object.freeze({
  STORE_PURCHASE: 'STORE',
  STORE_SALE: 'STORE',
  STORE_WITHDRAW: 'STORE',
  LEDGER_OBLIGATION_ADD: 'FINANCE',
  CALENDAR_COMPLETE: 'CALENDAR',
  CALENDAR_CANCEL: 'CALENDAR',
  TRANSACTION_REVERSE: 'FINANCE',
});

function legacyOwnerFor(type) {
  return LEGACY_OWNER_BY_COMMAND[type];
}

export function createAppController({
  store,
  state,
  onChange = () => {},
  commandOptions = {},
}) {
  let currentState = structuredClone(state);
  let busy = false;
  const coordinator = createWorkflowCoordinator({ execute: applyCommand });

  return {
    getState() {
      return structuredClone(currentState);
    },

    isBusy() {
      return busy;
    },

    async dispatch(command) {
      if (busy) throw new Error('ระบบกำลังบันทึก กรุณารอสักครู่');
      busy = true;
      try {
        const authorizedCommand = {
          ...command,
          owner: command.owner || legacyOwnerFor(command.type),
        };
        const proposed = coordinator.execute(currentState, authorizedCommand, commandOptions);
        const receipt = await commitState({
          store,
          proposed,
          action: command.type,
        });
        currentState = proposed;
        onChange(structuredClone(currentState), receipt);
        return receipt;
      } finally {
        busy = false;
      }
    },
  };
}
