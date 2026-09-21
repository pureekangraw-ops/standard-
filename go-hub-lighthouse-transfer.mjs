export const LIGHTHOUSE_TRANSFER_CONTRACT = "lighthouse-transfer-v1";
export const LIGHTHOUSE_TRANSFER_CATALOG_SOURCE = Object.freeze({
  repository:"pureekangraw-ops/ygph-metropolis",
  path:"lighthouse-next/control-port/capability-registry.mjs",
  sha:"8ce80fc4db5820a03f45ed3bbeb7d2ab36ea363c",
});

const RAW_CAPABILITIES = [
  { id:"system.health", readable:true, editable:false, owner:"CONTROL_PORT", action:null, confirmationRequired:false, readback:"health", derived:true },
  { id:"system.appState", readable:true, editable:false, owner:"CONTROL_PORT", action:null, confirmationRequired:false, readback:"query.appState", derived:true },
  { id:"system.commandPack", readable:false, editable:true, owner:"CONTROL_PORT", action:"commitCommandPack", confirmationRequired:true, readback:"perItemReadback", derived:false },
  { id:"centreBoard.read", readable:true, editable:false, owner:"LIGHTHOUSE:CENTRE_BOARD", action:null, confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"centreBoard.initialize", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"initializeBoard", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"centreBoard.pin.create", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"createPin", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"centreBoard.claim", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"claimPins", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"centreBoard.return", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"returnPins", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"centreBoard.recover", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"recoverEmergency", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"board.read", readable:true, editable:false, owner:"LIGHTHOUSE:CENTRE_BOARD", action:null, confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"board.initialize", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"initializeBoard", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"pin.create", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"createPin", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"board.claim", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"claimPins", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"board.return", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"returnPins", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"board.recover", readable:false, editable:true, owner:"LIGHTHOUSE:CENTRE_BOARD", action:"recoverEmergency", confirmationRequired:false, readback:"readBoard", derived:false },
  { id:"finance.balance", readable:true, editable:false, owner:"GREENFIELD:LEDGER", action:null, confirmationRequired:false, readback:"readLedgerTruth.balanceSatang", derived:true },
  { id:"finance.todayIn", readable:true, editable:false, owner:"GREENFIELD:LEDGER", action:null, confirmationRequired:false, readback:"readLedgerTruth.todayInSatang", derived:true },
  { id:"finance.todayOut", readable:true, editable:false, owner:"GREENFIELD:LEDGER", action:null, confirmationRequired:false, readback:"readLedgerTruth.todayOutSatang", derived:true },
  { id:"finance.net", readable:true, editable:false, owner:"GREENFIELD:LEDGER", action:null, confirmationRequired:false, readback:"readLedgerTruth.netSatang", derived:true },
  { id:"finance.transactions", readable:true, editable:false, owner:"GREENFIELD:LEDGER", action:null, confirmationRequired:false, readback:"readLedgerTruth.transactions", derived:false },
  { id:"finance.dailyGoal", readable:true, editable:true, owner:"GREENFIELD:META", action:"setDailyGoal", confirmationRequired:false, readback:"readPlanningTruth.goalSatang", derived:false },
  { id:"finance.income.create", readable:false, editable:true, owner:"GREENFIELD:LEDGER", action:"recordOtherIncome", confirmationRequired:true, readback:"readLedgerTruth.transactions", derived:false },
  { id:"finance.expense.create", readable:false, editable:true, owner:"GREENFIELD:LEDGER", action:"recordExpense", confirmationRequired:true, readback:"readLedgerTruth.transactions", derived:false },
  { id:"finance.obligations", readable:true, editable:false, owner:"GREENFIELD:LEDGER", action:null, confirmationRequired:false, readback:"readLedgerTruth.obligations", derived:false },
  { id:"finance.obligation.create", readable:false, editable:true, owner:"GREENFIELD:LEDGER", action:"createObligation", confirmationRequired:true, readback:"readLedgerTruth.obligations", derived:false },
  { id:"finance.obligation.dueDate", readable:true, editable:true, owner:"GREENFIELD:CALENDAR", action:"rescheduleCalendar", confirmationRequired:true, readback:"readCalendarTruth.records", derived:false },
  { id:"finance.obligation.payment", readable:false, editable:true, owner:"GREENFIELD:LEDGER", action:"payObligation", confirmationRequired:true, readback:"readLedgerTruth.obligations", derived:false },
  { id:"finance.receivables", readable:true, editable:false, owner:"GREENFIELD:STORE", action:null, confirmationRequired:false, readback:"readIncomeTruth.receivables", derived:true },
  { id:"finance.receivable.payment", readable:false, editable:true, owner:"GREENFIELD:STORE", action:"receiveReceivablePayment", confirmationRequired:true, readback:"readIncomeTruth.receivables", derived:false },
  { id:"calendar.records", readable:true, editable:false, owner:"GREENFIELD:CALENDAR", action:null, confirmationRequired:false, readback:"readCalendarTruth.records", derived:false },
  { id:"calendar.status", readable:true, editable:true, owner:"GREENFIELD:CALENDAR", action:"setCalendarStatus", confirmationRequired:true, readback:"readCalendarTruth.records", derived:false },
  { id:"store.products", readable:true, editable:false, owner:"GREENFIELD:STORE", action:null, confirmationRequired:false, readback:"readStoreTruth.products", derived:false },
  { id:"store.product.create", readable:false, editable:true, owner:"GREENFIELD:STORE", action:"createProductWithStock", confirmationRequired:true, readback:"readStoreTruth.products", derived:false },
  { id:"store.stock.add", readable:false, editable:true, owner:"GREENFIELD:STORE", action:"addProductStock", confirmationRequired:true, readback:"readStoreTruth.products", derived:false },
  { id:"ride.summary", readable:true, editable:false, owner:"GREENFIELD:RIDE", action:null, confirmationRequired:false, readback:"readRideTruth", derived:true },
  { id:"security.pin", readable:false, editable:false, owner:"DEVICE_SECURITY", action:null, confirmationRequired:true, readback:null, derived:false },
  { id:"security.recoveryCode", readable:false, editable:false, owner:"DEVICE_SECURITY", action:null, confirmationRequired:true, readback:null, derived:false },
  { id:"security.vault", readable:false, editable:false, owner:"DEVICE_SECURITY", action:null, confirmationRequired:true, readback:null, derived:false },
];

