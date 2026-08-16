"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("NormalPocket release authority restamps legacy package and audit metadata", async () => {
  const { NORMALPOCKET_RELEASE, restampPackage, restampAudit } = await import("../src/architecture/release-authority.mjs");
  assert.equal(NORMALPOCKET_RELEASE.version, "1.3.1");
  assert.equal(NORMALPOCKET_RELEASE.product, "NormalPocket");

  const pack = restampPackage({ app: "NormalPocket", appVersion: "1.2.0" });
  const audit = restampAudit({ app: "NormalPocket", appVersion: "1.2.0" });
  assert.equal(pack.appVersion, "1.3.1");
  assert.equal(audit.appVersion, "1.3.1");
});

test("release restamping can refresh a package checksum after version correction", async () => {
  const { restampPackage } = await import("../src/architecture/release-authority.mjs");
  let checksumInput = null;
  const pack = restampPackage({ appVersion: "1.2.0", checksum: "old" }, value => {
    checksumInput = { ...value };
    return "fresh";
  });
  assert.equal(pack.checksum, "fresh");
  assert.equal(checksumInput.appVersion, "1.3.1");
  assert.equal(checksumInput.checksum, undefined);
});
