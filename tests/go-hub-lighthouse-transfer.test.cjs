"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const transferUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-lighthouse-transfer.mjs")).href;
const serviceUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-lighthouse-control-port-service.mjs")).href;

test("LIGHTHOUSE transfer catalog mirrors the 38 current Control Port capabilities", async () => {
  const transfer = await import(transferUrl + "?catalog=" + Date.now());
  const all = transfer.listLighthouseTransferCapabilities();

  assert.equal(all.length, 38);
  assert.equal(new Set(all.map(item => item.id)).size, 38);
  assert.equal(all[0].id, "system.health");
  assert.equal(all.at(-1).id, "security.vault");

  const expense = transfer.getLighthouseTransferCapability("finance.expense.create");
  assert.deepEqual({
    owner:expense.owner,
    action:expense.action,
    readback:expense.readback,
    confirmationRequired:expense.confirmationRequired,
  }, {
    owner:"GREENFIELD:LEDGER",
    action:"recordExpense",
    readback:"readLedgerTruth.transactions",
    confirmationRequired:true,
  });
  assert.deepEqual(expense.payloadTemplate, { title:"", amountBaht:0 });
});

test("transfer envelope derives route from the catalog and never trusts imported route metadata", async () => {
  const transfer = await import(transferUrl + "?route=" + Date.now());
  const normalized = transfer.normalizeLighthouseTransferEnvelope({
    contract:"lighthouse-transfer-v1",
    targetId:"lighthouse",
    requestId:"LH-EXPENSE-001",
    capabilityId:"finance.expense.create",
    route:{ owner:"WRONG", action:"deleteEverything", readback:null, confirmationRequired:false },
    payload:{ title:"ข้าว", amountBaht:65 },
  });

  assert.equal(normalized.route.owner, "GREENFIELD:LEDGER");
  assert.equal(normalized.route.action, "recordExpense");
  assert.equal(normalized.route.readback, "readLedgerTruth.transactions");
  assert.equal(normalized.route.confirmationRequired, true);
  assert.deepEqual(normalized.payload, { title:"ข้าว", amountBaht:65 });
});

test("transfer files cannot queue read-only or locked capabilities", async () => {
  const transfer = await import(transferUrl + "?readonly=" + Date.now());
  for (const capabilityId of ["finance.balance", "security.pin"]) {
    assert.throws(() => transfer.normalizeLighthouseTransferEnvelope({
      contract:"lighthouse-transfer-v1",
      targetId:"lighthouse",
      requestId:"LH-BLOCKED-001",
      capabilityId,
      payload:{},
    }), /LIGHTHOUSE_TRANSFER_CAPABILITY_NOT_WRITABLE/);
  }
});

test("owner page exposes send plus JSON import/export without exposing a stored owner secret", async () => {
  const service = await import(serviceUrl + "?owner-page=" + Date.now());
  const response = service.lighthouseControlPortOwnerPage();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /LIGHTHOUSE Transfer Form/);
  assert.match(html, /Send to LIGHTHOUSE/);
  assert.match(html, /Export JSON/);
  assert.match(html, /Import JSON/);
  assert.match(html, /finance\.expense\.create/);
  assert.match(html, /security\.vault/);
  assert.match(html, /lighthouse-transfer-v1/);
  assert.doesNotMatch(html, /value="[^"]*GOHUB_OWNER_PASSCODE/);
});

test("owner command queues one normalized transfer packet behind owner passcode", async () => {
  const service = await import(serviceUrl + "?owner-command=" + Date.now());
  const calls = [];
  const namespace = {
    getByName(name) {
      assert.equal(name, "lighthouse-control-port-v1");
      return {
        async fetch(request) {
          calls.push({
            path:new URL(request.url).pathname,
            body:JSON.parse(await request.text()),
          });
          return new Response(JSON.stringify({ ok:true, queuedAt:"2026-09-21T13:30:00+07:00" }), {
            status:200,
            headers:{ "content-type":"application/json" },
          });
        },
      };
    },
  };
  const http = service.createLighthouseControlPortHttpService({
    namespace,
    ownerPasscode:"owner-secret",
  });

  const response = await http.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/owner-command", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-go-owner-passcode":"owner-secret",
    },
    body:JSON.stringify({
      contract:"lighthouse-transfer-v1",
      targetId:"lighthouse",
      requestId:"LH-EXPENSE-002",
      capabilityId:"finance.expense.create",
      route:{ owner:"SPOOFED" },
      payload:{ title:"กาแฟ", amountBaht:55 },
    }),
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.route.owner, "GREENFIELD:LEDGER");
  assert.equal(body.route.action, "recordExpense");
  assert.deepEqual(calls, [{
    path:"/enqueue",
    body:{
      requestId:"LH-EXPENSE-002",
      capabilityId:"finance.expense.create",
      payload:{ title:"กาแฟ", amountBaht:55 },
    },
  }]);
});

test("owner command rejects wrong passcode before touching the paired session", async () => {
  const service = await import(serviceUrl + "?owner-auth=" + Date.now());
  let calls = 0;
  const namespace = {
    getByName() {
      return { async fetch() { calls += 1; return new Response("{}", { status:200 }); } };
    },
  };
  const http = service.createLighthouseControlPortHttpService({
    namespace,
    ownerPasscode:"owner-secret",
  });
  const response = await http.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/owner-command", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-go-owner-passcode":"wrong",
    },
    body:JSON.stringify({
      contract:"lighthouse-transfer-v1",
      targetId:"lighthouse",
      requestId:"LH-EXPENSE-003",
      capabilityId:"finance.expense.create",
      payload:{ title:"x", amountBaht:1 },
    }),
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "OWNER_AUTH_FAILED");
  assert.equal(calls, 0);
});


test("owner-state returns app state, returned reports, commands and board reality", async () => {
  const service = await import(serviceUrl + "?owner-state-rich=" + Date.now());
  const namespace = {
    getByName(name) {
      assert.equal(name, "lighthouse-control-port-v1");
      return {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/latest") {
            return new Response(JSON.stringify({
              ok:true,
              session:{ sessionId:"lh-rich", active:true, lastSeenAt:1234 },
              latest:{ screen:"HOME", health:"OK" },
              commands:[{ requestId:"REQ-1", status:"RECEIPT" }],
              receipts:[{ requestId:"REQ-1", status:"OK", at:"2026-09-24T02:10:00Z" }],
              reconciliation:{ cursor:3, lastError:null },
            }), { status:200, headers:{ "content-type":"application/json" } });
          }
          if (pathname === "/board/latest") {
            return new Response(JSON.stringify({ ok:true, board:{ revision:9, pins:[], updatedAt:"2026-09-24T02:10:00Z" } }), { status:200, headers:{ "content-type":"application/json" } });
          }
          return new Response(JSON.stringify({ ok:false, code:"NOT_FOUND" }), { status:404, headers:{ "content-type":"application/json" } });
        },
      };
    },
  };
  const http = service.createLighthouseControlPortHttpService({ namespace, ownerPasscode:"owner-secret" });
  const response = await http.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/owner-state", {
    method:"POST",
    headers:{ "x-go-owner-passcode":"owner-secret" },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.sourceStatus, "ACTIVE");
  assert.equal(body.appState.screen, "HOME");
  assert.equal(body.receipts[0].requestId, "REQ-1");
  assert.equal(body.commands[0].status, "RECEIPT");
  assert.equal(body.reconciliation.cursor, 3);
  assert.equal(body.board.revision, 9);
});
