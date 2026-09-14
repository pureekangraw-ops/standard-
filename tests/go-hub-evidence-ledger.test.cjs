"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const ledgerUrl = pathToFileURL(path.join(root, "go-hub-evidence-ledger.js")).href;
const taskUrl = pathToFileURL(path.join(root, "go-hub-code-task.js")).href;

test("piece evidence names the claim and exact head it proves", async () => {
  const { createEvidenceEntry } = await import(`${ledgerUrl}?ledger=${Date.now()}`);
  const input = {
    id: "ev-1", scope: "piece", claim: "diff-reviewed", kind: "diff",
    value: "diff-fingerprint-1", repository: "pureekangraw-ops/standard-",
    headSha: "head-1", recordedAt: "2026-09-14T12:00:00.000Z",
  };
  const item = createEvidenceEntry(input);
  input.claim = "mutated";
  assert.equal(item.scope, "piece");
  assert.equal(item.claim, "diff-reviewed");
  assert.equal(item.headSha, "head-1");
  assert.equal(Object.isFrozen(item), true);
});

test("piece evidence fails closed when identity, claim, kind, or head is absent", async () => {
  const { createEvidenceEntry } = await import(`${ledgerUrl}?ledger=${Date.now()}`);
  const valid = { id: "ev-1", scope: "piece", claim: "purpose-correct", kind: "test", headSha: "head-1" };
  for (const field of ["id", "scope", "claim", "kind", "headSha"]) {
    assert.throws(() => createEvidenceEntry({ ...valid, [field]: "" }), new RegExp(field));
  }
});

test("ledger appends immutably, rejects duplicate IDs, and CodeTask audits evidence", async () => {
  const { appendEvidence } = await import(`${ledgerUrl}?ledger=${Date.now()}`);
  const entry = { id: "ev-1", scope: "piece", claim: "purpose-correct", kind: "test", headSha: "head-1" };
  const original = [];
  const ledger = appendEvidence(original, entry);
  assert.deepEqual(original, []);
  assert.equal(ledger[0].id, "ev-1");
  assert.throws(() => appendEvidence(ledger, entry), /duplicate evidence id/);

  const { createCodeTask } = await import(`${taskUrl}?task=${Date.now()}`);
  const task = createCodeTask({ id: "evidence-task" }).addEvidence(entry);
  assert.equal(task.evidence[0].claim, "purpose-correct");
  assert.deepEqual(task.audit.at(-1), {
    at: task.audit.at(-1).at,
    event: "EVIDENCE_RECORDED",
    evidenceId: "ev-1",
    claim: "purpose-correct",
    headSha: "head-1",
  });
});
