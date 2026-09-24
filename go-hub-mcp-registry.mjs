const str = { type: "string", minLength: 1 };
const int = { type: "integer", minimum: 1 };
const revision = { type: "integer", minimum: 0 };
const obj = { type: "object" };
const priority = { type: "integer", minimum: 0, maximum: 4 };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };
const FACTORY = "destination://factory";
const LINEAR = "destination://linear";
const MAINTENANCE = "destination://maintenance";
const DRIVE = "destination://drive";
const GMAIL = "destination://gmail";
const CALENDAR = "destination://calendar";
const COUNTER = "destination://counter";
const workContext = {
  type: "object",
  properties: {
    workId: str, checkpointId: str, returnAddress: str, destination: str,
    task: str, requestedResult: str, lensReference: str,
    ownerId: str, leaseId: str, ownershipRevision: revision,
  },
  required: ["workId", "checkpointId", "returnAddress", "destination", "task", "requestedResult", "lensReference"],
  additionalProperties: false,
};
const schema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const ann = (readOnlyHint, destructiveHint = false) => ({ readOnlyHint, destructiveHint });
const def = (name, description, operation, inputSchema, annotations) => ({
  name, description, operation, inputSchema,
  securitySchemes: [{ type: "oauth2", scopes: ["go-hub"] }], annotations,
});

