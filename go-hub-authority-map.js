const MAP=Object.freeze({
  centre:Object.freeze({
    decisionAuthority:Object.freeze(["WORK_IDENTITY","WORK_PERSISTENCE","WORK_STATE","DISTRIBUTION","RETURN_POINT"]),
    checks:Object.freeze(["HANDOFF_IDENTITY","RETURN_ADDRESS","DURABLE_RESUME"]),
    produces:Object.freeze(["WORK_CONTEXT","HANDOFF","RETURN_READBACK"]),
  }),
  heimdall:Object.freeze({
    decisionAuthority:Object.freeze(["WORK_REGISTRY","HOLDER","PASS","PROJECT_BOARD","WARP"]),
    checks:Object.freeze(["SCOPE","EXPIRY","CLOSE_CONDITION","RETURN_ADDRESS"]),
    produces:Object.freeze(["PASS_STATE","PROJECT_REF_INDEX","WORK_REPORT"]),
  }),
  factory:Object.freeze({
    decisionAuthority:Object.freeze(["FACTORY_PROJECT","FACTORY_LIFECYCLE","PLAN","PRODUCTION","ASSEMBLY","INTERNAL_QC"]),
    checks:Object.freeze(["PIECE_QC","ASSEMBLY_QC","MERGE_VERIFICATION"]),
    produces:Object.freeze(["PRODUCTION_RECEIPT","FACTORY_LIVE_BOARD","OUTPUT"]),
  }),
  maintenance:Object.freeze({
    decisionAuthority:Object.freeze(["MAINTENANCE_PROJECT","MAINTENANCE_MAP","PROBE","HEALTH_CLASSIFICATION"]),
    checks:Object.freeze(["HEALTH","DRIFT","STALE_TRUTH","FIRST_BREAK"]),
    produces:Object.freeze(["PROBE_RESULT","REPAIR_CONTEXT","CLOSEOUT_PLAN"]),
  }),
  counter:Object.freeze({
    decisionAuthority:Object.freeze(["LIGHT_COMMAND","TICKET_LIFECYCLE","SEARCH","RESEARCH","KNOWLEDGE_EXCHANGE"]),
    checks:Object.freeze(["SOURCE_PRESENCE","READBACK"]),
    produces:Object.freeze(["SOURCES","KNOWLEDGE","LIGHT_READBACK"]),
  }),
  notion_light:Object.freeze({
    decisionAuthority:Object.freeze(["KNOWLEDGE_REGISTRY","MIRROR","REPORT","DROP_ARCHIVE"]),
    checks:Object.freeze(["INDEX_SCOPE","READBACK"]),
    produces:Object.freeze(["KNOWLEDGE_REF","MIRROR_REF","ARCHIVE_REF"]),
  }),
  audit:Object.freeze({
    decisionAuthority:Object.freeze(["AUDIT_HISTORY"]),
    checks:Object.freeze(["EVENT_IDEMPOTENCY","SEQUENCE","SECRET_REDACTION"]),
    produces:Object.freeze(["IMMUTABLE_HISTORY"]),
  }),
});

export function authorityMap(){return MAP;}
export function authorityOwner(concern){const c=String(concern||"").trim().toUpperCase();return Object.entries(MAP).find(([,v])=>v.decisionAuthority.includes(c))?.[0]||null;}
export function assertUniqueDecisionAuthority(){const seen=new Map();for(const [station,v] of Object.entries(MAP)){for(const concern of v.decisionAuthority){if(seen.has(concern))throw new Error("DUPLICATE_DECISION_AUTHORITY:"+concern);seen.set(concern,station);}}return Object.freeze(Object.fromEntries(seen));}

// V4 deliberately has no EVIDENCE_GATE, RCA, REPAIR_ROUTE, or PASS/REJECT authority.
export const RETIRED_AUTHORITY_NAMES = Object.freeze(["EVIDENCE_GATE","RCA","REPAIR_ROUTE","PASS_REJECT_JUDGMENT"]);
