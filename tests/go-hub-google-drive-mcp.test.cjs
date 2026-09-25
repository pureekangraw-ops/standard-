"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;
const workerUrl = pathToFileURL(path.join(root, "go-hub-factory-mcp-worker.mjs")).href;
const oauthUrl = pathToFileURL(path.join(root, "go-hub-oauth.mjs")).href;
const endpoint = "https://hub.example/mcp";

const driveWorkContext = Object.freeze({
  workId:"WORK-DRIVE-HUB-20260919-001",
  checkpointId:"CP-DRIVE-HUB-001",
});

function rpc(token, name, args = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

test("registry publishes twelve governed Drive bridge tools", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?drive-tools=" + Date.now());
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => new Response(JSON.stringify({ operation: name, input }), {
      headers: { "content-type": "application/json" },
    }),
  });
  const registry = createMcpRegistry({ lifecycle });
  const tools = registry.listTools().filter(tool => tool.name.startsWith("go_hub_drive_"));
  assert.deepEqual(tools.map(tool => tool.name), [
    "go_hub_drive_capabilities",
    "go_hub_drive_health",
    "go_hub_drive_diagnostics",
    "go_hub_drive_root",
    "go_hub_drive_get_item",
    "go_hub_drive_list_children",
    "go_hub_drive_read_document",
    "go_hub_drive_download_file",
    "go_hub_drive_create_folder",
    "go_hub_drive_upload_file",
    "go_hub_drive_move_item",
    "go_hub_drive_rename_item",
  ]);
  assert.deepEqual(tools.map(tool => tool.annotations.readOnlyHint), [true, true, true, true, true, true, true, true, false, false, false, false]);

  await registry.callTool("go_hub_drive_move_item", {
    fileId: "file-a",
    destinationFolderId: "folder-b",
    workContext: driveWorkContext,
  });

  const uploadResult = await registry.callTool("go_hub_drive_upload_file", {
    parentId: "folder-b",
    name: "pixie.zip",
    mimeType: "application/zip",
    contentBase64: "cGl4aWU=",
    size: 5,
    sha256: "0".repeat(64),
    workContext: driveWorkContext,
  });
  assert.equal(uploadResult.structuredContent.operation, "driveUploadFile");

  await assert.rejects(registry.callTool("go_hub_drive_move_item", {
    fileId: "file-a",
    destinationFolderId: "folder-b",
  }), /workContext/);

  await assert.rejects(registry.callTool("go_hub_drive_create_folder", {
    parentId: "folder-b",
    name: "Archive",
    workContext: { ...driveWorkContext, destination:"destination://factory" },
  }), /unknown workContext field/i);

  const downloadResult = await registry.callTool("go_hub_drive_download_file", {
    fileId:"file-a",
    maxBytes:1024,
  });
  assert.equal(downloadResult.structuredContent.operation, "driveDownloadFile");
});

