const API_ROOT = "/hub/api/github-workspace";
const ALLOWED_OWNER = "pureekangraw-ops";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function badRequest(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function assertRepository(value) {
  const repository = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) badRequest("invalid repository");
  if (repository.split("/")[0] !== ALLOWED_OWNER) badRequest("repository owner is not allowed", 403);
  return repository;
}

function assertSafePath(value) {
  const filePath = String(value || "");
  if (!filePath || filePath.startsWith("/") || filePath.includes("\\") ||
      filePath.split("/").some(part => part === ".." || part === "." || part === "")) {
    badRequest("unsafe path");
  }
  return filePath;
}

function assertRef(value, label = "ref") {
  const ref = String(value || "").trim();
  if (!ref || ref.startsWith("/") || ref.endsWith("/") || ref.includes("\\") ||
      ref.includes("..") || ref.includes("//") || /[\s~^:?*[\]]/.test(ref)) {
    badRequest(`invalid ${label}`);
  }
  return ref;
}

function assertPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) badRequest(`invalid ${label}`);
  return number;
}

function encodePath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "go-hub-workspace-gateway",
  };
}

async function githubRequest(fetchImpl, token, url, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { ...githubHeaders(token), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeUtf8Base64(value) {
  const binary = atob(String(value || "").replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)));
}

function upstreamError(response) {
  return json({ code: "GITHUB_UPSTREAM_ERROR", status: response.status }, 502);
}

async function getRepository(fetchImpl, token, repository) {
  const result = await githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}`);
  if (!result.response.ok) return { error: upstreamError(result.response) };
  const defaultBranch = String(result.payload.default_branch || "");
  if (!defaultBranch) return { error: json({ code: "DEFAULT_BRANCH_MISSING" }, 502) };
  return { defaultBranch };
}

async function getBranch(fetchImpl, token, repository, branch) {
  const result = await githubRequest(
    fetchImpl, token,
    `https://api.github.com/repos/${repository}/branches/${encodeURIComponent(branch)}`,
  );
  if (result.response.status === 404) return { error: json({ code: "BRANCH_NOT_FOUND" }, 404) };
  if (!result.response.ok) return { error: upstreamError(result.response) };
  const sha = result.payload?.commit?.sha || null;
  if (!sha) return { error: json({ code: "BRANCH_SHA_MISSING" }, 502) };
  return { branch: result.payload?.name || branch, sha };
}

async function getTree(fetchImpl, token, repository, ref) {
  const branch = await getBranch(fetchImpl, token, repository, ref);
  if (branch.error) return branch;
  const result = await githubRequest(
    fetchImpl, token,
    `https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(branch.sha)}?recursive=1`,
  );
  if (!result.response.ok) return { error: upstreamError(result.response) };
  const tree = Array.isArray(result.payload.tree)
    ? result.payload.tree
        .filter(item => item && typeof item.path === "string" && typeof item.type === "string")
        .map(item => ({ path: item.path, type: item.type, sha: item.sha || null }))
    : [];
  return { branch: branch.branch, sha: branch.sha, tree };
}

async function inspectRepository(fetchImpl, token, repository, selectedBranch) {
  const repo = await getRepository(fetchImpl, token, repository);
  if (repo.error) return repo.error;
  const branch = selectedBranch || repo.defaultBranch;
  const base = await getBranch(fetchImpl, token, repository, repo.defaultBranch);
  if (base.error) return base.error;
  const tree = await getTree(fetchImpl, token, repository, branch);
  if (tree.error) return tree.error;
  return json({
    repository,
    defaultBranch: repo.defaultBranch,
    branch: tree.branch,
    baseSha: base.sha,
    headSha: tree.sha,
    tree: tree.tree,
  });
}

async function listTree(fetchImpl, token, repository, ref) {
  const tree = await getTree(fetchImpl, token, repository, ref);
  if (tree.error) return tree.error;
  return json({ ref: tree.branch, sha: tree.sha, tree: tree.tree });
}

