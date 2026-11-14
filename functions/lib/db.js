// Storage backend is chosen by env:
//   • DATABASE_URL set  → Postgres (e.g. Render Postgres). No read quotas.
//   • otherwise         → Firestore (Firebase Admin SDK).
// Both expose the same tiny `db.collection(...)` surface, so nothing downstream changes.
let admin = null;
let db;

if (process.env.DATABASE_URL) {
  ({ db } = require('./pgdb'));
  console.log('[db] Using Postgres (DATABASE_URL set)');
} else {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) {
      // Render / any non-GCP host: authenticate with a service-account JSON string.
      try {
        const parsed = JSON.parse(sa);
        admin.initializeApp({ credential: admin.credential.cert(parsed), projectId: parsed.project_id });
        console.log('[db] Firestore initialized for project', parsed.project_id);
      } catch (e) {
        // Don't crash the whole server on a bad key — boot anyway so /health works and the error is visible.
        console.error('[db] FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
        admin.initializeApp();
      }
    } else {
      // Emulator or GCP (Functions): Application Default Credentials.
      admin.initializeApp();
    }
  }
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
}

/* ------------------------------------------------------------------ */
/*  Small Firestore helpers — keep route code readable.               */
/*  (The Admin SDK auto-connects to the emulator when                 */
/*   FIRESTORE_EMULATOR_HOST is set.)                                 */
/* ------------------------------------------------------------------ */

const withId = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

// Health-bot privacy wall (see diagContext.js): during a bot request, private
// collections only return the bot's own records; for everyone else, bot records
// are hidden from lists.
const { isBotRecord, isDiagnostic, botCanSee } = require('./diagContext');
const botScope = (collection, rows) => (isDiagnostic() ? rows.filter(r => botCanSee(collection, r)) : rows);

// Fetch a single doc by id.
async function getById(collection, id) {
  const row = withId(await db.collection(collection).doc(id).get());
  return row && isDiagnostic() && !botCanSee(collection, row) ? null : row;
}

// All docs in a collection, optionally ordered.
// The health bot's temporary test records (customer, job, time entries, bot users…)
// are hidden from everyone except the bot itself, so staff lists, dashboards and
// reports never show them. Pass { includeBot: true } for maintenance (bot cleanup).
async function list(collection, { orderBy, dir = 'asc', includeBot = false } = {}) {
  let q = db.collection(collection);
  if (orderBy) q = q.orderBy(orderBy, dir);
  const snap = await q.get();
  const rows = snap.docs.map(withId);
  if (includeBot) return rows;
  return isDiagnostic() ? botScope(collection, rows) : rows.filter(r => !isBotRecord(r));
}

// First doc matching a single equality filter (or null).
async function findOne(collection, field, value) {
  if (isDiagnostic()) return (await findWhere(collection, field, value))[0] || null;
  const snap = await db.collection(collection).where(field, '==', value).limit(1).get();
  return snap.empty ? null : withId(snap.docs[0]);
}

// All docs matching a single equality filter.
async function findWhere(collection, field, value) {
  const snap = await db.collection(collection).where(field, '==', value).get();
  return botScope(collection, snap.docs.map(withId));
}

// Create a doc with an explicit id (uuid). Returns the stored doc.
async function create(collection, id, data) {
  // Anything the bot creates is tagged as bot data, so it's hidden and always cleaned up.
  const payload = { ...data, ...(isDiagnostic() ? { __diagnostic: true } : {}), created_at: data.created_at || new Date().toISOString() };
  await db.collection(collection).doc(id).set(payload);
  return { id, ...payload };
}

async function update(collection, id, patch) {
  await db.collection(collection).doc(id).set({ ...patch, updated_at: new Date().toISOString() }, { merge: true });
  return getById(collection, id);
}

async function remove(collection, id) {
  await db.collection(collection).doc(id).delete();
}

// Build a name lookup map { id -> name } for a collection (for "joins").
async function nameMap(collection) {
  const snap = await db.collection(collection).get();
  const map = {};
  snap.docs.forEach(d => { if (!isDiagnostic() || botCanSee(collection, { id: d.id, ...d.data() })) map[d.id] = d.data().name; });
  return map;
}

module.exports = { admin, db, getById, list, findOne, findWhere, create, update, remove, nameMap, withId };
