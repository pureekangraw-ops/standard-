const string = { type: "string", minLength: 1 };
const integer = { type: "integer", minimum: 1 };

function schema(properties, required) {
  return { type: "object", properties, required, additionalProperties: false };
}

const definitions = [
  ["go_hub_inspect_repository", "Inspect repository truth and recursive tree at an explicit branch.", "inspect",
    schema({ repository: string, branch: string }, ["repository"]), { readOnlyHint: true, destructiveHint: false }],
  ["go_hub_read_file", "Read one UTF-8 repository file at an explicit ref.", "readFile",
    schema({ repository: string, path: string, ref: string }, ["repository", "path"]), { readOnlyHint: true, destructiveHint: false }],
  ["go_hub_create_branch", "Create a non-default task branch from an exact commit SHA.", "createBranch",
    schema({ repository: string, name: string, fromSha: string }, ["repository", "name", "fromSha"]), { readOnlyHint: false, destructiveHint: false }],
  ["go_hub_put_file", "Create or update one file on a non-default branch with optimistic SHA protection.", "putFile",
    schema({ repository: string, path: string, branch: string, expectedSha: string, content: { type: "string" } }, ["repository", "path", "branch", "content"]), { readOnlyHint: false, destructiveHint: false }],
  ["go_hub_delete_file", "Delete one file on a non-default branch using its exact current blob SHA.", "deleteFile",
    schema({ repository: string, path: string, branch: string, expectedSha: string }, ["repository", "path", "branch", "expectedSha"]), { readOnlyHint: false, destructiveHint: true }],
  ["go_hub_compare_refs", "Compare exact base and head refs and return changed-file evidence.", "compare",
    schema({ repository: string, base: string, head: string }, ["repository", "base", "head"]), { readOnlyHint: true, destructiveHint: false }],
  ["go_hub_open_pull_request", "Open or update a pull request from a task branch.", "openPullRequest",
    schema({ repository: string, branch: string, base: string, title: string, body: { type: "string" } }, ["repository", "branch", "base", "title"]), { readOnlyHint: false, destructiveHint: false }],
  ["go_hub_get_pull_request", "Read pull-request state with exact head and base evidence.", "getPullRequest",
    schema({ repository: string, number: integer }, ["repository", "number"]), { readOnlyHint: true, destructiveHint: false }],
  ["go_hub_get_ci", "Read workflow and check evidence bound to an exact head SHA.", "getCI",
    schema({ repository: string, sha: string }, ["repository", "sha"]), { readOnlyHint: true, destructiveHint: false }],
  ["go_hub_rerun_failed_jobs", "Rerun failed jobs for one workflow run.", "rerunFailed",
    schema({ repository: string, runId: integer }, ["repository", "runId"]), { readOnlyHint: false, destructiveHint: false }],
  ["go_hub_merge_pull_request", "Merge only when the expected head is current and exact-head CI is green.", "mergePullRequest",
    schema({ repository: string, number: integer, expectedHeadSha: string, method: { type: "string", enum: ["merge", "squash", "rebase"] } }, ["repository", "number", "expectedHeadSha"]), { readOnlyHint: false, destructiveHint: true }],
  ["go_hub_get_workflow_runs", "Observe workflow and deployment runs for one exact SHA.", "getWorkflowRuns",
    schema({ repository: string, sha: string }, ["repository", "sha"]), { readOnlyHint: true, destructiveHint: false }],
  ["go_hub_mimir_search_catalog", "Search the live owner-scoped Notion catalog, apply current Gate before GO Rating, and return PASS or explicit WAIT evidence.", "searchCatalog",
    schema({ task: string, requestedResult: string, lensReference: string }, ["task", "requestedResult"]), { readOnlyHint: true, destructiveHint: false }],
].map(([name, description, operation, inputSchema, annotations]) =>
  Object.freeze({
    name, description, operation, inputSchema,
    securitySchemes: Object.freeze([{ type: "oauth2", scopes: Object.freeze(["go-hub"]) }]),
    annotations: Object.freeze(annotations),
  })
);

function assertArguments(definition, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("invalid MCP tool arguments");
  for (const field of definition.inputSchema.required) {
    if (!(field in args) || args[field] === "" || args[field] == null) throw new Error("missing required argument: " + field);
  }
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(definition.inputSchema.properties, key)) throw new Error("unknown argument: " + key);
  }
}

async function toolResult(response) {
  const payload = await response.json().catch(() => ({ code: "INVALID_TOOL_RESPONSE" }));
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(response.ok ? {} : { isError: true }),
  };
}

export function createMcpRegistry({ lifecycle } = {}) {
  if (!lifecycle) throw new Error("lifecycle service is required");
  const byName = new Map(definitions.map(definition => [definition.name, definition]));
  return Object.freeze({
    listTools() {
      return definitions.map(({ operation, ...tool }) => ({
        ...tool,
        securitySchemes: tool.securitySchemes.map(scheme => ({ ...scheme, scopes: [...scheme.scopes] })),
        annotations: { ...tool.annotations },
        inputSchema: structuredClone(tool.inputSchema),
      }));
    },
    async callTool(name, args = {}) {
      const definition = byName.get(name);
      if (!definition) throw new Error("unknown MCP tool: " + name);
      assertArguments(definition, args);
      const operation = lifecycle[definition.operation];
      if (typeof operation !== "function") throw new Error("lifecycle operation unavailable: " + definition.operation);
      return toolResult(await operation(args));
    },
  });
}
