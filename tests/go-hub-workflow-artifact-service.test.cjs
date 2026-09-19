"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const url = pathToFileURL(path.resolve(__dirname, "..", "go-hub-workflow-artifact-service.mjs")).href;

function storedZip(name, bytes) {
  const enc = new TextEncoder();
  const n = enc.encode(name);
  const data = bytes instanceof Uint8Array ? bytes : enc.encode(String(bytes));
  const local = new Uint8Array(30 + n.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(8, 0, true);
  lv.setUint16(26, n.length, true);
  lv.setUint16(28, 0, true);
  local.set(n, 30);
  local.set(data, 30 + n.length);

  const central = new Uint8Array(46 + n.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(10, 0, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, n.length, true);
  cv.setUint32(42, 0, true);
  central.set(n, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(eocd, local.length + central.length);
  return out;
}

test("lists exact-run GitHub Actions artifacts", async () => {
  const { createWorkflowArtifactService } = await import(url + "?list=" + Date.now());
  const fetchImpl = async requestUrl => {
    assert.match(String(requestUrl), /actions\/runs\/99\/artifacts/);
    return new Response(JSON.stringify({ artifacts: [{
      id: 7, name: "owner", size_in_bytes: 123, expired: false,
      created_at: "now", updated_at: "now", expires_at: "later", digest: "sha256:zip",
    }] }), { headers: { "content-type": "application/json" } });
  };
  const drive = { uploadFileBytes: async () => new Response("{}") };
  const service = createWorkflowArtifactService({ fetchImpl, token: "token", drive });
  const response = await service.listArtifacts({ repository: "pureekangraw-ops/ygph-metropolis", runId: 99 });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.artifacts[0].id, 7);
  assert.equal(payload.artifacts[0].digest, "sha256:zip");
});

test("extracts one artifact entry and archives exact bytes to Drive with identity metadata", async () => {
  const { createWorkflowArtifactService } = await import(url + "?archive=" + Date.now());
  const zip = storedZip("android/app/lighthouse-release.apk", new Uint8Array([1,2,3,4]));
  let calls = 0;
  const fetchImpl = async requestUrl => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ artifacts: [{
        id: 8, name: "lighthouse-owner", size_in_bytes: zip.length, expired: false,
        archive_download_url: "https://api.github.test/artifact/8", digest: "sha256:archive",
      }] }), { headers: { "content-type": "application/json" } });
    }
    assert.equal(String(requestUrl), "https://api.github.test/artifact/8");
    return new Response(zip);
  };
  let upload = null;
  const drive = {
    uploadFileBytes: async input => {
      upload = input;
      return new Response(JSON.stringify({
        item: { id: "drive-1", name: input.name, parents: [input.parentId], appProperties: input.appProperties },
        readback: "PASS",
      }), { headers: { "content-type": "application/json" } });
    },
  };
  const service = createWorkflowArtifactService({ fetchImpl, token: "token", drive });
  const response = await service.archiveArtifact({
    repository: "pureekangraw-ops/ygph-metropolis",
    runId: 100,
    artifactId: 8,
    parentId: "folder-a",
    entrySuffix: "lighthouse-release.apk",
    destinationName: "lighthouse-owner.11-vc1016.apk",
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.readback, "PASS");
  assert.equal(upload.name, "lighthouse-owner.11-vc1016.apk");
  assert.equal(upload.mimeType, "application/vnd.android.package-archive");
  assert.deepEqual(Array.from(upload.bytes), [1,2,3,4]);
  assert.equal(upload.appProperties.workflowRunId, "100");
  assert.equal(upload.appProperties.artifactId, "8");
  assert.match(payload.fileSha256, /^[a-f0-9]{64}$/);
});

test("refuses expired artifacts before download", async () => {
  const { createWorkflowArtifactService } = await import(url + "?expired=" + Date.now());
  const fetchImpl = async () => new Response(JSON.stringify({ artifacts: [{
    id: 9, name: "old", size_in_bytes: 1, expired: true, archive_download_url: "x",
  }] }), { headers: { "content-type": "application/json" } });
  const drive = { uploadFileBytes: async () => { throw new Error("must not upload"); } };
  const service = createWorkflowArtifactService({ fetchImpl, token: "token", drive });
  const response = await service.archiveArtifact({
    repository: "pureekangraw-ops/ygph-metropolis", runId: 1, artifactId: 9, parentId: "folder",
  });
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { code: "ARTIFACT_EXPIRED" });
});