async function listFiles(fetchImpl, token, repository) {
  const result = await githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/contents/`);
  if (!result.response.ok) return upstreamError(result.response);
  const files = Array.isArray(result.payload)
    ? result.payload.filter(item => item && item.type === "file").map(item => item.path)
    : [];
  return json({ files });
}

async function readFile(fetchImpl, token, repository, filePath, ref = null) {
  const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const result = await githubRequest(
    fetchImpl, token,
    `https://api.github.com/repos/${repository}/contents/${encodePath(filePath)}${suffix}`,
  );
  if (result.response.status === 404) return json({ code: "FILE_NOT_FOUND" }, 404);
  if (!result.response.ok) return upstreamError(result.response);
  if (result.payload.type !== "file" || result.payload.encoding !== "base64") {
    return json({ code: "UNSUPPORTED_CONTENT" }, 422);
  }
  return json({ content: decodeUtf8Base64(result.payload.content), sha: result.payload.sha || null });
}

async function assertNonDefaultBranch(fetchImpl, token, repository, branch) {
  const repo = await getRepository(fetchImpl, token, repository);
  if (repo.error) return repo;
  if (branch === repo.defaultBranch) return { error: json({ code: "DEFAULT_BRANCH_WRITE_BLOCKED" }, 409) };
  return repo;
}

async function createBranch(fetchImpl, token, repository, name, fromSha) {
  const result = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/git/refs`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha: fromSha }),
    },
  );
  if (!result.response.ok) return upstreamError(result.response);
  return json({ branch: name, headSha: result.payload?.object?.sha || fromSha }, 201);
}

async function mutateFile(fetchImpl, token, repository, filePath, branch, expectedSha, content, method) {
  const policy = await assertNonDefaultBranch(fetchImpl, token, repository, branch);
  if (policy.error) return policy.error;

  const hasExpectedSha = expectedSha != null && String(expectedSha).trim() !== "";
  if (method === "DELETE" && !hasExpectedSha) badRequest("invalid sha");
  const safeExpectedSha = hasExpectedSha ? assertRef(expectedSha, "sha") : null;
  const action = method === "DELETE" ? "delete" : safeExpectedSha ? "update" : "create";
  const body = {
    message: `GO Hub: ${action} ${filePath}`,
    branch,
  };
  if (safeExpectedSha) body.sha = safeExpectedSha;
  if (method === "PUT") body.content = encodeUtf8Base64(content);

  const result = await githubRequest(
    fetchImpl, token,
    `https://api.github.com/repos/${repository}/contents/${encodePath(filePath)}`,
    {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!result.response.ok) {
    if (safeExpectedSha && (result.response.status === 409 || result.response.status === 422)) {
      return json({ code: "STALE_FILE_SHA" }, 409);
    }
    return upstreamError(result.response);
  }
  return json({
    ok: true,
    commit: result.payload?.commit?.sha || null,
    ...(method === "PUT" ? { sha: result.payload?.content?.sha || null } : {}),
  });
}

async function compareRefs(fetchImpl, token, repository, base, head) {
  const result = await githubRequest(
    fetchImpl, token,
    `https://api.github.com/repos/${repository}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
  if (!result.response.ok) return upstreamError(result.response);
  return json({
    status: result.payload.status || null,
    aheadBy: Number(result.payload.ahead_by || 0),
    behindBy: Number(result.payload.behind_by || 0),
    files: Array.isArray(result.payload.files)
      ? result.payload.files.map(file => ({
          path: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        }))
      : [],
  });
}

function pullRequestPayload(payload) {
  return {
    number: payload.number,
    url: payload.html_url || null,
    state: payload.state || null,
    mergeable: payload.mergeable ?? null,
    headBranch: payload.head?.ref || null,
    headSha: payload.head?.sha || null,
    baseBranch: payload.base?.ref || null,
    baseSha: payload.base?.sha || null,
  };
}

async function openPullRequest(fetchImpl, token, repository, branch, base, title, body) {
  const owner = repository.split("/")[0];
  const query = new URLSearchParams({ state: "open", head: `${owner}:${branch}`, base });
  const listed = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/pulls?${query}`,
  );
  if (!listed.response.ok) return upstreamError(listed.response);
  const existing = Array.isArray(listed.payload) ? listed.payload[0] : null;
  const result = existing
    ? await githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/pulls/${existing.number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, base }),
      })
    : await githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/pulls`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, head: branch, base }),
      });
  if (!result.response.ok) return upstreamError(result.response);
  return json(pullRequestPayload(result.payload), existing ? 200 : 201);
}

async function getPullRequest(fetchImpl, token, repository, number) {
  const result = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/pulls/${number}`,
  );
  if (result.response.status === 404) return json({ code: "PULL_REQUEST_NOT_FOUND" }, 404);
  if (!result.response.ok) return upstreamError(result.response);
  return json(pullRequestPayload(result.payload));
}

