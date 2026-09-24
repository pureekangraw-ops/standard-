const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"../go-hub-lighthouse-control-port-service.mjs"),"utf8");
test("LIGHTHOUSE owner UI is a closed control room",()=>{for(const text of ["LIGHTHOUSE Control Room","Live Reality Board","Data Drop → LIGHTHOUSE","Report Inbox + LIGHTHOUSE Maintenance","Return Centre","No cross-room Service Path"])assert.ok(source.includes(text),text);});
test("LIGHTHOUSE control room exposes owner-source reality read",()=>{assert.match(source,/owner-state/);assert.match(source,/sessions\.latest\(\)/);assert.match(source,/sessions\.latestBoard\(\)/);});
test("LIGHTHOUSE room does not advertise direct Factory or GitHub exits",()=>{const room=source.slice(source.indexOf("<h1>LIGHTHOUSE Control Room"),source.indexOf("<script>"));assert.doesNotMatch(room,/Factory Pass|GitHub Pass|Open Factory|Open GitHub/);});
