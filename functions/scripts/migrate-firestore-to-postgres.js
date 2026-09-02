/*
 * One-time migration: copy EVERY document from Firestore into Postgres.
 * Nothing is deleted from Firestore — it only reads the source and writes the destination,
 * so you can run it more than once safely (existing rows are overwritten, not duplicated).
 *
 * Requires two env vars:
 *   FIREBASE_SERVICE_ACCOUNT  – the same service-account JSON already on your backend
 *   DATABASE_URL              – your Render Postgres connection string
 *
 * Run:  node scripts/migrate-firestore-to-postgres.js
 */
const admin = require('firebase-admin');
const { Pool } = require('pg');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
const url = process.env.DATABASE_URL;
if (!sa) { console.error('✗ Set FIREBASE_SERVICE_ACCOUNT (the service-account JSON).'); process.exit(1); }
if (!url) { console.error('✗ Set DATABASE_URL (your Render Postgres URL).'); process.exit(1); }

const parsed = JSON.parse(sa);
admin.initializeApp({ credential: admin.credential.cert(parsed), projectId: parsed.project_id });
const fs = admin.firestore();

let ssl = false;
try { ssl = new URL(url).hostname.includes('.') ? { rejectUnauthorized: false } : false; } catch { /* internal host */ }
const pool = new Pool({ connectionString: url, ssl });

async function migrateCollection(ref, indent = '') {
  const snap = await ref.get();
  let n = 0;
  for (const doc of snap.docs) {
    await pool.query(
      `INSERT INTO documents (collection, id, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data`,
      [ref.id, doc.id, JSON.stringify(doc.data())]
    );
    n++;
    // Copy any nested subcollections too (rare, but be safe).
    const subs = await doc.ref.listCollections();
    for (const sub of subs) n += await migrateCollection(sub, indent + '  ');
  }
  console.log(`${indent}• ${ref.id}: ${n} documents`);
  return n;
}

async function main() {
  console.log('Creating table if needed…');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      collection text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS documents_collection_idx ON documents (collection);
  `);

  console.log('Reading Firestore collections…');
  const cols = await fs.listCollections();
  if (!cols.length) { console.log('No collections found in Firestore. Nothing to migrate.'); }

  let total = 0;
  for (const c of cols) total += await migrateCollection(c);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM documents');
  console.log(`\n✓ Done. Copied ${total} documents. Postgres now holds ${rows[0].n} rows total.`);
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('✗ Migration failed:', e); process.exit(1); });
