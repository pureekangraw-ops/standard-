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
  const capability = mimirModule.createMimirSearchDestination({ async search(query) { seen.push(query); if (search) return search(query); return [{ id: "source-record-1", name: "Observed capability", source: "MIMIR owner registry", verifiedAt: "2026-09-14" }]; } });
  const centre = centreModule.createCentrePassage();
  const reviewed = centre.review(centre.enter({ checkpointId: "CENTRE-001", workId: "WORK-A" }), { task: "Find a repository capability", requestedResult: "Return relevant source records", authority: "BIG" });
  const fitted = centre.fit(reviewed, { lensId: "LENS-SEARCH", lensReference: "lens://search", fittedView: "Find relevant source without inventing missing fields" });
  const away = centre.leave(fitted, { destination: mimirModule.MIMIR_DESTINATION }).work;
  const access = centreModule.admitDestination(away, { destination: mimirModule.MIMIR_DESTINATION, capability });
  return { centre, away, access, capability, seen, mimirModule };
}

function liveLikeCatalog() {
  return [
    { "ชื่อ": "Python", "ประเภท": "Tool", "คุณสมบัติ": "คำนวณ วิเคราะห์ข้อมูล ตรวจตรรกะ ประมวลไฟล์ และสร้างผลลัพธ์เชิงข้อมูล", "Where / Surface": "ChatGPT Android/Web/Desktop ในแชทนี้", "สถานะ": "พร้อมใช้", "สถานะปัจจุบัน": "Active", "Permission": "Allowed", "Callable Action / Tool Exposure": "Available", "Route": "GO → Python เมื่อโจทย์ต้องคำนวณ วิเคราะห์ หรือตรวจด้วยโค้ด", "ข้อจำกัด / ข้อควรระวัง": "ตรวจสมมติฐานและหน่วยก่อนสรุปผล", "date:Verified Date:start": "2026-09-13T07:46:00.000+07:00", "date:Modified Date:start": "2026-09-13T07:46:00.000+07:00", "url": "https://notion.test/python" },
    { "ชื่อ": "Web", "ประเภท": "Tool", "คุณสมบัติ": "ค้นข้อมูลสดจากอินเทอร์เน็ต เปิดเว็บ ติดตามลิงก์ ค้นภาพ สินค้า ร้านค้า และข้อมูลสาธารณะ", "Where / Surface": "ChatGPT Android/Web/Desktop ในแชทนี้", "สถานะ": "พร้อมใช้", "สถานะปัจจุบัน": "Active", "Permission": "Allowed", "Callable Action / Tool Exposure": "Available", "Route": "GO → Web เมื่อข้อมูลเป็นสาธารณะ/สด → search/open/click/find ตามโจทย์", "ข้อจำกัด / ข้อควรระวัง": "ไม่ใช้แทนแหล่งข้อมูลส่วนตัวที่มี connector โดยตรง; ข้อมูลจากเว็บต้องอ้างอิงแหล่งที่ตรวจสอบได้", "date:Verified Date:start": "2026-09-13T07:46:00.000+07:00", "date:Modified Date:start": "2026-09-13T07:46:00.000+07:00", "url": "https://notion.test/web" },
    { "ชื่อ": "Notion", "ประเภท": "Connector", "คุณสมบัติ": "ค้น อ่าน สร้าง และแก้ไขฐานความรู้/หน้า/ฐานข้อมูลใน Notion ของผู้ใช้", "สถานะ": "พร้อมใช้", "สถานะปัจจุบัน": "พร้อมใช้", "วิธีใช้": "ค้นของเดิมก่อน → Fetch ต้นทาง → เลือก Skill ที่ตรง → แก้หรือสร้างเฉพาะส่วนที่ต้องการ → Verify เมื่อเป็นการแก้โครงสร้าง", "ข้อจำกัด / ข้อควรระวัง": "ห้ามสร้างซ้ำโดยไม่ค้นของเดิม และควรใช้ schema จริงของ database ก่อนเขียนข้อมูล", "url": "https://notion.test/notion" },
  ];
}

