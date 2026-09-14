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
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    badRequest("invalid repository");
  }
  const [owner] = repository.split("/");
  if (owner !== ALLOWED_OWNER) {
    badRequest("repository owner is not allowed", 403);
  }
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
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
    fetchImpl,
    token,
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
    fetchImpl,
    token,
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
  const { response, payload } = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/contents/`
  );
  if (!response.ok) return upstreamError(response);
  const files = Array.isArray(payload)
    ? payload.filter(item => item && item.type === "file").map(item => item.path)
    : [];
  return json({ files });
}

async function readFile(fetchImpl, token, repository, filePath, ref = null) {
  const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const { response, payload } = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/contents/${encodePath(filePath)}${suffix}`
  );
  if (response.status === 404) return json({ code: "FILE_NOT_FOUND" }, 404);
  if (!response.ok) return upstreamError(response);
  if (payload.type !== "file" || payload.encoding !== "base64") {
    return json({ code: "UNSUPPORTED_CONTENT" }, 422);
  }
  return json({ content: decodeUtf8Base64(payload.content), sha: payload.sha || null });
}

async function writeFile(fetchImpl, token, repository, filePath, content) {
  const lookup = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/contents/${encodePath(filePath)}`
  );
  if (!lookup.response.ok && lookup.response.status !== 404) {
    return upstreamError(lookup.response);
  }

  const body = {
    message: `GO Hub: update ${filePath}`,
    content: encodeUtf8Base64(content),
  };
  if (lookup.response.ok && lookup.payload.sha) body.sha = lookup.payload.sha;

  const { response, payload } = await githubRequest(
    fetchImpl,
    token,
    `https://api.github.com/repos/${repository}/contents/${encodePath(filePath)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return upstreamError(response);
  return json({ ok: true, commit: payload?.commit?.sha || null });
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
          const branchValue = url.searchParams.get("branch");
          const branch = branchValue ? assertRef(branchValue, "branch") : null;
          return inspectRepository(fetchImpl, env.GITHUB_TOKEN, repository, branch);
        }

        if (request.method === "GET" && url.pathname === `${API_ROOT}/tree`) {
          const repository = assertRepository(url.searchParams.get("repository"));
          const ref = assertRef(url.searchParams.get("ref"));
          return listTree(fetchImpl, env.GITHUB_TOKEN, repository, ref);
        }

        if (request.method === "GET" && url.pathname === `${API_ROOT}/files`) {
          const repository = assertRepository(url.searchParams.get("repository"));
          return listFiles(fetchImpl, env.GITHUB_TOKEN, repository);
        }

        if (request.method === "GET" && url.pathname === `${API_ROOT}/file`) {
          const repository = assertRepository(url.searchParams.get("repository"));
          const filePath = assertSafePath(url.searchParams.get("path"));
          const refValue = url.searchParams.get("ref");
          const ref = refValue ? assertRef(refValue) : null;
          return readFile(fetchImpl, env.GITHUB_TOKEN, repository, filePath, ref);
        }

        if (request.method === "PUT" && url.pathname === `${API_ROOT}/file`) {
          const body = await request.json().catch(() => null);
          if (!body) return json({ code: "INVALID_JSON" }, 400);
          const repository = assertRepository(body.repository);
          const filePath = assertSafePath(body.path);
          return writeFile(fetchImpl, env.GITHUB_TOKEN, repository, filePath, body.content);
        }

        return json({ code: "NOT_FOUND" }, 404);
      } catch (error) {
        return json(
          { code: error?.message || "BAD_REQUEST" },
          error?.status || 400
        );
      }
    },
  };
}

export default createWorkerHandler();
