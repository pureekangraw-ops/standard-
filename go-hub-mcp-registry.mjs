const str = { type: "string", minLength: 1 };
const int = { type: "integer", minimum: 1 };
const revision = { type: "integer", minimum: 0 };
const obj = { type: "object" };
const priority = { type: "integer", minimum: 0, maximum: 4 };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };
const FACTORY = "destination://factory";
const MIMIR = "destination://mimir";
const LINEAR = "destination://linear";
const MAINTENANCE = "destination://maintenance";
const DRIVE = "destination://drive";
const workContext = {
  type: "object",
  properties: {
    workId: str, checkpointId: str, returnAddress: str, destination: str,
    task: str, requestedResult: str, lensReference: str,
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
  def("go_hub_factory_foreman", "Request, cancel, park, verify, release, or inspect Hephaestus work.", "factoryForeman", schema({ action: { type: "string", enum: ["request", "cancel", "park", "verify", "release", "state"] }, repository: str, slot: { type: "string", enum: ["assembly", "merge"] }, goId: str, jobId: str, mainSha: str, mergedAt: str, readyGate: obj, piece: obj, assembly: obj, assemblyQc: obj, pullRequest: obj, ci: obj, risk: obj, cancellation: obj, postMergeVerification: obj, workContext }, ["action", "repository"]), ann(false)),
  def("go_hub_maintenance", "Inspect governed Maintenance capability or build a source-bound Factory closeout plan.", "maintenance", schema({ target: { type: "string", enum: ["factory"] }, action: { type: "string", enum: ["inspect", "plan_closeout"] }, input: obj, workContext }, ["target", "action", "input", "workContext"]), ann(true)),
  def("go_hub_merge_pull_request", "Merge with Foreman ownership and exact-head CI.", "mergePullRequest", schema({ repository: str, number: int, expectedHeadSha: str, goId: str, jobId: str, method: { type: "string", enum: ["merge", "squash", "rebase"] }, workContext }, ["repository", "number", "expectedHeadSha", "goId", "jobId", "workContext"]), ann(false, true)),
  def("go_hub_get_workflow_runs", "Observe workflow and deployment runs.", "getWorkflowRuns", schema({ repository: str, sha: str }, ["repository", "sha"]), ann(true)),
  def("go_hub_list_workflow_artifacts", "List GitHub Actions artifacts for one exact workflow run.", "listWorkflowArtifacts", schema({ repository: str, runId: int }, ["repository", "runId"]), ann(true)),
  def("go_hub_archive_workflow_artifact", "Download one GitHub Actions artifact server-side, optionally extract one entry, and archive it to governed Google Drive with hash metadata and readback.", "archiveWorkflowArtifact", schema({ repository: str, runId: int, artifactId: int, parentId: str, entrySuffix: str, destinationName: str, mimeType: str, workContext }, ["repository", "runId", "artifactId", "parentId", "workContext"]), ann(false)),
  def("go_hub_centre_live_action", "Execute or inspect durable City/Centre live work through GO Hub.", "centreLiveAction", schema({ action: { type: "string", enum: ["start", "inspect", "review", "fit", "leave", "return", "record_reality", "cancel", "resume"] }, workId: str, checkpointId: str, returnAddress: str, task: str, requestedResult: str, authority: str, targetId: str, roleId: str, roleReference: str, workingView: str, destination: str, payload: obj, evidence: obj, reuseFit: { type: "boolean" } }, ["action", "workId"]), ann(false)),
  def("go_hub_lighthouse_control_port_state", "Read latest paired LIGHTHOUSE Control Port snapshot, work state, commands, and receipts.", "lighthouseControlPortState", schema({ targetId: str }, ["targetId"]), ann(true)),
  def("go_hub_lighthouse_control_port_command", "Queue one governed command for paired LIGHTHOUSE Control Port. Owner confirmation remains enforced on-device by capability guard.", "lighthouseControlPortCommand", schema({ targetId: str, requestId: str, capabilityId: str, payload: obj }, ["targetId", "requestId", "capabilityId", "payload"]), ann(false)),
  def("go_hub_project_status", "Read normalized Project Status from current GitHub truth and optional Factory task truth.", "projectStatus", schema({ targetId: str, factoryTaskId: str }, ["targetId"]), ann(true)),
  def("go_hub_board_pin_route", "Resolve first-command Pin identity routing without mutating the Board.", "boardPinRoute", schema({ firstCommand: str, pin: obj }, ["firstCommand"]), ann(true)),
  def("go_hub_mimir_search_catalog", "Search live MIMIR catalog with Gate-before-Rating.", "searchCatalog", schema({ task: str, requestedResult: str, lensReference: str, workContext }, ["task", "requestedResult", "workContext"]), ann(true)),
  def("go_hub_mimir_search_knowledge", "Search verified MIMIR knowledge with freshness and evidence gates.", "searchKnowledge", schema({ task: str, requestedResult: str, lensReference: str, workContext }, ["task", "requestedResult", "workContext"]), ann(true)),
  def("go_hub_observer_latest", "Read latest sanitized Browser Observer evidence.", "observerLatest", schema({}), ann(true)),
  def("go_hub_observer_screenshot", "Read one consented Browser Observer screenshot by ref.", "observerScreenshot", schema({ screenshotRef: str }, ["screenshotRef"]), ann(true)),
  def("go_hub_linear_list_projects", "List projects scoped to the configured Linear team.", "linearListProjects", schema({}), ann(true)),
  def("go_hub_linear_get_issue", "Read one Linear issue and enforce configured-team scope.", "linearGetIssue", schema({ identifier: str }, ["identifier"]), ann(true)),
  def("go_hub_linear_create_issue", "Create a Linear issue in the configured team.", "linearCreateIssue", schema({ title: str, description: nullableStr, projectId: nullableStr, priority, workContext }, ["title", "workContext"]), ann(false)),
  def("go_hub_linear_update_issue", "Update an in-team Linear issue after a scoped read.", "linearUpdateIssue", schema({ identifier: str, title: str, description: nullableStr, priority, stateId: nullableStr, projectId: nullableStr, workContext }, ["identifier", "workContext"]), ann(false)),
  def("go_hub_drive_capabilities", "Inspect GO Hub Google Drive bridge configuration and supported operations without exposing credentials.", "driveCapabilities", schema({}), ann(true)),
  def("go_hub_drive_health", "Verify server-side Google Drive authentication and upstream API reachability without returning account data.", "driveHealth", schema({}), ann(true)),
  def("go_hub_drive_diagnostics", "Read sanitized Google Drive runtime account identity and granted OAuth scopes without exposing credentials.", "driveDiagnostics", schema({}), ann(true)),
  def("go_hub_drive_get_item", "Read normalized Google Drive item metadata by file or folder ID.", "driveGetItem", schema({ fileId: str }, ["fileId"]), ann(true)),
  def("go_hub_drive_list_children", "List normalized Google Drive children under one folder ID.", "driveListChildren", schema({ parentId: str, pageSize: { type: "integer", minimum: 1, maximum: 1000 }, pageToken: str }, ["parentId"]), ann(true)),
  def("go_hub_drive_create_folder", "Create a Google Drive folder and require destination readback before success.", "driveCreateFolder", schema({ parentId: str, name: str, workContext }, ["parentId", "name", "workContext"]), ann(false)),
  def("go_hub_drive_move_item", "Move an existing Google Drive item with native parent update and require destination readback before success.", "driveMoveItem", schema({ fileId: str, destinationFolderId: str, workContext }, ["fileId", "destinationFolderId", "workContext"]), ann(false)),
  def("go_hub_drive_rename_item", "Rename an existing Google Drive item and require readback before success.", "driveRenameItem", schema({ fileId: str, name: str, workContext }, ["fileId", "name", "workContext"]), ann(false)),
];

const factoryTools = new Set(["go_hub_create_branch", "go_hub_put_file", "go_hub_delete_file", "go_hub_open_pull_request", "go_hub_rerun_failed_jobs", "go_hub_merge_pull_request", "go_hub_factory_action"]);
const mimirTools = new Set(["go_hub_mimir_search_catalog", "go_hub_mimir_search_knowledge"]);
const maintenanceTools = new Set(["go_hub_maintenance"]);
const linearMutationTools = new Set(["go_hub_linear_create_issue", "go_hub_linear_update_issue"]);
const driveMutationTools = new Set(["go_hub_drive_create_folder", "go_hub_drive_move_item", "go_hub_drive_rename_item", "go_hub_archive_workflow_artifact"]);

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

function assertWork(value, destination) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workContext is required");
  for (const field of workContext.required) if (!String(value[field] || "").trim()) throw new Error("workContext missing field: " + field);
  for (const key of Object.keys(value)) if (!Object.hasOwn(workContext.properties, key)) throw new Error("unknown workContext field: " + key);
  if (String(value.checkpointId) !== String(value.returnAddress)) throw new Error("workContext Return Address must match Checkpoint ID");
  if (String(value.destination) !== destination) throw new Error("workContext destination must be " + destination);
}

function assertLifecycle(name, args) {
  if (factoryTools.has(name)) assertWork(args.workContext, FACTORY);
  if (linearMutationTools.has(name)) assertWork(args.workContext, LINEAR);
  if (mimirTools.has(name)) assertWork(args.workContext, MIMIR);
  if (maintenanceTools.has(name)) assertWork(args.workContext, MAINTENANCE);
  if (driveMutationTools.has(name)) assertWork(args.workContext, DRIVE);
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