test("Factory MCP injects Drive refresh credentials and serves metadata read", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?drive-worker=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?drive-token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const token = await createTestAccessToken({ issuer: "https://hub.example", signingKey });
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "fresh-access", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).startsWith("https://www.googleapis.com/drive/v3/files/file-a")) {
      assert.equal(init.headers.authorization, "Bearer fresh-access");
      return new Response(JSON.stringify({
        id: "file-a",
        name: "alpha.txt",
        mimeType: "text/plain",
        size: "12",
        modifiedTime: "2026-09-19T00:00:00.000Z",
        md5Checksum: "hash-a",
        version: "2",
        parents: ["parent-a"],
        trashed: false,
        webViewLink: null,
      }), { headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected upstream " + url);
  };

  const worker = createFactoryMcpWorker({ fetchImpl });
  const response = await worker.fetch(rpc(token, "go_hub_drive_get_item", { fileId: "file-a" }), {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: signingKey,
    GOHUB_OWNER_PASSCODE: "owner-passcode",
    GOOGLE_DRIVE_REFRESH_TOKEN: "refresh-secret",
    GOOGLE_DRIVE_CLIENT_ID: "client-id",
    GOOGLE_DRIVE_CLIENT_SECRET: "client-secret",
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.item.id, "file-a");
  assert.equal(payload.result.structuredContent.item.md5Checksum, "hash-a");
  assert.equal(requests.length, 2);
  assert.doesNotMatch(JSON.stringify(payload), /refresh-secret|client-secret|fresh-access/);
});

test("Factory MCP Drive route fails closed without server config", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?drive-missing=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?drive-missing-token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const token = await createTestAccessToken({ issuer: "https://hub.example", signingKey });
  let calls = 0;
  const worker = createFactoryMcpWorker({
    fetchImpl: async () => { calls += 1; throw new Error("must not call upstream"); },
  });
  const response = await worker.fetch(rpc(token, "go_hub_drive_get_item", { fileId: "file-a" }), {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: signingKey,
    GOHUB_OWNER_PASSCODE: "owner-passcode",
  });
  const payload = await response.json();
  assert.equal(payload.result.isError, true);
  assert.deepEqual(payload.result.structuredContent, { code: "DRIVE_NOT_CONFIGURED" });
  assert.equal(calls, 0);
});

test("Factory MCP reads native Google Doc text through the governed Drive bridge", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?drive-doc=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?drive-doc-token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const token = await createTestAccessToken({ issuer:"https://hub.example", signingKey });
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push(String(url));
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token:"fresh-doc-access", expires_in:3600 }), {
        headers:{ "content-type":"application/json" },
      });
    }
    if (String(url).startsWith("https://www.googleapis.com/drive/v3/files/doc-a")) {
      assert.equal(init.headers.authorization, "Bearer fresh-doc-access");
      return new Response(JSON.stringify({
        id:"doc-a",
        name:"LIGHT REGISTRY QUEUE — CURRENT",
        mimeType:"application/vnd.google-apps.document",
        parents:["folder-a"],
        trashed:false,
      }), { headers:{ "content-type":"application/json" } });
    }
    if (String(url) === "https://docs.googleapis.com/v1/documents/doc-a?includeTabsContent=true") {
      assert.equal(init.headers.authorization, "Bearer fresh-doc-access");
      return new Response(JSON.stringify({
        documentId:"doc-a",
        title:"LIGHT REGISTRY QUEUE — CURRENT",
        revisionId:"rev-1",
        body:{ content:[
          { paragraph:{ elements:[{ textRun:{ content:"SYSTEM / WORK\n" } }] } },
          { paragraph:{ elements:[{ textRun:{ content:"Drive Folder ID: folder-system\n" } }] } },
        ] },
      }), { headers:{ "content-type":"application/json" } });
    }
    throw new Error("unexpected upstream " + url);
  };
  const worker = createFactoryMcpWorker({ fetchImpl });
  const response = await worker.fetch(rpc(token, "go_hub_drive_read_document", {
    documentId:"doc-a",
    maxChars:5000,
  }), {
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:signingKey,
    GOHUB_OWNER_PASSCODE:"owner-passcode",
    GOOGLE_DRIVE_REFRESH_TOKEN:"refresh-secret",
    GOOGLE_DRIVE_CLIENT_ID:"client-id",
    GOOGLE_DRIVE_CLIENT_SECRET:"client-secret",
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, undefined);
  assert.equal(payload.result.structuredContent.document.id, "doc-a");
  assert.equal(payload.result.structuredContent.document.revisionId, "rev-1");
  assert.match(payload.result.structuredContent.document.text, /folder-system/);
  assert.deepEqual(payload.result.structuredContent.document.paragraphs.map(item => item.text), [
    "SYSTEM / WORK",
    "Drive Folder ID: folder-system",
  ]);
  assert.equal(payload.result.structuredContent.document.truncated, false);
  assert.equal(requests.length, 3);
  assert.doesNotMatch(JSON.stringify(payload), /refresh-secret|fresh-doc-access/);
});
