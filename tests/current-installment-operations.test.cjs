"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const loadCurrent = () => import(pathToFileURL(path.join(root, "src/finance/installment-operations.mjs")).href);

function fixture() {
  return {
    obligation: {
      id: "OBL-1",
      scheduleMode: "PER_INSTALLMENT",
      scheduleFrequency: "MONTHLY",
      installmentAmountSatang: 10000,
      installmentCount: 3,
      firstDue: "2026-01-31",
      originalSatang: 30000,
      paidSatang: 2000,
      remainingSatang: 28000,
      status: "PARTIAL",
      installments: [
        { number: 1, amountSatang: 10000, paidSatang: 2000, due: "2026-01-31", status: "PARTIAL", queueId: "Q1" },
        { number: 2, amountSatang: 10000, paidSatang: 0, due: "2026-02-28", status: "PENDING", queueId: "Q2" },
        { number: 3, amountSatang: 10000, paidSatang: 0, due: "2026-03-31", status: "PENDING", queueId: "Q3" }
      ]
    },
    queues: [
      { id: "Q1", status: "PARTIAL", amountSatang: 10000, paidSatang: 2000, due: "2026-01-31" },
      { id: "Q2", status: "OPEN", amountSatang: 10000, paidSatang: 0, due: "2026-02-28" },
      { id: "Q3", status: "OPEN", amountSatang: 10000, paidSatang: 0, due: "2026-03-31" }
    ]
  };
}

test("recompute obligation derives money truth from installments without mutating input", async () => {
  const { recomputeObligation } = await loadCurrent();
  const { obligation } = fixture();
  const before = structuredClone(obligation);
  obligation.installments[2].amountSatang = 12000;
  const next = recomputeObligation(obligation);
  assert.equal(next.originalSatang, 32000);
  assert.equal(next.paidSatang, 2000);
  assert.equal(next.remainingSatang, 30000);
  assert.equal(next.status, "PARTIAL");
  assert.equal(before.originalSatang, 30000);
});

test("editing future installments changes only open future schedule and recomputes totals", async () => {
  const { editInstallmentSchedule } = await loadCurrent();
  const input = fixture();
  const before = structuredClone(input);
  const result = editInstallmentSchedule({ ...input, queueId: "Q2", scope: "EDIT_FUTURE", amountSatang: 12000, due: "2026-03-05", frequency: "MONTHLY" });
  assert.equal(result.obligation.installments[0].amountSatang, 10000);
  assert.equal(result.obligation.installments[1].amountSatang, 12000);
  assert.equal(result.obligation.installments[1].due, "2026-03-05");
  assert.equal(result.obligation.installments[2].due, "2026-04-05");
  assert.equal(result.obligation.originalSatang, 34000);
  assert.equal(result.obligation.remainingSatang, 32000);
  assert.equal(result.queues.find(item => item.id === "Q3").amountSatang, 12000);
  assert.deepEqual(input, before);
});

test("editing one installment rejects an amount below money already paid", async () => {
  const { editInstallmentSchedule } = await loadCurrent();
  const input = fixture();
  assert.throws(() => editInstallmentSchedule({ ...input, queueId: "Q1", scope: "EDIT_THIS", amountSatang: 1000, due: "2026-02-01", frequency: "MONTHLY" }), /ต่ำกว่ายอดที่จ่ายแล้ว/);
});

test("skipping an interval shifts selected and future open installments without changing debt total", async () => {
  const { skipInstallmentInterval } = await loadCurrent();
  const input = fixture();
  const result = skipInstallmentInterval({ ...input, queueId: "Q2" });
  assert.equal(result.obligation.installments[0].due, "2026-01-31");
  assert.equal(result.obligation.installments[1].due, "2026-03-28");
  assert.equal(result.obligation.installments[2].due, "2026-04-30");
  assert.equal(result.obligation.originalSatang, 30000);
  assert.equal(result.obligation.remainingSatang, 28000);
});
