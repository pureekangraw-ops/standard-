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
export function createGoogleWorkspaceService({ fetchImpl = fetch, accessToken, refreshToken, clientId, clientSecret } = {}) {
  const auth = createGoogleAuth({ fetchImpl, accessToken, refreshToken, clientId, clientSecret });
  return Object.freeze({
    async capabilities() {
      return json({ configured: Boolean(auth.mode()), authMode: auth.mode(), gmail: ["profile","search","get_message","send_message"], calendar: ["list_calendars","list_events","create_event"], destructiveDeleteExposed: false });
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
      const to = text(input.to), subject = text(input.subject), body = String(input.body || "");
      if (!to || !subject || !body) return json({ code: "GMAIL_INVALID_INPUT" }, 400);
      const raw = base64Url("To: " + to + "\r\nSubject: " + subject + "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body);
      const r = await request(fetchImpl, auth, GMAIL_ROOT, "/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) }); if (r.response) return r.response;
      return json({ message: { id: r.payload?.id || null, threadId: r.payload?.threadId || null }, readback: "ACCEPTED_BY_GMAIL" });
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
