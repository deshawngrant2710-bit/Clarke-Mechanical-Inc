// Optional demo data seeder for Clarke Mechanical — safe to re-run (clears demo rows first).
// Run:  node seed-demo.js
require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

console.log('Seeding demo data…');

// --- Employees / technicians ---
const techs = [
  ['Marcus Reyes', 'marcus@clarkemechanical.com', 'technician', '(555) 201-8890'],
  ['Danielle Cho', 'danielle@clarkemechanical.com', 'technician', '(555) 201-4471'],
  ['Andre Whitfield', 'andre@clarkemechanical.com', 'technician', '(555) 201-3320'],
  ['Priya Natarajan', 'priya@clarkemechanical.com', 'office', '(555) 201-7712'],
];
const techIds = [];
for (const [name, email, role, phone] of techs) {
  let row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!row) {
    const id = uuid();
    db.prepare('INSERT INTO users (id,name,email,password,role,phone) VALUES (?,?,?,?,?,?)')
      .run(id, name, email, bcrypt.hashSync('clarke2024', 10), role, phone);
    row = { id };
  }
  techIds.push(row.id);
}

// --- Customers ---
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
for (const [name, email, phone, address, city, state, zip] of customers) {
  let row = db.prepare('SELECT id FROM customers WHERE name = ?').get(name);
  if (!row) {
    const id = uuid();
    db.prepare('INSERT INTO customers (id,name,email,phone,address,city,state,zip) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, name, email, phone, address, city, state, zip);
    row = { id };
  }
  custIds.push(row.id);
}

// --- Jobs ---
const pick = (arr, i) => arr[i % arr.length];
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
  ['Ventilation Balancing', 'Ventilation', 'scheduled', 'normal', addDays(3), '10:30'],
  ['Emergency AC Failure — Server Room', 'Emergency', 'completed', 'urgent', addDays(-1), '18:00'],
  ['Filter Replacement Program', 'Maintenance', 'completed', 'low', addDays(-7), '08:30'],
];
const jobIds = [];
jobDefs.forEach(([title, type, status, priority, date, time], i) => {
  const id = uuid();
  db.prepare(`INSERT INTO jobs (id,title,description,customer_id,technician_id,status,priority,job_type,scheduled_date,scheduled_time,address)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, title, 'Service request logged via office.', pick(custIds, i), pick(techIds, i), status, priority, type, date, time, pick(customers, i)[3]);
  jobIds.push(id);
});

// --- Inventory ---
const inv = [
  ['16x25x1 Pleated Air Filter', 'FLT-1625', 'Filters', 120, 40, 8.5, 'Supply Pro', 'Shelf A-1'],
  ['R-410A Refrigerant (25lb)', 'REF-410', 'Refrigerant', 6, 8, 165.0, 'CoolChem', 'Cage 2'],
  ['Blower Motor 1/2 HP', 'MOT-05HP', 'Belts & Motors', 3, 5, 210.0, 'MotorWorks', 'Shelf C-4'],
  ['Contactor 40A 2-Pole', 'ELE-C40', 'Electrical', 22, 10, 24.0, 'ElectriParts', 'Bin B-2'],
  ['Smart Thermostat Pro', 'CTL-TSTAT', 'Controls', 14, 6, 189.0, 'NestSupply', 'Shelf D-1'],
  ['Flex Duct 8in x 25ft', 'DCT-825', 'Ductwork', 2, 4, 58.0, 'DuctDirect', 'Rack 3'],
  ['Copper Line Set 3/8-3/4', 'FIT-LS38', 'Fittings', 9, 6, 92.0, 'PlumbPro', 'Rack 1'],
  ['Capacitor 45/5 MFD', 'ELE-CAP45', 'Electrical', 0, 8, 16.5, 'ElectriParts', 'Bin B-3'],
];
for (const [name, sku, category, quantity, min_quantity, unit_price, supplier, location] of inv) {
  if (!db.prepare('SELECT id FROM inventory WHERE sku = ?').get(sku)) {
    db.prepare(`INSERT INTO inventory (id,name,sku,category,quantity,min_quantity,unit_price,supplier,location) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), name, sku, category, quantity, min_quantity, unit_price, supplier, location);
  }
}

// --- Invoices + items + payments ---
const year = today.getFullYear();
let invCounter = db.prepare("SELECT COUNT(*) c FROM invoices WHERE invoice_number LIKE ?").get(`INV-${year}-%`).c;
const invoiceDefs = [
  ['paid', -20, [['AC Repair labor', 2, 125], ['R-410A Refrigerant', 1, 220]]],
  ['paid', -14, [['Maintenance contract — Q1', 1, 850]]],
  ['sent', -3, [['Mini-split unit + install', 1, 3200], ['Electrical materials', 1, 180]]],
  ['overdue', -45, [['Emergency service call', 1, 450], ['Compressor', 1, 640]]],
  ['draft', 0, [['Ductwork inspection', 1, 275]]],
  ['sent', -6, [['Furnace tune-up', 1, 145], ['Filters (x4)', 4, 12]]],
  ['paid', -9, [['Thermostat + install', 1, 240]]],
];
invoiceDefs.forEach(([status, dayOffset, items], i) => {
  const id = uuid();
  invCounter += 1;
  const number = `INV-${year}-${String(invCounter).padStart(4, '0')}`;
  const subtotal = items.reduce((s, [, q, p]) => s + q * p, 0);
  const tax = +(subtotal * 0.0875).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  const issue = addDays(dayOffset);
  const due = addDays(dayOffset + 30);
  db.prepare(`INSERT INTO invoices (id,invoice_number,customer_id,status,issue_date,due_date,subtotal,tax_rate,tax_amount,total)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, number, pick(custIds, i), status, issue, due, subtotal, 0.0875, tax, total);
  for (const [desc, q, p] of items) {
    db.prepare('INSERT INTO invoice_items (id,invoice_id,description,quantity,unit_price,total) VALUES (?,?,?,?,?,?)')
      .run(uuid(), id, desc, q, p, q * p);
  }
  if (status === 'paid') {
    db.prepare('INSERT INTO payments (id,invoice_id,amount,method) VALUES (?,?,?,?)').run(uuid(), id, total, 'card');
  }
});

// --- Quotes ---
let quoteCounter = db.prepare("SELECT COUNT(*) c FROM quotes WHERE quote_number LIKE ?").get(`QUO-${year}-%`).c;
const quoteDefs = [
  ['accepted', [['Full system replacement', 1, 6800]]],
  ['sent', [['Zoning upgrade — 3 zones', 1, 2400]]],
  ['draft', [['Annual maintenance plan', 1, 1200]]],
  ['declined', [['Duct cleaning — whole home', 1, 550]]],
];
quoteDefs.forEach(([status, items], i) => {
  const id = uuid();
  quoteCounter += 1;
  const number = `QUO-${year}-${String(quoteCounter).padStart(4, '0')}`;
  const subtotal = items.reduce((s, [, q, p]) => s + q * p, 0);
  const tax = +(subtotal * 0.0875).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  db.prepare(`INSERT INTO quotes (id,quote_number,customer_id,status,issue_date,expiry_date,subtotal,tax_rate,tax_amount,total)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, number, pick(custIds, i), status, addDays(-5), addDays(25), subtotal, 0.0875, tax, total);
  for (const [desc, q, p] of items) {
    db.prepare('INSERT INTO quote_items (id,quote_id,description,quantity,unit_price,total) VALUES (?,?,?,?,?,?)')
      .run(uuid(), id, desc, q, p, q * p);
  }
});

console.log('Demo data seeded ✓');
process.exit(0);
