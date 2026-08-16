"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function loadOps() {
  return import(pathToFileURL(path.resolve(__dirname, "../src/finance/installment-operations.mjs")).href + `?t=${Date.now()}`);
}

function fixture() {
  return {
    obligation: {
      id: "OBL-1", scheduleMode: "PER_INSTALLMENT", scheduleFrequency: "MONTHLY",
      installmentCount: 2, originalSatang: 2000, paidSatang: 500, remainingSatang: 1500,
      firstDue: "2026-08-31", status: "PARTIAL",
      installments: [
        { number: 1, amountSatang: 1000, paidSatang: 500, due: "2026-08-31", status: "PARTIAL", queueId: "Q1" },
        { number: 2, amountSatang: 1000, paidSatang: 0, due: "2026-09-30", status: "PENDING", queueId: "Q2" }
      ]
    },
    queues: [
      { id: "Q1", source: "LEDGER", sourceId: "OBL-1", installmentNumber: 1, amountSatang: 1000, paidSatang: 500, due: "2026-08-31", status: "PARTIAL" },
      { id: "Q2", source: "LEDGER", sourceId: "OBL-1", installmentNumber: 2, amountSatang: 1000, paidSatang: 0, due: "2026-09-30", status: "OPEN" }
    ]
  };
}

test("early settlement closes active installments and emits finance transaction intents without mutating input", async () => {
  const { settleInstallmentsEarly } = await loadOps();
  assert.equal(typeof settleInstallmentsEarly, "function");
  const input = fixture();
  const before = structuredClone(input);
  const result = settleInstallmentsEarly(input);
  assert.deepEqual(input, before);
  assert.equal(result.obligation.status, "COMPLETED");
  assert.equal(result.obligation.remainingSatang, 0);
  assert.deepEqual(result.transactions.map(tx => tx.amountSatang), [500, 1000]);
  assert.ok(result.transactions.every(tx => tx.owner === "FINANCE" && tx.direction === "OUT"));
  assert.ok(result.queues.every(queue => queue.status === "COMPLETED"));
});

test("reconciliation repairs missing installment queue as a calendar effect without directly persisting", async () => {
  const { reconcileInstallmentSchedule } = await loadOps();
  assert.equal(typeof reconcileInstallmentSchedule, "function");
  const obligation = {
    id: "OBL-2", scheduleMode: "PER_INSTALLMENT", scheduleFrequency: "MONTHLY", installmentCount: 2,
    installmentAmountSatang: 750, firstDue: "2026-01-31", status: "OPEN",
    installments: [{ number: 1, amountSatang: 750, paidSatang: 0, due: "2026-01-31", status: "PENDING", queueId: "Q10" }]
  };
  const queues = [{ id: "Q10", source: "LEDGER", sourceId: "OBL-2", installmentNumber: 1, amountSatang: 750, due: "2026-01-31", status: "OPEN" }];
  const before = structuredClone({ obligation, queues });
  const result = reconcileInstallmentSchedule({ obligation, queues, idFactory: () => "Q11" });
  assert.deepEqual({ obligation, queues }, before);
  assert.equal(result.obligation.installments.length, 2);
  assert.equal(result.queues.length, 2);
  assert.equal(result.calendarEffects.length, 1);
  assert.equal(result.calendarEffects[0].owner, "CALENDAR");
  assert.equal(result.calendarEffects[0].type, "UPSERT_INSTALLMENT_QUEUE");
});
