const SECRET_KEY = /(authorization|token|secret|passcode|master.?key)/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function rejectSecrets(value, path = "root") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`SECRET_FIELD_REJECTED:${path}.${key}`);
    rejectSecrets(nested, `${path}.${key}`);
  }
}

export function createFactoryStatePort({ storage } = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
    throw new Error("Durable storage port is required");
  }

  return Object.freeze({
    async load() {
      const revision = await storage.get("revision");
      if (revision == null) return null;
      return {
        revision: Number(revision),
        task: clone((await storage.get("task")) ?? null),
        receipts: clone((await storage.get("receipts")) ?? []),
        audit: clone((await storage.get("audit")) ?? []),
      };
    },

    async save({ expectedRevision, task, receipt, auditEvent } = {}) {
      const current = Number((await storage.get("revision")) ?? 0);
      if (Number(expectedRevision) !== current) throw new Error("STALE_TASK_REVISION");

      rejectSecrets(task);
      rejectSecrets(receipt);
      rejectSecrets(auditEvent);

      const receipts = [
        ...((await storage.get("receipts")) ?? []),
        clone(receipt),
      ].slice(-50);
      const audit = [
        ...((await storage.get("audit")) ?? []),
        clone(auditEvent),
      ].slice(-200);
      const revision = current + 1;
      const safeTask = clone(task);

      await storage.put({ revision, task: safeTask, receipts, audit });
      return { revision, task: clone(safeTask), receipt: clone(receipt) };
    },
  });
}
