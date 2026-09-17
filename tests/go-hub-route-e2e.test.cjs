"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const centreUrl = pathToFileURL(path.join(root, "go-hub-centre.js")).href;
const routeUrl = pathToFileURL(path.join(root, "go-hub-city-route.js")).href;
const contractUrl = pathToFileURL(path.join(root, "go-hub-route-contract.js")).href;
const opticianUrl = pathToFileURL(path.join(root, "go-hub-optician.js")).href;

async function modules(tag) {
  const nonce = `${tag}-${Date.now()}-${Math.random()}`;
  const [centre, route, contract, optician] = await Promise.all([
    import(`${centreUrl}?${nonce}`),
    import(`${routeUrl}?${nonce}`),
    import(`${contractUrl}?${nonce}`),
    import(`${opticianUrl}?${nonce}`),
  ]);
  return { centre, route, contract, optician };
}

function makeReady(centre, destination) {
  const passage = centre.createCentrePassage();
  let work = passage.enter({ checkpointId: `CENTRE-${destination.id}`, workId: `WORK-${destination.id}` });
  work = passage.review(work, {
    task: `Use ${destination.id}`,
    requestedResult: `Return verified ${destination.id} reality`,
    authority: "BIG",
  });
  work = passage.fit(work, {
    lensId: `LENS-${destination.id}`,
    lensReference: `lens://${destination.id}`,
    fittedView: `Route only to ${destination.route}`,
  });
  return { passage, work };
}

test("every canonical destination completes the same Centre -> Optician -> Route -> Return identity contract", async () => {
  const { centre, route, contract, optician } = await modules("all-destinations");

  for (const destination of Object.values(contract.CITY_DESTINATIONS)) {
    const { passage, work: ready } = makeReady(centre, destination);
    const fit = optician.fitWork({
      context: { purpose: ready.task, successCondition: ready.requestedResult },
      reality: { destination: destination.id, revision: 1 },
      lens: { reference: ready.lens.lensReference },
      destination,
    });
    assert.equal(fit.gate, "PASS");

    const inbound = route.routeInbound({ fit });
    assert.deepEqual(inbound, {
      destination: "go-work-loop",
      via: "optician",
      workRoute: destination.route,
      destinationId: destination.id,
    });

    const away = passage.leave(ready, { destination: inbound.workRoute }).work;
    const access = centre.admitDestination(away, {
      destination: destination.route,
      capability: { id: destination.id },
    });
    contract.assertCityWorkContext({
      workId: access.workId,
      checkpointId: access.checkpointId,
      returnAddress: access.returnAddress,
      destination: access.destination,
      task: access.envelope.task,
      requestedResult: access.envelope.requestedResult,
      lensReference: access.envelope.lensReference,
    }, destination.route);

    const returned = passage.return(away, centre.createReturnPacket(access, {
      kind: `${destination.id.toUpperCase()}_REALITY_RETURN`,
      status: "RETURNED",
    }));
    assert.equal(returned.workId, ready.workId);
    assert.equal(returned.checkpointId, ready.checkpointId);
    assert.equal(returned.status, centre.CENTRE_STATES.RETURNED);
  }
});

test("changed reality forces refit before another round, unchanged reality may reuse the fit", async () => {
  const { centre, contract, optician } = await modules("refit");
  const destination = contract.CITY_DESTINATIONS.factory;
  const { passage, work: ready } = makeReady(centre, destination);
  const context = { purpose: ready.task, successCondition: ready.requestedResult };
  const reality = { revision: 1 };
  const fit = optician.fitWork({
    context,
    reality,
    lens: { reference: ready.lens.lensReference },
    destination,
  });

  assert.equal(optician.checkRound(fit, { context, reality }).decision, "REUSE_FIT");
  assert.equal(optician.checkRound(fit, { context, reality: { revision: 2 } }).decision, "REFIT");

  const away = passage.leave(ready, { destination: destination.route }).work;
  const access = centre.admitDestination(away, { destination: destination.route, capability: { id: "factory" } });
  const returned = passage.return(away, centre.createReturnPacket(access, { status: "RETURNED" }));
  const reused = passage.resume(returned, { reuseFit: true });
  const refit = passage.resume(returned, { reuseFit: false });
  assert.equal(reused.lens.lensReference, ready.lens.lensReference);
  assert.equal(refit.lens, null);
});

test("Heimdall is the only outbound gate before Bifrost return to BIG chat", async () => {
  const { route } = await modules("exit");

  assert.deepEqual(route.routeOutbound({ heimdall: { decision: "WAIT", reason: "VERIFY_REALITY" } }), {
    destination: "heimdall",
    reason: "VERIFY_REALITY",
  });

  const outbound = route.routeOutbound({ heimdall: { decision: "PASS" }, needsOptician: false });
  assert.deepEqual(outbound, {
    destination: "bifrost",
    via: "heimdall",
    next: "big-chat",
    reason: "PASSAGE_ALLOWED",
  });

  const crossed = route.crossBifrost({
    workId: "WORK-EXIT",
    checkpointId: "CENTRE-EXIT",
    returnAddress: "CENTRE-EXIT",
    result: "verified",
  }, { direction: "HUB_TO_CHAT" });
  assert.equal(crossed.bridge, "bifrost");
  assert.equal(crossed.direction, "HUB_TO_CHAT");
  assert.equal(crossed.packet.returnAddress, "CENTRE-EXIT");
});