async function getCI(fetchImpl, token, repository, sha) {
  const [runsResult, checksResult] = await Promise.all([
    githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(sha)}`),
    githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(sha)}/check-runs`),
  ]);
  if (!runsResult.response.ok) return upstreamError(runsResult.response);
  if (!checksResult.response.ok) return upstreamError(checksResult.response);
  const runs = Array.isArray(runsResult.payload.workflow_runs)
    ? runsResult.payload.workflow_runs
        .filter(run => run.head_sha === sha)
        .map(run => ({
          id: run.id, name: run.name, status: run.status, conclusion: run.conclusion,
          headSha: run.head_sha, url: run.html_url || null,
        }))
    : [];
  const checks = Array.isArray(checksResult.payload.check_runs)
    ? checksResult.payload.check_runs
        .filter(check => check.head_sha === sha)
        .map(check => ({
          id: check.id, name: check.name, status: check.status, conclusion: check.conclusion,
          headSha: check.head_sha, url: check.html_url || null,
        }))
    : [];
  return json({ headSha: sha, runs, checks });
}

async function rerunFailed(fetchImpl, token, repository, runId) {
  const result = await githubRequest(
    fetchImpl, token,
    `https://api.github.com/repos/${repository}/actions/runs/${runId}/rerun-failed-jobs`,
    { method: "POST" },
  );
  if (!result.response.ok) return upstreamError(result.response);
  return json({ ok: true, runId }, 202);
}

async function exactHeadCI(fetchImpl, token, repository, sha) {
  const [runsResult, checksResult] = await Promise.all([
    githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(sha)}`),
    githubRequest(fetchImpl, token, `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(sha)}/check-runs`),
  ]);
  if (!runsResult.response.ok) return { error: upstreamError(runsResult.response) };
  if (!checksResult.response.ok) return { error: upstreamError(checksResult.response) };
  const runs = Array.isArray(runsResult.payload.workflow_runs)
    ? runsResult.payload.workflow_runs.filter(run => run.head_sha === sha)
    : [];
  const checks = Array.isArray(checksResult.payload.check_runs)
    ? checksResult.payload.check_runs.filter(check => check.head_sha === sha)
    : [];
  return { runs, checks };
}

async function mergePullRequest(fetchImpl, token, repository, number, expectedHeadSha, method) {
  const pull = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/pulls/${number}`,
  );
  if (!pull.response.ok) return upstreamError(pull.response);
  const currentHeadSha = pull.payload?.head?.sha || null;
  if (currentHeadSha !== expectedHeadSha) {
    return json({ code: "STALE_PULL_REQUEST_HEAD" }, 409);
  }
  const ci = await exactHeadCI(fetchImpl, token, repository, expectedHeadSha);
  if (ci.error) return ci.error;
  const signals = [...ci.runs, ...ci.checks];
  const green = signals.length > 0 && signals.every(item =>
    item.status === "completed" && item.conclusion === "success"
  );
  if (!green) return json({ code: "CURRENT_HEAD_CI_NOT_GREEN" }, 409);
  const result = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/pulls/${number}/merge`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha: expectedHeadSha, merge_method: method }),
    },
  );
  if (!result.response.ok) return upstreamError(result.response);
  if (result.payload?.merged !== true || !result.payload?.sha) {
    return json({ code: "MERGE_REJECTED" }, 409);
  }
  return json({ merged: true, mergeSha: result.payload.sha, headSha: expectedHeadSha });
}

async function getWorkflowRuns(fetchImpl, token, repository, sha) {
  const result = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(sha)}`,
  );
  if (!result.response.ok) return upstreamError(result.response);
  const runs = Array.isArray(result.payload.workflow_runs)
    ? result.payload.workflow_runs
        .filter(run => run.head_sha === sha)
        .map(run => ({
          id: run.id, name: run.name, status: run.status, conclusion: run.conclusion,
          headSha: run.head_sha, url: run.html_url || null,
        }))
    : [];
  return json({ headSha: sha, runs });
}

