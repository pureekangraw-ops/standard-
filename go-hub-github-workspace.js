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

function assertPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`invalid ${label}`);
  return number;
}

function assertSafePath(value) {
  const filePath = String(value || "");
  if (
    !filePath ||
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    filePath.split("/").some(part => part === ".." || part === "." || part === "")
  ) {
    throw new Error("unsafe path");
  }
  return filePath;
}

function assertRef(value, label = "ref") {
  const ref = String(value || "").trim();
  if (
    !ref ||
    ref.startsWith("/") ||
    ref.endsWith("/") ||
    ref.includes("\\") ||
    ref.includes("..") ||
    ref.includes("//") ||
    /[\s~^:?*[\]]/.test(ref)
  ) {
    throw new Error(`invalid ${label}`);
  }
  return ref;
}

async function parseJson(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload.error ||
      payload.message ||
      payload.code ||
      `gateway request failed (${response.status})`
    );
    error.status = response.status;
    error.code = payload.code || null;
    throw error;
  }

  return payload;
}

export function createGitHubWorkspace({
  gatewayBase,
  repository,
  fetchImpl = fetch,
} = {}) {
  const base = normalizeBase(gatewayBase);
  const repo = assertRepository(repository);

  if (typeof fetchImpl !== "function") {
    throw new Error("fetchImpl is required");
  }

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

    async inspect({ branch } = {}) {
      const branchQuery = branch
        ? `&branch=${encodeURIComponent(assertRef(branch, "branch"))}`
        : "";
      return request(
        `/inspect?repository=${encodeURIComponent(repo)}${branchQuery}`
      );
    },

    async listTree({ ref } = {}) {
      const safeRef = assertRef(ref);
      const payload = await request(
        `/tree?repository=${encodeURIComponent(repo)}&ref=${encodeURIComponent(safeRef)}`
      );
      return Array.isArray(payload.tree) ? payload.tree : [];
    },

    async listFiles() {
      const payload = await request(
        `/files?repository=${encodeURIComponent(repo)}`
      );
      return Array.isArray(payload.files) ? payload.files : [];
    },

    async readText(path, { branch } = {}) {
      const safePath = assertSafePath(path);
      const branchQuery = branch
        ? `&ref=${encodeURIComponent(assertRef(branch, "branch"))}`
        : "";
      const payload = await request(
        `/file?repository=${encodeURIComponent(repo)}&path=${encodeURIComponent(safePath)}${branchQuery}`
      );
      return String(payload.content ?? "");
    },

    async createBranch({ name, fromSha } = {}) {
      return request("/branch", {
        method: "POST",
        body: JSON.stringify({
          repository: repo,
          name: assertRef(name, "branch"),
          fromSha: assertRef(fromSha, "sha"),
        }),
      });
    },

    async writeText(path, content, { branch, expectedSha } = {}) {
      return request("/file", {
        method: "PUT",
        body: JSON.stringify({
          repository: repo,
          path: assertSafePath(path),
          content: String(content ?? ""),
          branch: assertRef(branch, "branch"),
          expectedSha: assertRef(expectedSha, "sha"),
        }),
      });
    },

    async deletePath(path, { branch, expectedSha } = {}) {
      return request("/file", {
        method: "DELETE",
        body: JSON.stringify({
          repository: repo,
          path: assertSafePath(path),
          branch: assertRef(branch, "branch"),
          expectedSha: assertRef(expectedSha, "sha"),
        }),
      });
    },

    async compare({ base: baseRef, head } = {}) {
      return request(
        `/compare?repository=${encodeURIComponent(repo)}&base=${encodeURIComponent(assertRef(baseRef, "base"))}&head=${encodeURIComponent(assertRef(head, "head"))}`
      );
    },

    async openPullRequest({ branch, base: baseRef, title, body = "" } = {}) {
      const safeTitle = String(title || "").trim();
      if (!safeTitle) throw new Error("title is required");
      return request("/pull-request", {
        method: "POST",
        body: JSON.stringify({
          repository: repo,
          branch: assertRef(branch, "branch"),
          base: assertRef(baseRef, "base"),
          title: safeTitle,
          body: String(body),
        }),
      });
    },

    async getPullRequest({ number } = {}) {
      return request(
        `/pull-request?repository=${encodeURIComponent(repo)}&number=${assertPositiveInteger(number, "pull request number")}`
      );
    },

    async getCI({ sha } = {}) {
      return request(
        `/ci?repository=${encodeURIComponent(repo)}&sha=${encodeURIComponent(assertRef(sha, "sha"))}`
      );
    },

    async rerunFailed({ runId } = {}) {
      return request("/ci/rerun-failed", {
        method: "POST",
        body: JSON.stringify({
          repository: repo,
          runId: assertPositiveInteger(runId, "run id"),
        }),
      });
    },
  });
}
