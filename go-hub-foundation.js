export function createHubController({
  state,
  applyCommand,
  commitState,
  onChange = () => {},
}) {
  if (typeof applyCommand !== 'function') throw new TypeError('applyCommand port is required');
  if (typeof commitState !== 'function') throw new TypeError('commitState port is required');

  let currentState = structuredClone(state);
  let busy = false;

  return {
    getState() {
      return structuredClone(currentState);
    },

    isBusy() {
      return busy;
    },

    async dispatch(command) {
      if (busy) throw new Error('Hub is committing; wait for the current action');
      if (!command?.type) throw new Error('command.type is required');

      busy = true;
      try {
        const proposed = await applyCommand(structuredClone(currentState), structuredClone(command));
        const receipt = await commitState({
          current: structuredClone(currentState),
          proposed: structuredClone(proposed),
          command: structuredClone(command),
        });
        currentState = structuredClone(proposed);
        onChange(structuredClone(currentState), receipt);
        return receipt;
      } finally {
        busy = false;
      }
    },
  };
}
