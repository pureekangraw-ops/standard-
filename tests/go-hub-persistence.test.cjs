"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const modulePath = path.join(root, "go-hub-persistence.js");

function advanceProductionToWrite(task, { repository, baseSha, blueprintRef, planRef }) {
  return task
    .recordProductionStep({ step: "INSPECT_REALITY", evidence: { repository, headSha: baseSha } })
    .recordProductionStep({ step: "BASELINE", evidence: { baseSha } })
    .recordProductionStep({ step: "TRACE", evidence: { summary: "trace before edit" } })
    .recordProductionStep({ step: "PLAN", evidence: { blueprintRef, planRef } });
}

function localVerify(task, headSha) {
  return task.recordProductionStep({ step: "LOCAL_VERIFY", evidence: { status: "pass", headSha, checks: { test: "pass" } } });
}

test("GO Hub persistence mechanics stay neutral and identity-free", () => {
  assert.equal(fs.existsSync(modulePath), true);
  const source = fs.readFileSync(modulePath, "utf8");
  for (const forbidden of ["ygph-standard", "stock-pocket", "NormalPocket", "STORE", "LEDGER", "CALENDAR", "indexedDB"]) {
    assert.equal(source.includes(forbidden), false, `neutral persistence must not own ${forbidden}`);
  }
});

