"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = name => import(pathToFileURL(path.join(root, name)).href + `?${Date.now()}-${Math.random()}`);

test("one Centre identity crosses Bifrost, Optician, Heimdall, Factory, and returns to Chat unchanged", async () => {
  const centreModule = await load("go-hub-centre.js");
  const city = await load("go-hub-city-route.js");
  const optician = await load("go-hub-optician.js");
  const factory = await load("go-hub-factory-return.js");

  const centre = centreModule.createCentrePassage();
  const arrived = centre.enter({ checkpointId: "CENTRE-ROUNDTRIP", workId: "WORK-ROUNDTRIP" });
  const reviewed = centre.review(arrived, {
    task: "Repair GO City roundtrip",
    requestedResult: "Return verified production truth to Chat",
    authority: "BIG",
  });

  const map = city.createCityRoute();
  const fit = optician.fitWork({
    context: {
      purpose: "Repair GO City roundtrip",
      target: "GO Hub",
      successCondition: "Verified Factory reality returns to Chat with the same work identity",
    },
    lens: { reference: "lens://integration" },
    destination: map.destinations.factory,
  });
  assert.equal(fit.gate, "PASS");

  const fitted = centre.fit(reviewed, {
    lensId: "LENS-INTEGRATION",
    lensReference: fit.lensReference,
    fittedView: "Preserve identity and require reality evidence",
  });

  const inboundBridge = city.crossBifrost({
    workId: fitted.workId,
    checkpointId: fitted.checkpointId,
    returnAddress: fitted.checkpointId,
  }, { direction: "CHAT_TO_HUB" });
  assert.deepEqual(inboundBridge, {
    bridge: "bifrost",
    direction: "CHAT_TO_HUB",
    packet: {
      workId: "WORK-ROUNDTRIP",
      checkpointId: "CENTRE-ROUNDTRIP",
      returnAddress: "CENTRE-ROUNDTRIP",
    },
  });

  const inbound = city.routeInbound({
    fit,
    heimdall: { decision: "PASS", reason: "SAFE_AND_ALLOWED" },
  });
  assert.deepEqual(inbound.via, ["optician", "heimdall"]);
  assert.equal(inbound.workRoute, "destination://factory");

  const outboundWork = centre.leave(fitted, { destination: inbound.workRoute });
  const access = centreModule.admitDestination(outboundWork.work, {
    destination: map.destinations.factory.route,
    capability: { id: "code", status: "ready" },
  });
  const factoryReturn = factory.createFactoryRealityReturn(access, {
    id: "factory-task-roundtrip",
    repository: "pureekangraw-ops/standard-",
    state: "VERIFIED",
    factoryStage: "CLOSED",
    nextAction: "complete",
    verification: {
      status: "success",
      kind: "production-smoke",
      target: "GO Hub",
      evidence: { deploymentSha: "main-after-merge" },
      timestamp: "2026-09-16T03:45:00+07:00",
    },
    evidence: [{ id: "EVIDENCE-ROUNDTRIP", claim: "production verified" }],
  });
  const returned = centre.return(outboundWork.work, factoryReturn);
  assert.equal(returned.workId, "WORK-ROUNDTRIP");
  assert.equal(returned.checkpointId, "CENTRE-ROUNDTRIP");
  assert.equal(returned.returnedPayload.status, "PASS");
  assert.equal(returned.returnedPayload.kind, "FACTORY_REALITY_RETURN");

  const exit = city.routeOutbound({
    heimdall: { decision: "PASS", reason: "SAFE_TO_CHAT" },
    needsOptician: false,
  });
  assert.equal(exit.destination, "bifrost");
  assert.equal(exit.next, "big-chat");

  const outboundBridge = city.crossBifrost({
    workId: returned.workId,
    checkpointId: returned.checkpointId,
    returnAddress: returned.handoff.returnAddress,
    payload: returned.returnedPayload,
  }, { direction: "HUB_TO_CHAT" });
  assert.equal(outboundBridge.packet.workId, "WORK-ROUNDTRIP");
  assert.equal(outboundBridge.packet.checkpointId, "CENTRE-ROUNDTRIP");
  assert.equal(outboundBridge.packet.returnAddress, "CENTRE-ROUNDTRIP");
  assert.equal(outboundBridge.packet.payload.status, "PASS");
});
