// Client mirror of the commercial boiler contract packages + agreement body
// builder (kept in sync with functions/lib/boilerContract.js). Used to print,
// preview and download the contract PDF from the admin page.

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const money = (v) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const PACKAGES = {
  essential: {
    id: 'essential', name: 'Essential', default_price: 2500, visits: 2, frequency: 'Semi-annual', labor_discount: 10, parts_discount: 0,
    scope: ['2 scheduled boiler inspections per year', 'Burner inspection', 'Safety-control testing', 'Combustion analysis', 'Written service reports', 'Priority scheduling', '10% discount on repair labor'],
  },
  professional: {
    id: 'professional', name: 'Professional', default_price: 4500, visits: 4, frequency: 'Quarterly', labor_discount: 15, parts_discount: 0,
    scope: ['Quarterly preventive-maintenance visits', 'Combustion analysis', 'Burner maintenance', 'Safety-control testing', 'Low-water cutoff testing', 'Boiler-room inspection', 'Detailed service reports with equipment photos', 'Priority emergency response', '15% discount on repair labor'],
  },
  premium: {
    id: 'premium', name: 'Premium', default_price: 7500, visits: 4, frequency: 'Monthly/Quarterly (per equipment)', labor_discount: 20, parts_discount: 10,
    scope: ['Scheduled preventive maintenance (monthly or quarterly per equipment)', 'Full boiler and burner preventive maintenance', 'Combustion testing', 'Safety-control testing', 'Low-water cutoff testing', 'Priority 24/7 emergency response', 'Detailed service documentation', '20% discount on repair labor', 'Preferred parts pricing', 'Annual boiler-room condition assessment'],
  },
};

export const PRICING_GUIDE = [
  ['Small commercial boiler', '$1,500 – $2,500 / year'],
  ['100–200 HP', '$3,000 – $5,000 / year'],
  ['200–300 HP', '$4,500 – $7,500 / year'],
  ['Single 200 HP Scotch marine (quarterly PM + annual fireside)', '$5,000 – $7,500 / year'],
  ['Two large commercial boilers', '$7,500 – $12,000 / year'],
  ['Two 200 HP Scotch marine boilers', '$9,000 – $13,000 / year'],
  ['Three to four large boilers', '$10,000 – $18,000+ / year'],
  ['Large boiler plant / multiple buildings', 'Custom, starting around $20,000+'],
];

export const DEFAULT_EXCLUSIONS = [
  'Replacement parts and major repairs (motors, pumps, burners, burner controls, flame scanners, gas valves, oil pumps, VFDs, belts, bearings, transformers, relays, sensors, actuators, safety valves, pressure controls, boiler sections, tubes, refractory, heat exchangers, expansion tanks, etc.)',
  'Any repair, replacement or overhaul work — quoted separately by written estimate',
  'Water treatment, chemicals, and water-side/fireside descaling beyond the listed cleaning',
  'Code-required engineering, permits, filings, inspections and certifications',
  'Abatement or removal of asbestos or other hazardous materials',
  'Work required due to acts of God, misuse, vandalism, or service performed by others',
];

export const packageFor = (id) => PACKAGES[id] || null;