test("CENTRE sends the minimum query and MIMIR returns to the same checkpoint", async () => {
  const result = await outboundMimirAccess(); const packet = await result.capability.accept(result.access);
  assert.deepEqual(Object.keys(result.seen[0]).sort(), ["lensReference", "requestedResult", "task"]);
  for (const inferredCoordinate of ["who", "why", "what", "where", "when"]) assert.equal(Object.hasOwn(result.seen[0], inferredCoordinate), false);
  assert.equal(packet.workId, "WORK-A"); assert.equal(packet.checkpointId, "CENTRE-001"); assert.equal(packet.payload.status, "PASS"); assert.equal(packet.payload.records[0].source, "MIMIR owner registry"); assert.equal(packet.payload.next, "GO_DECIDE");
  const returned = result.centre.return(result.away, packet); assert.equal(returned.status, "RETURNED"); assert.equal(returned.workId, "WORK-A"); assert.equal(returned.checkpointId, "CENTRE-001");
});

test("Notion-shaped catalog stock selects a usable fit before a blocked five-star item", async () => {
  const result = await outboundMimirAccess(); const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({ async readCatalog() { return [
    { "ชื่อ": "Python Legacy", "ประเภท": "Tool", "คุณสมบัติ": "Python calculate analyze data", "สถานะ": "พร้อมใช้", "สถานะปัจจุบัน": "Blocked", "Permission": "Blocked", "Callable Action / Tool Exposure": "Available", "GO Rating": "5.0", "Route": "blocked route", "date:Verified Date:start": "2026-09-13T00:46:00.000Z", "url": "https://notion.test/python-legacy" },
    { "ชื่อ": "Python", "ประเภท": "Tool", "คุณสมบัติ": "Python calculate analyze data", "สถานะ": "พร้อมใช้", "สถานะปัจจุบัน": "Active", "Permission": "Allowed", "Callable Action / Tool Exposure": "Available", "GO Rating": "1.0", "Route": "GO -> Python", "date:Verified Date:start": "2026-09-13T00:46:00.000Z", "date:Modified Date:start": "2026-09-13T00:46:00.000Z", "url": "https://notion.test/python" },
  ]; } });
  const catalogResult = await searchCatalog({ task: "Use Python to calculate", requestedResult: "Analyze data", lensReference: "lens://tool-fit" });
  assert.equal(catalogResult.status, "PASS"); assert.equal(catalogResult.records[0].name, "Python"); assert.equal(catalogResult.route, "GO -> Python"); assert.equal(catalogResult.evidence.gateBeforeRating, true);
});

test("information registry intent prefers Notion connector over generic Python data capability", async () => {
  const result = await outboundMimirAccess(); const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({ async readCatalog() { return [
    { "ชื่อ": "Python", "ประเภท": "Tool", "คุณสมบัติ": "calculate analyze data process files database", "สถานะปัจจุบัน": "Active", "Permission": "Allowed", "Callable Action / Tool Exposure": "Available", "Route": "GO -> Python", "date:Verified Date:start": "2026-09-15", "url": "https://notion.test/python" },
    { "ชื่อ": "Notion", "ประเภท": "Connector", "คุณสมบัติ": "manage Notion database information registry pages schema", "สถานะปัจจุบัน": "Active", "Permission": "Allowed", "Callable Action / Tool Exposure": "Available", "Route": "GO Hub -> Notion", "date:Verified Date:start": "2026-09-15", "url": "https://notion.test/notion" },
  ]; } });
  const catalogResult = await searchCatalog({ task: "จัดการ Notion database สำหรับ information registry", requestedResult: "สร้างและค้นข้อมูลใน database ผ่าน GO Hub", lensReference: "MIMIR Information" });
  assert.equal(catalogResult.status, "PASS"); assert.equal(catalogResult.records[0].name, "Notion"); assert.equal(catalogResult.route, "GO Hub -> Notion");
});

