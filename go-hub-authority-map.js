const MAP=Object.freeze({
 heimdall:Object.freeze({decisionAuthority:Object.freeze(["BOUNDARY_PASSAGE","EVIDENCE_GATE"]),checks:Object.freeze(["SAFETY","PERMISSION","STOP"]),produces:Object.freeze(["GATE_DECISION","AUDIT_SENTINEL_EVENT"])}),
 centre:Object.freeze({decisionAuthority:Object.freeze(["WORK_IDENTITY","WORK_STATE","DISTRIBUTION","RETURN"]),checks:Object.freeze(["HANDOFF_IDENTITY","RETURN_ADDRESS"]),produces:Object.freeze(["WORK_CONTEXT","HANDOFF"])}),
 factory:Object.freeze({decisionAuthority:Object.freeze(["PLAN","PRODUCTION","ASSEMBLY","INTERNAL_QC"]),checks:Object.freeze(["PIECE_QC","ASSEMBLY_QC","MERGE_VERIFICATION"]),produces:Object.freeze(["PRODUCTION_EVIDENCE","QC_RESULT"])}),
 counter:Object.freeze({decisionAuthority:Object.freeze(["SEARCH","RESEARCH","KNOWLEDGE_EXCHANGE"]),checks:Object.freeze(["SOURCE_PRESENCE","READBACK"]),produces:Object.freeze(["SOURCES","EVIDENCE_CANDIDATES","KNOWLEDGE"])}),
 audit:Object.freeze({decisionAuthority:Object.freeze(["AUDIT_HISTORY"]),checks:Object.freeze(["EVENT_IDEMPOTENCY","SEQUENCE"]),produces:Object.freeze(["IMMUTABLE_HISTORY"])}),
 maintenance:Object.freeze({decisionAuthority:Object.freeze(["HEALTH_CLASSIFICATION"]),checks:Object.freeze(["HEALTH","DRIFT","STALE_TRUTH"]),produces:Object.freeze(["FINDING","RCA","REPAIR_ROUTE"])})
});
export function authorityMap(){return MAP;}
export function authorityOwner(concern){const c=String(concern||"").trim().toUpperCase();return Object.entries(MAP).find(([,v])=>v.decisionAuthority.includes(c))?.[0]||null;}
export function assertUniqueDecisionAuthority(){const seen=new Map();for(const [station,v] of Object.entries(MAP)){for(const concern of v.decisionAuthority){if(seen.has(concern))throw new Error("DUPLICATE_DECISION_AUTHORITY:"+concern);seen.set(concern,station);}}return Object.freeze(Object.fromEntries(seen));}
