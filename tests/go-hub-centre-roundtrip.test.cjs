"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const centreUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-centre.js")).href;

async function returnedWork() {
  const { createCentrePassage } = await import(`${centreUrl}?setup=${Date.now()}-${Math.random()}`);
  const centre = createCentrePassage();
  let work = centre.enter({ checkpointId: "CENTRE-R1", workId: "WORK-R1" });
  work = centre.review(work, { task: "Continue routed work", requestedResult: "Verified result", authority: "BIG" });
  work = centre.fit(work, { lensId: "LENS-R1", lensReference: "lens://round-1", fittedView: "Round one" });
  work = centre.leave(work, { destination: "destination://factory" }).work;
  work = centre.return(work, { workId: "WORK-R1", checkpointId: "CENTRE-R1", payload: { status: "RETURNED" } });
  return { centre, work };
}

test("Centre resumes a returned work round with the same identity and forces refit when requested", async () => {
  const { centre, work } = await returnedWork();
  const resumed = centre.resume(work, { reuseFit: false });
  assert.equal(resumed.status, "READY");
  assert.equal(resumed.workId, "WORK-R1");
  assert.equal(resumed.checkpointId, "CENTRE-R1");
  assert.equal(resumed.task, "Continue routed work");
  assert.equal(resumed.requestedResult, "Verified result");
  assert.equal(resumed.lens, null);
  assert.equal(resumed.handoff, null);
  assert.deepEqual(resumed.returnedPayload, { status: "RETURNED" });
});

test("Centre may reuse the fitted lens only when the round fingerprint is unchanged", async () => {
  const { centre, work } = await returnedWork();
  const resumed = centre.resume(work, { reuseFit: true });
  assert.equal(resumed.status, "READY");
  assert.equal(resumed.lens.lensReference, "lens://round-1");
  assert.equal(resumed.handoff, null);
});
