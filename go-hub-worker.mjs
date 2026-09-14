const API_ROOT = "/hub/api/github-workspace";
const ALLOWED_OWNER = "pureekangraw-ops";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function assertRepository(value) {
  const repository = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw Object.assign(new Error("invalid repository"), { status: 400 });
  }
  const [owner] = repository.split("/");
  if (owner !== ALLOWED_OWNER) {
    throw Object.assign(new Error("repository owner is not allowed"), { status: 403 });
  }
  return repository;
}

function assertSafePath(value) {
  const filePath = String(value || "");
  if (!filePath || filePath.startsWith("/") || filePath.includes("\\") ||
      filePath.split("/").some(part => part === ".." || part === "." || part === "")) {
    throw Object.assign(new Error("unsafe path"), { status: 400 });
  }
  return filePath;
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

async function listFiles(fetchImpl, token, repository) {
  const { response, payload } = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/contents/`
  );
  if (!response.ok) return json({ code: "GITHUB_UPSTREAM_ERROR", status: response.status }, 502);
  const files = Array.isArray(payload)
    ? payload.filter(item => item && item.type === "file").map(item => item.path)
    : [];
  return json({ files });
}

async function readFile(fetchImpl, token, repository, filePath) {
  const { response, payload } = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/contents/${filePath}`
  );
  if (response.status === 404) return json({ code: "FILE_NOT_FOUND" }, 404);
  if (!response.ok) return json({ code: "GITHUB_UPSTREAM_ERROR", status: response.status }, 502);
  if (payload.type !== "file" || payload.encoding !== "base64") {
    return json({ code: "UNSUPPORTED_CONTENT" }, 422);
  }
  return json({ content: decodeUtf8Base64(payload.content), sha: payload.sha || null });
}

async function writeFile(fetchImpl, token, repository, filePath, content) {
  const lookup = await githubRequest(
    fetchImpl, token, `https://api.github.com/repos/${repository}/contents/${filePath}`
  );
  if (!lookup.response.ok && lookup.response.status !== 404) {
    return json({ code: "GITHUB_UPSTREAM_ERROR", status: lookup.response.status }, 502);
  }

  const body = {
    message: `GO Hub: update ${filePath}`,
    content: encodeUtf8Base64(content),
  };
  if (lookup.response.ok && lookup.payload.sha) body.sha = lookup.payload.sha;

  const { response, payload } = await githubRequest(
    fetchImpl,
    token,
    `https://api.github.com/repos/${repository}/contents/${filePath}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return json({ code: "GITHUB_UPSTREAM_ERROR", status: response.status }, 502);
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
        if (request.method === "GET" && url.pathname === `${API_ROOT}/files`) {
          const repository = assertRepository(url.searchParams.get("repository"));
          return listFiles(fetchImpl, env.GITHUB_TOKEN, repository);
        }

        if (request.method === "GET" && url.pathname === `${API_ROOT}/file`) {
          const repository = assertRepository(url.searchParams.get("repository"));
          const filePath = assertSafePath(url.searchParams.get("path"));
          return readFile(fetchImpl, env.GITHUB_TOKEN, repository, filePath);
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
