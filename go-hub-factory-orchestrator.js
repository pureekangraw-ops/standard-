import { produceReadyGate } from "./go-hub-ready-gate-producer.js";
import { assembleReadyPieces } from "./go-hub-assembly-bench.js";
import { evaluateAssemblyQc } from "./go-hub-assembly-qc.js";
import { deriveFactoryNextAction } from "./go-hub-factory-authority.js";

export function advanceFactoryLifecycle(snapshot = {}) {
  const action = deriveFactoryNextAction(snapshot);
  if (!action) return Object.freeze({status:"NO_FACTORY_STAGE",nextAction:null,snapshot});
  if (action === "ready-gate") {
    const produced=produceReadyGate({workPackage:snapshot.workPackage,piece:snapshot.piece,blueprint:snapshot.blueprint,pieceQc:snapshot.pieceQc,evidence:snapshot.evidence,ci:snapshot.ci,knownLimitations:snapshot.knownLimitations});
    return Object.freeze({status:"ADVANCED",factoryStage:"READY_GATE",nextAction:"assemble",readyGate:produced.readyGate});
  }
  if (action === "assemble") {
    const assembly=assembleReadyPieces({id:snapshot.assemblyId,blueprint:snapshot.blueprint,handoffs:[snapshot.readyGate],repository:snapshot.readyGate?.repository,integrationBranch:snapshot.integrationBranch,integrationHeadSha:snapshot.integrationHeadSha});
    return Object.freeze({status:"ADVANCED",factoryStage:"ASSEMBLY",nextAction:"assembly-qc",assembly});
  }
  if (action === "assembly-qc") {
    const assemblyQc=evaluateAssemblyQc({assembly:snapshot.assembly,blueprint:snapshot.blueprint,evidence:snapshot.evidence});
    return Object.freeze({status:assemblyQc.status==="pass"?"ADVANCED":"BLOCKED",factoryStage:"ASSEMBLY_QC",nextAction:assemblyQc.status==="pass"?"merge-gate":"fix-assembly",assemblyQc});
  }
  return Object.freeze({status:"DELEGATE",factoryStage:snapshot.factoryStage,nextAction:action});
}
