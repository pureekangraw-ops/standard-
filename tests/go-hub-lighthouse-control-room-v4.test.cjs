const test=require("node:test");const assert=require("node:assert/strict");
(async()=>{
 const m=await import("../go-hub-lighthouse-control-room-v4.js");
 const work={workId:"W-LH-1",status:"ON PROCESS",holder:"GO",pass:{state:"ACTIVE",allowedDestinations:["lighthouse"]}};
 test("LIGHTHOUSE room requires Centre-authorized active pass",()=>{const room=m.createLighthouseControlRoom({work,actor:"GO",status:{connection:"ONLINE"}});assert.equal(room.realBoard.connection,"ONLINE");assert.equal(room.dataDrop.destination,"lighthouse");assert.deepEqual(room.exits,["RETURN_CENTRE"]);assert.equal(room.crossRoomRoutes,false);assert.equal(room.maintenance.scope,"LIGHTHOUSE_ONLY");assert.equal(room.maintenance.crossRoomServicePath,false);});
 test("LIGHTHOUSE room rejects entry without authorized destination",()=>assert.throws(()=>m.createLighthouseControlRoom({work:{...work,pass:{state:"ACTIVE",allowedDestinations:["github"]}},actor:"GO"}),/NOT_AUTHORIZED/));
 test("new repair destination requires Return Centre instead of route skipping",()=>{const gate=m.lighthouseExitForExternalWork({requestedDestination:"factory"});assert.equal(gate.allowedFromRoom,false);assert.equal(gate.action,"RETURN_CENTRE");assert.equal(gate.requestedDestination,"factory");});
})();
