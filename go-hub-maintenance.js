import { planCloseout } from "./go-hub-housekeeper.js";
function json(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
const SAFE=new Set(["READ","PREFLIGHT","SAFE_TEST"]);
function text(v){return String(v??"").trim();}
function requireWork(input={}){
 const w=input.work||{};
 if(text(w.status)!=="ON PROCESS"||!text(w.holder)) return {ok:false,code:"MAINTENANCE_ACTIVE_WORK_REQUIRED"};
 if(w.pass?.state!=="ACTIVE"||text(w.pass?.kind).toUpperCase()!=="MAINTENANCE") return {ok:false,code:"MAINTENANCE_PASS_REQUIRED"};
 const allowed=Array.isArray(w.pass?.allowedDestinations)?w.pass.allowedDestinations:[];
 if(!allowed.includes("ALL_GO_HUB_OWNED_AREAS")) return {ok:false,code:"MAINTENANCE_SERVICE_PATH_NOT_OPEN"};
 return {ok:true,workId:w.workId,holder:w.holder};
}
function normalizeMap(map={}){
 return {source:text(map.source)||"GO_FIRST_REALITY_RUN",routes:(Array.isArray(map.routes)?map.routes:[]).map(r=>({id:text(r.id),from:text(r.from),to:text(r.to),checkpoints:(Array.isArray(r.checkpoints)?r.checkpoints:[]).map(p=>({id:text(p.id),importantValue:text(p.importantValue),expected:p.expected??null,source:text(p.source),probeAction:text(p.probeAction),mode:text(p.mode).toUpperCase()||"READ",ownerSource:text(p.ownerSource)}))}))};
}
function compare(expected,observed){
 if(expected==null||expected==="")return{status:"UNKNOWN",reason:"EXPECTED_NOT_DEFINED"};
 if(expected&&typeof expected==="object"&&Array.isArray(expected.contains)){const vals=Array.isArray(observed)?observed:[observed],missing=expected.contains.filter(v=>!vals.includes(v));return missing.length?{status:"FAIL",reason:"RELATION_MISMATCH",missing}:{status:"PASS",reason:"RELATION_PROVED"};}
 if(expected&&typeof expected==="object"&&Object.hasOwn(expected,"equals")) expected=expected.equals;
 return Object.is(expected,observed)?{status:"PASS",reason:"VALUE_PROVED"}:{status:"FAIL",reason:"VALUE_MISMATCH"};
}
async function probePoint(point,readValue){
 if(!point.id||!point.importantValue||!point.source||!point.probeAction)return{checkpointId:point.id||null,status:"UNKNOWN",reason:"MAP_POINT_INCOMPLETE"};
 if(!SAFE.has(point.mode))return{checkpointId:point.id,status:"BLOCKED",reason:"MUTATING_PROBE_FORBIDDEN"};
 try{const o=await readValue(point);if(!o||o.available===false)return{checkpointId:point.id,status:"UNKNOWN",reason:o?.reason||"OBSERVATION_UNAVAILABLE"};return{checkpointId:point.id,importantValue:point.importantValue,expected:point.expected,observed:o.value,source:point.source,ownerSource:point.ownerSource||null,evidence:o.evidence||null,...compare(point.expected,o.value)};}catch(e){return{checkpointId:point.id,status:"UNKNOWN",reason:"PROBE_READ_FAILED",error:e?.message||String(e)};}
}
async function probeRoute(route,readValue){const checkpoints=[];let stop=false;for(const p of route.checkpoints){if(stop){checkpoints.push({checkpointId:p.id,status:"NOT_CHECKED",reason:"DOWNSTREAM_OF_FIRST_BREAK"});continue;}const r=await probePoint(p,readValue);checkpoints.push(r);if(["FAIL","BLOCKED"].includes(r.status))stop=true;}const first=checkpoints.find(x=>["FAIL","BLOCKED"].includes(x.status));return{routeId:route.id,from:route.from,to:route.to,status:first?first.status:(checkpoints.some(x=>x.status==="UNKNOWN")?"UNKNOWN":"PASS"),firstBreak:first?.checkpointId||null,checkpoints};}
export function createMaintenanceV4({readValue=async()=>({available:false,reason:"READER_NOT_CONFIGURED"}),now=()=>new Date().toISOString(),traceId=()=>`maintenance-${Date.now()}`}={}){
 return Object.freeze({async run(input={}){
  const work=requireWork(input);if(!work.ok)return json(work,409);
  const action=text(input.action).toLowerCase(),map=normalizeMap(input.map||input.maintenanceMap||{});
  if(action==="inspect")return json({status:"MAINTENANCE_READY",...work,servicePath:"ALL_GO_HUB_OWNED_AREAS",autoRepair:false});
  if(action==="inspect_map")return json({status:"MAP_READY",...work,map});
  if(["run_system_check","probe_route"].includes(action)){const routes=action==="probe_route"?map.routes.filter(r=>r.id===text(input.routeId)):map.routes;if(!routes.length)return json({code:"ROUTE_NOT_FOUND"},404);const results=[];for(const route of routes)results.push(await probeRoute(route,readValue));const attention=results.some(r=>["FAIL","BLOCKED"].includes(r.status));return json({status:attention?"MAINTENANCE_CHECK_ATTENTION":"MAINTENANCE_CHECK_COMPLETE",...work,traceId:traceId(),checkedAt:now(),routes:results,autoRepair:false,next:attention?"GO_DIAGNOSE_REPAIR":(action==="probe_route"?"ROUTE_VERIFIED":"FULL_SYSTEM_CHECK_VERIFIED")});}
  if(action==="repair_context")return json({status:"REPAIR_CONTEXT",...work,servicePath:"ALL_GO_HUB_OWNED_AREAS",routeId:text(input.routeId)||null,checkpointId:text(input.checkpointId)||null,next:"GO_REPAIR_THEN_REPROBE",autoRepair:false});
  if(action==="plan_closeout")return json({status:"PLAN_READY",...work,next:"REPROBE_AFFECTED_ROUTE_THEN_FULL_SYSTEM_CHECK",plan:planCloseout(input.input||{}),autoRepair:false});
  return json({code:"MAINTENANCE_ACTION_UNAVAILABLE"},400);
 }});
}
export { normalizeMap, compare };
