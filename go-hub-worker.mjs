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
  const safeExpectedSha = assertRef(expectedSha, "sha");
  const body = {
    message: `GO Hub: ${method === "DELETE" ? "delete" : "update"} ${filePath}`,
    branch,
    sha: safeExpectedSha,
  };
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
  if (!result.response.ok) return upstreamError(result.response);
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
