// Commercial Boiler Preventive Maintenance & Service Agreement.
//
// Defines the three service packages (with DEFAULT prices the admin can override),
// large-boiler pricing guidance, and a builder that assembles the full professional
// agreement text from a contract's fields. The body is HTML that renders in the
// branded proposal PDF (<h3><b>…</b></h3> headings, <br>, "• " bullets).
//
// IMPORTANT business rule baked into the wording: preventive maintenance LABOR for
// listed services only — major repairs, replacement parts, and emergency work are
// separately billable unless explicitly added.

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(v) {
  return `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Default package definitions. Prices/rates are DEFAULTS — the admin can change
// them per contract, and the shop-wide defaults live in settings.
const PACKAGES = {
  essential: {
    id: 'essential', name: 'Essential', default_price: 2500, visits: 2, frequency: 'Semi-annual',
    labor_discount: 10, parts_discount: 0,
    scope: [
      '2 scheduled boiler inspections per year',
      'Burner inspection',
      'Safety-control testing',
      'Combustion analysis',
      'Written service reports',
      'Priority scheduling',
      '10% discount on repair labor',
    ],
  },
  professional: {
    id: 'professional', name: 'Professional', default_price: 4500, visits: 4, frequency: 'Quarterly',
    labor_discount: 15, parts_discount: 0,
    scope: [
      'Quarterly preventive-maintenance visits',
      'Combustion analysis',
      'Burner maintenance',
      'Safety-control testing',
      'Low-water cutoff testing',
      'Boiler-room inspection',
      'Detailed service reports with equipment photos',
      'Priority emergency response',
      '15% discount on repair labor',
    ],
  },
  premium: {
    id: 'premium', name: 'Premium', default_price: 7500, visits: 4, frequency: 'Monthly/Quarterly (per equipment)',
    labor_discount: 20, parts_discount: 10,
    scope: [
      'Scheduled preventive maintenance (monthly or quarterly per equipment)',
      'Full boiler and burner preventive maintenance',
      'Combustion testing',
      'Safety-control testing',
      'Low-water cutoff testing',
      'Priority 24/7 emergency response',
      'Detailed service documentation',
      '20% discount on repair labor',
      'Preferred parts pricing',
      'Annual boiler-room condition assessment',
    ],
  },
};

// Large-boiler annual pricing guidance (shown to the admin, not the customer).
const PRICING_GUIDE = [
  ['Small commercial boiler', '$1,500 – $2,500 / year'],
  ['100–200 HP', '$3,000 – $5,000 / year'],
  ['200–300 HP', '$4,500 – $7,500 / year'],
  ['Single 200 HP Scotch marine (quarterly PM + annual fireside)', '$5,000 – $7,500 / year'],
  ['Two large commercial boilers', '$7,500 – $12,000 / year'],
  ['Two 200 HP Scotch marine boilers', '$9,000 – $13,000 / year'],
  ['Three to four large boilers', '$10,000 – $18,000+ / year'],
  ['Large boiler plant / multiple buildings', 'Custom, starting around $20,000+'],
];

// The standard exclusions / parts-not-included list.
const DEFAULT_EXCLUSIONS = [
  'Replacement parts and major repairs (motors, pumps, burners, burner controls, flame scanners, gas valves, oil pumps, VFDs, belts, bearings, transformers, relays, sensors, actuators, safety valves, pressure controls, boiler sections, tubes, refractory, heat exchangers, expansion tanks, etc.)',
  'Any repair, replacement or overhaul work — quoted separately by written estimate',
  'Water treatment, chemicals, and water-side/fireside descaling beyond the listed cleaning',
  'Code-required engineering, permits, filings, inspections and certifications',
  'Abatement or removal of asbestos or other hazardous materials',
  'Work required due to acts of God, misuse, vandalism, or service performed by others',
];

function packageFor(id) { return PACKAGES[id] || null; }

/* ====================================================================== */
/*  RESIDENTIAL MAINTENANCE AGREEMENTS                                      */
/*  Fixed consumer pricing (not per-contract editable). 12-month term,     */
/*  payable annually (one payment) or monthly (12 payments).               */
/* ====================================================================== */
const RESIDENTIAL_PLANS = {
  essential: {
    id: 'essential', name: 'Boiler Essential Care', annual: 299, monthly: 29, monthly_total: 348, labor_discount: 0,
    scope: [
      'One annual boiler cleaning and tune-up',
      'Safety and control inspection',
      'Combustion testing where applicable',
      'Written maintenance report',
    ],
  },
  priority: {
    id: 'priority', name: 'Boiler Priority Care', annual: 449, monthly: 42, monthly_total: 504, labor_discount: 15,
    scope: [
      'Everything in Boiler Essential Care',
      'Priority scheduling',
      '15% off qualifying repairs',
      '$99 diagnostic / service-call fee during normal business hours (vs. the standard $189 fee)',
    ],
  },
  wholehome: {
    id: 'wholehome', name: 'Whole-Home HVAC + Boiler Care', annual: 699, monthly: 65, monthly_total: 780, labor_discount: 15,
    scope: [
      'Annual boiler maintenance plus spring AC maintenance',
      'Priority scheduling',
      '15% off qualifying repairs',
    ],
  },
};

const RESIDENTIAL_ADDONS = [
  { id: 'extra_boiler', label: 'Additional boiler at the same property', price: 225 },
  { id: 'extra_ac', label: 'Additional AC system', price: 199 },
  { id: 'minisplit', label: 'Additional mini-split head', price: 75, note: 'deep cleaning is billed separately' },
];
const addonFor = (id) => RESIDENTIAL_ADDONS.find(a => a.id === id) || null;

const RESIDENTIAL_EXCLUSIONS = [
  'Repairs and replacement parts are additional, subject to any applicable plan discount',
  'Refrigerant, and refrigerant recovery or recharge',
  'Major repairs and deep cleaning (including mini-split or coil deep cleaning)',
  'After-hours premiums and emergency or after-hours service calls, unless expressly included',
  'Work required due to misuse, neglect, acts of God, or service performed by others',
];

const residentialPlanFor = (id) => RESIDENTIAL_PLANS[id] || null;

// Compute residential pricing from a contract record. `addons` is a map of
// { addonId: quantity }. Returns itemized lines + totals for the chosen billing.
function residentialTotals(c = {}) {
  const plan = residentialPlanFor(c.plan) || RESIDENTIAL_PLANS.essential;
  const billing = c.billing === 'monthly' ? 'monthly' : 'annual';
  const planCharge = billing === 'monthly' ? plan.monthly_total : plan.annual; // 12-month cost
  const addonsMap = (c.addons && typeof c.addons === 'object') ? c.addons : {};
  const addonLines = RESIDENTIAL_ADDONS
    .map(a => ({ ...a, qty: Math.max(0, Number(addonsMap[a.id]) || 0) }))
    .filter(a => a.qty > 0)
    .map(a => ({ ...a, total: a.qty * a.price }));
  const addonsTotal = addonLines.reduce((s, a) => s + a.total, 0);
  const subtotal = planCharge + addonsTotal;
  return { plan, billing, planCharge, addonLines, addonsTotal, subtotal };
}

// Full residential agreement body (HTML) — mirrors the commercial look/structure.
function buildResidentialBody(c = {}, business = {}) {
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const t = residentialTotals(c);
  const plan = t.plan;
  const equip = Array.isArray(c.boilers) ? c.boilers : [];
  const exclusions = (Array.isArray(c.exclusions) && c.exclusions.length) ? c.exclusions : RESIDENTIAL_EXCLUSIONS;
  const li = (arr) => arr.filter(Boolean).map(x => `• ${esc(x)}`).join('<br>');
  const equipRows = equip.length
    ? equip.map((b, i) => `• ${esc([b.type, b.manufacturer, b.model].filter(Boolean).join(' ') || `Unit ${i + 1}`)}${b.serial ? `, S/N ${esc(b.serial)}` : ''}${b.capacity ? `, ${esc(b.capacity)}` : ''}${b.fuel ? `, ${esc(b.fuel)}` : ''}${b.system ? `, ${esc(b.system)}` : ''}`).join('<br>')
    : '• (Equipment to be listed)';

  const billingLine = t.billing === 'monthly'
    ? `Selected billing: <b>Monthly — ${money(plan.monthly)}/month</b> (${money(plan.monthly_total)} total over the 12-month term).`
    : `Selected billing: <b>Annual — ${money(plan.annual)}</b> for the 12-month term (one payment).`;

  const P = [];
  P.push(`This Residential Maintenance Agreement ("Agreement") is entered into between ${esc(bizName)} ("Contractor") and ${esc(c.customer_name || '________________________')} ("Customer") for the residential HVAC and/or boiler equipment located at: ${esc(c.property_address || c.service_address || '________________________')}.`);

  P.push(`<h3><b>SELECTED PLAN:</b></h3>${esc(plan.name)}<br>Annual payment: <b>${money(plan.annual)}/year</b>. &nbsp;Monthly payment: <b>${money(plan.monthly)}/month</b> (${money(plan.monthly_total)} over 12 months).<br>${billingLine}<br>Both billing options cover a 12-month agreement.`);

  P.push(`<h3><b>COVERED EQUIPMENT:</b></h3>${equipRows}`);

  P.push(`<h3><b>WHAT'S INCLUDED:</b></h3>The following are included under this Agreement:<br>${li(plan.scope)}`);

  if (t.addonLines.length) {
    const rows = t.addonLines.map(a => `• ${esc(a.label)}${a.qty > 1 ? ` × ${a.qty}` : ''} — ${money(a.total)}/year${a.note ? ` (${esc(a.note)})` : ''}`).join('<br>');
    P.push(`<h3><b>OPTIONAL ADD-ONS:</b></h3>${rows}<br><br>Add-ons are billed once per year at the start of the agreement term (or added to the first payment). Mini-split deep cleaning is a separate charge and is not included.`);
  }

  const priceRows = [
    `• ${esc(plan.name)} (${t.billing === 'monthly' ? `${money(plan.monthly)}/mo × 12` : 'annual'}) — ${money(t.planCharge)}`,
    ...t.addonLines.map(a => `• ${esc(a.label)}${a.qty > 1 ? ` × ${a.qty}` : ''} — ${money(a.total)}`),
  ].join('<br>');
  P.push(`<h3><b>ITEMIZED PRICING:</b></h3>${priceRows}<br><b>Agreement total (before tax): ${money(t.subtotal)} for the 12-month term.</b>${c.taxable !== false ? ' Applicable sales tax is added.' : ''}`);

  P.push(`<h3><b>WHAT'S NOT INCLUDED:</b></h3>The following are additional and are not covered by the plan fee:<br>${li(exclusions)}<br><br>Repairs and replacement parts are billed separately, subject to any applicable plan discount. Priority scheduling does not guarantee immediate service. These plans do not include unlimited free service calls.`);

  P.push(`<h3><b>TERM &amp; RENEWAL:</b></h3>This Agreement runs from ${esc(c.start_date || '____________')} through ${esc(c.expiry_date || '____________')} (12 months). It renews for successive one-year terms unless either party gives written notice of non-renewal at least thirty (30) days before expiration.`);

  P.push(`<h3><b>PAYMENT:</b></h3>${billingLine} ${t.billing === 'monthly' ? 'Monthly payments are due on the same day each month for the 12-month term.' : 'The annual fee is due in advance at the start of the term.'} Amounts unpaid for more than thirty (30) days may pause service until the account is current.`);

  P.push(`<h3><b>ACCEPTANCE:</b></h3>By signing, the Customer accepts the selected plan, add-ons, pricing, billing option and terms above, and acknowledges that repairs, replacement parts, refrigerant, deep cleaning, after-hours premiums and emergency work are additional unless expressly included.`);

  return P.join('<br><br>');
}