test("GO Hub persistence port commits with durable readback through injected store", async () => {
  const { createMemoryKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const store = createMemoryKeyValueStore();
  const persistence = createStatePersistence({
    store,
    key: "hub-state",
    validate(value) {
      if (!Number.isSafeInteger(value?.revision)) throw new Error("revision required");
      return value;
    },
  });

  const proposed = { revision: 2, nested: { ready: true } };
  const receipt = await persistence.commitState({ proposed, command: { type: "REGISTER" } });

  assert.equal(receipt.status, "COMMITTED");
  assert.equal(receipt.revision, 2);
  assert.equal(receipt.commandType, "REGISTER");
  assert.deepEqual(await persistence.loadState(), proposed);

  proposed.nested.ready = false;
  assert.equal((await persistence.loadState()).nested.ready, true);
});

test("GO Hub persistence rejects invalid proposed state before write", async () => {
  const { createMemoryKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const store = createMemoryKeyValueStore();
  const persistence = createStatePersistence({
    store,
    validate(value) {
      if (value?.ok !== true) throw new Error("invalid state");
      return value;
    },
  });

  await assert.rejects(
    persistence.commitState({ proposed: { ok: false }, command: { type: "BAD" } }),
    /invalid state/,
  );
  assert.equal(await persistence.loadState(), null);
});

test("GO Hub local storage port restores an identical task snapshot", async () => {
  const { createLocalStorageKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
  const store = createLocalStorageKeyValueStore({ storage, namespace: "go-hub-code" });
  const persistence = createStatePersistence({ store, key: "active-task" });
  const snapshot = {
    id: "task-19", state: "CI_RUNNING", repository: "pureekangraw-ops/standard-",
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1",
    pullRequest: { number: 19, headSha: "head-1" },
    ci: { headSha: "head-1", conclusion: null },
    nextAction: "check-ci", audit: [{ event: "CI_STARTED" }],
  };
  await persistence.commitState({ proposed: snapshot, command: { type: "SAVE_CODE_TASK" } });
  assert.deepEqual(await persistence.loadState(), snapshot);
});

test("Code task session restores and projects the exact six workbench truths", async () => {
  const { createMemoryKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const { createCodeTask } = await import(pathToFileURL(path.join(root, "go-hub-code-task.js")).href);
  const { createCodeTaskSession } = await import(pathToFileURL(path.join(root, "go-hub-code-module.js")).href);
  const { createWorkbenchView } = await import(pathToFileURL(path.join(root, "go-hub-workbench-model.js")).href);
  const persistence = createStatePersistence({ store: createMemoryKeyValueStore(), key: "active-task" });
  const session = createCodeTaskSession({ persistence });
  let task = createCodeTask({
    id: "engine-1-resume",
    intent: "assemble Engine 1",
    repository: "pureekangraw-ops/standard-",
  });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main",
    baseSha: "base-1",
    workBranch: "go-hub-factory-engine-1-truth-workbench",
    headSha: "head-1",
  });
  task = task.setWorkbenchTruth({
    mission: { summary: "Build Engine 1", outcome: "GO resumes without chat" },
    blueprint: {
      title: "Factory Blueprint",
      ref: "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md",
      status: "approved",
    },
    currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Expose resumable truth" },
    evidence: [{ kind: "design", label: "Blueprint commit", value: "aa7d779" }],
  });

  await session.save(task);
  const restored = await session.load();
  const view = createWorkbenchView(restored.snapshot());

  assert.deepEqual(view, {
    mission: { summary: "Build Engine 1", outcome: "GO resumes without chat" },
    blueprint: {
      title: "Factory Blueprint",
      ref: "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md",
      status: "approved",
    },
    currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Expose resumable truth" },
    status: "BRANCH_READY",
    evidence: [{ kind: "design", label: "Blueprint commit", value: "aa7d779" }],
    next: "edit",
    blocker: null,
  });
});

test("Code task session restores exact Engine 2 production truth at Ready Gate", async () => {
  const { createMemoryKeyValueStore, createStatePersistence } = await import(pathToFileURL(modulePath).href);
  const { createCodeTask } = await import(`${pathToFileURL(path.join(root, "go-hub-code-task.js")).href}?engine2=${Date.now()}`);
  const { createCodeTaskSession } = await import(`${pathToFileURL(path.join(root, "go-hub-code-module.js")).href}?engine2=${Date.now()}`);
  const { createWorkbenchView } = await import(`${pathToFileURL(path.join(root, "go-hub-workbench-model.js")).href}?engine2=${Date.now()}`);
  const persistence = createStatePersistence({ store: createMemoryKeyValueStore(), key: "active-task" });
  const session = createCodeTaskSession({ persistence });
  let task = createCodeTask({ id: "engine-2-resume" }).setWorkbenchTruth({ blueprint: { ref: "spec.md" } });
  task = task.setWorkPackage({
    id: "wp-1", title: "Production Line", purpose: "seal one piece", blueprintRef: "spec.md",
    inputs: ["truth"], expectedOutputs: ["piece"], dependencies: [], assemblyTarget: "future assembly",
  });
  task = advanceProductionToWrite(task, { repository: "repo", baseSha: "base-1", blueprintRef: "spec.md", planRef: "plan://engine-2-resume" })
    .recordPiece({
      id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "engine-2",
      headSha: "head-1", changedPaths: ["piece.js"], outputs: ["piece"],
    });
  task = localVerify(task, "head-1")
    .addEvidence({ id: "ev-1", scope: "piece", claim: "purpose-correct", kind: "test", headSha: "head-1" })
    .recordPieceQc({
      status: "pass", checkedHeadSha: "head-1", checks: { purpose: true, behavior: true, interface: true, evidence: true },
      evidenceIds: ["ev-1"], checkedAt: "2026-09-14T12:00:00.000Z",
    }).recordGateHandoff({
      status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1",
      blueprintRef: "spec.md", headSha: "head-1", evidenceIds: ["ev-1"],
    });

  await session.save(task);
  const restored = (await session.load()).snapshot();
  assert.equal(restored.factoryStage, "READY_GATE");
  assert.equal(restored.workPackage.blueprintRef, "spec.md");
  assert.equal(restored.piece.headSha, "head-1");
  assert.deepEqual(restored.pieceQc.evidenceIds, ["ev-1"]);
  assert.deepEqual(restored.gateHandoff.evidenceIds, ["ev-1"]);
  assert.deepEqual(restored.productionTrace.map(item => item.step), ["INSPECT_REALITY", "BASELINE", "TRACE", "PLAN", "WRITE", "LOCAL_VERIFY"]);
  assert.equal(createWorkbenchView(restored).status, "READY_GATE");
});

test("one Work Package travels from mounted Blueprint to a resumable Ready Gate", async () => {
  const nonce = `${Date.now()}-${Math.random()}`;
  const { createMemoryKeyValueStore, createStatePersistence } = await import(`${pathToFileURL(modulePath).href}?line=${nonce}`);
  const { createCodeTask } = await import(`${pathToFileURL(path.join(root, "go-hub-code-task.js")).href}?line=${nonce}`);
  const { createCodeTaskSession, createCodeCapability } = await import(`${pathToFileURL(path.join(root, "go-hub-code-module.js")).href}?line=${nonce}`);
  const { createWorkbenchView } = await import(`${pathToFileURL(path.join(root, "go-hub-workbench-model.js")).href}?line=${nonce}`);
  const { evaluatePieceQc } = await import(`${pathToFileURL(path.join(root, "go-hub-piece-qc.js")).href}?line=${nonce}`);
  const { sealReadyGate } = await import(`${pathToFileURL(path.join(root, "go-hub-ready-gate.js")).href}?line=${nonce}`);

  const blueprintRef = "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md";
  let task = createCodeTask({
    id: "engine-2-functional", repository: "pureekangraw-ops/standard-",
  }).setWorkbenchTruth({
    mission: { summary: "Build Engine 2", outcome: "One evidenced piece reaches Ready Gate" },
    blueprint: { title: "Factory Blueprint", ref: blueprintRef, status: "approved" },
  }).setWorkPackage({
    id: "wp-production-line", title: "Production Line", purpose: "produce and seal one bounded piece",
    blueprintRef, inputs: ["Engine 1 CodeTask truth"], expectedOutputs: ["Ready Gate handoff"],
    dependencies: ["Engine 1 accepted main"], assemblyTarget: "Engine 3 Assembly input",
  });
  task = advanceProductionToWrite(task, {
    repository: "pureekangraw-ops/standard-", baseSha: "engine-2-base", blueprintRef, planRef: "plan://engine-2-functional",
  }).recordPiece({
    id: "piece-production-line", workPackageId: "wp-production-line",
    repository: "pureekangraw-ops/standard-", branch: "go-hub-factory-engine-2-production-line",
    headSha: "engine-2-functional-head",
    changedPaths: ["go-hub-code-task.js", "go-hub-evidence-ledger.js", "go-hub-piece-qc.js", "go-hub-ready-gate.js"],
    outputs: ["Piece Controller", "Evidence Ledger", "Piece QC", "Ready Gate"],
  });
  task = localVerify(task, "engine-2-functional-head");
  for (const [id, claim] of [
    ["ev-purpose", "purpose-correct"],
    ["ev-behavior", "behavior-correct"],
    ["ev-interface", "interface-correct"],
  ]) {
    task = task.addEvidence({
      id, scope: "piece", claim, kind: "functional-test", value: true,
      repository: "pureekangraw-ops/standard-", headSha: "engine-2-functional-head",
      recordedAt: "2026-09-14T12:00:00.000Z",
    });
  }
  const production = task.snapshot();
  const pieceQc = evaluatePieceQc(production);
  task = task.recordPieceQc(pieceQc);
  const checked = task.snapshot();
  const gateHandoff = sealReadyGate({ ...checked, knownLimitations: ["Engine 3 is out of scope"] });
  task = task.recordGateHandoff(gateHandoff);

  const persistence = createStatePersistence({ store: createMemoryKeyValueStore(), key: "active-task" });
  const session = createCodeTaskSession({ persistence });
  await session.save(task);
  const restored = (await session.load()).snapshot();
  const view = createWorkbenchView(restored);
  const capability = createCodeCapability({ task: restored });

  assert.equal(view.status, "READY_GATE");
  assert.equal(restored.blueprint.ref, blueprintRef);
  assert.equal(restored.gateHandoff.blueprintRef, blueprintRef);
  assert.equal(restored.gateHandoff.headSha, restored.piece.headSha);
  assert.deepEqual(restored.gateHandoff.evidenceIds, ["ev-purpose", "ev-behavior", "ev-interface"]);
  assert.deepEqual(restored.pieceQc.evidenceIds, restored.gateHandoff.evidenceIds);
  assert.equal(capability.gateHandoff.status, "READY_FOR_ASSEMBLY");
});

test("Engine 3 assembles a Ready Gate Piece into a resumable verified Product", async () => {
  const nonce = `${Date.now()}-${Math.random()}`;
  const load = file => import(`${pathToFileURL(path.join(root, file)).href}?engine3=${nonce}`);
  const { createMemoryKeyValueStore, createStatePersistence } = await import(`${pathToFileURL(modulePath).href}?engine3=${nonce}`);
  const { createCodeTask } = await load("go-hub-code-task.js");
  const { createCodeTaskSession, createCodeCapability } = await load("go-hub-code-module.js");
  const { createWorkbenchView } = await load("go-hub-workbench-model.js");
  const { evaluatePieceQc } = await load("go-hub-piece-qc.js");
  const { sealReadyGate } = await load("go-hub-ready-gate.js");
  const { assembleReadyPieces } = await load("go-hub-assembly-bench.js");
  const { evaluateAssemblyQc } = await load("go-hub-assembly-qc.js");
  const { createBuildArtifact, inspectArtifact } = await load("go-hub-artifact.js");
  const { evaluateProductQc } = await load("go-hub-product-qc.js");
  const blueprintRef = "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md";
  const blueprint = { title: "Factory Blueprint", ref: blueprintRef, status: "approved" };

  let task = createCodeTask({ id: "engine-3-functional", repository: "pureekangraw-ops/standard-" })
    .setWorkbenchTruth({ mission: { summary: "Build Engine 3", outcome: "Verified Product" }, blueprint })
    .setWorkPackage({ id: "wp-3", title: "Assembly & Product", purpose: "assemble and verify", blueprintRef, inputs: ["Piece"], expectedOutputs: ["Product"], dependencies: [], assemblyTarget: "Product" });
  task = advanceProductionToWrite(task, {
    repository: "pureekangraw-ops/standard-", baseSha: "engine-3-base", blueprintRef, planRef: "plan://engine-3-functional",
  }).recordPiece({ id: "piece-3", workPackageId: "wp-3", repository: "pureekangraw-ops/standard-", branch: "engine-3", headSha: "piece-head", changedPaths: ["piece.js"], outputs: ["piece"] });
  task = localVerify(task, "piece-head");
  for (const [id, claim] of [["piece-purpose", "purpose-correct"], ["piece-behavior", "behavior-correct"], ["piece-interface", "interface-correct"]]) {
    task = task.addEvidence({ id, scope: "piece", claim, kind: "functional-test", headSha: "piece-head" });
  }
  task = task.recordPieceQc(evaluatePieceQc(task.snapshot()));
  task = task.recordGateHandoff(sealReadyGate(task.snapshot()));

  const assembly = assembleReadyPieces({ id: "assembly-3", blueprint, handoffs: [task.snapshot().gateHandoff], repository: "pureekangraw-ops/standard-", integrationBranch: "engine-3", integrationHeadSha: "assembly-head" });
  task = task.recordAssembly(assembly);
  for (const [id, claim] of [["assembly-structure", "structure-correct"], ["assembly-flow", "flow-correct"], ["assembly-behavior", "combined-behavior-correct"]]) {
    task = task.addEvidence({ id, scope: "assembly", claim, kind: "functional-test", headSha: "assembly-head" });
  }
  task = task.recordAssemblyQc(evaluateAssemblyQc({ assembly: task.snapshot().assembly, blueprint, evidence: task.snapshot().evidence }));
  task = task.recordMergeGate({
    status: "MERGED_VERIFIED", assemblyId: "assembly-3", sourceHeadSha: "assembly-head",
    pullRequest: { number: 53, headSha: "assembly-head" },
    ci: { status: "success", headSha: "assembly-head" },
    merge: { headSha: "assembly-head", mergeSha: "main-head", pullRequestNumber: 53 },
    postMergeVerification: { status: "pass", mainSha: "main-head", checkedAt: "2026-09-14T12:00:00.000Z" },
  });
  const artifact = createBuildArtifact({ id: "artifact-3", kind: "worker", assembly: task.snapshot().assembly, assemblyQc: task.snapshot().assemblyQc, mergeGate: task.snapshot().mergeGate, digest: "sha256:engine-3", location: "production", builtAt: "2026-09-14T12:00:00.000Z" });
  task = task.recordBuildArtifact(artifact);
  for (const [id, claim] of [["artifact-load", "artifact-loads"], ["artifact-binding", "source-binding-correct"], ["artifact-flow", "core-flow-correct"], ["artifact-outcome", "blueprint-outcome-correct"]]) {
    task = task.addEvidence({ id, scope: "artifact", claim, kind: "functional-test", value: { digest: artifact.digest } });
  }
  assert.equal(inspectArtifact({ artifact, evidence: task.snapshot().evidence }).status, "pass");
  task = task.recordProductQc(evaluateProductQc({ artifact, blueprint, evidence: task.snapshot().evidence }));

  const session = createCodeTaskSession({ persistence: createStatePersistence({ store: createMemoryKeyValueStore(), key: "active-task" }) });
  await session.save(task);
  const restored = (await session.load()).snapshot();
  assert.equal(createWorkbenchView(restored).status, "PRODUCT_VERIFIED");
  assert.equal(restored.blueprint.ref, blueprintRef);
  assert.deepEqual(restored.assembly.sourceHeads, ["piece-head"]);
  assert.equal(restored.mergeGate.mainSha, "main-head");
  assert.equal(restored.buildArtifact.sourceHeadSha, restored.mergeGate.mainSha);
  assert.equal(restored.buildArtifact.assemblyHeadSha, restored.assembly.integrationHeadSha);
  assert.deepEqual(restored.productQc.evidenceIds, ["artifact-load", "artifact-flow", "artifact-outcome"]);
  assert.equal(createCodeCapability({ task: restored }).productQc.status, "pass");
});

test("Engine 4 scans closes and learns through exact persistence", async () => {
  const nonce = `${Date.now()}-${Math.random()}`; const load=file=>import(`${pathToFileURL(path.join(root,file)).href}?e4=${nonce}`);
  const { createMemoryKeyValueStore, createStatePersistence } = await import(`${pathToFileURL(modulePath).href}?e4=${nonce}`);
  const { createCodeTask, createCodeTaskFromSnapshot }=await load("go-hub-code-task.js");
  const { createCodeTaskSession, createCodeCapability }=await load("go-hub-code-module.js");
  const { createWorkbenchView }=await load("go-hub-workbench-model.js");
  const { scanFactoryTruth }=await load("go-hub-verification-scanner.js");
  const { planCloseout }=await load("go-hub-housekeeper.js");
  const { recordLesson }=await load("go-hub-learning-recorder.js");
  const initial=createCodeTask({id:"engine-4-functional"}).snapshot();
  const truth={...initial,factoryStage:"PRODUCT_VERIFIED",blueprint:{ref:"spec.md",status:"approved"},piece:{id:"p",headSha:"piece-head"},pieceQc:{status:"pass",checkedHeadSha:"piece-head"},gateHandoff:{status:"READY_FOR_ASSEMBLY",headSha:"piece-head",blueprintRef:"spec.md"},assembly:{id:"assembly",status:"ASSEMBLED",integrationHeadSha:"assembly-head",blueprintRef:"spec.md"},assemblyQc:{status:"pass",checkedHeadSha:"assembly-head"},mergeGate:{status:"MERGED_VERIFIED",assemblyId:"assembly",sourceHeadSha:"assembly-head",pullRequestHeadSha:"assembly-head",ciHeadSha:"assembly-head",mergeSha:"main-head",mainSha:"main-head"},buildArtifact:{id:"artifact",status:"BUILT",digest:"digest-4",assemblyHeadSha:"assembly-head",sourceHeadSha:"main-head",blueprintRef:"spec.md"},productQc:{status:"pass",artifactId:"artifact",artifactDigest:"digest-4"}};
  const broken=structuredClone(truth); broken.assemblyQc.checkedHeadSha="stale"; assert.equal(scanFactoryTruth(broken).station,"assembly-qc");
  let task=createCodeTaskFromSnapshot(truth); const scan=scanFactoryTruth(task.snapshot()); task=task.recordVerificationScan(scan);
  task=task.recordCloseout(planCloseout({task:task.snapshot(),scan,transientKeys:["draft"],obsoleteKeys:["old-cache"]}));
  task=task.recordLesson(recordLesson({id:"lesson-4",context:"exact chain closeout",action:"scan in station order",finding:"no broken truth",resolution:"close verified artifact",reusableWhen:"closing a verified product",sourceTaskId:"engine-4-functional",sourceArtifactDigest:"digest-4",recordedAt:"2026-09-14T13:00:00.000Z"}));
  const session=createCodeTaskSession({persistence:createStatePersistence({store:createMemoryKeyValueStore(),key:"active-task"})}); await session.save(task); const restored=(await session.load()).snapshot();
  assert.equal(createWorkbenchView(restored).status,"LEARNED"); assert.equal(restored.verificationScan.artifactDigest,"digest-4"); assert.equal(restored.closeout.finalArtifact.digest,"digest-4"); assert.deepEqual(restored.lessons.map(x=>x.id),["lesson-4"]); assert.equal(createCodeCapability({task:restored}).lessons[0].status,"RECORDED");
});