test("live-like Notion intent fails closed on the matching incomplete connector instead of substituting Python or Web", async () => {
  const result = await outboundMimirAccess(); const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({ async readCatalog() { return liveLikeCatalog(); } });
  const catalogResult = await searchCatalog({ task: "จัดการ Notion database สำหรับ METROPOLIS INFORMATION REGISTRY ให้ GO ใช้ผ่าน GO Hub MIMIR Information", requestedResult: "ค้นหา record หรือ capability สำหรับอ่าน ค้นหา จัดการ schema page database ของ Notion information registry ผ่าน GO Hub", lensReference: "MIMIR Information / FIT BEFORE INVENT / Information Source Routing" });
  assert.equal(catalogResult.status, "WAIT");
  assert.equal(catalogResult.waitReason, "MISSING_DECISION_CRITICAL_FIELD");
  assert.equal(catalogResult.records[0].name, "Notion");
  assert.equal(catalogResult.route, null);
});

test("explicit Notion connector intent cannot fall through to a usable Web record", async () => {
  const result = await outboundMimirAccess(); const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({ async readCatalog() { return liveLikeCatalog(); } });
  const catalogResult = await searchCatalog({ task: "search and edit Notion workspace", requestedResult: "find Notion connector", lensReference: "connector" });
  assert.equal(catalogResult.status, "WAIT");
  assert.equal(catalogResult.records[0].name, "Notion");
  assert.equal(catalogResult.route, null);
});

test("missing decision-critical Gate fields return WAIT instead of assumed access", async () => {
  const result = await outboundMimirAccess(); const searchCatalog = result.mimirModule.createMimirCatalogSearchPort({ async readCatalog() { return [{ "ชื่อ": "Notion", "ประเภท": "Connector", "คุณสมบัติ": "search and edit Notion workspace", "สถานะ": "พร้อมใช้", "วิธีใช้": "Search then fetch", "url": "https://notion.test/notion" }]; } });
  const catalogResult = await searchCatalog({ task: "Search Notion", requestedResult: "Find existing data" });
  assert.equal(catalogResult.status, "WAIT"); assert.equal(catalogResult.waitReason, "MISSING_DECISION_CRITICAL_FIELD"); assert.equal(catalogResult.route, null); assert.equal(catalogResult.records[0].name, "Notion");
});

test("structured MIMIR PASS result carries route and evidence back through CENTRE", async () => {
  const result = await outboundMimirAccess(async () => ({ status: "PASS", waitReason: null, records: [{ id: "python-record", name: "Python", source: "https://notion.test/python" }], route: "GO -> Python", evidence: { source: "https://notion.test/python", verifiedAt: "2026-09-13", gateBeforeRating: true } })); const packet = await result.capability.accept(result.access); const returned = result.centre.return(result.away, packet);
  assert.equal(returned.checkpointId, "CENTRE-001"); assert.equal(returned.returnedPayload.status, "PASS"); assert.equal(returned.returnedPayload.route, "GO -> Python"); assert.equal(returned.returnedPayload.evidence.gateBeforeRating, true);
});

test("MIMIR returns explicit WAIT when catalog sees no record", async () => { const result = await outboundMimirAccess(async () => ({ status: "WAIT", waitReason: "NO_MATCH", records: [], route: null })); const packet = await result.capability.accept(result.access); assert.equal(packet.payload.status, "WAIT"); assert.equal(packet.payload.waitReason, "NO_MATCH"); assert.deepEqual(packet.payload.records, []); assert.equal(packet.payload.sourceObserved, true); assert.equal(packet.payload.next, "GO_REVIEW_WAIT"); });

test("MIMIR preserves source failure as WAIT instead of inventing data", async () => { const result = await outboundMimirAccess(); const unavailable = result.mimirModule.createMimirSearchDestination({ async search() { throw new Error("registry offline"); } }); const packet = await unavailable.accept({ ...result.access, capability: unavailable }); assert.equal(packet.payload.status, "WAIT"); assert.equal(packet.payload.waitReason, "SOURCE_UNAVAILABLE"); assert.equal(packet.payload.sourceObserved, false); assert.deepEqual(packet.payload.records, []); assert.equal(packet.payload.route, null); });

test("GO Hub adapter contains no copied registry products or owner truth", () => { const source = fs.readFileSync(path.join(root, "go-hub-mimir-destination.js"), "utf8"); assert.equal(source.includes("MIMIR_REGISTRY"), false); assert.equal(source.includes("github-chatgpt-connector"), false); assert.equal(source.includes("owner-logic-seal-v1"), false); assert.equal(source.includes("pureekangraw-ops/"), false); });
