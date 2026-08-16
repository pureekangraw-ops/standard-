const CONTRACTS = Object.freeze({
  STORE_PURCHASE: Object.freeze({ initiator: "STORE", effects: Object.freeze(["STORE", "FINANCE"]) }),
  STORE_SALE: Object.freeze({ initiator: "STORE", effects: Object.freeze(["STORE", "FINANCE", "CALENDAR"]) }),
  STORE_WITHDRAW: Object.freeze({ initiator: "STORE", effects: Object.freeze(["STORE"]) }),
  LEDGER_OBLIGATION_ADD: Object.freeze({ initiator: "FINANCE", effects: Object.freeze(["FINANCE", "CALENDAR"]) }),
  CALENDAR_COMPLETE: Object.freeze({ initiator: "CALENDAR", effects: Object.freeze(["CALENDAR", "STORE", "FINANCE"]) }),
  CALENDAR_CANCEL: Object.freeze({ initiator: "CALENDAR", effects: Object.freeze(["CALENDAR"]) }),
  TRANSACTION_REVERSE: Object.freeze({ initiator: "FINANCE", effects: Object.freeze(["FINANCE"]) })
});

export function normalizeOwner(owner) {
  return owner === "LEDGER" ? "FINANCE" : owner;
}

export function commandContract(type) {
  const contract = CONTRACTS[type];
  if (!contract) throw new Error(`ไม่มี workflow authority สำหรับ ${type}`);
  return { initiator: contract.initiator, effects: [...contract.effects] };
}

export function assertCommandOwner(command) {
  const contract = commandContract(command?.type);
  const owner = normalizeOwner(command?.owner);
  if (owner !== contract.initiator) {
    throw new Error(`${command?.type || "UNKNOWN"} ต้อง dispatch ผ่าน ${contract.initiator} authority`);
  }
  return { ...command, owner };
}
