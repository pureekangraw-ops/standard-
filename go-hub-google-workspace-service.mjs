const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_ROOT = "https://gmail.googleapis.com/gmail/v1";
const CALENDAR_ROOT = "https://www.googleapis.com/calendar/v3";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function authConfig(input) {
  return {
    accessToken: text(input.accessToken),
    refreshToken: text(input.refreshToken),
    clientId: text(input.clientId),
    clientSecret: text(input.clientSecret),
  };
}
function createGoogleAuth({ fetchImpl, ...input }) {
  const config = authConfig(input);
  let cached = config.accessToken || "";
  let scopes = "";
  function mode() {
    if (config.refreshToken && config.clientId && config.clientSecret) return "refresh_token";
    if (config.accessToken) return "access_token";
    return null;
  }
  async function token() {
    if (cached) return { token: cached };
    if (mode() !== "refresh_token") return { response: json({ code: "GOOGLE_WORKSPACE_NOT_CONFIGURED" }, 503) };
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId, client_secret: config.clientSecret,
          refresh_token: config.refreshToken, grant_type: "refresh_token",
        }),
      });
    } catch { return { response: json({ code: "GOOGLE_WORKSPACE_AUTH_ERROR", category: "NETWORK_ERROR" }, 502) }; }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) return { response: json({ code: "GOOGLE_WORKSPACE_AUTH_ERROR" }, 502) };
    cached = String(payload.access_token);
    scopes = text(payload.scope);
    return { token: cached };
  }
  return Object.freeze({ token, mode, scopes: () => scopes.split(/\s+/).filter(Boolean) });
}
async function request(fetchImpl, auth, root, path, init = {}) {
  const bearer = await auth.token();
  if (bearer.response) return { response: bearer.response };
  let upstream;
  try {
    upstream = await fetchImpl(root + path, {
      ...init,
      headers: { authorization: "Bearer " + bearer.token, "content-type": "application/json", ...(init.headers || {}) },
    });
  } catch { return { response: json({ code: "GOOGLE_WORKSPACE_UPSTREAM_ERROR", category: "NETWORK_ERROR" }, 502) }; }
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) return { response: json({ code: "GOOGLE_WORKSPACE_UPSTREAM_ERROR", status: upstream.status }, upstream.status === 401 || upstream.status === 403 ? 403 : 502) };
  return { payload };
}
function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
const MAX_GMAIL_ATTACHMENTS = 5;
const MAX_GMAIL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
function safeHeader(value) {
  const v = text(value);
  return v && !/[\r\n]/.test(v) ? v : "";
}
function quotedHeaderValue(value) {
  return String(value || "").replace(/[\\"]/g, "_").replace(/[\r\n]/g, "");
}
function attachmentBytes(base64) {
  const compact = String(base64 || "").replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) return null;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return { base64: compact, bytes: Math.floor(compact.length * 3 / 4) - padding };
}
function wrapBase64(value) {
  return String(value || "").match(/.{1,76}/g)?.join("\r\n") || "";
}
function prepareAttachments(value) {
  if (value == null) return { attachments: [], totalBytes: 0 };
  if (!Array.isArray(value) || value.length > MAX_GMAIL_ATTACHMENTS) return null;
  const attachments = [];
  let totalBytes = 0;
  for (const item of value) {
    const filename = safeHeader(item?.filename);
    const mimeType = safeHeader(item?.mimeType);
    const encoded = attachmentBytes(item?.contentBase64);
    if (!filename || !/^[A-Za-z0-9!#function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}^_.+\/-]+\/[A-Za-z0-9!#function base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}^_.+\/-]+$/.test(mimeType) || !encoded) return null;
    totalBytes += encoded.bytes;
    if (totalBytes > MAX_GMAIL_ATTACHMENT_BYTES) return null;
    attachments.push({ filename, mimeType, contentBase64: encoded.base64 });
  }
  return { attachments, totalBytes };
}
function buildRawEmail({ to, subject, body, attachments = [], inReplyTo = "", references = "" }) {
  const headers = ["To: " + to, "Subject: " + subject, "MIME-Version: 1.0"];
  if (inReplyTo) headers.push("In-Reply-To: " + inReplyTo);
  if (references) headers.push("References: " + references);
  if (!attachments.length) {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    return headers.join("\r\n") + "\r\n\r\n" + body;
  }
  const boundary = "go-hub-" + crypto.randomUUID();
  headers.push('Content-Type: multipart/mixed; boundary="' + boundary + '"');
  const parts = [
    "--" + boundary,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ];
  for (const attachment of attachments) {
    const filename = quotedHeaderValue(attachment.filename);
    parts.push(
      "--" + boundary,
      'Content-Type: ' + attachment.mimeType + '; name="' + filename + '"',
      'Content-Disposition: attachment; filename="' + filename + '"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(attachment.contentBase64),
    );
  }
  parts.push("--" + boundary + "--", "");
  return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
}
export function createGoogleWorkspaceService({ fetchImpl = fetch, accessToken, refreshToken, clientId, clientSecret } = {}) {
  const auth = createGoogleAuth({ fetchImpl, accessToken, refreshToken, clientId, clientSecret });
  return Object.freeze({
    async capabilities() {
      return json({ configured: Boolean(auth.mode()), authMode: auth.mode(), gmail: ["profile","search","get_message","send_message","send_message_with_attachments"], gmailAttachmentLimits: { maxFiles: MAX_GMAIL_ATTACHMENTS, maxDecodedBytes: MAX_GMAIL_ATTACHMENT_BYTES }, calendar: ["list_calendars","list_events","create_event"], destructiveDeleteExposed: false });
    },
    async diagnostics() {
      return json({ configured: Boolean(auth.mode()), authMode: auth.mode(), scopes: auth.scopes(), scopeSource: auth.scopes().length ? "refresh_response" : "unavailable" });
    },
    async gmailProfile() {
      const r = await request(fetchImpl, auth, GMAIL_ROOT, "/users/me/profile"); if (r.response) return r.response;
      return json({ profile: { emailAddress: r.payload?.emailAddress || null, messagesTotal: r.payload?.messagesTotal ?? null, threadsTotal: r.payload?.threadsTotal ?? null } });
    },
    async gmailSearch(input = {}) {
      const q = text(input.query); const maxResults = Math.min(Math.max(Number(input.maxResults || 20),1),100);
      const p = new URLSearchParams({ maxResults: String(maxResults) }); if (q) p.set("q", q); if (text(input.pageToken)) p.set("pageToken", text(input.pageToken));
      const r = await request(fetchImpl, auth, GMAIL_ROOT, "/users/me/messages?" + p); if (r.response) return r.response;
      return json({ messages: Array.isArray(r.payload?.messages) ? r.payload.messages : [], nextPageToken: r.payload?.nextPageToken || null, resultSizeEstimate: r.payload?.resultSizeEstimate ?? null });
    },
    async gmailGetMessage(input = {}) {
      const id = text(input.messageId); if (!id) return json({ code: "GMAIL_INVALID_INPUT" }, 400);
      const format = ["minimal","full","metadata"].includes(input.format) ? input.format : "metadata";
      const r = await request(fetchImpl, auth, GMAIL_ROOT, "/users/me/messages/" + encodeURIComponent(id) + "?format=" + format); if (r.response) return r.response;
      return json({ message: r.payload });
    },
    async gmailSendMessage(input = {}) {
      const to = safeHeader(input.to), subject = safeHeader(input.subject), body = String(input.body || "");
      const threadId = safeHeader(input.threadId), inReplyTo = safeHeader(input.inReplyTo), references = safeHeader(input.references);
      const prepared = prepareAttachments(input.attachments);
      if (!to || !subject || !body || !prepared ||
          (input.threadId != null && !threadId) ||
          (input.inReplyTo != null && !inReplyTo) ||
          (input.references != null && !references)) {
        return json({ code: "GMAIL_INVALID_INPUT" }, 400);
      }
      const raw = base64Url(buildRawEmail({ to, subject, body, attachments: prepared.attachments, inReplyTo, references }));
      const payload = { raw };
      if (threadId) payload.threadId = threadId;
      const r = await request(fetchImpl, auth, GMAIL_ROOT, "/users/me/messages/send", { method: "POST", body: JSON.stringify(payload) }); if (r.response) return r.response;
      return json({
        message: { id: r.payload?.id || null, threadId: r.payload?.threadId || null },
        attachmentCount: prepared.attachments.length,
        attachmentBytes: prepared.totalBytes,
        readback: "ACCEPTED_BY_GMAIL",
      });
    },
    async calendarList(input = {}) {
      const p = new URLSearchParams({ maxResults: String(Math.min(Math.max(Number(input.maxResults || 100),1),250)) }); if (text(input.pageToken)) p.set("pageToken", text(input.pageToken));
      const r = await request(fetchImpl, auth, CALENDAR_ROOT, "/users/me/calendarList?" + p); if (r.response) return r.response;
      return json({ calendars: Array.isArray(r.payload?.items) ? r.payload.items : [], nextPageToken: r.payload?.nextPageToken || null });
    },
    async calendarEvents(input = {}) {
      const id = text(input.calendarId) || "primary"; const p = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: String(Math.min(Math.max(Number(input.maxResults || 50),1),250)) });
      if (text(input.timeMin)) p.set("timeMin", text(input.timeMin)); if (text(input.timeMax)) p.set("timeMax", text(input.timeMax)); if (text(input.pageToken)) p.set("pageToken", text(input.pageToken));
      const r = await request(fetchImpl, auth, CALENDAR_ROOT, "/calendars/" + encodeURIComponent(id) + "/events?" + p); if (r.response) return r.response;
      return json({ events: Array.isArray(r.payload?.items) ? r.payload.items : [], nextPageToken: r.payload?.nextPageToken || null });
    },
    async calendarCreateEvent(input = {}) {
      const id = text(input.calendarId) || "primary"; const summary = text(input.summary);
      if (!summary || !input.start || !input.end) return json({ code: "CALENDAR_INVALID_INPUT" }, 400);
      const event = { summary, start: input.start, end: input.end };
      if (text(input.description)) event.description = text(input.description); if (text(input.location)) event.location = text(input.location);
      const r = await request(fetchImpl, auth, CALENDAR_ROOT, "/calendars/" + encodeURIComponent(id) + "/events", { method: "POST", body: JSON.stringify(event) }); if (r.response) return r.response;
      return json({ event: r.payload, readback: "ACCEPTED_BY_CALENDAR" });
    },
  });
}