const definitions = [
  def("go_hub_inspect_repository", "Inspect repository truth and tree.", "inspect", schema({ repository: str, branch: str }, ["repository"]), ann(true)),
  def("go_hub_list_repositories", "List visible owner repositories.", "listRepositories", schema({}), ann(true)),
  def("go_hub_read_file", "Read one UTF-8 repository file.", "readFile", schema({ repository: str, path: str, ref: str }, ["repository", "path"]), ann(true)),
  def("go_hub_create_branch", "Create a non-default task branch.", "createBranch", schema({ repository: str, name: str, fromSha: str, workContext }, ["repository", "name", "fromSha", "workContext"]), ann(false)),
  def("go_hub_put_file", "Create or update one file on a task branch.", "putFile", schema({ repository: str, path: str, branch: str, expectedSha: str, content: { type: "string" }, workContext }, ["repository", "path", "branch", "content", "workContext"]), ann(false)),
  def("go_hub_delete_file", "Delete one file using exact blob SHA.", "deleteFile", schema({ repository: str, path: str, branch: str, expectedSha: str, workContext }, ["repository", "path", "branch", "expectedSha", "workContext"]), ann(false, true)),
  def("go_hub_compare_refs", "Compare base and head refs.", "compare", schema({ repository: str, base: str, head: str }, ["repository", "base", "head"]), ann(true)),
  def("go_hub_open_pull_request", "Open or update a pull request.", "openPullRequest", schema({ repository: str, branch: str, base: str, title: str, body: { type: "string" }, workContext }, ["repository", "branch", "base", "title", "workContext"]), ann(false)),
  def("go_hub_get_pull_request", "Read pull-request truth.", "getPullRequest", schema({ repository: str, number: int }, ["repository", "number"]), ann(true)),
  def("go_hub_get_ci", "Read exact-head CI evidence.", "getCI", schema({ repository: str, sha: str }, ["repository", "sha"]), ann(true)),
  def("go_hub_get_failure_evidence", "Read failed jobs and concise logs.", "getFailureEvidence", schema({ repository: str, runId: int }, ["repository", "runId"]), ann(true)),
  def("go_hub_rerun_failed_jobs", "Rerun failed workflow jobs.", "rerunFailed", schema({ repository: str, runId: int, workContext }, ["repository", "runId", "workContext"]), ann(false)),
  def("go_hub_factory_action", "Execute one governed Factory task action through durable task authority.", "factoryAction", schema({ taskId: str, action: { type: "string", enum: ["inspect", "create_branch", "write", "delete", "compare", "open_pr", "check_ci", "diagnose_failure"] }, input: obj, expectedRevision: revision, workContext }, ["taskId", "action", "input", "workContext"]), ann(false)),
  def("go_hub_factory_auto", "Advance a Factory task automatically through consecutive governed states until completion or a real blocker.", "factoryAuto", schema({ taskId: str, inputs: obj, workContext }, ["taskId", "workContext"]), ann(false)),
  def("go_hub_factory_ready_gate", "Seal an exact-head Ready Gate from a governed Work Package, Piece, Blueprint, Piece QC, and evidence.", "factoryReadyGate", schema({ workPackage: obj, piece: obj, blueprint: obj, pieceQc: obj, evidence: { type: "array", items: obj }, knownLimitations: { type: "array", items: str }, workContext }, ["workPackage","piece","blueprint","pieceQc","evidence","workContext"]), ann(false)),
  def("go_hub_factory_foreman", "Request, cancel, park, verify, release, or inspect Hephaestus work.", "factoryForeman", schema({ action: { type: "string", enum: ["request", "cancel", "park", "verify", "release", "state"] }, repository: str, slot: { type: "string", enum: ["assembly", "merge"] }, goId: str, jobId: str, mainSha: str, mergedAt: str, readyGate: obj, piece: obj, assembly: obj, assemblyQc: obj, pullRequest: obj, ci: obj, risk: obj, cancellation: obj, postMergeVerification: obj, workContext }, ["action", "repository"]), ann(false)),
  def("go_hub_maintenance", "Run Work-bound Maintenance V4 map inspection, safe probes, repair context, or closeout planning.", "maintenance", schema({ target: { type: "string", enum: ["factory", "go-hub"] }, action: { type: "string", enum: ["inspect", "inspect_map", "run_system_check", "probe_route", "repair_context", "plan_closeout"] }, input: obj, work: obj, map: obj, routeId: str, checkpointId: str, projectId: str, workContext }, ["action", "workContext"]), ann(true)),
  def("go_hub_heimdall_pass", "Open or close a Work-bound Pass through Heimdall, including bounded Emergency Passes.", "heimdallPass", schema({ action: { type: "string", enum: ["open", "close"] }, workId: str, checkpointId: str, actor: str, holder: str, kind: { type: "string", enum: ["WORK", "READ", "MAINTENANCE", "EMERGENCY"] }, scope: { type: "array", items: str }, destinations: { type: "array", items: str }, expiresAt: str, closeCondition: str, returnAddress: str, reason: str, audit: obj, status: str, result: obj, workContext }, ["action", "workId", "workContext"]), ann(false)),
  def("go_hub_v4_project_board", "Read Heimdall's three-way Project ref board without replacing Workspace truth.", "v4ProjectBoard", schema({ workId: str, checkpointId: str }, ["workId", "checkpointId"]), ann(true)),
  def("go_hub_merge_pull_request", "Merge with Foreman ownership and exact-head CI.", "mergePullRequest", schema({ repository: str, number: int, expectedHeadSha: str, goId: str, jobId: str, method: { type: "string", enum: ["merge", "squash", "rebase"] }, workContext }, ["repository", "number", "expectedHeadSha", "goId", "jobId", "workContext"]), ann(false, true)),
  def("go_hub_get_workflow_runs", "Observe workflow and deployment runs.", "getWorkflowRuns", schema({ repository: str, sha: str }, ["repository", "sha"]), ann(true)),
  def("go_hub_list_workflow_artifacts", "List GitHub Actions artifacts for one workflow run, or inventory recent repository artifacts when runId is omitted.", "listWorkflowArtifacts", schema({ repository: str, runId: int }, ["repository"]), ann(true)),
  def("go_hub_archive_workflow_artifact", "Download one GitHub Actions artifact server-side, optionally extract one entry, and archive it to governed Google Drive with hash metadata and readback.", "archiveWorkflowArtifact", schema({ repository: str, runId: int, artifactId: int, parentId: str, entrySuffix: str, destinationName: str, mimeType: str, workContext }, ["repository", "runId", "artifactId", "workContext"]), ann(false)),
  def("go_hub_audit_history", "Read immutable global GO Hub audit events, optionally filtered by Work ID.", "auditHistory", schema({ workId: str, afterSequence: revision, limit: { type: "integer", minimum: 1, maximum: 200 } }), ann(true)),
  def("go_hub_centre_inspect", "Read one Centre Work truth record without allowing Centre mutation.", "centreInspect", schema({ workId: str, checkpointId: str }, ["workId", "checkpointId"]), ann(true)),
  def("go_hub_centre_audit_history", "Read Centre-only immutable audit events from the global GO Hub audit log.", "centreAuditHistory", schema({ workId: str, afterSequence: revision, limit: { type: "integer", minimum: 1, maximum: 200 } }), ann(true)),
  def("go_hub_centre_live_action", "Execute or inspect durable City/Centre live work through GO Hub.", "centreLiveAction", schema({ action: { type: "string", enum: ["start", "inspect", "claim", "renew", "release", "record_effect", "save_checkpoint", "resume_checkpoint", "review", "fit", "leave", "validate", "return", "record_reality", "cancel", "resume", "v4_create", "v4_inspect", "v4_board", "v4_claim", "v4_open_pass", "v4_update_destinations", "v4_wait", "v4_resume", "v4_return"] }, workId: str, checkpointId: str, returnAddress: str, work: obj, actor: str, status: str, kind: { type: "string", enum: ["WORK", "READ", "MAINTENANCE", "EMERGENCY"] }, destinations: { type: "array", items: str }, reason: str, result: obj, task: str, requestedResult: str, authority: str, targetId: str, personaId: str, personaReference: str, workingView: str, destination: str, payload: obj, evidence: obj, reuseFit: { type: "boolean" }, ownerId: str, leaseId: str, expectedOwnershipRevision: revision, leaseSeconds: int, expectedEffectRevision: revision, effectId: str, effectTool: str, effectReceiptRef: str, effectStatus: str, expectedExecutionCheckpointRevision: revision, executionCheckpointId: str, resumeFrom: str, safePoint: { type: "boolean" }, snapshot: obj, reconciliationEvidence: obj }, ["action", "workId"]), ann(false)),
  def("go_hub_centre_read_only_fast_lane", "Route a pure Read -> Tell request through Centre's short read-only lane. Reads used for planning, creation, checklist work, or any mutation are escalated to normal Work.", "centreReadOnlyFastLane", schema({ purpose: { type: "string", enum: ["READ_TELL", "READ_FOR_WORK", "PLAN", "CREATE", "ACT"] }, operations: { type: "array", minItems: 1, items: { type: "string", enum: ["SEARCH", "LIST", "READ", "INSPECT", "METADATA", "CREATE", "UPDATE", "DELETE", "MOVE", "RENAME", "SHARE", "UPLOAD"] } } }, ["purpose", "operations"]), ann(true)),
  def("go_hub_lighthouse_control_port_state", "Read latest paired LIGHTHOUSE Control Port snapshot, work state, commands, and receipts.", "lighthouseControlPortState", schema({ targetId: str }, ["targetId"]), ann(true)),
  def("go_hub_lighthouse_control_port_command", "Queue one governed command for paired LIGHTHOUSE Control Port. Owner confirmation remains enforced on-device by capability guard.", "lighthouseControlPortCommand", schema({ targetId: str, requestId: str, capabilityId: str, payload: obj }, ["targetId", "requestId", "capabilityId", "payload"]), ann(false)),
  def("go_hub_project_status", "Read normalized Project Status from current GitHub truth and optional Factory task truth.", "projectStatus", schema({ targetId: str, factoryTaskId: str }, ["targetId"]), ann(true)),
  def("go_hub_board_read", "Read authoritative GO Hub Board truth without mutation.", "boardRead", schema({}), ann(true)),
  def("go_hub_board_pin_route", "Resolve first-command Pin identity routing without mutating the Board.", "boardPinRoute", schema({ firstCommand: str, pin: obj }, ["firstCommand"]), ann(true)),
  def("go_hub_counter_create", "Create one governed GO↔LIGHT Counter ticket. Authenticated MCP identity determines the sender; LIGHT creation is HANDOFF-only.", "counterCreate", schema({ counterId: str, mode: { type: "string", enum: ["SEARCH", "HANDOFF", "MONITOR"] }, request: str, requestedResult: str, authority: str, target: str, projectRef: str, context: obj, sourceHints: { type: "array", items: str }, doNotChange: { type: "array", items: str }, workContext }, ["counterId", "request", "workContext"]), ann(false)),
  def("go_hub_counter_inbox", "List bounded pending HANDOFF Counter tickets addressed to the authenticated actor for the same WorkContext.", "counterInbox", schema({ limit: { type: "integer", minimum: 1, maximum: 50 }, workContext }, ["workContext"]), ann(true)),
  def("go_hub_counter_get", "Read the current GO↔LIGHT Counter ticket and append-only event history.", "counterGet", schema({ counterId: str, workContext }, ["counterId", "workContext"]), ann(true)),
  def("go_hub_counter_seen", "Mark one Counter ticket as seen by its authenticated recipient.", "counterSeen", schema({ counterId: str, workContext }, ["counterId", "workContext"]), ann(false)),
  def("go_hub_counter_pickup", "Explicitly accept one incoming HANDOFF Counter ticket as its authenticated recipient. This is the user-facing pickup alias for the existing SEEN transition.", "counterPickup", schema({ counterId: str, workContext }, ["counterId", "workContext"]), ann(false)),
  def("go_hub_counter_answer", "Write the authenticated recipient's bounded answer back to the same Counter ticket.", "counterAnswer", schema({ counterId: str, status: { type: "string", enum: ["ANSWERED", "WAIT", "UNKNOWN", "NEEDS_INPUT", "FAILED", "EXPIRED"] }, answer: str, sources: { type: "array", items: str }, evidence: { type: "array", items: obj }, confidence: { type: "string" }, nextRoute: { type: "string" }, workContext }, ["counterId", "status", "answer", "workContext"]), ann(false)),
  def("go_hub_counter_readback", "Record the authenticated originator's readback on the same Counter ticket and close it by default.", "counterReadback", schema({ counterId: str, evidence: obj, close: { type: "boolean" }, workContext }, ["counterId", "evidence", "workContext"]), ann(false)),
  def("go_hub_observer_latest", "Read latest sanitized Browser Observer evidence.", "observerLatest", schema({}), ann(true)),
  def("go_hub_observer_screenshot", "Read one consented Browser Observer screenshot by ref.", "observerScreenshot", schema({ screenshotRef: str }, ["screenshotRef"]), ann(true)),
  def("go_hub_linear_list_projects", "List projects scoped to the configured Linear team.", "linearListProjects", schema({}), ann(true)),
  def("go_hub_linear_get_issue", "Read one Linear issue and enforce configured-team scope.", "linearGetIssue", schema({ identifier: str }, ["identifier"]), ann(true)),
  def("go_hub_linear_create_issue", "Create a Linear issue in the configured team.", "linearCreateIssue", schema({ title: str, description: nullableStr, projectId: nullableStr, priority, workContext }, ["title", "workContext"]), ann(false)),
  def("go_hub_linear_update_issue", "Update an in-team Linear issue after a scoped read.", "linearUpdateIssue", schema({ identifier: str, title: str, description: nullableStr, priority, stateId: nullableStr, projectId: nullableStr, workContext }, ["identifier", "workContext"]), ann(false)),
  def("go_hub_gmail_capabilities", "Inspect governed Gmail bridge configuration.", "gmailCapabilities", schema({}), ann(true)),
  def("go_hub_gmail_diagnostics", "Read sanitized Gmail OAuth diagnostics.", "gmailDiagnostics", schema({}), ann(true)),
  def("go_hub_gmail_profile", "Read Gmail profile metadata.", "gmailProfile", schema({}), ann(true)),
  def("go_hub_gmail_search", "Search Gmail messages using Gmail query syntax.", "gmailSearch", schema({ query: { type: "string" }, maxResults: { type: "integer", minimum: 1, maximum: 100 }, pageToken: str }), ann(true)),
  def("go_hub_gmail_get_message", "Read one Gmail message.", "gmailGetMessage", schema({ messageId: str, format: { type: "string", enum: ["minimal","full","metadata"] } }, ["messageId"]), ann(true)),
  def("go_hub_gmail_send_message", "Send one plain-text Gmail message through governed mutation.", "gmailSendMessage", schema({ to: str, subject: str, body: str, workContext }, ["to","subject","body","workContext"]), ann(false)),
  def("go_hub_calendar_capabilities", "Inspect governed Google Calendar bridge configuration.", "calendarCapabilities", schema({}), ann(true)),
  def("go_hub_calendar_diagnostics", "Read sanitized Calendar OAuth diagnostics.", "calendarDiagnostics", schema({}), ann(true)),
  def("go_hub_calendar_list", "List visible Google calendars.", "calendarList", schema({ maxResults: { type: "integer", minimum: 1, maximum: 250 }, pageToken: str }), ann(true)),
  def("go_hub_calendar_events", "List events from one Google calendar.", "calendarEvents", schema({ calendarId: str, timeMin: str, timeMax: str, maxResults: { type: "integer", minimum: 1, maximum: 250 }, pageToken: str }), ann(true)),
  def("go_hub_calendar_create_event", "Create one Google Calendar event through governed mutation.", "calendarCreateEvent", schema({ calendarId: str, summary: str, description: { type: "string" }, location: { type: "string" }, start: obj, end: obj, workContext }, ["summary","start","end","workContext"]), ann(false)),
  def("go_hub_drive_capabilities", "Inspect GO Hub Google Drive bridge configuration and supported operations without exposing credentials.", "driveCapabilities", schema({}), ann(true)),
  def("go_hub_drive_health", "Verify server-side Google Drive authentication and upstream API reachability without returning account data.", "driveHealth", schema({}), ann(true)),
  def("go_hub_drive_diagnostics", "Read sanitized Google Drive runtime account identity and granted OAuth scopes without exposing credentials.", "driveDiagnostics", schema({}), ann(true)),
  def("go_hub_drive_root", "Read the governed Google Drive root metadata used by GO Hub.", "driveRoot", schema({}), ann(true)),
  def("go_hub_drive_get_item", "Read normalized Google Drive item metadata by file or folder ID.", "driveGetItem", schema({ fileId: str }, ["fileId"]), ann(true)),
  def("go_hub_drive_list_children", "List normalized Google Drive children under one folder ID.", "driveListChildren", schema({ parentId: str, pageSize: { type: "integer", minimum: 1, maximum: 1000 }, pageToken: str }, ["parentId"]), ann(true)),
  def("go_hub_drive_create_folder", "Create a Google Drive folder and require destination readback before success.", "driveCreateFolder", schema({ parentId: str, name: str, workContext }, ["parentId", "name", "workContext"]), ann(false)),
  def("go_hub_drive_move_item", "Move an existing Google Drive item with native parent update and require destination readback before success.", "driveMoveItem", schema({ fileId: str, destinationFolderId: str, workContext }, ["fileId", "destinationFolderId", "workContext"]), ann(false)),
  def("go_hub_drive_rename_item", "Rename an existing Google Drive item and require readback before success.", "driveRenameItem", schema({ fileId: str, name: str, workContext }, ["fileId", "name", "workContext"]), ann(false)),
];

