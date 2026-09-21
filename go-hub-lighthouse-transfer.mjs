export const LIGHTHOUSE_TRANSFER_CONTRACT = "lighthouse-transfer-v1";

const RAW_CAPABILITIES = [
  {
    "id": "system.health",
    "readable": true,
    "editable": false,
    "owner": "CONTROL_PORT",
    "action": null,
    "confirmationRequired": false,
    "readback": "health",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "system.appState",
    "readable": true,
    "editable": false,
    "owner": "CONTROL_PORT",
    "action": null,
    "confirmationRequired": false,
    "readback": "query.appState",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "system.commandPack",
    "readable": false,
    "editable": true,
    "owner": "CONTROL_PORT",
    "action": "commitCommandPack",
    "confirmationRequired": true,
    "readback": "perItemReadback",
    "derived": false,
    "payloadTemplate": {
      "title": "",
      "commands": [
        {
          "requestId": "",
          "capabilityId": "finance.expense.create",
          "payload": {
            "title": "",
            "amountBaht": 0
          }
        }
      ]
    }
  },
  {
    "id": "centreBoard.read",
    "readable": true,
    "editable": false,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": null,
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "centreBoard.initialize",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "initializeBoard",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "boardId": "",
      "workId": ""
    }
  },
  {
    "id": "centreBoard.pin.create",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "createPin",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "workId": "",
      "expectedRevision": 0,
      "pinId": "",
      "title": "",
      "detail": "",
      "evidence": [],
      "links": [],
      "nextAction": ""
    }
  },
  {
    "id": "centreBoard.claim",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "claimPins",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "workId": "",
      "employeeId": "",
      "pinIds": [],
      "expectedRevision": 0
    }
  },
  {
    "id": "centreBoard.return",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "returnPins",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "workId": "",
      "employeeId": "",
      "expectedRevision": 0,
      "updates": []
    }
  },
  {
    "id": "centreBoard.recover",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "recoverEmergency",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "capsuleId": "",
      "capsule": {}
    }
  },
  {
    "id": "board.read",
    "readable": true,
    "editable": false,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": null,
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "board.initialize",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "initializeBoard",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "boardId": "",
      "workId": ""
    }
  },
  {
    "id": "pin.create",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "createPin",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "workId": "",
      "expectedRevision": 0,
      "pinId": "",
      "title": "",
      "detail": "",
      "evidence": [],
      "links": [],
      "nextAction": ""
    }
  },
  {
    "id": "board.claim",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "claimPins",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "workId": "",
      "employeeId": "",
      "pinIds": [],
      "expectedRevision": 0
    }
  },
  {
    "id": "board.return",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "returnPins",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "workId": "",
      "employeeId": "",
      "expectedRevision": 0,
      "updates": []
    }
  },
  {
    "id": "board.recover",
    "readable": false,
    "editable": true,
    "owner": "LIGHTHOUSE:CENTRE_BOARD",
    "action": "recoverEmergency",
    "confirmationRequired": false,
    "readback": "readBoard",
    "derived": false,
    "payloadTemplate": {
      "capsuleId": "",
      "capsule": {}
    }
  },
  {
    "id": "finance.balance",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:LEDGER",
    "action": null,
    "confirmationRequired": false,
    "readback": "readLedgerTruth.balanceSatang",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "finance.todayIn",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:LEDGER",
    "action": null,
    "confirmationRequired": false,
    "readback": "readLedgerTruth.todayInSatang",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "finance.todayOut",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:LEDGER",
    "action": null,
    "confirmationRequired": false,
    "readback": "readLedgerTruth.todayOutSatang",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "finance.net",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:LEDGER",
    "action": null,
    "confirmationRequired": false,
    "readback": "readLedgerTruth.netSatang",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "finance.transactions",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:LEDGER",
    "action": null,
    "confirmationRequired": false,
    "readback": "readLedgerTruth.transactions",
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "finance.dailyGoal",
    "readable": true,
    "editable": true,
    "owner": "GREENFIELD:META",
    "action": "setDailyGoal",
    "confirmationRequired": false,
    "readback": "readPlanningTruth.goalSatang",
    "derived": false,
    "payloadTemplate": {
      "goalBaht": 0
    }
  },
  {
    "id": "finance.income.create",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:LEDGER",
    "action": "recordOtherIncome",
    "confirmationRequired": true,
    "readback": "readLedgerTruth.transactions",
    "derived": false,
    "payloadTemplate": {
      "source": "",
      "amountBaht": 0
    }
  },
  {
    "id": "finance.expense.create",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:LEDGER",
    "action": "recordExpense",
    "confirmationRequired": true,
    "readback": "readLedgerTruth.transactions",
    "derived": false,
    "payloadTemplate": {
      "title": "",
      "amountBaht": 0
    }
  },
  {
    "id": "finance.obligations",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:LEDGER",
    "action": null,
    "confirmationRequired": false,
    "readback": "readLedgerTruth.obligations",
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "finance.obligation.create",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:LEDGER",
    "action": "createObligation",
    "confirmationRequired": true,
    "readback": "readLedgerTruth.obligations",
    "derived": false,
    "payloadTemplate": {
      "obligationId": "",
      "queueId": "",
      "title": "",
      "amountBaht": 0,
      "dueDate": "YYYY-MM-DD",
      "detail": ""
    }
  },
  {
    "id": "finance.obligation.dueDate",
    "readable": true,
    "editable": true,
    "owner": "GREENFIELD:CALENDAR",
    "action": "rescheduleCalendar",
    "confirmationRequired": true,
    "readback": "readCalendarTruth.records",
    "derived": false,
    "payloadTemplate": {
      "queueId": "",
      "dueDate": "YYYY-MM-DD"
    }
  },
  {
    "id": "finance.obligation.payment",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:LEDGER",
    "action": "payObligation",
    "confirmationRequired": true,
    "readback": "readLedgerTruth.obligations",
    "derived": false,
    "payloadTemplate": {
      "obligationId": "",
      "queueId": "",
      "amountBaht": 0
    }
  },
  {
    "id": "finance.receivables",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:STORE",
    "action": null,
    "confirmationRequired": false,
    "readback": "readIncomeTruth.receivables",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "finance.receivable.payment",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:STORE",
    "action": "receiveReceivablePayment",
    "confirmationRequired": true,
    "readback": "readIncomeTruth.receivables",
    "derived": false,
    "payloadTemplate": {
      "saleId": "",
      "queueId": "",
      "amountBaht": 0
    }
  },
  {
    "id": "calendar.records",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:CALENDAR",
    "action": null,
    "confirmationRequired": false,
    "readback": "readCalendarTruth.records",
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "calendar.status",
    "readable": true,
    "editable": true,
    "owner": "GREENFIELD:CALENDAR",
    "action": "setCalendarStatus",
    "confirmationRequired": true,
    "readback": "readCalendarTruth.records",
    "derived": false,
    "payloadTemplate": {
      "queueId": "",
      "status": ""
    }
  },
  {
    "id": "store.products",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:STORE",
    "action": null,
    "confirmationRequired": false,
    "readback": "readStoreTruth.products",
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "store.product.create",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:STORE",
    "action": "createProductWithStock",
    "confirmationRequired": true,
    "readback": "readStoreTruth.products",
    "derived": false,
    "payloadTemplate": {
      "productId": "",
      "name": "",
      "model": "",
      "color": "",
      "descriptors": [],
      "quantity": 0
    }
  },
  {
    "id": "store.stock.add",
    "readable": false,
    "editable": true,
    "owner": "GREENFIELD:STORE",
    "action": "addProductStock",
    "confirmationRequired": true,
    "readback": "readStoreTruth.products",
    "derived": false,
    "payloadTemplate": {
      "productId": "",
      "title": "",
      "quantity": 0
    }
  },
  {
    "id": "ride.summary",
    "readable": true,
    "editable": false,
    "owner": "GREENFIELD:RIDE",
    "action": null,
    "confirmationRequired": false,
    "readback": "readRideTruth",
    "derived": true,
    "payloadTemplate": {}
  },
  {
    "id": "security.pin",
    "readable": false,
    "editable": false,
    "owner": "DEVICE_SECURITY",
    "action": null,
    "confirmationRequired": true,
    "readback": null,
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "security.recoveryCode",
    "readable": false,
    "editable": false,
    "owner": "DEVICE_SECURITY",
    "action": null,
    "confirmationRequired": true,
    "readback": null,
    "derived": false,
    "payloadTemplate": {}
  },
  {
    "id": "security.vault",
    "readable": false,
    "editable": false,
    "owner": "DEVICE_SECURITY",
    "action": null,
    "confirmationRequired": true,
    "readback": null,
    "derived": false,
    "payloadTemplate": {}
  }
];

