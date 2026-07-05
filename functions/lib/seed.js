// Seeds an admin + demo data into Firestore, but ONLY if the database is empty.
// Safe to call on every boot — it no-ops once data exists.
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db } = require('./db');

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const now = () => new Date().toISOString();
const pick = (arr, i) => arr[i % arr.length];
const set = (col, id, data) => db.collection(col).doc(id).set({ ...data, created_at: data.created_at || now() }).then(() => id);

async function seedIfEmpty() {
  const users = await db.collection('users').limit(1).get();
  if (!users.empty) return { seeded: false };

  // Admin
  await set('users', uuid(), { name: 'Clarke Admin', email: 'admin@clarkemechanical.com', password: bcrypt.hashSync('clarke2024', 10), role: 'admin', phone: null });

  const techs = [
    ['Marcus Reyes', 'marcus@clarkemechanical.com', 'technician', '(555) 201-8890'],
    ['Danielle Cho', 'danielle@clarkemechanical.com', 'technician', '(555) 201-4471'],
    ['Andre Whitfield', 'andre@clarkemechanical.com', 'dispatcher', '(555) 201-3320'],
    ['Priya Natarajan', 'priya@clarkemechanical.com', 'office', '(555) 201-7712'],
  ];
  const techIds = [];
  for (const [name, email, role, phone] of techs) techIds.push(await set('users', uuid(), { name, email, password: bcrypt.hashSync('clarke2024', 10), role, phone }));

  const customers = [
    ['Northgate Office Park', 'facilities@northgate.com', '(555) 340-1120', '1200 Commerce Blvd', 'Austin', 'TX', '78701'],
    ['Sarah Whitcomb', 'sarah.w@gmail.com', '(555) 771-2043', '48 Maple Grove Ln', 'Round Rock', 'TX', '78664'],
    ['Riverside Dental Group', 'office@riversidedental.com', '(555) 662-9008', '77 Riverside Dr', 'Austin', 'TX', '78704'],
    ['James Okonkwo', 'jokonkwo@outlook.com', '(555) 208-3391', '910 Birchwood Ct', 'Cedar Park', 'TX', '78613'],
    ['Lakeline Retail Center', 'pm@lakelineretail.com', '(555) 903-4412', '250 Lakeline Mall Dr', 'Austin', 'TX', '78717'],
    ['Elena Vasquez', 'elena.vasquez@gmail.com', '(555) 447-1180', '33 Sunset Terrace', 'Pflugerville', 'TX', '78660'],
    ['Hilltop Elementary School', 'facilities@hilltopisd.org', '(555) 118-7745', '4400 Hilltop Rd', 'Austin', 'TX', '78745'],
    ['Gregory Tan', 'gtan@gmail.com', '(555) 552-8834', '150 Oak Meadow', 'Leander', 'TX', '78641'],
  ];
  const custIds = [];
  for (const [name, email, phone, address, city, state, zip] of customers) custIds.push(await set('customers', uuid(), { name, email, phone, address, city, state, zip, notes: null }));

  const jobDefs = [
    ['Rooftop AC Unit Not Cooling', 'AC Repair', 'in-progress', 'high', addDays(0), '09:00'],
    ['Annual Maintenance — 4 RTUs', 'Maintenance', 'scheduled', 'normal', addDays(0), '13:30'],
    ['No Heat Emergency Call', 'Heating Repair', 'pending', 'urgent', addDays(0), '16:00'],
    ['New Mini-Split Installation', 'AC Installation', 'scheduled', 'normal', addDays(1), '08:00'],
    ['Thermostat Replacement', 'Maintenance', 'completed', 'low', addDays(-2), '10:00'],
    ['Ductwork Inspection', 'Inspection', 'scheduled', 'normal', addDays(2), '11:00'],
    ['Compressor Replacement', 'AC Repair', 'in-progress', 'high', addDays(0), '14:00'],
    ['Furnace Tune-Up', 'Heating Repair', 'completed', 'normal', addDays(-5), '09:30'],
    ['Refrigerant Leak Diagnosis', 'AC Repair', 'pending', 'high', addDays(1), '15:00'],
    ['Emergency AC Failure — Server Room', 'Emergency', 'completed', 'urgent', addDays(-1), '18:00'],
  ];
  for (let i = 0; i < jobDefs.length; i++) {
    const [title, type, status, priority, date, time] = jobDefs[i];
    await set('jobs', uuid(), { title, description: 'Service request logged via office.', customer_id: pick(custIds, i), technician_id: pick(techIds, i), status, priority, job_type: type, scheduled_date: date, scheduled_time: time, completed_date: status === 'completed' ? date : null, address: pick(customers, i)[3], notes: null });
  }

  const inv = [
    ['16x25x1 Pleated Air Filter', 'FLT-1625', 'Filters', 120, 40, 8.5, 'Supply Pro', 'Shelf A-1'],
    ['R-410A Refrigerant (25lb)', 'REF-410', 'Refrigerant', 6, 8, 165.0, 'CoolChem', 'Cage 2'],
    ['Blower Motor 1/2 HP', 'MOT-05HP', 'Belts & Motors', 3, 5, 210.0, 'MotorWorks', 'Shelf C-4'],
    ['Contactor 40A 2-Pole', 'ELE-C40', 'Electrical', 22, 10, 24.0, 'ElectriParts', 'Bin B-2'],
    ['Smart Thermostat Pro', 'CTL-TSTAT', 'Controls', 14, 6, 189.0, 'NestSupply', 'Shelf D-1'],
    ['Capacitor 45/5 MFD', 'ELE-CAP45', 'Electrical', 0, 8, 16.5, 'ElectriParts', 'Bin B-3'],
  ];
  for (const [name, sku, category, quantity, min_quantity, unit_price, supplier, location] of inv) await set('inventory', uuid(), { name, sku, description: null, category, quantity, min_quantity, unit_price, supplier, location });

  const year = today.getFullYear();
  const invoiceDefs = [
    ['paid', -20, [['AC Repair labor', 2, 125], ['R-410A Refrigerant', 1, 220]]],
    ['paid', -14, [['Maintenance contract — Q1', 1, 850]]],
    ['sent', -3, [['Mini-split unit + install', 1, 3200], ['Electrical materials', 1, 180]]],
    ['overdue', -45, [['Emergency service call', 1, 450], ['Compressor', 1, 640]]],
    ['draft', 0, [['Ductwork inspection', 1, 275]]],
    ['sent', -6, [['Furnace tune-up', 1, 145], ['Filters (x4)', 4, 12]]],
    ['paid', -9, [['Thermostat + install', 1, 240]]],
  ];
  let n = 0;
  for (const [status, dayOffset, items] of invoiceDefs) {
    n++;
    const lineItems = items.map(([description, quantity, unit_price]) => ({ id: uuid(), description, quantity, unit_price, total: quantity * unit_price }));
    const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
    const tax_amount = +(subtotal * 0.0875).toFixed(2);
    const total = +(subtotal + tax_amount).toFixed(2);
    const id = await set('invoices', uuid(), { invoice_number: `INV-${year}-${String(n).padStart(4, '0')}`, customer_id: pick(custIds, n), job_id: null, status, issue_date: addDays(dayOffset), due_date: addDays(dayOffset + 30), subtotal, tax_rate: 0.0875, tax_amount, total, notes: null, items: lineItems });
    if (status === 'paid') await set('payments', uuid(), { invoice_id: id, amount: total, method: 'card', reference: null, notes: null, paid_at: now() });
  }

  const quoteDefs = [
    ['accepted', [['Full system replacement', 1, 6800]]],
    ['sent', [['Zoning upgrade — 3 zones', 1, 2400]]],
    ['draft', [['Annual maintenance plan', 1, 1200]]],
    ['declined', [['Duct cleaning — whole home', 1, 550]]],
  ];
  n = 0;
  for (const [status, items] of quoteDefs) {
    n++;
    const lineItems = items.map(([description, quantity, unit_price]) => ({ id: uuid(), description, quantity, unit_price, total: quantity * unit_price }));
    const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
    const tax_amount = +(subtotal * 0.0875).toFixed(2);
    await set('quotes', uuid(), { quote_number: `QUO-${year}-${String(n).padStart(4, '0')}`, customer_id: pick(custIds, n), status, issue_date: addDays(-5), expiry_date: addDays(25), subtotal, tax_rate: 0.0875, tax_amount, total: +(subtotal + tax_amount).toFixed(2), notes: null, items: lineItems });
  }

  return { seeded: true };
}

module.exports = { seedIfEmpty };
