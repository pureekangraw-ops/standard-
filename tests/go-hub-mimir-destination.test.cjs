"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const centreUrl = pathToFileURL(path.join(root, "go-hub-centre.js")).href;
const mimirUrl = pathToFileURL(path.join(root, "go-hub-mimir-destination.js")).href;

async function outboundMimirAccess(search) {
  const nonce = String(Date.now()) + "-" + String(Math.random());
  const centreModule = await import(centreUrl + "?centre=" + nonce);
  const mimirModule = await import(mimirUrl + "?mimir=" + nonce);
  const seen = [];
  const capability = mimirModule.createMimirSearchDestination({
    async search(query) {
      seen.push(query);
      if (search) return search(query);
      return [{
        id: "source-record-1",
        name: "Observed capability",
        source: "MIMIR owner registry",
        verifiedAt: "2026-09-14",
      }];
    },
  });
  const centre = centreModule.createCentrePassage();
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
  const away = centre.leave(fitted, {
    destination: mimirModule.MIMIR_DESTINATION,
  }).work;
  const access = centreModule.admitDestination(away, {
    destination: mimirModule.MIMIR_DESTINATION,
    capability,
  });
  return { centre, away, access, capability, seen, mimirModule };
}

test("CENTRE sends the minimum query and MIMIR returns to the same checkpoint", async () => {
  const result = await outboundMimirAccess();
  const packet = await result.capability.accept(result.access);

  assert.deepEqual(Object.keys(result.seen[0]).sort(), [
    "lensReference",
    "requestedResult",
    "task",
  ]);
  for (const inferredCoordinate of ["who", "why", "what", "where", "when"]) {
    assert.equal(Object.hasOwn(result.seen[0], inferredCoordinate), false);
  }

  assert.equal(packet.workId, "WORK-A");
  assert.equal(packet.checkpointId, "CENTRE-001");
  assert.equal(packet.payload.status, "PASS");
  assert.equal(packet.payload.records[0].source, "MIMIR owner registry");
  assert.equal(packet.payload.next, "GO_DECIDE");

  const returned = result.centre.return(result.away, packet);
  assert.equal(returned.status, "RETURNED");
  assert.equal(returned.workId, "WORK-A");
  assert.equal(returned.checkpointId, "CENTRE-001");
});

test("Notion-shaped catalog stock selects a usable fit before a blocked five-star item", async () => {
  const result = await outboundMimirAccess();
  const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({
    async readCatalog() {
      return [
        {
          "ชื่อ": "Python Legacy",
          "ประเภท": "Tool",
          "คุณสมบัติ": "Python calculate analyze data",
          "สถานะ": "พร้อมใช้",
          "สถานะปัจจุบัน": "Blocked",
          "Permission": "Blocked",
          "Callable Action / Tool Exposure": "Available",
          "GO Rating": "5.0",
          "Route": "blocked route",
          "date:Verified Date:start": "2026-09-13T00:46:00.000Z",
          "url": "https://notion.test/python-legacy",
        },
        {
          "ชื่อ": "Python",
          "ประเภท": "Tool",
          "คุณสมบัติ": "Python calculate analyze data",
          "สถานะ": "พร้อมใช้",
          "สถานะปัจจุบัน": "Active",
          "Permission": "Allowed",
          "Callable Action / Tool Exposure": "Available",
          "GO Rating": "1.0",
          "Route": "GO -> Python",
          "date:Verified Date:start": "2026-09-13T00:46:00.000Z",
          "date:Modified Date:start": "2026-09-13T00:46:00.000Z",
          "url": "https://notion.test/python",
        },
      ];
    },
  });

  const catalogResult = await searchCatalog({
    task: "Use Python to calculate",
    requestedResult: "Analyze data",
    lensReference: "lens://tool-fit",
  });

  assert.equal(catalogResult.status, "PASS");
  assert.equal(catalogResult.records[0].name, "Python");
  assert.equal(catalogResult.route, "GO -> Python");
  assert.equal(catalogResult.evidence.gateBeforeRating, true);
});

test("missing decision-critical Gate fields return WAIT instead of assumed access", async () => {
  const result = await outboundMimirAccess();
  const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({
    async readCatalog() {
      return [{
        "ชื่อ": "Notion",
        "ประเภท": "Connector",
        "คุณสมบัติ": "search and edit Notion workspace",
        "สถานะ": "พร้อมใช้",
        "วิธีใช้": "Search then fetch",
        "url": "https://notion.test/notion",
      }];
    },
  });

  const catalogResult = await searchCatalog({
    task: "Search Notion",
    requestedResult: "Find existing data",
  });

  assert.equal(catalogResult.status, "WAIT");
  assert.equal(catalogResult.waitReason, "MISSING_DECISION_CRITICAL_FIELD");
  assert.equal(catalogResult.route, null);
  assert.equal(catalogResult.records[0].name, "Notion");
});

test("structured MIMIR PASS result carries route and evidence back through CENTRE", async () => {
  const result = await outboundMimirAccess(async () => ({
    status: "PASS",
    waitReason: null,
    records: [{
      id: "python-record",
      name: "Python",
      source: "https://notion.test/python",
    }],
    route: "GO -> Python",
    evidence: {
      source: "https://notion.test/python",
      verifiedAt: "2026-09-13",
      gateBeforeRating: true,
    },
  }));
  const packet = await result.capability.accept(result.access);
  const returned = result.centre.return(result.away, packet);

  assert.equal(returned.checkpointId, "CENTRE-001");
  assert.equal(returned.returnedPayload.status, "PASS");
  assert.equal(returned.returnedPayload.route, "GO -> Python");
  assert.equal(returned.returnedPayload.evidence.gateBeforeRating, true);
});

test("MIMIR returns explicit WAIT when catalog sees no record", async () => {
  const result = await outboundMimirAccess(async () => ({
    status: "WAIT",
    waitReason: "NO_MATCH",
    records: [],
    route: null,
  }));
  const packet = await result.capability.accept(result.access);

  assert.equal(packet.payload.status, "WAIT");
  assert.equal(packet.payload.waitReason, "NO_MATCH");
  assert.deepEqual(packet.payload.records, []);
  assert.equal(packet.payload.sourceObserved, true);
  assert.equal(packet.payload.next, "GO_REVIEW_WAIT");
});

test("MIMIR preserves source failure as WAIT instead of inventing data", async () => {
  const result = await outboundMimirAccess();
  const unavailable = result.mimirModule.createMimirSearchDestination({
    async search() {
      throw new Error("registry offline");
    },
  });
  const packet = await unavailable.accept({
    ...result.access,
    capability: unavailable,
  });

  assert.equal(packet.payload.status, "WAIT");
  assert.equal(packet.payload.waitReason, "SOURCE_UNAVAILABLE");
  assert.equal(packet.payload.sourceObserved, false);
  assert.deepEqual(packet.payload.records, []);
  assert.equal(packet.payload.route, null);
});

test("GO Hub adapter contains no copied registry products or owner truth", () => {
  const source = fs.readFileSync(
    path.join(root, "go-hub-mimir-destination.js"),
    "utf8",
  );
  assert.equal(source.includes("MIMIR_REGISTRY"), false);
  assert.equal(source.includes("github-chatgpt-connector"), false);
  assert.equal(source.includes("owner-logic-seal-v1"), false);
  assert.equal(source.includes("pureekangraw-ops/"), false);
});
