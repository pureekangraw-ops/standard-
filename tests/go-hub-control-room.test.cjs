const test = require("node:test");
const assert = require("node:assert/strict");

async function mod() { return import("../go-hub-control-room.js"); }

test("Control Room reports Centre ACTIVE versus Project IDLE as a conflict", async () => {
  const { compareCentreProjectStatus } = await mod();
  const result = compareCentreProjectStatus({ centreStatus: "ON PROCESS", projectStatus: "IDLE" });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.reason, "CENTRE_ACTIVE_PROJECT_IDLE");
});

test("Control Room classifies smoke residue without overwriting Board truth", async () => {
  const { classifyBoardResidue } = await mod();
  const result = classifyBoardResidue({ smokeResidue: true, updatedAt: "2026-09-20T00:00:00.000Z", evidenceRef: "board://550" }, { now: Date.parse("2026-09-25T00:00:00.000Z") });
  assert.equal(result.status, "STALE");
  assert.equal(result.classification, "STALE_PROJECTION_RESIDUE");
  assert.equal(result.evidenceRef, "board://550");
});

test("Control Room preserves UNKNOWN when GitHub to Cloudflare exact provenance is absent", async () => {
  const { proveDeploymentProvenance } = await mod();
  const result = proveDeploymentProvenance({ githubSha: "abc123", cloudflareDeployment: { id: "dep-1" } });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.reason, "EXACT_SHA_LINKAGE_UNAVAILABLE");
});

test("Control Room proves exact deployment provenance only on an exact SHA match", async () => {
  const { proveDeploymentProvenance } = await mod();
  assert.equal(proveDeploymentProvenance({ githubSha: "abc123", cloudflareSha: "abc123" }).status, "VERIFIED");
  assert.equal(proveDeploymentProvenance({ githubSha: "abc123", cloudflareSha: "def456" }).status, "MISMATCH");
});

test("GO Control Room is GO-only and exposes only available controls", async () => {
  const { createGoControlRoom } = await mod();
  const work = { workId: "W-1", checkpointId: "CP-1", status: "ON PROCESS", holder: "GO", pass: { state: "ACTIVE" } };
  const room = createGoControlRoom({ work, actor: "GO", capabilities: [
    { id: "read-board", available: true },
    { id: "deploy", available: false },
  ] });
  assert.equal(room.room, "GO_CONTROL_ROOM");
  assert.deepEqual(room.controls.map(item => item.id), ["read-board"]);
  assert.throws(() => createGoControlRoom({ work, actor: "LIGHT" }), /GO_ONLY/);
});