export function buildContractBody(c = {}, business = {}) {
  const pkg = packageFor(c.package);
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const price = Number(c.annual_price) || (pkg ? pkg.default_price : 0);
  const laborDisc = c.labor_discount != null ? c.labor_discount : (pkg ? pkg.labor_discount : 0);
  const partsDisc = c.parts_discount != null ? c.parts_discount : (pkg ? pkg.parts_discount : 0);
  const freq = c.service_frequency || (pkg ? pkg.frequency : '');
  const scope = (Array.isArray(c.scope_items) && c.scope_items.length) ? c.scope_items : (pkg ? pkg.scope : []);
  const exclusions = (Array.isArray(c.exclusions) && c.exclusions.length) ? c.exclusions : DEFAULT_EXCLUSIONS;
  const boilers = Array.isArray(c.boilers) ? c.boilers : [];
  const li = (arr) => arr.filter(Boolean).map(x => `• ${esc(x)}`).join('<br>');
  const equipRows = boilers.length
    ? boilers.map((b, i) => `• Boiler ${i + 1}: ${esc([b.manufacturer, b.model].filter(Boolean).join(' '))}${b.serial ? `, S/N ${esc(b.serial)}` : ''}${b.capacity ? `, ${esc(b.capacity)}` : ''}${b.fuel ? `, ${esc(b.fuel)}` : ''}${b.system ? `, ${esc(b.system)}` : ''}`).join('<br>')
    : '• (Equipment to be listed)';

  const P = [];
  P.push(`This Commercial Boiler Preventive Maintenance &amp; Service Agreement ("Agreement") is entered into between ${esc(bizName)} ("Contractor") and ${esc(c.customer_name || '________________________')} ("Owner") for the boiler equipment located at the premises: ${esc(c.property_address || '________________________')}, in the City of New York.`);
  P.push(`<h3><b>SERVICE PACKAGE:</b></h3>${esc(pkg ? pkg.name : (c.package || 'Custom'))} — ${money(price)} per year.<br>Service frequency: ${esc(freq)}.`);
  P.push(`<h3><b>PROPERTY &amp; EQUIPMENT SCHEDULE:</b></h3>${equipRows}`);
  P.push(`<h3><b>INCLUDED PREVENTIVE-MAINTENANCE SCOPE:</b></h3>The following preventive-maintenance services are included under this Agreement for the equipment listed above:<br>${li(scope)}`);
  P.push(`<h3><b>PREVENTIVE-MAINTENANCE WORK:</b></h3>At each scheduled visit, Contractor will inspect and service the boiler, burner and controls appropriate to the equipment, which may include: burner maintenance; combustion testing (O₂, CO₂, CO, stack temperature, draft, excess air and efficiency; smoke test on oil equipment); safety-control testing; low-water cutoff testing and blow-down; fireside/waterside inspection and listed cleaning; steam-system or hot-water-system inspection; gas-fired or oil-fired boiler inspection as applicable; and condensate/feedwater inspection. A written service report is provided after each visit.`);
  P.push(`<h3><b>WHAT IS NOT INCLUDED — REPAIRS, PARTS &amp; REPLACEMENTS:</b></h3>Preventive-maintenance LABOR is included only for the services specifically listed in the selected package above. Major repairs, replacement parts, and replacement equipment are NOT included and are billed separately by written estimate upon the Owner's authorization.<br>${li(exclusions)}<br>Repair labor is discounted ${laborDisc}%${partsDisc ? `, and parts are discounted ${partsDisc}%,` : ''} for Owner under an active Agreement.`);
  P.push(`<h3><b>EMERGENCY SERVICE:</b></h3>Normal service hours: ${esc(c.normal_hours || 'Mon–Fri, 8:00 AM – 5:30 PM')}. Emergency service availability: ${esc(c.emergency_availability || (c.package === 'premium' ? '24/7 priority' : 'Priority, business hours'))}. Emergency labor rate: ${c.emergency_rate ? money(c.emergency_rate) + '/hr' : '________'}; after-hours rate: ${c.after_hours_rate ? money(c.after_hours_rate) + '/hr' : '________'}; weekend/holiday rates and a minimum emergency charge of ${c.min_charge ? money(c.min_charge) : '________'} apply. Target response time: ${esc(c.response_time || '4 hours')}. Response times are targets and are not absolute guarantees.`);
  P.push(`<h3><b>APPLICABLE REQUIREMENTS:</b></h3>Contractor shall perform the contracted maintenance work in accordance with applicable requirements governing the equipment and work being performed, manufacturer requirements, approved construction documents, and applicable laws and codes. This Agreement does not replace required engineering, permits, inspections, filings or certifications. Where a required inspection or certification falls outside Contractor's license or contractual scope, Contractor shall notify Owner.`);
  P.push(`<h3><b>OWNER RESPONSIBILITIES:</b></h3>• Provide safe, timely access to the boiler room and equipment<br>• Maintain water treatment and normal operation between visits<br>• Report abnormal conditions promptly<br>• Authorize repairs and replacement parts required for safe operation<br>• Pay all amounts when due`);
  P.push(`<h3><b>CONTRACTOR RESPONSIBILITIES:</b></h3>• Perform the listed preventive maintenance on the agreed schedule<br>• Provide a written service report after each visit<br>• Identify deficiencies and provide written repair estimates<br>• Maintain insurance as required by law<br>• Perform work with qualified personnel`);
  P.push(`<h3><b>WARRANTY LIMITATIONS:</b></h3>Contractor warrants its preventive-maintenance workmanship for the services actually performed. Contractor is not liable for equipment failure, damage or loss caused by defective equipment, age, deferred repairs the Owner declined, lack of water treatment, or conditions beyond Contractor's control. Manufacturer warranties on parts and equipment pass through to the Owner.`);
  P.push(`<h3><b>ANNUAL CONTRACT PRICE &amp; PAYMENT:</b></h3>The annual contract price is ${money(price)}, plus applicable sales tax. Payment terms: ${esc(c.payment_schedule || 'Annual in advance')}. Amounts unpaid for more than thirty (30) days accrue interest at 1½% per month.`);
  P.push(`<h3><b>TERM, RENEWAL &amp; CANCELLATION:</b></h3>This Agreement runs from ${esc(c.start_date || '____________')} through ${esc(c.expiry_date || '____________')}. It renews for successive one-year terms unless either party gives written notice of non-renewal at least thirty (30) days before expiration. Either party may cancel for cause on thirty (30) days' written notice; fees for services already rendered remain due.`);
  P.push(`<h3><b>ACCEPTANCE:</b></h3>By signing, the Owner accepts the service package, scope, price and terms above, and acknowledges that repairs, replacement parts and emergency work are separately billable unless expressly included.`);
  return P.join('<br><br>');
}

// Build the print/PDF payload (reuses the branded proposal renderer).
export function contractDocPayload(form, business, customer) {
  const pkg = packageFor(form.package);
  const price = Number(form.annual_price) || 0;
  const taxRate = form.tax_rate != null ? Number(form.tax_rate) : 0.08875;
  const taxable = form.taxable !== false;
  const tax = taxable ? Math.round(price * taxRate * 100) / 100 : 0;
  return {
    kind: 'proposal',
    doc: {
      doc_title: 'SERVICE AGREEMENT',
      proposal_number: form.contract_number || 'DRAFT',
      issue_date: form.start_date || new Date().toISOString().slice(0, 10),
      expiry_date: form.expiry_date,
      body: buildContractBody({ ...form, customer_name: customer?.name }, { name: business?.business_name || business?.name }),
      items: [{ description: `Annual boiler service agreement — ${pkg ? pkg.name : 'Custom'} package`, quantity: 1, unit_price: price, total: price }],
      subtotal: price, discount: 0, tax_rate: taxRate, tax_amount: tax, total: price + tax,
      service_address: form.property_address,
    },
    business: { name: business?.business_name || business?.name, phone: business?.business_phone, email: business?.business_email, address: business?.business_address, website: business?.business_website },
    customer: customer ? { ...customer } : { name: form.customer_name || '' },
  };
}
