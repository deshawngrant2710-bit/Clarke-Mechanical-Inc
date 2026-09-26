/*
 * One-time import of Andre's supplier list into the Purchasing → Vendors list.
 *
 * Safe to run more than once: it skips any vendor whose name already exists.
 * Contact people / cell numbers go in the vendor's Notes (there's no separate
 * contact field), and each vendor's main phone/address fill those fields.
 *
 * Run from the functions folder with your Render External Database URL:
 *   DATABASE_URL='<External Database URL from Render>' node scripts/import-vendors.js
 */
const { v4: uuid } = require('uuid');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ Set DATABASE_URL first (use the External Database URL from Render).');
  process.exit(1);
}
let ssl = false;
try { ssl = new URL(url).hostname.includes('.') ? { rejectUnauthorized: false } : false; } catch { /* internal host */ }

// Transcribed from the handwritten "Andre Supplier List".
const VENDORS = [
  { name: 'AMAF Supply', phone: '718-358-1100', address: '51-23 Van Dam Street, Long Island City, NY',
    notes: 'Contact: Matt Lupardo — cell 516-404-1107' },
  { name: 'AF Supply', phone: '718-443-6900', address: '942 Lafayette Ave, Brooklyn, NY 11221',
    notes: 'Contact: Daniel Friedman' },
  { name: 'East New York Supply', phone: '516-292-1466', address: '384 Hempstead Turnpike, West Hempstead, NY 11552',
    notes: 'Contact: Henry' },
  { name: 'Heating & Burner Supply', phone: '718-665-0006', address: '479 Walton Ave, Bronx, NY',
    notes: 'Contact: Terry Broker — 917-596-3855' },
  { name: 'H&L Heating Supply', phone: '718-859-2424', address: '1100 Coney Island Ave, Brooklyn, NY',
    notes: "Contact: Brian T. O'Neil — 347-236-0947" },
  { name: 'Economy Pump & Motors Inc / GBS Supply', phone: '718-433-2600', address: '36-52 36th St, Astoria, Queens, NY',
    notes: 'Economy Pump & Motors: 718-433-2600 · GBS Supply: 718-937-1825. Contacts: John 917-531-8614, JT 347-809-0847' },
  { name: 'J&J Heating Supply', phone: '516-801-0212', address: '10 Roselle St, Mineola, NY 11501',
    notes: 'Contact: Jeff Rohditi — 516-238-2844' },
  { name: 'Eastern Steel Corp.', phone: '718-495-5300', address: '1946 Pitkin Ave, Brooklyn, NY',
    notes: '' },
];

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl, connectionTimeoutMillis: 20000 });
  try {
    const { rows } = await pool.query("SELECT data->>'name' AS name FROM documents WHERE collection = 'vendors'");
    const existing = new Set(rows.map(r => (r.name || '').trim().toLowerCase()));

    let added = 0, skipped = 0;
    for (const v of VENDORS) {
      if (existing.has(v.name.trim().toLowerCase())) { console.log(`• skip (already there): ${v.name}`); skipped++; continue; }
      const data = {
        name: v.name, email: v.email || null, phone: v.phone || null,
        address: v.address || null, notes: v.notes || null,
        created_at: new Date().toISOString(),
      };
      await pool.query('INSERT INTO documents (collection, id, data) VALUES ($1, $2, $3)', ['vendors', uuid(), JSON.stringify(data)]);
      console.log(`✓ added: ${v.name}`);
      added++;
    }
    console.log(`\nDone — ${added} added, ${skipped} skipped.`);
  } catch (e) {
    console.error('✗ Import failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
