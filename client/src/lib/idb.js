// Minimal IndexedDB wrapper (no dependencies). Two stores:
//   - 'cache'  : out-of-line keys (URL → { data, at })  for offline reads
//   - 'queue'  : keyPath 'opId'                          for pending mutations
// All calls are defensive: if IndexedDB is unavailable, they resolve to safe
// no-ops so the app keeps working online-only.

const DB = 'cm_offline';
const VER = 1;
let _dbPromise = null;

function open() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'opId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return _dbPromise;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    const req = fn(os);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })).catch(() => (mode === 'readonly' ? undefined : undefined));
}

export const idbGet = (store, key) => run(store, 'readonly', os => os.get(key));
export const idbAll = (store) => run(store, 'readonly', os => os.getAll()).then(r => r || []);
export const idbDel = (store, key) => run(store, 'readwrite', os => os.delete(key));
export const idbSet = (store, key, val) =>
  run(store, 'readwrite', os => (store === 'queue' ? os.put(val) : os.put(val, key)));

// Strict write: resolves only once the transaction has actually committed, and
// REJECTS on any failure (e.g. the phone's storage is full). Used for the offline
// queue, where "saved" must really mean saved.
export function idbPutStrict(store, val, key) {
  return open().then(db => new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(store, 'readwrite'); } catch (e) { return reject(e); }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Device storage error'));
    tx.onabort = () => reject(tx.error || new Error('Device storage full'));
    try { store === 'queue' ? tx.objectStore(store).put(val) : tx.objectStore(store).put(val, key); } catch (e) { reject(e); }
  }));
}
