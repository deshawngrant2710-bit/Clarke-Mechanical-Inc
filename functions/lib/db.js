const admin = require('firebase-admin');

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

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/* ------------------------------------------------------------------ */
/*  Small Firestore helpers — keep route code readable.               */
/*  (The Admin SDK auto-connects to the emulator when                 */
/*   FIRESTORE_EMULATOR_HOST is set.)                                 */
/* ------------------------------------------------------------------ */

const withId = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

// Fetch a single doc by id.
async function getById(collection, id) {
  return withId(await db.collection(collection).doc(id).get());
}

// All docs in a collection, optionally ordered.
async function list(collection, { orderBy, dir = 'asc' } = {}) {
  let q = db.collection(collection);
  if (orderBy) q = q.orderBy(orderBy, dir);
  const snap = await q.get();
  return snap.docs.map(withId);
}

// First doc matching a single equality filter (or null).
async function findOne(collection, field, value) {
  const snap = await db.collection(collection).where(field, '==', value).limit(1).get();
  return snap.empty ? null : withId(snap.docs[0]);
}

// All docs matching a single equality filter.
async function findWhere(collection, field, value) {
  const snap = await db.collection(collection).where(field, '==', value).get();
  return snap.docs.map(withId);
}

// Create a doc with an explicit id (uuid). Returns the stored doc.
async function create(collection, id, data) {
  const payload = { ...data, created_at: data.created_at || new Date().toISOString() };
  await db.collection(collection).doc(id).set(payload);
  return { id, ...payload };
}

async function update(collection, id, patch) {
  await db.collection(collection).doc(id).set(patch, { merge: true });
  return getById(collection, id);
}

async function remove(collection, id) {
  await db.collection(collection).doc(id).delete();
}

// Build a name lookup map { id -> name } for a collection (for "joins").
async function nameMap(collection) {
  const snap = await db.collection(collection).get();
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data().name; });
  return map;
}

module.exports = { admin, db, getById, list, findOne, findWhere, create, update, remove, nameMap, withId };
