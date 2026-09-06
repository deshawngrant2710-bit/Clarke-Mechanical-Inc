/*
 * Off-platform backup of the whole database.
 *
 * Writes one timestamped JSON file containing every record, so you always hold a
 * copy that does not depend on Render, Firebase, or any account staying alive.
 * Keep a few of these somewhere else — iCloud Drive, Dropbox, an external disk.
 *
 * Run from the functions folder:
 *   DATABASE_URL='<your External Database URL>' node scripts/backup.js
 *
 * Optional: choose where it lands (defaults to a Backups folder on your Desktop)
 *   BACKUP_DIR="/Users/apple/Desktop/Clarke Mechanical Backups" node scripts/backup.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ Set DATABASE_URL first (use the External Database URL from Render).');
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR || path.join(os.homedir(), 'Desktop', 'Clarke Mechanical Backups');
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const outFile = path.join(outDir, `clarke-backup-${stamp}.json`);

let ssl = false;
try { ssl = new URL(url).hostname.includes('.') ? { rejectUnauthorized: false } : false; } catch { /* internal host */ }

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl, connectionTimeoutMillis: 20000 });
  try {
    fs.mkdirSync(outDir, { recursive: true });

    const { rows } = await pool.query('SELECT collection, id, data FROM documents ORDER BY collection, id');
    const byCollection = {};
    for (const r of rows) {
      (byCollection[r.collection] = byCollection[r.collection] || []).push({ id: r.id, ...r.data });
    }

    const payload = {
      backed_up_at: new Date().toISOString(),
      source: 'Clarke Mechanical — Render Postgres',
      total_records: rows.length,
      collections: byCollection,
    };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));

    console.log(`\n✓ Backup written to:\n  ${outFile}\n`);
    console.log(`  ${rows.length} records across ${Object.keys(byCollection).length} collections:`);
    for (const [name, list] of Object.entries(byCollection).sort()) {
      console.log(`    ${String(list.length).padStart(5)}  ${name}`);
    }
    const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
    console.log(`\n  File size: ${mb} MB`);
    console.log('  Keep a copy somewhere other than this Mac (iCloud, Dropbox, external drive).\n');
  } catch (e) {
    console.error('✗ Backup failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