// Build the full agreement body (HTML) from a contract record.
function buildContractBody(c = {}, business = {}) {
  if (c.contract_type === 'residential') return buildResidentialBody(c, business);
  const pkg = packageFor(c.package) || null;
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

  P.push(
    `This Commercial Boiler Preventive Maintenance &amp; Service Agreement ("Agreement") is entered into between ${esc(bizName)} ("Contractor") and ${esc(c.customer_name || '________________________')} ("Owner") for the boiler equipment located at the premises: ${esc(c.property_address || c.service_address || '________________________')}, in the City of New York.`
  );

  P.push(`<h3><b>SERVICE PACKAGE:</b></h3>${esc(pkg ? pkg.name : (c.package || 'Custom'))} — ${money(price)} per year.<br>Service frequency: ${esc(freq)}.`);

  P.push(`<h3><b>PROPERTY &amp; EQUIPMENT SCHEDULE:</b></h3>${equipRows}`);

  P.push(`<h3><b>INCLUDED PREVENTIVE-MAINTENANCE SCOPE:</b></h3>The following preventive-maintenance services are included under this Agreement for the equipment listed above:<br>${li(scope)}`);

  P.push(
    `<h3><b>PREVENTIVE-MAINTENANCE WORK:</b></h3>` +
    `At each scheduled visit, Contractor will inspect and service the boiler, burner and controls appropriate to the equipment, which may include: burner maintenance; combustion testing (O₂, CO₂, CO, stack temperature, draft, excess air and efficiency; smoke test on oil equipment); safety-control testing; low-water cutoff testing and blow-down; fireside/waterside inspection and listed cleaning; steam-system or hot-water-system inspection; gas-fired or oil-fired boiler inspection as applicable; and condensate/feedwater inspection. A written service report is provided after each visit.`
  );

  P.push(
    `<h3><b>WHAT IS NOT INCLUDED — REPAIRS, PARTS &amp; REPLACEMENTS:</b></h3>` +
    `Preventive-maintenance LABOR is included only for the services specifically listed in the selected package above. Major repairs, replacement parts, and replacement equipment are NOT included and are billed separately by written estimate upon the Owner's authorization.<br>${li(exclusions)}<br>` +
    `Repair labor is discounted ${laborDisc}%${partsDisc ? `, and parts are discounted ${partsDisc}%,` : ''} for Owner under an active Agreement.`
  );

  P.push(
    `<h3><b>EMERGENCY SERVICE:</b></h3>` +
    `Normal service hours: ${esc(c.normal_hours || 'Mon–Fri, 8:00 AM – 5:30 PM')}. Emergency service availability: ${esc(c.emergency_availability || (c.package === 'premium' ? '24/7 priority' : 'Priority, business hours'))}. ` +
    `Emergency labor rate: ${c.emergency_rate ? money(c.emergency_rate) + '/hr' : '________'}; after-hours rate: ${c.after_hours_rate ? money(c.after_hours_rate) + '/hr' : '________'}; weekend/holiday rates and a minimum emergency charge of ${c.min_charge ? money(c.min_charge) : '________'} apply. ` +
    `Target response time: ${esc(c.response_time || '4 hours')}. Response times are targets and are not absolute guarantees.`
  );

  P.push(
    `<h3><b>APPLICABLE REQUIREMENTS:</b></h3>` +
    `Contractor shall perform the contracted maintenance work in accordance with applicable requirements governing the equipment and work being performed, manufacturer requirements, approved construction documents, and applicable laws and codes. This Agreement does not replace required engineering, permits, inspections, filings or certifications. Where a required inspection or certification falls outside Contractor's license or contractual scope, Contractor shall notify Owner.`
  );

  P.push(
    `<h3><b>OWNER RESPONSIBILITIES:</b></h3>` +
    `• Provide safe, timely access to the boiler room and equipment<br>• Maintain water treatment and normal operation between visits<br>• Report abnormal conditions promptly<br>• Authorize repairs and replacement parts required for safe operation<br>• Pay all amounts when due`
  );

  P.push(
    `<h3><b>CONTRACTOR RESPONSIBILITIES:</b></h3>` +
    `• Perform the listed preventive maintenance on the agreed schedule<br>• Provide a written service report after each visit<br>• Identify deficiencies and provide written repair estimates<br>• Maintain insurance as required by law<br>• Perform work with qualified personnel`
  );

  P.push(
    `<h3><b>WARRANTY LIMITATIONS:</b></h3>` +
    `Contractor warrants its preventive-maintenance workmanship for the services actually performed. Contractor is not liable for equipment failure, damage or loss caused by defective equipment, age, deferred repairs the Owner declined, lack of water treatment, or conditions beyond Contractor's control. Manufacturer warranties on parts and equipment pass through to the Owner.`
  );

  P.push(
    `<h3><b>ANNUAL CONTRACT PRICE &amp; PAYMENT:</b></h3>` +
    `The annual contract price is ${money(price)}, plus applicable sales tax. Payment terms: ${esc(c.payment_schedule || 'Annual in advance')}. Amounts unpaid for more than thirty (30) days accrue interest at 1½% per month.`
  );

  P.push(
    `<h3><b>TERM, RENEWAL &amp; CANCELLATION:</b></h3>` +
    `This Agreement runs from ${esc(c.start_date || '____________')} through ${esc(c.expiry_date || '____________')}. It renews for successive one-year terms unless either party gives written notice of non-renewal at least thirty (30) days before expiration. Either party may cancel for cause on thirty (30) days' written notice; fees for services already rendered remain due.`
  );

  P.push(
    `<h3><b>ACCEPTANCE:</b></h3>` +
    `By signing, the Owner accepts the service package, scope, price and terms above, and acknowledges that repairs, replacement parts and emergency work are separately billable unless expressly included.`
  );

  return P.join('<br><br>');
}

module.exports = {
  PACKAGES, PRICING_GUIDE, DEFAULT_EXCLUSIONS, packageFor, buildContractBody, money,
  RESIDENTIAL_PLANS, RESIDENTIAL_ADDONS, RESIDENTIAL_EXCLUSIONS, residentialPlanFor, addonFor, residentialTotals, buildResidentialBody,
};
