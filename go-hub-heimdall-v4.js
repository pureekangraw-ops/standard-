import { boardView, WORK_STATUS, openWorkPass, returnWork, validateWorkRecord } from "./go-hub-centre-v4.js";
function text(v){return String(v??"").trim();}
function clone(v){return v==null?v:structuredClone(v);}
function freeze(v){if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const PROJECT_TYPES=Object.freeze(["WORK_CENTRE","FACTORY","MAINTENANCE"]);
function projectBoard(works){
  return freeze(works.flatMap(w => PROJECT_TYPES.map(type => {
    const ref=w.projectRefs?.[type]||null;
    return {projectType:type,projectRef:ref?.ref||null,status:ref?.status||w.status,destination:ref?.destination||w.destination||null,workspace:ref?.workspace||null,workId:w.workId,lastUpdated:ref?.lastUpdated||w.lastUpdated};
  })));
}
export function createHeimdallV4({works=[],workIndex=null}={}){const store=new Map(works.map(w=>[w.workId,clone(w)]));const source=workIndex||null;async function hydrate(){if(source?.all){for(const w of await source.all())store.set(w.workId,clone(w));}return [...store.values()];}async function persist(w){validateWorkRecord(w);store.set(w.workId,clone(w));if(source?.replace)await source.replace(w);return clone(w);}return Object.freeze({hydrate, get(workId){return clone(store.get(text(workId))||null);},async put(work){if(!work?.workId)throw new Error("Work ID is required");if(store.has(work.workId)&&JSON.stringify(store.get(work.workId))!==JSON.stringify(work))throw new Error("DUPLICATE_WORK_ID");return persist(work);},async search(query=""){await hydrate();const q=text(query).toLowerCase();return [...store.values()].filter(w=>!q||[w.workId,w.name,w.command,w.status,w.holder,w.waitReason,w.destination,...(w.requestedDestinations||[])].some(v=>String(v??"").toLowerCase().includes(q))).map(clone);},async active(){await hydrate();return [...store.values()].filter(w=>w.status===WORK_STATUS.ON_PROCESS).map(clone);},async waiting(){await hydrate();return [...store.values()].filter(w=>w.status===WORK_STATUS.WAIT_CONFIRM).map(clone);},async resumable(){await hydrate();return [...store.values()].filter(w=>[WORK_STATUS.OPEN,WORK_STATUS.WAIT_CONFIRM].includes(w.status)).map(clone);},async openPass(workId,input={}){const w=store.get(text(workId));if(!w)throw new Error("WORK_NOT_FOUND");return persist(openWorkPass(w,{...input,actor:input.holder||input.actor}));},async closePass(workId,input={}){const w=store.get(text(workId));if(!w)throw new Error("WORK_NOT_FOUND");return persist(returnWork(w,{...input,actor:input.holder||input.actor}));},async board(){await hydrate();return boardView([...store.values()]);},async projectBoard(){await hydrate();return projectBoard([...store.values()]);},async report(){await hydrate();const items=boardView([...store.values()]);return freeze({items,projectBoard:projectBoard([...store.values()]),counts:Object.values(WORK_STATUS).reduce((o,s)=>(o[s]=items.filter(x=>x.status===s).length,o),{}),active:items.filter(x=>x.status===WORK_STATUS.ON_PROCESS),waiting:items.filter(x=>x.status===WORK_STATUS.WAIT_CONFIRM),resumable:items.filter(x=>[WORK_STATUS.OPEN,WORK_STATUS.WAIT_CONFIRM].includes(x.status))});},warp({workId,destination,owner,at=new Date().toISOString()}={}){const w=store.get(text(workId));if(!w)throw new Error("WORK_NOT_FOUND");const next=clone(w);next.destination=text(destination)||next.destination;next.destinationOwner=text(owner)||null;next.lastUpdated=at;store.set(next.workId,next);return freeze({workId:next.workId,destination:next.destination,owner:next.destinationOwner,projectRefs:clone(next.projectRefs||{}),lastUpdated:at,routeArchitecture:"UNCHANGED"});}});}
export function createThinHeimdall({works=[]}={}){
  const store=new Map(works.map(w=>[w.workId,clone(w)]));
  const syncBoard=()=>boardView([...store.values()]);
  return freeze({
    put(work){if(!work?.workId)throw new Error("Work ID is required");if(store.has(work.workId)&&JSON.stringify(store.get(work.workId))!==JSON.stringify(work))throw new Error("DUPLICATE_WORK_ID");store.set(work.workId,clone(work));return clone(work);},
    get(workId){return clone(store.get(text(workId))||null);},
    search(query=""){const q=text(query).toLowerCase();return [...store.values()].filter(w=>!q||[w.workId,w.name,w.command,w.status,w.holder,w.waitReason,w.destination,...(w.requestedDestinations||[])].some(v=>String(v??"").toLowerCase().includes(q))).map(clone);},
    board:syncBoard,
    projectBoard:()=>projectBoard([...store.values()]),
    report(){const items=syncBoard();return freeze({items,projectBoard:projectBoard([...store.values()]),counts:Object.values(WORK_STATUS).reduce((o,st)=>(o[st]=items.filter(x=>x.status===st).length,o),{}),active:items.filter(x=>x.status===WORK_STATUS.ON_PROCESS),waiting:items.filter(x=>x.status===WORK_STATUS.WAIT_CONFIRM),resumable:items.filter(x=>[WORK_STATUS.OPEN,WORK_STATUS.WAIT_CONFIRM].includes(x.status))});}
  });
}
export { projectBoard, PROJECT_TYPES };
