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
      return json({ projects: nodes.map(project => ({
        id: project.id,
        name: project.name,
        status: project.status?.name || null,
        url: project.url || null,
      })) });
    },
    async getIssue() { return json({ code: "LINEAR_INVALID_INPUT" }, 400); },
    async createIssue() { return json({ code: "LINEAR_INVALID_INPUT" }, 400); },
    async updateIssue() { return json({ code: "LINEAR_INVALID_INPUT" }, 400); },
  });
}
