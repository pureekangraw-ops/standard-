const test=require("node:test");const assert=require("node:assert/strict");
(async()=>{
 const m=await import("../go-hub-lighthouse-control-room-v4.js");
 const work={workId:"W-LH-1",status:"ON PROCESS",holder:"GO",pass:{state:"ACTIVE",allowedDestinations:["lighthouse"]}};
 test("LIGHTHOUSE room requires Centre-authorized active pass",()=>{const room=m.createLighthouseControlRoom({work,actor:"GO",status:{connection:"ONLINE"}});assert.equal(room.realBoard.connection,"ONLINE");assert.equal(room.dataDrop.destination,"lighthouse");});
 test("LIGHTHOUSE room rejects entry without authorized destination",()=>assert.throws(()=>m.createLighthouseControlRoom({work:{...work,pass:{state:"ACTIVE",allowedDestinations:["github"]}},actor:"GO"}),/NOT_AUTHORIZED/));
 test("new repair destination requires Return Centre instead of route skipping",()=>{const gate=m.requireCentreReturnForLighthouseMutation({requestedDestination:"github",currentPass:work.pass});assert.equal(gate.allowed,false);assert.equal(gate.action,"RETURN_CENTRE");});
})();
