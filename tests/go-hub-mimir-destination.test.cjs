"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const centreUrl = pathToFileURL(path.join(root, "go-hub-centre.js")).href;
const mimirUrl = pathToFileURL(path.join(root, "go-hub-mimir-destination.js")).href;

async function outboundMimirAccess() {
  const nonce = `${Date.now()}-${Math.random()}`;
  const { createCentrePassage, admitDestination } = await import(`${centreUrl}?centre=${nonce}`);
  const { createMimirSearchDestination, MIMIR_DESTINATION } = await import(`${mimirUrl}?mimir=${nonce}`);
  const seen = [];
  const capability = createMimirSearchDestination({
    async search(query) {
      seen.push(query);
      return [{
        id: "source-record-1",
        name: "Observed capability",
        source: "MIMIR owner registry",
        verifiedAt: "2026-09-14",
      }];
    },
  });
  const centre = createCentrePassage();
  const reviewed = centre.review(
    centre.enter({ checkpointId: "CENTRE-001", workId: "WORK-A" }),
    {
      task: "Find a repository capability",
      requestedResult: "Return relevant source records",
      authority: "BIG",
    },
  );
  const fitted = centre.fit(reviewed, {
    lensId: "LENS-SEARCH",
    lensReference: "lens://search",
    fittedView: "Find relevant source without inventing missing fields",
  });
  const away = centre.leave(fitted, { destination: MIMIR_DESTINATION }).work;
  const access = admitDestination(away, {
    destination: MIMIR_DESTINATION,
    capability,
  });
  return { centre, away, access, capability, seen };
}

test("MIMIR destination searches first and returns observed records before 5W", async () => {
  const { centre, away, access, capability, seen } = await outboundMimirAccess();
  const packet = await capability.accept(access);

  assert.deepEqual(Object.keys(seen[0]).sort(), [
    "lensReference",
    "requestedResult",
    "task",
  ]);
  for (const inferredCoordinate of ["who", "why", "what", "where", "when"]) {
    assert.equal(Object.hasOwn(seen[0], inferredCoordinate), false);
  }

  assert.equal(packet.workId, "WORK-A");
  assert.equal(packet.checkpointId, "CENTRE-001");
  assert.equal(packet.payload.status, "FOUND");
  assert.equal(packet.payload.records[0].source, "MIMIR owner registry");
  assert.equal(packet.payload.next, "GO_APPLY_5W");
  assert.equal(packet.payload.route, null);

  const returned = centre.return(away, packet);
  assert.equal(returned.status, "RETURNED");
  assert.equal(returned.checkpointId, "CENTRE-001");
});

test("MIMIR destination returns explicit WAIT when search sees no record", async () => {
  const nonce = `${Date.now()}-${Math.random()}`;
  const { createCentrePassage, admitDestination } = await import(`${centreUrl}?empty-centre=${nonce}`);
  const { createMimirSearchDestination, MIMIR_DESTINATION } = await import(`${mimirUrl}?empty-mimir=${nonce}`);
  const capability = createMimirSearchDestination({ search: async () => [] });
  const centre = createCentrePassage();
  const ready = centre.fit(
    centre.review(
      centre.enter({ checkpointId: "CENTRE-EMPTY", workId: "WORK-EMPTY" }),
      { task: "Unknown thing", requestedResult: "Observed records", authority: "BIG" },
    ),
    { lensId: "LENS-SEARCH", lensReference: "lens://search", fittedView: "Search only" },
  );
  const away = centre.leave(ready, { destination: MIMIR_DESTINATION }).work;
  const access = admitDestination(away, { destination: MIMIR_DESTINATION, capability });
  const packet = await capability.accept(access);

  assert.equal(packet.payload.status, "WAIT");
  assert.equal(packet.payload.waitReason, "NO_MATCH");
  assert.deepEqual(packet.payload.records, []);
  assert.equal(packet.payload.sourceObserved, true);
});

test("MIMIR destination preserves source failure as WAIT instead of inventing data", async () => {
  const { access } = await outboundMimirAccess();
  const { createMimirSearchDestination } = await import(`${mimirUrl}?failure=${Date.now()}`);
  const unavailable = createMimirSearchDestination({
    async search() {
      throw new Error("registry offline");
    },
  });
  const packet = await unavailable.accept({ ...access, capability: unavailable });

  assert.equal(packet.payload.status, "WAIT");
  assert.equal(packet.payload.waitReason, "SOURCE_UNAVAILABLE");
  assert.equal(packet.payload.sourceObserved, false);
  assert.deepEqual(packet.payload.records, []);
  assert.equal(packet.payload.route, null);
});

test("GO Hub adapter contains no copied MIMIR registry truth", () => {
  const source = fs.readFileSync(path.join(root, "go-hub-mimir-destination.js"), "utf8");
  assert.equal(source.includes("MIMIR_REGISTRY"), false);
  assert.equal(source.includes("github-chatgpt-connector"), false);
  assert.equal(source.includes("callableActions"), false);
});
