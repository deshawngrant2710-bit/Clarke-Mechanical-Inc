// Postgres storage that mimics the small slice of the Firestore API this app uses,
// so lib/db.js and the few direct db.collection() callers work unchanged.
// Every record is a row in `documents(collection, id, data jsonb)`.
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
let ssl = false;
try { ssl = new URL(connectionString).hostname.includes('.') ? { rejectUnauthorized: false } : false; } catch { /* internal host */ }
const pool = new Pool({ connectionString, ssl, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });

// A dropped idle connection emits an 'error' on the pool. Without a listener,
// Node treats it as an unhandled error event and kills the server — so log it and
// let the pool replace the client instead.
pool.on('error', (err) => console.error('[db] idle Postgres client error:', err.message));

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        collection text NOT NULL,
        id text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS documents_collection_idx ON documents (collection);
    `).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
async function q(text, params) { await ensureSchema(); return pool.query(text, params); }

const snap = (id, data) => ({ id, exists: data != null, data: () => (data || {}) });
const col = (name) => `"${String(name).replace(/"/g, '')}"`; // (unused; kept for clarity)
const jsonPath = (field) => `data->>'${String(field).replace(/'/g, "''")}'`;

class Query {
  constructor(collection) { this.collection = collection; this._where = []; this._order = null; this._limit = null; }
  where(field, _op, value) { this._where.push([field, value]); return this; }
  orderBy(field, dir = 'asc') { this._order = [field, dir]; return this; }
  limit(n) { this._limit = n; return this; }
  async get() {
    const params = [this.collection];
    let sql = 'SELECT id, data FROM documents WHERE collection = $1';
    for (const [field, value] of this._where) {
      params.push(value == null ? null : String(value));
      sql += ` AND ${jsonPath(field)} = $${params.length}`;
    }
    if (this._order) sql += ` ORDER BY ${jsonPath(this._order[0])} ${String(this._order[1]).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
    if (this._limit != null) sql += ` LIMIT ${Number(this._limit)}`;
    const res = await q(sql, params);
    const docs = res.rows.map((r) => snap(r.id, r.data));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
}
class DocRef {
  constructor(collection, id) { this.collection = collection; this.id = id; }
  async get() {
    const res = await q('SELECT data FROM documents WHERE collection = $1 AND id = $2', [this.collection, this.id]);
    return res.rows.length ? snap(this.id, res.rows[0].data) : snap(this.id, null);
  }
  async set(data, opts) {
    const json = JSON.stringify(data == null ? {} : data);
    const merge = opts && opts.merge;
    await q(
      `INSERT INTO documents (collection, id, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (collection, id) DO UPDATE SET data = ${merge ? 'documents.data || EXCLUDED.data' : 'EXCLUDED.data'}`,
      [this.collection, this.id, json]
    );
    return { id: this.id };
  }
  async delete() { await q('DELETE FROM documents WHERE collection = $1 AND id = $2', [this.collection, this.id]); }
}
class CollectionRef extends Query {
  doc(id) { return new DocRef(this.collection, id); }
}

const db = {
  collection: (name) => new CollectionRef(name),
  settings: () => {}, // Firestore compatibility no-op
};

module.exports = { db, pool, ensureSchema };