const PAYLOAD_TEMPLATES = Object.freeze({
  "system.commandPack":{ title:"", commands:[{ requestId:"", capabilityId:"finance.expense.create", payload:{ title:"", amountBaht:0 } }] },
  "centreBoard.initialize":{ boardId:"", workId:"" },
  "centreBoard.pin.create":{ workId:"", expectedRevision:0, pinId:"", title:"", detail:"", evidence:[], links:[], nextAction:"" },
  "centreBoard.claim":{ workId:"", employeeId:"", pinIds:[], expectedRevision:0 },
  "centreBoard.return":{ workId:"", employeeId:"", expectedRevision:0, updates:[] },
  "centreBoard.recover":{ capsuleId:"", capsule:{} },
  "board.initialize":{ boardId:"", workId:"" },
  "pin.create":{ workId:"", expectedRevision:0, pinId:"", title:"", detail:"", evidence:[], links:[], nextAction:"" },
  "board.claim":{ workId:"", employeeId:"", pinIds:[], expectedRevision:0 },
  "board.return":{ workId:"", employeeId:"", expectedRevision:0, updates:[] },
  "board.recover":{ capsuleId:"", capsule:{} },
  "finance.dailyGoal":{ goalBaht:0 },
  "finance.income.create":{ source:"", amountBaht:0 },
  "finance.expense.create":{ title:"", amountBaht:0 },
  "finance.obligation.create":{ obligationId:"", queueId:"", title:"", amountBaht:0, dueDate:"YYYY-MM-DD", detail:"" },
  "finance.obligation.dueDate":{ queueId:"", dueDate:"YYYY-MM-DD" },
  "finance.obligation.payment":{ obligationId:"", queueId:"", amountBaht:0 },
  "finance.receivable.payment":{ saleId:"", queueId:"", amountBaht:0 },
  "calendar.status":{ queueId:"", status:"" },
  "store.product.create":{ productId:"", name:"", model:"", color:"", descriptors:[], quantity:0 },
  "store.stock.add":{ productId:"", title:"", quantity:0 },
});

export const LIGHTHOUSE_TRANSFER_CAPABILITIES = Object.freeze(
  RAW_CAPABILITIES.map(item => Object.freeze({
    ...item,
    payloadTemplate:Object.freeze(structuredClone(PAYLOAD_TEMPLATES[item.id] || {})),
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
