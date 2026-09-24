import { createCentreBackedWorkIndex } from "./go-hub-centre-v4.js";
import { createHeimdallV4 } from "./go-hub-heimdall-v4.js";
import { enterFactoryV4, factoryBoardView } from "./go-hub-factory-v4.js";
import { createMaintenanceV4 } from "./go-hub-maintenance.js";

export const V4_PROJECT_TYPES=Object.freeze(["WORK_CENTRE","FACTORY","MAINTENANCE"]);
export const V4_PASS_KINDS=Object.freeze(["WORK","READ","MAINTENANCE","EMERGENCY"]);
export const LEGACY_OWNERS=Object.freeze(["HephaestusForeman","Ready Gate","Foreman","QC gate","Evidence Gate","RCA"]);
export const CUTOVER_CONTRACT=Object.freeze({ownerSource:"Centre Durable Store",board:"read-model/index-only",projectTypes:V4_PROJECT_TYPES,passKinds:V4_PASS_KINDS,factoryLifecycle:["PLAN","BUILD","ASSEMBLY","MERGE","CHECK","OUTPUT"],maintenanceActions:["inspect_map","run_system_check","probe_route","repair_context","plan_closeout"],legacyCallers:"QUARANTINED"});

export function createGoHubV4({storage,works=[],readValue,now,traceId}={}){const index=createCentreBackedWorkIndex({storage});const heimdall=createHeimdallV4({works,workIndex:index});const maintenance=createMaintenanceV4({storage,readValue,now,traceId});return Object.freeze({index,heimdall,maintenance,contract:CUTOVER_CONTRACT,async report(){return heimdall.report();},async projectBoard(){return heimdall.projectBoard();},factory(input){return enterFactoryV4(input);},factoryBoard(state){return factoryBoardView(state);}});}
