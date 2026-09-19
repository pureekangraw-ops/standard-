const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum,version,parents,trashed,webViewLink";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFile(file) {
  return {
    id: text(file?.id) || null,
    name: typeof file?.name === "string" ? file.name : null,
    mimeType: text(file?.mimeType) || null,
    size: file?.size == null ? null : String(file.size),
    modifiedTime: file?.modifiedTime || null,
    md5Checksum: file?.md5Checksum || null,
    version: file?.version == null ? null : String(file.version),
    parents: Array.isArray(file?.parents) ? file.parents.map(String) : [],
    trashed: file?.trashed === true,
    webViewLink: file?.webViewLink || null,
  };
}

function errorCategory(payload, status) {
  const reason = payload?.error?.errors?.[0]?.reason;
  return typeof reason === "string" && reason ? reason : "HTTP_" + status;
}

function validPageSize(value) {
  if (value == null) return 100;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 1000 ? number : null;
}

function encode(value) {
  return encodeURIComponent(String(value));
}

export function createGoogleDriveService({
  fetchImpl = fetch,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  rootFolderId,
} = {}) {
  const directAccessToken = text(accessToken);
  const oauthRefreshToken = text(refreshToken);
  const oauthClientId = text(clientId);
  const oauthClientSecret = text(clientSecret);
  const scopeRoot = text(rootFolderId);
  let cachedToken = null;
  let cachedTokenExpiresAt = 0;

  function authMode() {
    if (oauthRefreshToken && oauthClientId && oauthClientSecret) return "refresh_token";
    if (directAccessToken) return "access_token";
    return null;
  }

  async function bearerToken() {
    if (!(oauthRefreshToken && oauthClientId && oauthClientSecret)) {
      if (directAccessToken) return { token: directAccessToken };
      return { response: json({ code: "DRIVE_NOT_CONFIGURED" }, 503) };
    }
    if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) return { token: cachedToken };

    let upstream;
    try {
      upstream = await fetchImpl(DRIVE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: oauthClientId,
          client_secret: oauthClientSecret,
          refresh_token: oauthRefreshToken,
          grant_type: "refresh_token",
        }).toString(),
      });
    } catch {
      return { response: json({ code: "DRIVE_AUTH_UPSTREAM_ERROR", category: "NETWORK_ERROR" }, 502) };
    }
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !text(payload?.access_token)) {
      return {
        response: json({
          code: "DRIVE_AUTH_UPSTREAM_ERROR",
          category: errorCategory(payload, upstream.status),
        }, 502),
      };
    }
    cachedToken = text(payload.access_token);
    const expiresIn = Number(payload.expires_in);
    cachedTokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1000;
    return { token: cachedToken };
  }

  async function request(path, init = {}) {
    const auth = await bearerToken();
    if (auth.response) return { response: auth.response };
    let upstream;
    try {
      upstream = await fetchImpl(DRIVE_API_ROOT + path, {
        ...init,
        headers: {
          authorization: "Bearer " + auth.token,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
    } catch {
      return { response: json({ code: "DRIVE_UPSTREAM_ERROR", category: "NETWORK_ERROR" }, 502) };
    }
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload) {
      return {
        response: json({
          code: "DRIVE_UPSTREAM_ERROR",
          category: errorCategory(payload, upstream.status),
        }, 502),
      };
    }
    return { payload };
  }

  async function getRaw(fileId) {
    const id = text(fileId);
    if (!id) return { response: json({ code: "DRIVE_INVALID_INPUT" }, 400) };
    return request("/files/" + encode(id) +
      "?supportsAllDrives=true&fields=" + encode(FILE_FIELDS));
  }

  async function isWithinScope(fileId) {
    if (!scopeRoot) return { ok: true };
    let current = text(fileId);
    if (!current) return { ok: false, response: json({ code: "DRIVE_INVALID_INPUT" }, 400) };
    const visited = new Set();
    for (let depth = 0; depth < 64; depth += 1) {
      if (current === scopeRoot) return { ok: true };
      if (visited.has(current)) break;
      visited.add(current);
      const result = await getRaw(current);
      if (result.response) return { ok: false, response: result.response };
      const parents = Array.isArray(result.payload?.parents) ? result.payload.parents : [];
      if (!parents.length) break;
      current = String(parents[0]);
    }
    return { ok: false, response: json({ code: "DRIVE_SCOPE_VIOLATION" }, 403) };
  }

  async function readback(fileId, expected = {}) {
    const result = await getRaw(fileId);
    if (result.response) return result;
    const item = normalizeFile(result.payload);
    if (expected.name != null && item.name !== expected.name) {
      return { response: json({ code: "DRIVE_READBACK_MISMATCH", field: "name" }, 409) };
    }
    if (expected.parentId != null && !item.parents.includes(expected.parentId)) {
      return { response: json({ code: "DRIVE_READBACK_MISMATCH", field: "parentId" }, 409) };
    }
    return { item };
  }

  return Object.freeze({
    async capabilities() {
      return json({
        configured: Boolean(authMode()),
        authMode: authMode(),
        rootScopeConfigured: Boolean(scopeRoot),
        operations: [
          "capabilities",
          "get_item",
          "list_children",
          "create_folder",
          "move_item",
          "rename_item",
        ],
        destructiveDeleteExposed: false,
        mutationReadbackRequired: true,
      });
    },

    async getItem(input = {}) {
      const fileId = text(input.fileId);
      if (!fileId) return json({ code: "DRIVE_INVALID_INPUT" }, 400);
      const scoped = await isWithinScope(fileId);
      if (!scoped.ok) return scoped.response;
      const result = await getRaw(fileId);
      if (result.response) return result.response;
      return json({ item: normalizeFile(result.payload) });
    },

    async listChildren(input = {}) {
      const parentId = text(input.parentId);
      const pageSize = validPageSize(input.pageSize);
      const pageToken = text(input.pageToken);
      if (!parentId || pageSize == null) return json({ code: "DRIVE_INVALID_INPUT" }, 400);
      const scoped = await isWithinScope(parentId);
      if (!scoped.ok) return scoped.response;
      const params = new URLSearchParams({
        q: "'" + parentId.replace(/'/g, "\\'") + "' in parents and trashed = false",
        fields: "nextPageToken,files(" + FILE_FIELDS + ")",
        pageSize: String(pageSize),
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const result = await request("/files?" + params.toString());
      if (result.response) return result.response;
      return json({
        items: Array.isArray(result.payload?.files) ? result.payload.files.map(normalizeFile) : [],
        nextPageToken: result.payload?.nextPageToken || null,
      });
    },

    async createFolder(input = {}) {
      const parentId = text(input.parentId);
      const name = text(input.name);
      if (!parentId || !name) return json({ code: "DRIVE_INVALID_INPUT" }, 400);
      const scoped = await isWithinScope(parentId);
      if (!scoped.ok) return scoped.response;
      const result = await request(
        "/files?supportsAllDrives=true&fields=" + encode(FILE_FIELDS),
        {
          method: "POST",
          body: JSON.stringify({
            name,
            mimeType: FOLDER_MIME,
            parents: [parentId],
          }),
        },
      );
      if (result.response) return result.response;
      const verified = await readback(result.payload?.id, { name, parentId });
      if (verified.response) return verified.response;
      return json({ item: verified.item, readback: "PASS" });
    },

    async moveItem(input = {}) {
      const fileId = text(input.fileId);
      const destinationFolderId = text(input.destinationFolderId);
      if (!fileId || !destinationFolderId || fileId === destinationFolderId) {
        return json({ code: "DRIVE_INVALID_INPUT" }, 400);
      }
      for (const id of [fileId, destinationFolderId]) {
        const scoped = await isWithinScope(id);
        if (!scoped.ok) return scoped.response;
      }
      const before = await getRaw(fileId);
      if (before.response) return before.response;
      const oldParents = Array.isArray(before.payload?.parents) ? before.payload.parents.map(String) : [];
      if (!oldParents.length) return json({ code: "DRIVE_SOURCE_PARENT_MISSING" }, 409);
      const removeParents = oldParents.filter(parent => parent !== destinationFolderId);
      if (removeParents.length || !oldParents.includes(destinationFolderId)) {
        const params = new URLSearchParams({
          supportsAllDrives: "true",
          fields: FILE_FIELDS,
          addParents: destinationFolderId,
        });
        if (removeParents.length) params.set("removeParents", removeParents.join(","));
        const moved = await request("/files/" + encode(fileId) + "?" + params.toString(), {
          method: "PATCH",
          body: JSON.stringify({}),
        });
        if (moved.response) return moved.response;
      }
      const verified = await readback(fileId, { parentId: destinationFolderId });
      if (verified.response) return verified.response;
      return json({
        item: verified.item,
        previousParents: oldParents,
        readback: "PASS",
      });
    },

    async renameItem(input = {}) {
      const fileId = text(input.fileId);
      const name = text(input.name);
      if (!fileId || !name) return json({ code: "DRIVE_INVALID_INPUT" }, 400);
      const scoped = await isWithinScope(fileId);
      if (!scoped.ok) return scoped.response;
      const renamed = await request(
        "/files/" + encode(fileId) + "?supportsAllDrives=true&fields=" + encode(FILE_FIELDS),
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      if (renamed.response) return renamed.response;
      const verified = await readback(fileId, { name });
      if (verified.response) return verified.response;
      return json({ item: verified.item, readback: "PASS" });
    },
  });
}
