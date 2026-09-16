const LINEAR_API_ROOT = "https://api.linear.app/graphql";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function configured(token, teamId) {
  return Boolean(String(token || "").trim() && String(teamId || "").trim());
}

function sanitizeCategory(errors) {
  const code = errors?.[0]?.extensions?.code;
  return typeof code === "string" && code ? code : "GRAPHQL_ERROR";
}

function normalizeProject(project) {
  return {
    id: project.id,
    name: project.name,
    status: project.status?.name || null,
    url: project.url || null,
  };
}

function normalizeIssue(issue) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    status: issue.state ? { id: issue.state.id, name: issue.state.name } : null,
    priority: issue.priority,
    project: issue.project ? { id: issue.project.id, name: issue.project.name } : null,
    url: issue.url || null,
    updatedAt: issue.updatedAt || null,
  };
}

function issueInScope(issue, teamId) {
  return String(issue?.team?.id || "") === String(teamId || "");
}

function validPriority(value) {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

function optionalId(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !value.trim()) return { ok: false };
  return { ok: true, value: value.trim() };
}

const ISSUE_SELECTION = `
  id
  identifier
  title
  description
  url
  updatedAt
  priority
  state { id name }
  team { id }
  project { id name }
`;

export function createLinearService({ fetchImpl = fetch, token, teamId } = {}) {
  async function request(query, variables = {}) {
    if (!configured(token, teamId)) return { response: json({ code: "LINEAR_NOT_CONFIGURED" }, 503) };
    let upstream;
    try {
      upstream = await fetchImpl(LINEAR_API_ROOT, {
        method: "POST",
        headers: {
          authorization: String(token),
          "content-type": "application/json",
          "user-agent": "go-hub-linear-bridge",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      return { response: json({ code: "LINEAR_UPSTREAM_ERROR", category: "NETWORK_ERROR" }, 502) };
    }
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload || Array.isArray(payload.errors) && payload.errors.length) {
      return {
        response: json({
          code: "LINEAR_UPSTREAM_ERROR",
          category: Array.isArray(payload?.errors) && payload.errors.length
            ? sanitizeCategory(payload.errors)
            : "HTTP_" + upstream.status,
        }, 502),
      };
    }
    return { data: payload.data };
  }

  async function readIssue(identifier) {
    return request(`query HubIssue($identifier: String!) {
      issue(id: $identifier) {${ISSUE_SELECTION}}
    }`, { identifier });
  }

  function scopedIssueResult(result) {
    if (result.response) return result;
    const issue = result.data?.issue;
    if (!issue) return { response: json({ code: "LINEAR_ISSUE_NOT_FOUND" }, 404) };
    if (!issueInScope(issue, teamId)) return { response: json({ code: "LINEAR_TEAM_SCOPE_VIOLATION" }, 403) };
    return { issue };
  }

  return Object.freeze({
    async listProjects() {
      const result = await request(`query TeamProjects($teamId: String!) {
        team(id: $teamId) {
          id
          projects(first: 100) {
            nodes { id name url status { name } }
          }
        }
      }`, { teamId: String(teamId || "") });
      if (result.response) return result.response;
      const nodes = result.data?.team?.projects?.nodes || [];
      return json({ projects: nodes.map(normalizeProject) });
    },

    async getIssue(input = {}) {
      const identifier = typeof input?.identifier === "string" ? input.identifier.trim() : "";
      if (!identifier) return json({ code: "LINEAR_INVALID_INPUT" }, 400);
      const scoped = scopedIssueResult(await readIssue(identifier));
      if (scoped.response) return scoped.response;
      return json({ issue: normalizeIssue(scoped.issue) });
    },

    async createIssue(input = {}) {
      const title = typeof input?.title === "string" ? input.title.trim() : "";
      if (!title) return json({ code: "LINEAR_INVALID_INPUT" }, 400);

      const mutationInput = { teamId: String(teamId || ""), title };
      if (Object.hasOwn(input, "description")) {
        if (input.description !== null && typeof input.description !== "string") return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput.description = input.description;
      }
      if (Object.hasOwn(input, "priority")) {
        if (!validPriority(input.priority)) return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput.priority = input.priority;
      }
      if (Object.hasOwn(input, "projectId")) {
        const projectId = optionalId(input.projectId);
        if (!projectId.ok) return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput.projectId = projectId.value;
      }

      const result = await request(`mutation HubIssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {${ISSUE_SELECTION}}
        }
      }`, { input: mutationInput });
      if (result.response) return result.response;
      const payload = result.data?.issueCreate;
      if (!payload?.success || !payload.issue) return json({ code: "LINEAR_UPSTREAM_ERROR", category: "MUTATION_FAILED" }, 502);
      if (!issueInScope(payload.issue, teamId)) return json({ code: "LINEAR_UPSTREAM_ERROR", category: "TEAM_SCOPE_MISMATCH" }, 502);
      return json({ issue: normalizeIssue(payload.issue) });
    },

    async updateIssue(input = {}) {
      const identifier = typeof input?.identifier === "string" ? input.identifier.trim() : "";
      const patchFields = ["title", "description", "priority", "stateId", "projectId"];
      if (!identifier || !patchFields.some(field => Object.hasOwn(input, field))) {
        return json({ code: "LINEAR_INVALID_INPUT" }, 400);
      }

      const mutationInput = {};
      if (Object.hasOwn(input, "title")) {
        if (typeof input.title !== "string" || !input.title.trim()) return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput.title = input.title.trim();
      }
      if (Object.hasOwn(input, "description")) {
        if (input.description !== null && typeof input.description !== "string") return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput.description = input.description;
      }
      if (Object.hasOwn(input, "priority")) {
        if (!validPriority(input.priority)) return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput.priority = input.priority;
      }
      for (const field of ["stateId", "projectId"]) {
        if (!Object.hasOwn(input, field)) continue;
        const parsed = optionalId(input[field]);
        if (!parsed.ok) return json({ code: "LINEAR_INVALID_INPUT" }, 400);
        mutationInput[field] = parsed.value;
      }

      const scoped = scopedIssueResult(await readIssue(identifier));
      if (scoped.response) return scoped.response;

      const result = await request(`mutation HubIssueUpdate($issueId: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $issueId, input: $input) {
          success
          issue {${ISSUE_SELECTION}}
        }
      }`, { issueId: scoped.issue.id, input: mutationInput });
      if (result.response) return result.response;
      const payload = result.data?.issueUpdate;
      if (!payload?.success || !payload.issue) return json({ code: "LINEAR_UPSTREAM_ERROR", category: "MUTATION_FAILED" }, 502);
      if (!issueInScope(payload.issue, teamId)) return json({ code: "LINEAR_UPSTREAM_ERROR", category: "TEAM_SCOPE_MISMATCH" }, 502);
      return json({ issue: normalizeIssue(payload.issue) });
    },
  });
}
