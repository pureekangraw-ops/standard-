"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

async function modules() {
  return {
    ...(await import("../src/workflows/command-authority.mjs")),
    ...(await import("../src/workflows/workflow-coordinator.mjs"))
  };
}

test("command authority assigns one initiating owner and explicit effect owners", async () => {
  const { commandContract } = await modules();
  assert.deepEqual(commandContract("STORE_SALE"), {
    initiator: "STORE",
    effects: ["STORE", "FINANCE", "CALENDAR"]
  });
  assert.deepEqual(commandContract("LEDGER_OBLIGATION_ADD"), {
    initiator: "FINANCE",
    effects: ["FINANCE", "CALENDAR"]
  });
  assert.deepEqual(commandContract("CALENDAR_COMPLETE"), {
    initiator: "CALENDAR",
    effects: ["CALENDAR", "STORE", "FINANCE"]
  });
});

test("workflow coordinator rejects a command dispatched through the wrong owner", async () => {
  const { createWorkflowCoordinator } = await modules();
  const coordinator = createWorkflowCoordinator({ execute: (_state, command) => command });
  assert.throws(
    () => coordinator.execute({}, { owner: "FINANCE", type: "STORE_SALE", payload: {} }),
    /STORE/
  );
});

test("workflow coordinator normalizes legacy LEDGER owner to FINANCE at the boundary", async () => {
  const { createWorkflowCoordinator } = await modules();
  const coordinator = createWorkflowCoordinator({ execute: (_state, command) => command });
  const command = coordinator.execute({}, { owner: "LEDGER", type: "LEDGER_OBLIGATION_ADD", payload: {} });
  assert.equal(command.owner, "FINANCE");
});

test("workflow coordinator keeps cross-domain effects explicit instead of granting whole-state ownership", async () => {
  const { createWorkflowCoordinator } = await modules();
  let observed = null;
  const coordinator = createWorkflowCoordinator({
    execute: (_state, command, options) => {
      observed = options.workflow;
      return command;
    }
  });
  coordinator.execute({}, { owner: "STORE", type: "STORE_SALE", payload: {} });
  assert.deepEqual(observed, {
    initiator: "STORE",
    effects: ["STORE", "FINANCE", "CALENDAR"]
  });
});
