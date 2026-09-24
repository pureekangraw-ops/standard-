import { boardView, WORK_STATUS } from "./go-hub-centre-v4.js";
function text(v){return String(v??"").trim();}
function freeze(v){if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function createThinHeimdall({works=[]}={}){
 const store=new Map(works.map(w=>[w.workId,w]));
 return freeze({
  put(work){if(!work?.workId)throw new Error("Work ID is required");store.set(work.workId,work);return work;},
  get(workId){return store.get(text(workId))||null;},
  search(query=""){const q=text(query).toLowerCase();return [...store.values()].filter(w=>!q||[w.workId,w.name,w.command,w.status,w.holder,...(w.requestedDestinations||[])].some(v=>String(v??"").toLowerCase().includes(q)));},
  board(){return boardView([...store.values()]);},
  report(){const items=boardView([...store.values()]);return freeze({counts:Object.values(WORK_STATUS).reduce((o,s)=>(o[s]=items.filter(x=>x.status===s).length,o),{}),items});}
 });
}