export const LIGHTHOUSE_TRANSFER_CAPABILITIES = Object.freeze(
  RAW_CAPABILITIES.map(item => Object.freeze({
    ...item,
    payloadTemplate:Object.freeze(structuredClone(item.payloadTemplate || {})),
  }))
);

const BY_ID = new Map(LIGHTHOUSE_TRANSFER_CAPABILITIES.map(item => [item.id, item]));

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function requestId(value) {
  const id = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_REQUEST_ID_INVALID"), { status:400 });
  }
  return id;
}

function payload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_PAYLOAD_INVALID"), { status:400 });
  }
  return clone(value);
}

export function getLighthouseTransferCapability(id) {
  return BY_ID.get(clean(id)) || null;
}

export function listLighthouseTransferCapabilities() {
  return LIGHTHOUSE_TRANSFER_CAPABILITIES.map(clone);
}

export function createLighthouseTransferEnvelope({ requestId:rid, capabilityId, payload:input = {} } = {}) {
  const capability = getLighthouseTransferCapability(capabilityId);
  if (!capability) throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_CAPABILITY_UNKNOWN"), { status:400 });
  if (capability.editable !== true) {
    throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_CAPABILITY_NOT_WRITABLE"), { status:400 });
  }
  return Object.freeze({
    contract:LIGHTHOUSE_TRANSFER_CONTRACT,
    targetId:"lighthouse",
    requestId:requestId(rid),
    capabilityId:capability.id,
    route:Object.freeze({
      owner:capability.owner,
      action:capability.action,
      readback:capability.readback,
      confirmationRequired:capability.confirmationRequired,
    }),
    payload:payload(input),
  });
}

export function normalizeLighthouseTransferEnvelope(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_ENVELOPE_INVALID"), { status:400 });
  }
  if (clean(input.contract) !== LIGHTHOUSE_TRANSFER_CONTRACT) {
    throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_CONTRACT_INVALID"), { status:400 });
  }
  if (clean(input.targetId).toLowerCase() !== "lighthouse") {
    throw Object.assign(new Error("LIGHTHOUSE_TRANSFER_TARGET_INVALID"), { status:400 });
  }
  return createLighthouseTransferEnvelope({
    requestId:input.requestId,
    capabilityId:input.capabilityId,
    payload:input.payload,
  });
}
