const BOARD_NAME = "centre-board-v4";
const STORAGE_KEY = "centre-board-v4";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers:{ "content-type":"application/json; charset=utf-8", "cache-control":"no-store" },
  });
}
function clean(value) { return String(value == null ? "" : value).trim(); }
function clone(value) { return value == null ? value : structuredClone(value); }
function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
}
function required(value, label) {
  const result = clean(value);
  if (!result) throw Object.assign(new Error(label + " is required"), { status:400 });
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function normalizePass(pass) {
  if (!pass || typeof pass !== "object" || Array.isArray(pass)) return null;
  return {
    kind:clean(pass.kind) || null,
    state:clean(pass.state) || null,
    allowedDestinations:unique(pass.allowedDestinations),
    openedAt:clean(pass.openedAt) || null,
    closedAt:clean(pass.closedAt) || null,
  };
}
function projection(work, projectedAt) {
  if (!work || typeof work !== "object" || Array.isArray(work)) {
    throw Object.assign(new Error("Work record is required"), { status:400 });
  }
  const status = required(work.status, "Work status");
  return {
    workId:required(work.workId, "Work ID"),
    checkpointId:clean(work.checkpointId) || null,
    name:required(work.name || work.command, "Work name"),
    status,
    holder:clean(work.holder) || null,
    lastUpdated:required(work.lastUpdated, "Last Updated"),
    requestedDestinations:unique(work.requestedDestinations),
    pass:normalizePass(work.pass),
    sourceRevision:Number.isSafeInteger(work.revision) && work.revision >= 0 ? work.revision : null,
    projectedAt,
  };
}
function newBoard() {
  return { schemaVersion:1, revision:0, updatedAt:null, works:{} };
}
function filteredItems(board, input = {}) {
  const query = clean(input.query).toLowerCase();
  const status = clean(input.status).toUpperCase();
  const holder = clean(input.holder).toLowerCase();
  const destination = clean(input.destination).toLowerCase();
  const workId = clean(input.workId);
  const items = Object.values(board.works || {}).filter(item => {
    if (workId && item.workId !== workId) return false;
    if (status && String(item.status || "").toUpperCase() !== status) return false;
    if (holder && String(item.holder || "").toLowerCase() !== holder) return false;
    if (destination) {
      const destinations = [
        ...(item.requestedDestinations || []),
        ...(item.pass?.allowedDestinations || []),
      ].map(value => String(value || "").toLowerCase());
      if (!destinations.includes(destination)) return false;
    }
    if (query) {
      const haystack = [
        item.workId, item.checkpointId, item.name, item.status, item.holder,
        ...(item.requestedDestinations || []),
        ...(item.pass?.allowedDestinations || []),
      ].map(value => String(value || "").toLowerCase());
      if (!haystack.some(value => value.includes(query))) return false;
    }
    return true;
  });
  return items.sort((a,b) => {
    const byTime = String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || ""));
    return byTime || String(a.workId).localeCompare(String(b.workId));
  });
}
function counts(items) {
  const result = { OPEN:0, "ON PROCESS":0, "WAIT CONFIRM":0, COMPLETE:0, CANCEL:0 };
  for (const item of items) {
    if (Object.prototype.hasOwnProperty.call(result, item.status)) result[item.status] += 1;
    else result[item.status] = (result[item.status] || 0) + 1;
  }
  return result;
}

export function createCentreBoardStore({ storage, now = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
    throw new TypeError("Centre Board storage required");
  }
  async function load() {
    const current = await storage.get(STORAGE_KEY);
    return current && current.schemaVersion === 1 && current.works && typeof current.works === "object"
      ? clone(current)
      : newBoard();
  }
  async function save(board) {
    await storage.put(STORAGE_KEY, clone(board));
    return board;
  }
  return Object.freeze({
    async project(work) {
      const board = await load();
      const at = String(now());
      const nextItem = projection(work, at);
      const previous = board.works[nextItem.workId] || null;
      const comparable = value => value ? { ...value, projectedAt:null } : null;
      if (previous && canonical(comparable(previous)) === canonical(comparable(nextItem))) {
        return { ok:true, changed:false, revision:board.revision, item:clone(previous) };
      }
      const next = clone(board);
      next.revision = Number(board.revision || 0) + 1;
      next.updatedAt = at;
      next.works[nextItem.workId] = nextItem;
      await save(next);
      return { ok:true, changed:true, revision:next.revision, item:clone(nextItem) };
    },
    async read(input = {}) {
      const board = await load();
      const all = filteredItems(board, {});
      const items = filteredItems(board, input);
      return {
        ok:true,
        readOnly:true,
        ownerSource:"CENTRE_WORK_STATE",
        projection:"CENTRE_BOARD_V4",
        revision:Number(board.revision || 0),
        updatedAt:board.updatedAt || null,
        counts:counts(all),
        total:all.length,
        filteredCount:items.length,
        items:clone(items),
      };
    },
  });
}

export class GoHubCentreBoardV4 {
  constructor(ctx) { this.ctx = ctx; }
  store() { return createCentreBoardStore({ storage:this.ctx.storage }); }
  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ code:"METHOD_NOT_ALLOWED" }, 405);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ code:"INVALID_JSON" }, 400);
      const url = new URL(request.url);
      if (url.pathname === "/project") return json(await this.store().project(input.work));
      if (url.pathname === "/read") return json(await this.store().read(input));
      return json({ code:"NOT_FOUND" }, 404);
    } catch (error) {
      return json({ code:clean(error?.message || "CENTRE_BOARD_ERROR") }, Number(error?.status) || 400);
    }
  }
}

function boardStub(namespace) {
  if (!namespace || typeof namespace.getByName !== "function") return null;
  return namespace.getByName(BOARD_NAME);
}
async function call(namespace, path, input = {}) {
  const stub = boardStub(namespace);
  if (!stub || typeof stub.fetch !== "function") return json({ code:"CENTRE_BOARD_NOT_CONFIGURED" }, 503);
  return stub.fetch(new Request("https://centre-board.internal/" + path, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify(input),
  }));
}

export function createCentreBoardService({ namespace } = {}) {
  return Object.freeze({
    configured:() => Boolean(boardStub(namespace)),
    project:work => call(namespace, "project", { work }),
    read:input => call(namespace, "read", input || {}),
  });
}