const factoryTools = new Set(["go_hub_create_branch", "go_hub_put_file", "go_hub_delete_file", "go_hub_open_pull_request", "go_hub_rerun_failed_jobs", "go_hub_merge_pull_request", "go_hub_factory_action", "go_hub_factory_auto", "go_hub_factory_ready_gate"]);
const maintenanceTools = new Set(["go_hub_maintenance"]);
const linearMutationTools = new Set(["go_hub_linear_create_issue", "go_hub_linear_update_issue"]);
const gmailMutationTools = new Set(["go_hub_gmail_send_message"]);
const calendarMutationTools = new Set(["go_hub_calendar_create_event"]);
const driveMutationTools = new Set(["go_hub_drive_create_folder", "go_hub_drive_move_item", "go_hub_drive_rename_item", "go_hub_archive_workflow_artifact"]);
const counterTools = new Set(["go_hub_counter_create", "go_hub_counter_inbox", "go_hub_counter_get", "go_hub_counter_seen", "go_hub_counter_answer", "go_hub_counter_readback"]);

function assertArgs(definition, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("invalid MCP tool arguments");
  for (const field of definition.inputSchema.required) {
    if (!(field in args) || args[field] === "" || args[field] == null) throw new Error("missing required argument: " + field);
  }
  for (const key of Object.keys(args)) if (!Object.hasOwn(definition.inputSchema.properties, key)) throw new Error("unknown argument: " + key);
  const actionSchema = definition.inputSchema.properties.action;
  if (actionSchema?.enum && args.action != null && !actionSchema.enum.includes(args.action)) throw new Error("invalid action");
  if (definition.inputSchema.properties.expectedRevision && args.expectedRevision != null &&
      (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0)) {
    throw new Error("invalid expectedRevision");
  }
}

