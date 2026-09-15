"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const mimirUrl = pathToFileURL(
  path.resolve(__dirname, "..", "go-hub-mimir-destination.js"),
).href;

test("MIMIR reads canonical METROPOLIS registry fields and returns a verified route", async () => {
  const { createMimirCatalogSearchPort } = await import(
    mimirUrl + "?metropolis=" + Date.now()
  );
  const search = createMimirCatalogSearchPort({
    async readCatalog() {
      return [{
        "Registry ID": "MIR-101",
        "ชื่อ": "GO Hub Factory",
        "ประเภท": "Service",
        "Purpose": "Build and verify code product work packages",
        "Capability": "Design Production Piece QC Ready Gate Assembly Build Product QC",
        "Location": "GO Hub → Factory",
        "Route": "GO → GO Catalog → GO Hub Factory",
        "Owner": "GO",
        "Permission": "Allowed",
        "Operational Status": "Active",
        "Callable": "No",
        "Source ID": "factory-source-id",
        "Source URL": "https://source.test/factory",
        "Verification State": "Verified",
        "date:Verified Date:start": "2026-09-15",
        "Evidence": "Factory source checked against repository evidence",
        "Aliases": "Factory / GO Factory",
        "Tags": "factory, build, code, product",
        "url": "https://notion.test/factory-record",
      }];
    },
  });

  const result = await search({
    task: "Find the factory for code build work",
    requestedResult: "Route this work to the verified product factory",
    lensReference: "lens://factory-fit",
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.waitReason, null);
  assert.equal(result.route, "GO → GO Catalog → GO Hub Factory");
  assert.equal(result.records[0].id, "https://notion.test/factory-record");
  assert.equal(result.records[0].registryId, "MIR-101");
  assert.equal(result.records[0].name, "GO Hub Factory");
  assert.equal(result.records[0].purpose, "Build and verify code product work packages");
  assert.equal(result.records[0].capability, "Design Production Piece QC Ready Gate Assembly Build Product QC");
  assert.equal(result.records[0].location, "GO Hub → Factory");
  assert.equal(result.records[0].operationalStatus, "Active");
  assert.equal(result.records[0].callable, "No");
  assert.equal(result.records[0].verificationState, "Verified");
  assert.equal(result.records[0].sourceId, "factory-source-id");
  assert.equal(result.records[0].sourceUrl, "https://source.test/factory");
  assert.equal(result.records[0].evidence, "Factory source checked against repository evidence");
  assert.equal(result.evidence.source, "https://source.test/factory");
  assert.equal(result.evidence.sourceId, "factory-source-id");
  assert.equal(result.evidence.verifiedAt, "2026-09-15");
});
