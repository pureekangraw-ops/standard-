const fs = require('node:fs/promises');
const path = require('node:path');

const PRODUCTION_DATABASE = 'ygph-standard-secure';
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function requireSegment(name, value) {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    throw new Error(`${name} must be a non-empty safe test identifier`);
  }
  return value;
}

async function openIsolatedDurableStore(options = {}) {
  const rootDir = options.rootDir;
  if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) {
    throw new Error('rootDir must be an absolute test directory');
  }

  const namespace = requireSegment('namespace', options.namespace);
  const database = requireSegment('database', options.database);
  const key = requireSegment('key', options.key);

  if (database === PRODUCTION_DATABASE) {
    throw new Error(`forbidden production database: ${PRODUCTION_DATABASE}`);
  }

  const databaseDir = path.join(rootDir, namespace, database);
  const filePath = path.join(databaseDir, `${key}.json`);
  await fs.mkdir(databaseDir, { recursive: true });

  let closed = false;
  function assertOpen() {
    if (closed) throw new Error('isolated durable store is closed');
  }

  return {
    locator: Object.freeze({ namespace, database, key }),

    async commit(value) {
      assertOpen();
      const payload = JSON.stringify(value);
      const handle = await fs.open(filePath, 'w', 0o600);
      try {
        await handle.writeFile(payload, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
    },

    async read() {
      assertOpen();
      const payload = await fs.readFile(filePath, 'utf8');
      return JSON.parse(payload);
    },

    async close() {
      closed = true;
    },
  };
}

module.exports = { openIsolatedDurableStore };
