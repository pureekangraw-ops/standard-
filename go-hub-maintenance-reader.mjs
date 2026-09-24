import { getCityDestination } from "./go-hub-route-contract.js";

const STANDARD_REPO="pureekangraw-ops/standard-";
const ALLOWED_BINDINGS=new Set([
  "GO_HUB_CENTRE_STATE","GO_HUB_FACTORY_STATE","GO_HUB_COUNTER_STATE","GO_HUB_GLOBAL_AUDIT",
  "GO_HUB_COUNTER_INBOX","GO_HUB_COUNTER_DISPATCH_STATE","LIGHTHOUSE_CONTROL_PORT_SESSIONS",
  "OBSERVER_SESSIONS","GO_HUB_NOTION_LIGHT_STATE","GO_HUB_MAINTENANCE_STATE","GO_HUB_BROADCAST_STATE",
]);
const ALLOWED_CONFIG_REFS=new Set([
  "GOHUB_MASTER_KEY","GOHUB_OWNER_PASSCODE","GOHUB_NOTION_CLIENT_SECRET","GITHUB_TOKEN",
  "LINEAR_API_KEY","LINEAR_TEAM_ID","LINEAR_TEAM_KEY","NOTION_TOKEN","NOTION_CATALOG_DATA_SOURCE_ID",
  "GOOGLE_WORKSPACE_ACCESS_TOKEN","GOOGLE_WORKSPACE_REFRESH_TOKEN","GOOGLE_WORKSPACE_CLIENT_ID","GOOGLE_WORKSPACE_CLIENT_SECRET",
  "GOOGLE_DRIVE_ACCESS_TOKEN","GOOGLE_DRIVE_REFRESH_TOKEN","GOOGLE_DRIVE_CLIENT_ID","GOOGLE_DRIVE_CLIENT_SECRET","GOOGLE_DRIVE_ROOT_FOLDER_ID",
]);
function text(v){return String(v??"").trim();}
function safePath(path){
  const p=text(path).replace(/^source:/,"");
  if(!p||p.startsWith("/")||p.includes("..")||p.includes("\\"))return null;
  if(/^go-hub-[^/]+\.(?:js|mjs|md|html|webmanifest|assetsignore)$/.test(p))return p;
  if(["package.json","wrangler.go-hub.jsonc","GO_HUB_V4_CUTOVER.json","go-hub.html","go-hub.webmanifest","go-hub.assetsignore"].includes(p))return p;
  if(/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(p))return p;
  return null;
}
async function payload(response){
  if(!response||typeof response.json!=="function")return{ok:false,status:0,body:{}};
  const body=await response.clone().json().catch(()=>({}));
  return{ok:response.ok,status:response.status,body};
}
function wanted(expected){
  if(expected&&typeof expected==="object"&&!Array.isArray(expected)&&Object.hasOwn(expected,"equals"))return expected.equals;
  return expected;
}
function evidence(kind,detail={}){return{kind,...detail};}
function observeText(expected,content){
  const e=wanted(expected);
  if(typeof e==="boolean")return true;
  if(typeof e==="string")return content.includes(e)?e:`MISSING:${e}`;
  if(Array.isArray(e))return e.filter(v=>content.includes(String(v)));
  if(expected&&typeof expected==="object"&&Array.isArray(expected.contains))return expected.contains.filter(v=>content.includes(String(v)));
  if(typeof e==="number")return content.length;
  return true;
}
function boundaryBoolean(body,ok=true){
  for(const key of ["configured","ok","available","enabled","healthy","ready"]){
    if(typeof body?.[key]==="boolean")return body[key];
  }
  const status=text(body?.status||body?.upstream).toUpperCase();
  if(["PASS","ACTIVE","READY","AVAILABLE","HEALTHY"].includes(status))return true;
  if(["FAIL","INACTIVE","UNAVAILABLE","UNHEALTHY","ERROR"].includes(status))return false;
  return Boolean(ok);
}
function observePayload(expected,body,ok=true){
  const e=wanted(expected),serialized=JSON.stringify(body??{});
  if(typeof e==="boolean"){
    const actual=boundaryBoolean(body,ok);
    return e?actual:!actual;
  }
  if(typeof e==="string")return serialized.includes(e)?e:`MISSING:${e}`;
  if(Array.isArray(e))return e.filter(v=>serialized.includes(String(v)));
  if(expected&&typeof expected==="object"&&Array.isArray(expected.contains))return expected.contains.filter(v=>serialized.includes(String(v)));
  return boundaryBoolean(body,ok);
}
export function createMaintenanceRealityReader({
  env={},lifecycle,registryRef=()=>null,googleWorkspace=null,drive=null,linear=null,observer=null,
  lighthouseControlPort=null,projectStatus=null,boardRead=null,globalAudit=null,broadcast=null,
}={}){
  const cache=new Map();
  async function once(key,fn){if(cache.has(key))return cache.get(key);const promise=Promise.resolve().then(fn);cache.set(key,promise);return promise;}
  async function sourceFile(point,path){
    if(!lifecycle?.readFile)return{available:false,reason:"GITHUB_READER_UNAVAILABLE"};
    const res=await once("file:"+path,()=>lifecycle.readFile({repository:STANDARD_REPO,path,ref:"main"}));
    const p=await payload(res);
    if(!p.ok&&p.status===404)return{available:true,value:false,evidenceRef:`github://${STANDARD_REPO}@main/${path}`,safeEvidence:evidence("SOURCE_FILE_MISSING",{repository:STANDARD_REPO,path,ref:"main"})};
    if(!p.ok)return{available:false,reason:p.body?.code||"SOURCE_FILE_READ_FAILED",evidenceRef:`github://${STANDARD_REPO}@main/${path}`};
    const content=text(p.body?.content),sha=text(p.body?.sha);
    return{available:true,value:observeText(point.expected,content),evidenceRef:`github://${STANDARD_REPO}@main/${path}${sha?"#"+sha:""}`,safeEvidence:evidence("SOURCE_FILE",{repository:STANDARD_REPO,path,ref:"main",sha:sha||null,bytes:content.length})};
  }
  async function serviceObservation(point,key,fn){
    if(typeof fn!=="function")return{available:false,reason:"MAINTENANCE_SERVICE_READER_UNAVAILABLE"};
    const res=await once("service:"+key,fn);
    if(res==null)return{available:false,reason:"MAINTENANCE_SERVICE_READER_UNAVAILABLE"};
    const p=res instanceof Response?await payload(res):{ok:res?.ok!==false,status:200,body:res??{}};
    if(!p.ok)return{available:true,status:"UNKNOWN",reason:text(p.body?.code)||"BOUNDARY_RESPONSE_UNAVAILABLE",value:null,evidenceRef:`service://${key}`,safeEvidence:evidence("BOUNDARY_RESPONSE",{service:key,status:p.status,code:text(p.body?.code)||null})};
    return{available:true,value:observePayload(point.expected,p.body,p.ok),evidenceRef:`service://${key}`,safeEvidence:evidence("BOUNDARY_RESPONSE",{service:key,status:p.status,ok:true})};
  }
  return async function readValue(point={}){
    const source=text(point.source),lower=source.toLowerCase();
    if(!source)return{available:false,reason:"MAINTENANCE_SOURCE_REQUIRED"};

    const binding=/^binding:([A-Z0-9_]+)$/.exec(source);
    if(binding){
      if(!ALLOWED_BINDINGS.has(binding[1]))return{available:false,reason:"BINDING_NOT_ALLOWLISTED"};
      return{available:true,value:Boolean(env?.[binding[1]]),evidenceRef:"worker-binding://"+binding[1],safeEvidence:evidence("BINDING_PRESENCE",{binding:binding[1],present:Boolean(env?.[binding[1]])})};
    }

    const config=/^(?:config|credential):([A-Z0-9_]+)$/.exec(source);
    if(config){
      if(!ALLOWED_CONFIG_REFS.has(config[1]))return{available:false,reason:"CONFIG_REFERENCE_NOT_ALLOWLISTED"};
      const present=Boolean(text(env?.[config[1]]));
      return{available:true,value:present,evidenceRef:"worker-config://"+config[1],safeEvidence:evidence("MASKED_CONFIG_PRESENCE",{reference:config[1],present})};
    }

    const path=safePath(source);
    if(path)return sourceFile(point,path);

    const tool=/^(?:tool|mcp-tool):([a-zA-Z0-9_.-]+)$/.exec(source) || (/^go_hub_[a-z0-9_]+$/i.test(source)?["",source]:null);
    if(tool){
      const registry=registryRef?.();
      if(!registry||typeof registry.listTools!=="function")return{available:false,reason:"MCP_REGISTRY_READER_UNAVAILABLE"};
      const names=registry.listTools().map(item=>text(item.name));
      const present=names.includes(tool[1]);
      return{available:true,value:typeof wanted(point.expected)==="string"?(present?tool[1]:"MISSING:"+tool[1]):present,evidenceRef:"mcp-registry://"+tool[1],safeEvidence:evidence("MCP_TOOL_PUBLICATION",{tool:tool[1],present})};
    }

    if(source.startsWith("destination://")||source.startsWith("route:destination://")){
      const route=source.replace(/^route:/,"");
      const destination=getCityDestination(route);
      const e=wanted(point.expected);
      const value=typeof e==="string"?(destination?(e===destination.id||e===destination.route?e:destination.route):"MISSING:"+e):Boolean(destination);
      return{available:true,value,evidenceRef:"route-contract://"+route,safeEvidence:evidence("ROUTE_CONTRACT",{route,destinationId:destination?.id||null,present:Boolean(destination)})};
    }

    const repoMatch=/^(?:repo|github):([^#]+)$/.exec(source);
    if(repoMatch&&lifecycle?.inspect){
      const repository=text(repoMatch[1]);
      if(!["pureekangraw-ops/standard-","pureekangraw-ops/ygph-metropolis","pureekangraw-ops/Go-Calalog-"].includes(repository))return{available:false,reason:"REPOSITORY_NOT_ALLOWLISTED"};
      const res=await once("repo:"+repository,()=>lifecycle.inspect({repository,branch:"main"}));
      const p=await payload(res);
      if(!p.ok)return{available:true,value:false,evidenceRef:"github://"+repository+"@main",safeEvidence:evidence("REPOSITORY",{repository,status:p.status,code:p.body?.code||null})};
      const sha=text(p.body?.sha||p.body?.headSha||p.body?.baseSha);
      return{available:true,value:typeof wanted(point.expected)==="string"?(wanted(point.expected)==="main"?"main":sha):true,evidenceRef:`github://${repository}@main${sha?"#"+sha:""}`,safeEvidence:evidence("REPOSITORY",{repository,branch:"main",sha:sha||null})};
    }

    const workflow=/^workflow:(.+)$/.exec(source);
    if(workflow&&lifecycle?.inspect&&lifecycle?.getWorkflowRuns){
      const name=text(workflow[1]),repo=STANDARD_REPO;
      const info=await once("repo:"+repo,()=>lifecycle.inspect({repository:repo,branch:"main"}));
      const ip=await payload(info);
      if(!ip.ok)return{available:false,reason:"REPOSITORY_HEAD_UNAVAILABLE"};
      const sha=text(ip.body?.sha||ip.body?.headSha||ip.body?.baseSha);
      const runs=await once("workflow:"+sha,()=>lifecycle.getWorkflowRuns({repository:repo,sha}));
      const rp=await payload(runs);
      if(!rp.ok)return{available:false,reason:"WORKFLOW_READ_FAILED"};
      const match=(Array.isArray(rp.body?.runs)?rp.body.runs:[]).find(run=>text(run.name)===name);
      const e=wanted(point.expected);
      const value=typeof e==="string"?(match?text(match.conclusion||match.status):"MISSING:"+e):Boolean(match);
      return{available:true,value,evidenceRef:`github-actions://${repo}/${name}@${sha}`,safeEvidence:evidence("WORKFLOW",{repository:repo,name,sha,status:match?.status||null,conclusion:match?.conclusion||null})};
    }

    if(lower==="gmail:capabilities"||lower==="service:gmail")return serviceObservation(point,"gmail-capabilities",()=>googleWorkspace?.capabilities?.());
    if(lower==="gmail:diagnostics")return serviceObservation(point,"gmail-diagnostics",()=>googleWorkspace?.diagnostics?.());
    if(lower==="calendar:capabilities"||lower==="service:calendar")return serviceObservation(point,"calendar-capabilities",()=>googleWorkspace?.capabilities?.());
    if(lower==="calendar:diagnostics")return serviceObservation(point,"calendar-diagnostics",()=>googleWorkspace?.diagnostics?.());
    if(lower==="drive:capabilities"||lower==="service:drive")return serviceObservation(point,"drive-capabilities",()=>drive?.capabilities?.());
    if(lower==="drive:health")return serviceObservation(point,"drive-health",()=>drive?.health?.());
    if(lower==="drive:diagnostics")return serviceObservation(point,"drive-diagnostics",()=>drive?.diagnostics?.());
    if(lower==="linear:projects"||lower==="service:linear")return serviceObservation(point,"linear-projects",()=>linear?.listProjects?.({}));
    if(lower==="observer:latest"||lower==="service:observer")return serviceObservation(point,"observer-latest",()=>observer?.latest?.());
    if(lower==="lighthouse:state"||lower==="service:lighthouse")return serviceObservation(point,"lighthouse-state",()=>lighthouseControlPort?.state?.({targetId:"lighthouse"}));
    if(lower==="board:live"||lower==="service:board")return serviceObservation(point,"board-live",()=>boardRead?.());
    if(lower==="audit:history"||lower==="service:audit")return serviceObservation(point,"audit-history",()=>globalAudit?.history?.({limit:1}));
    if(lower==="broadcast:current"||lower==="service:broadcast")return serviceObservation(point,"broadcast-current",()=>broadcast?.current?.());
    const project=/^project:(.+)$/.exec(source);
    if(project)return serviceObservation(point,"project-"+text(project[1]),()=>projectStatus?.read?.({targetId:text(project[1])}));

    if(lower.startsWith("notion:")){
      const present=Boolean(env?.GO_HUB_NOTION_LIGHT_STATE);
      return{available:true,value:typeof wanted(point.expected)==="string"?(present?wanted(point.expected):"MISSING:"+wanted(point.expected)):present,evidenceRef:"worker-binding://GO_HUB_NOTION_LIGHT_STATE",safeEvidence:evidence("NOTION_BOUNDARY",{stateBindingPresent:present,deepProviderProbe:false})};
    }

    return{available:false,reason:"MAINTENANCE_READER_UNAVAILABLE"};
  };
}
