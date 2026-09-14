function normalizeBase(value) {
  const base = String(value || "").trim();
  if (!base.startsWith("/")) throw new Error("gatewayBase must be same-origin");
  if (base.startsWith("//")) throw new Error("gatewayBase must be same-origin");
  return base.replace(/\/$/, "");
}

function assertRepository(value) {
  const repository = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("invalid repository");
  }
  return repository;
}

function assertSafePath(value) {
  const filePath = String(value || "");
  if (!filePath || filePath.startsWith("/") || filePath.includes("\\") || filePath.split("/").some(part => part === ".." || part === "." || part === "")) {
    throw new Error("unsafe path");
  }
  return filePath;
}

async function parseJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `gateway request failed (${response.status})`);
    error.status = response.status;
    error.code = payload.code || null;
    throw error;
  }
  return payload;
}

export function createGitHubWorkspace({ gatewayBase, repository, fetchImpl = fetch } = {}) {
  const base = normalizeBase(gatewayBase);
  const repo = assertRepository(repository);
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl is required");

  const request = async (path, init = {}) => {
    const response = await fetchImpl(`${base}${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    });
    return parseJson(response);
  };

  return Object.freeze({
    repository: repo,
    async listFiles() {
      const payload = await request(`/files?repository=${encodeURIComponent(repo)}`);
      return Array.isArray(payload.files) ? payload.files : [];
    },
    async readText(path) {
      const safePath = assertSafePath(path);
      const payload = await request(`/file?repository=${encodeURIComponent(repo)}&path=${encodeURIComponent(safePath)}`);
      return String(payload.content ?? "");
    },
    async writeText(path, content) {
      const safePath = assertSafePath(path);
      return request("/file", {
        method: "PUT",
        body: JSON.stringify({ repository: repo, path: safePath, content: String(content ?? "") }),
      });
    },
  });
}