export function createWorkerHandler({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(API_ROOT)) {
        if (env?.ASSETS && typeof env.ASSETS.fetch === "function") return env.ASSETS.fetch(request);
        return new Response("GO Hub", { status: 200 });
      }
      if (!env?.GITHUB_TOKEN) return json({ code: "GITHUB_NOT_CONFIGURED" }, 503);

      try {
        if (request.method === "GET" && url.pathname === `${API_ROOT}/inspect`) {
          const repository = assertRepository(url.searchParams.get("repository"));
          const value = url.searchParams.get("branch");
          return inspectRepository(fetchImpl, env.GITHUB_TOKEN, repository, value ? assertRef(value, "branch") : null);
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/tree`) {
          return listTree(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(url.searchParams.get("repository")),
            assertRef(url.searchParams.get("ref")),
          );
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/files`) {
          return listFiles(fetchImpl, env.GITHUB_TOKEN, assertRepository(url.searchParams.get("repository")));
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/file`) {
          const value = url.searchParams.get("ref");
          return readFile(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(url.searchParams.get("repository")),
            assertSafePath(url.searchParams.get("path")),
            value ? assertRef(value) : null,
          );
        }
        if (request.method === "POST" && url.pathname === `${API_ROOT}/branch`) {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          return createBranch(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(body.repository),
            assertRef(body.name, "branch"),
            assertRef(body.fromSha, "sha"),
          );
        }
        if ((request.method === "PUT" || request.method === "DELETE") && url.pathname === `${API_ROOT}/file`) {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          return mutateFile(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(body.repository),
            assertSafePath(body.path),
            assertRef(body.branch, "branch"),
            body.expectedSha,
            body.content,
            request.method,
          );
        }
        if (request.method === "POST" && url.pathname === `${API_ROOT}/pull-request`) {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          return openPullRequest(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(body.repository),
            assertRef(body.branch, "branch"),
            assertRef(body.base, "base"),
            String(body.title || "").trim() || badRequest("title is required"),
            String(body.body || ""),
          );
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/pull-request`) {
          return getPullRequest(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(url.searchParams.get("repository")),
            assertPositiveInteger(url.searchParams.get("number"), "pull request number"),
          );
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/ci`) {
          return getCI(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(url.searchParams.get("repository")),
            assertRef(url.searchParams.get("sha"), "sha"),
          );
        }
        if (request.method === "POST" && url.pathname === `${API_ROOT}/ci/rerun-failed`) {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          return rerunFailed(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(body.repository),
            assertPositiveInteger(body.runId, "run id"),
          );
        }
        if (request.method === "POST" && url.pathname === `${API_ROOT}/pull-request/merge`) {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          const method = String(body.method || "squash");
          if (!["merge", "squash", "rebase"].includes(method)) badRequest("invalid merge method");
          return mergePullRequest(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(body.repository),
            assertPositiveInteger(body.number, "pull request number"),
            assertRef(body.expectedHeadSha, "expected head sha"),
            method,
          );
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/workflow-runs`) {
          return getWorkflowRuns(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(url.searchParams.get("repository")),
            assertRef(url.searchParams.get("sha"), "sha"),
          );
        }
        if (request.method === "GET" && url.pathname === `${API_ROOT}/compare`) {
          return compareRefs(
            fetchImpl, env.GITHUB_TOKEN,
            assertRepository(url.searchParams.get("repository")),
            assertRef(url.searchParams.get("base"), "base"),
            assertRef(url.searchParams.get("head"), "head"),
          );
        }
        return json({ code: "NOT_FOUND" }, 404);
      } catch (error) {
        return json({ code: error?.message || "BAD_REQUEST" }, error?.status || 400);
      }
    },
  };
}

export default createWorkerHandler();