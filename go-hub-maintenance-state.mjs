const DEFAULT_STATE_NAME="go-hub-maintenance-v4";
function json(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
function clean(v){return String(v??"").trim();}
function clone(v){return v==null?v:structuredClone(v);}
export class GoHubMaintenanceState{
  constructor(ctx){this.ctx=ctx;}
  async fetch(request){
    if(request.method!=="POST")return json({code:"METHOD_NOT_ALLOWED"},405);
    const input=await request.json().catch(()=>null);
    if(!input||typeof input!=="object"||Array.isArray(input))return json({code:"INVALID_JSON"},400);
    const action=clean(input.action).toLowerCase(),key=clean(input.key);
    if(!key)return json({code:"MAINTENANCE_STATE_KEY_REQUIRED"},400);
    if(action==="get"){
      const value=await this.ctx.storage.get(key);
      return json({ok:true,key,value:value==null?null:clone(value)});
    }
    if(action==="put"){
      await this.ctx.storage.put(key,clone(input.value));
      const value=await this.ctx.storage.get(key);
      return json({ok:true,key,value:value==null?null:clone(value)});
    }
    return json({code:"MAINTENANCE_STATE_ACTION_UNAVAILABLE"},400);
  }
}
export function createMaintenanceDurableStorage({namespace,name=DEFAULT_STATE_NAME}={}){
  function stub(){
    if(!namespace||typeof namespace.getByName!=="function")return null;
    const value=namespace.getByName(name);
    return value&&typeof value.fetch==="function"?value:null;
  }
  async function call(action,key,value){
    const current=stub();
    if(!current)throw new Error("MAINTENANCE_STATE_NOT_CONFIGURED");
    const response=await current.fetch(new Request("https://maintenance-state.internal/state",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,key,...(action==="put"?{value}:{})}),
    }));
    const body=await response.json().catch(()=>({}));
    if(!response.ok||body?.ok!==true)throw new Error(body?.code||"MAINTENANCE_STATE_UNAVAILABLE");
    return body.value==null?null:clone(body.value);
  }
  return Object.freeze({get:key=>call("get",key),put:(key,value)=>call("put",key,value)});
}
export {DEFAULT_STATE_NAME};