function assertWork(value, destination, { ownershipRequired = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workContext is required");
  for (const field of workContext.required) if (!String(value[field] || "").trim()) throw new Error("workContext missing field: " + field);
  for (const key of Object.keys(value)) if (!Object.hasOwn(workContext.properties, key)) throw new Error("unknown workContext field: " + key);
  if (String(value.checkpointId) !== String(value.returnAddress)) throw new Error("workContext Return Address must match Checkpoint ID");
  if (String(value.destination) !== destination) throw new Error("workContext destination must be " + destination);
  if (ownershipRequired && (!String(value.ownerId || "").trim() || !String(value.leaseId || "").trim() || !Number.isSafeInteger(value.ownershipRevision))) {
    throw new Error("workContext ownership fields are required for Counter operations");
  }
}

function assertLifecycle(name, args) {
  if (factoryTools.has(name)) assertWork(args.workContext, FACTORY);
  if (linearMutationTools.has(name)) assertWork(args.workContext, LINEAR);
  if (maintenanceTools.has(name)) assertWork(args.workContext, MAINTENANCE);
  if (driveMutationTools.has(name)) assertWork(args.workContext, DRIVE);
  if (gmailMutationTools.has(name)) assertWork(args.workContext, GMAIL);
  if (calendarMutationTools.has(name)) assertWork(args.workContext, CALENDAR);
  if (counterTools.has(name)) assertWork(args.workContext, COUNTER);
  if (name === "go_hub_factory_foreman" && args.action !== "state") assertWork(args.workContext, FACTORY);
}

async function toolResult(response) {
  const payload = await response.json().catch(() => ({ code: "INVALID_TOOL_RESPONSE" }));
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, ...(response.ok ? {} : { isError: true }) };
}

export function createMcpRegistry({ lifecycle } = {}) {
  if (!lifecycle) throw new Error("lifecycle service is required");
  const byName = new Map(definitions.map(item => [item.name, item]));
  return Object.freeze({
    listTools() {
      return definitions.map(({ operation, ...tool }) => structuredClone(tool));
    },
    async callTool(name, args = {}) {
      const definition = byName.get(name);
      if (!definition) throw new Error("unknown MCP tool: " + name);
      assertArgs(definition, args);
      assertLifecycle(name, args);
      const operation = lifecycle[definition.operation];
      if (typeof operation !== "function") throw new Error("lifecycle operation unavailable: " + definition.operation);
      return toolResult(await operation(args));
    },
  });
}
