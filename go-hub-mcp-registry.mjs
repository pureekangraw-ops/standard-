const str = { type: "string", minLength: 1 };
const int = { type: "integer", minimum: 1 };
const obj = { type: "object" };
const priority = { type: "integer", minimum: 0, maximum: 4 };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };
const FACTORY = "destination://factory";
const MIMIR = "destination://mimir";
const LINEAR = "destination://linear";
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
  def("go_hub_factory_foreman", "Request, cancel, park, verify, release, or inspect Hephaestus work.", "factoryForeman", schema({ action: { type: "string", enum: ["request", "cancel", "park", "verify", "release", "state"] }, repository: str, slot: { type: "string", enum: ["assembly", "merge"] }, goId: str, jobId: str, mainSha: str, mergedAt: str, readyGate: obj, piece: obj, assembly: obj, assemblyQc: obj, pullRequest: obj, ci: obj, risk: obj, cancellation: obj, postMergeVerification: obj, workContext }, ["action", "repository"]), ann(false)),
  def("go_hub_merge_pull_request", "Merge with Foreman ownership and exact-head CI.", "mergePullRequest", schema({ repository: str, number: int, expectedHeadSha: str, goId: str, jobId: str, method: { type: "string", enum: ["merge", "squash", "rebase"] }, workContext }, ["repository", "number", "expectedHeadSha", "goId", "jobId", "workContext"]), ann(false, true)),
  def("go_hub_get_workflow_runs", "Observe workflow and deployment runs.", "getWorkflowRuns", schema({ repository: str, sha: str }, ["repository", "sha"]), ann(true)),
  def("go_hub_mimir_search_catalog", "Search live MIMIR catalog with Gate-before-Rating.", "searchCatalog", schema({ task: str, requestedResult: str, lensReference: str, workContext }, ["task", "requestedResult", "workContext"]), ann(true)),
  def("go_hub_mimir_search_knowledge", "Search verified MIMIR knowledge with freshness and evidence gates.", "searchKnowledge", schema({ task: str, requestedResult: str, lensReference: str, workContext }, ["task", "requestedResult", "workContext"]), ann(true)),
  def("go_hub_linear_list_projects", "List projects scoped to the configured Linear team.", "linearListProjects", schema({}), ann(true)),
  def("go_hub_linear_get_issue", "Read one Linear issue and enforce configured-team scope.", "linearGetIssue", schema({ identifier: str }, ["identifier"]), ann(true)),
  def("go_hub_linear_create_issue", "Create a Linear issue in the configured team.", "linearCreateIssue", schema({ title: str, description: nullableStr, projectId: nullableStr, priority, workContext }, ["title", "workContext"]), ann(false)),
  def("go_hub_linear_update_issue", "Update an in-team Linear issue after a scoped read.", "linearUpdateIssue", schema({ identifier: str, title: str, description: nullableStr, priority, stateId: nullableStr, projectId: nullableStr, workContext }, ["identifier", "workContext"]), ann(false)),
];

const factoryTools = new Set(["go_hub_create_branch", "go_hub_put_file", "go_hub_delete_file", "go_hub_open_pull_request", "go_hub_rerun_failed_jobs", "go_hub_merge_pull_request"]);
const mimirTools = new Set(["go_hub_mimir_search_catalog", "go_hub_mimir_search_knowledge"]);
const linearMutationTools = new Set(["go_hub_linear_create_issue", "go_hub_linear_update_issue"]);

function assertArgs(definition, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("invalid MCP tool arguments");
  for (const field of definition.inputSchema.required) {
    if (!(field in args) || args[field] === "" || args[field] == null) throw new Error("missing required argument: " + field);
  }
  for (const key of Object.keys(args)) if (!Object.hasOwn(definition.inputSchema.properties, key)) throw new Error("unknown argument: " + key);
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
