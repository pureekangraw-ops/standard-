"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const oauthUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-oauth.mjs")).href;
const factoryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
const edgeUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-edge-worker.mjs")).href;

test("LIGHT scoped bearer token authenticates only its resource/scope/subject", async () => {
  const { createAccessToken, verifyAccessToken } = await import(oauthUrl + "?light-scope=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  const request = new Request("https://hub.example/mcp/light", {
    headers:{ authorization:"Bearer " + token },
  });
  const verified = await verifyAccessToken(request, {
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
  });
  assert.deepEqual(verified, { subject:"light", scope:"go-hub-light" });
  await assert.rejects(
    () => verifyAccessToken(request, {
      issuer:"https://hub.example",
      signingKey:"master-secret",
    }),
    /invalid access token/,
  );
});

test("LIGHT MCP exposes bounded code tools and hides delete/merge", async () => {
  const { createAccessToken } = await import(oauthUrl + "?light-token=" + Date.now());
  const { createFactoryMcpWorker } = await import(factoryUrl + "?light-tools=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  const worker = createFactoryMcpWorker({
    fetchImpl: async () => { throw new Error("network should not be used for tools/list"); },
  });
  const env = {
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
  };
  const response = await worker.fetch(new Request("https://hub.example/mcp/light", {
    method:"POST",
    headers:{
      authorization:"Bearer " + token,
      "content-type":"application/json",
      origin:"https://www.notion.so",
    },
    body:JSON.stringify({ jsonrpc:"2.0", id:1, method:"tools/list", params:{} }),
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  const names = payload.result.tools.map(tool => tool.name);
  assert.ok(names.includes("go_hub_broadcast_read"));
  assert.equal(names.includes("go_hub_broadcast_activate"), false);
  assert.ok(names.includes("go_hub_put_file"));
  assert.ok(names.includes("go_hub_create_branch"));
  assert.ok(names.includes("go_hub_open_pull_request"));
  assert.ok(names.includes("go_hub_centre_inspect"));
  assert.ok(names.includes("go_hub_v4_project_board"));
  assert.ok(names.includes("go_hub_light_centre_v4_action"));
  assert.ok(names.includes("go_hub_centre_audit_history"));
  assert.ok(names.includes("go_hub_board_read"));
  assert.ok(names.includes("go_hub_counter_create"));
  assert.ok(names.includes("go_hub_counter_inbox"));
  assert.ok(names.includes("go_hub_counter_get"));
  assert.ok(names.includes("go_hub_counter_seen"));
  assert.ok(names.includes("go_hub_counter_pickup"));
  assert.ok(names.includes("go_hub_counter_answer"));
  assert.ok(names.includes("go_hub_counter_readback"));
  assert.ok(names.includes("go_hub_gmail_search"));
  assert.ok(names.includes("go_hub_gmail_get_message"));
  assert.ok(names.includes("go_hub_gmail_send_message"));
  assert.ok(names.includes("go_hub_calendar_list"));
  assert.ok(names.includes("go_hub_calendar_events"));
  assert.ok(names.includes("go_hub_calendar_create_event"));
  assert.ok(names.includes("go_hub_drive_root"));
  assert.ok(names.includes("go_hub_drive_get_item"));
  assert.ok(names.includes("go_hub_drive_list_children"));
  assert.ok(names.includes("go_hub_drive_read_document"));
  assert.ok(names.includes("go_hub_drive_create_folder"));
  assert.ok(names.includes("go_hub_drive_upload_file"));
  assert.ok(names.includes("go_hub_drive_move_item"));
  assert.ok(names.includes("go_hub_drive_rename_item"));
  for (const name of [
    "go_hub_get_workflow_runs",
    "go_hub_list_workflow_artifacts",
    "go_hub_audit_history",
    "go_hub_centre_read_only_fast_lane",
    "go_hub_lighthouse_control_port_state",
    "go_hub_project_status",
    "go_hub_board_pin_route",
    "go_hub_observer_latest",
    "go_hub_observer_screenshot",
    "go_hub_linear_list_projects",
    "go_hub_linear_get_issue",
  ]) assert.ok(names.includes(name), "LIGHT should inherit read-only tool " + name);
  assert.equal(names.includes("go_hub_delete_file"), false);
  assert.equal(names.includes("go_hub_merge_pull_request"), false);
  assert.equal(names.includes("go_hub_centre_live_action"), false);
  for (const name of [
    "go_hub_heimdall_pass",
    "go_hub_maintenance",
    "go_hub_factory_v4",
    "go_hub_lighthouse_control_port_command",
    "go_hub_linear_create_issue",
    "go_hub_linear_update_issue",
    "go_hub_archive_workflow_artifact",
    "go_hub_rerun_failed_jobs",
  ]) assert.equal(names.includes(name), false, "LIGHT should not inherit mutation " + name);
  assert.equal(payload.result.tools.some(tool => Object.hasOwn(tool, "securitySchemes")), false);
});

test("LIGHT Drive upload is exposed as bounded mutation and rejects bad SHA before upstream", async () => {
  const { createAccessToken } = await import(oauthUrl + "?light-upload-token=" + Date.now());
  const { createFactoryMcpWorker } = await import(factoryUrl + "?light-upload=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  let calls = 0;
  const worker = createFactoryMcpWorker({
    fetchImpl: async () => { calls += 1; throw new Error("bad SHA must fail before upstream"); },
  });
  const response = await worker.fetch(new Request("https://hub.example/mcp/light", {
    method:"POST",
    headers:{ authorization:"Bearer " + token, "content-type":"application/json", origin:"https://www.notion.so" },
    body:JSON.stringify({
      jsonrpc:"2.0",
      id:2,
      method:"tools/call",
      params:{
        name:"go_hub_drive_upload_file",
        arguments:{
          parentId:"governed-root",
          name:"pixie.zip",
          mimeType:"application/zip",
          contentBase64:"cGl4aWU=",
          size:5,
          sha256:"0".repeat(64),
          workContext:{
            workId:"WORK-LIGHT-UPLOAD-1",
            checkpointId:"CP-LIGHT-UPLOAD-1",
            returnAddress:"CP-LIGHT-UPLOAD-1",
            destination:"destination://drive",
            task:"Upload staging artifact",
            requestedResult:"Drive readback PASS",
            lensReference:"role://light-staging-upload",
          },
        },
      },
    }),
  }), {
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.code, "DRIVE_UPLOAD_SHA256_MISMATCH");
  assert.equal(calls, 0);
});


test("LIGHT Centre read tools perform bounded read-only calls", async () => {
  const { createAccessToken } = await import(oauthUrl + "?light-centre-read=" + Date.now());
  const { createFactoryMcpWorker } = await import(factoryUrl + "?light-centre-read=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  const workId = "WORK-LIGHT-MONITOR-20260921-001";
  const checkpointId = "CP-LIGHT-MONITOR-001";
  const centreEvents = [
    { sequence:1, event:{ type:"TOOL_MUTATION_WRITE", workId, checkpointId } },
    { sequence:2, event:{ type:"CENTRE_AWAY", workId, checkpointId } },
    { sequence:3, event:{ type:"TOOL_MUTATION_OPEN_PR", workId, checkpointId } },
    { sequence:4, event:{ type:"CENTRE_RETURN", workId, checkpointId } },
    { sequence:5, event:{ type:"TOOL_MUTATION_CI", workId, checkpointId } },
    { sequence:6, event:{ type:"CENTRE_VALIDATE", workId, checkpointId } },
  ];
  let inspectCalls = 0;
  const centreNamespace = {
    getByName(name) {
      assert.equal(name, workId);
      return { fetch: async request => {
        const input = await request.json();
        inspectCalls += 1;
        if (input.action === "v4_inspect") {
          assert.deepEqual(input, { action:"v4_inspect", workId, checkpointId, returnAddress:checkpointId });
          return new Response(JSON.stringify({ code:"unsupported Centre live action" }), {
            status:400,
            headers:{ "content-type":"application/json" },
          });
        }
        assert.deepEqual(input, { action:"inspect", workId, checkpointId, returnAddress:checkpointId });
        return new Response(JSON.stringify({
          ok:true,
          phase:"AWAY",
          work:{ workId, checkpointId, targetId:"standard", status:"AWAY" },
          realityExists:false,
          realityEvidence:null,
          validationEvidence:null,
        }), { headers:{ "content-type":"application/json" } });
      }};
    },
  };
  const auditNamespace = {
    getByName() {
      return { fetch: async request => {
        const input = await request.json();
        const afterSequence = Number(input.afterSequence || 0);
        const limit = Number(input.limit || 100);
        const events = centreEvents.filter(record => record.sequence > afterSequence).slice(0, limit);
        return new Response(JSON.stringify({ ok:true, afterSequence, events, lastSequence:6 }), {
          headers:{ "content-type":"application/json" },
        });
      }};
    },
  };
  const worker = createFactoryMcpWorker({ fetchImpl: async () => { throw new Error("network should not be used"); } });
  const env = {
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
    GO_HUB_CENTRE_STATE:centreNamespace,
    GO_HUB_GLOBAL_AUDIT:auditNamespace,
  };
  async function call(id, name, args) {
    const response = await worker.fetch(new Request("https://hub.example/mcp/light", {
      method:"POST",
      headers:{ authorization:"Bearer " + token, "content-type":"application/json", origin:"https://www.notion.so" },
      body:JSON.stringify({ jsonrpc:"2.0", id, method:"tools/call", params:{ name, arguments:args } }),
    }), env);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.error, undefined);
    return JSON.parse(payload.result.content[0].text);
  }

  const inspected = await call(2, "go_hub_centre_inspect", { workId, checkpointId });
  assert.equal(inspected.phase, "AWAY");
  assert.equal(inspected.work.workId, workId);
  assert.equal(inspectCalls, 2);

  const first = await call(3, "go_hub_centre_audit_history", { workId, afterSequence:0, limit:1 });
  assert.deepEqual(first.events.map(record => record.sequence), [2]);
  assert.equal(first.nextSequence, 2);
  assert.equal(first.events.every(record => record.event.type.startsWith("CENTRE_")), true);

  const second = await call(4, "go_hub_centre_audit_history", { workId, afterSequence:first.nextSequence, limit:1 });
  assert.deepEqual(second.events.map(record => record.sequence), [4]);
  assert.equal(second.nextSequence, 4);
  assert.equal(second.events.every(record => record.event.type.startsWith("CENTRE_")), true);
});

test("LIGHT V4 tool rejects Return and waiting on another holder's Work", async () => {
  const { createAccessToken } = await import(oauthUrl + "?light-v4-guard=" + Date.now());
  const { createFactoryMcpWorker } = await import(factoryUrl + "?light-v4-guard=" + Date.now());
  const token = await createAccessToken({ issuer:"https://hub.example", signingKey:"master-secret", resource:"https://hub.example/mcp/light", subject:"light", scope:"go-hub-light", ttlSeconds:3600 });
  const workId = "WORK-LIGHT-V4-GUARD";
  const checkpointId = "CP-LIGHT-V4-GUARD";
  const calls = [];
  const worker = createFactoryMcpWorker({ fetchImpl:async () => { throw new Error("network disabled"); } });
  const env = { GITHUB_TOKEN:"github-token", GOHUB_MASTER_KEY:"master-secret", GOHUB_OWNER_PASSCODE:"owner-passcode",
    GO_HUB_CENTRE_STATE:{ getByName:() => ({ fetch:async request => {
      const input = await request.json(); calls.push(input.action);
      return new Response(JSON.stringify({ ok:true, v4:true, work:{ workId, checkpointId, holder:"GO", status:"ON PROCESS" } }), { headers:{ "content-type":"application/json" } });
    } }) },
  };
  async function call(id, action) {
    const response = await worker.fetch(new Request("https://hub.example/mcp/light", { method:"POST", headers:{ authorization:"Bearer " + token, "content-type":"application/json", origin:"https://www.notion.so" }, body:JSON.stringify({ jsonrpc:"2.0", id, method:"tools/call", params:{ name:"go_hub_light_centre_v4_action", arguments:{ action, workId, checkpointId, reason:"pause" } } }) }), env);
    return response.json();
  }
  await call(1, "v4_return");
  assert.deepEqual(calls, []);
  const waiting = await call(2, "v4_wait");
  assert.match(JSON.stringify(waiting), /LIGHT_CENTRE_HOLDER_REQUIRED/);
  assert.deepEqual(calls, ["v4_inspect"]);
});

test("LIGHT MCP board.read returns bounded authoritative Board truth without mutation tools", async () => {
  const { createAccessToken } = await import(oauthUrl + "?light-board-read=" + Date.now());
  const { createFactoryMcpWorker } = await import(factoryUrl + "?light-board-read=" + Date.now());
  const token = await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
    ttlSeconds:3600,
  });
  const lighthouseNamespace = {
    getByName(name) {
      assert.equal(name, "lighthouse-control-port-v1");
      return {
        async fetch(request) {
          assert.equal(new URL(request.url).pathname, "/board/latest");
          return new Response(JSON.stringify({
            ok:true,
            board:{
              boardId:"BOARD-LIGHTHOUSE-CENTRE",
              revision:7,
              pins:[{ pinId:"PIN:WORK-BOARD-1", workId:"WORK-BOARD-1", status:"DOING" }],
              updatedAt:"2026-09-21T00:30:00.000Z",
              audit:[{ type:"BOARD_UPDATED" }],
            },
          }), { status:200, headers:{ "content-type":"application/json" } });
        },
      };
    },
  };
  const worker = createFactoryMcpWorker({ fetchImpl: async () => { throw new Error("network should not be used"); } });
  const response = await worker.fetch(new Request("https://hub.example/mcp/light", {
    method:"POST",
    headers:{ authorization:"Bearer " + token, "content-type":"application/json", origin:"https://www.notion.so" },
    body:JSON.stringify({
      jsonrpc:"2.0",
      id:20,
      method:"tools/call",
      params:{ name:"go_hub_board_read", arguments:{} },
    }),
  }), {
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
    LIGHTHOUSE_CONTROL_PORT_SESSIONS:lighthouseNamespace,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.error, undefined);
  const board = JSON.parse(payload.result.content[0].text);
  assert.deepEqual(board, {
    ok:true,
    boardId:"BOARD-LIGHTHOUSE-CENTRE",
    revision:7,
    pins:[{ pinId:"PIN:WORK-BOARD-1", workId:"WORK-BOARD-1", status:"DOING" }],
    updatedAt:"2026-09-21T00:30:00.000Z",
  });
  assert.equal(Object.hasOwn(board, "audit"), false);
});

test("LIGHT owner page mints scoped bearer without echoing owner passcode", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?light-owner=" + Date.now());
  const { verifyAccessToken } = await import(oauthUrl + "?light-verify=" + Date.now());
  const handler = createEdgeWorkerHandler({
    delegate:{ fetch:async () => new Response("delegate") },
    factoryMcp:{ fetch:async () => new Response("factory") },
  });
  const env = {
    GOHUB_MASTER_KEY:"master-secret",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
  };
  const form = new FormData();
  form.set("passcode", "owner-passcode");
  const response = await handler.fetch(new Request("https://hub.example/hub/light-mcp", {
    method:"POST",
    body:form,
  }), env);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /https:\/\/hub\.example\/mcp\/light/);
  assert.equal(body.includes("owner-passcode"), false);
  const textareaValues = [...body.matchAll(/<textarea[^>]*>([^<]+)<\/textarea>/g)].map(match => match[1]);
  assert.equal(textareaValues.length, 2);
  const token = textareaValues[1];
  const verified = await verifyAccessToken(new Request("https://hub.example/mcp/light", {
    headers:{ authorization:"Bearer " + token },
  }), {
    issuer:"https://hub.example",
    signingKey:"master-secret",
    resource:"https://hub.example/mcp/light",
    subject:"light",
    scope:"go-hub-light",
  });
  assert.equal(verified.subject, "light");
});
