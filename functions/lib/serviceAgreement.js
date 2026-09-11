// Clarke Mechanical — standard Service Agreement builder.
//
// The legal clauses below (Limitation of Liability, Act of God, Defective
// Operation Exclusions, Service by Others, Asbestos Exclusion, Non-Assignable,
// Parts & Payment, Triennial Renewal, Access to Equipment, Terms) are the
// company's STANDARD wording and are reproduced verbatim. The assistant only
// fills in the variables (owner, premises, period, price, equipment, scope);
// it never rewrites the clauses, so every drafted contract carries the same
// vetted terms.
//
// Output is HTML that renders correctly in BOTH places a proposal body is shown:
//   • the customer portal (sanitizeRich keeps only <b>/<i>/<u>/<br>)
//   • the branded PDF (htmlToBlocks understands <h3> headings, <br>, and
//     leading bullet characters)
// So section titles use <h3><b>…</b></h3> (bold in the portal, a heading in the
// PDF) and lists use a literal "• " prefix with <br> line breaks.

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Standard labor items INCLUDED (serviced or replaced) under a full burner agreement.
const DEFAULT_INCLUDED = [
  'Flame safeguard control',
  'Ignition assembly',
  'Flame scanner',
  'Modulating motor and ignition transformer',
  'Nozzle',
  'Lead-lag control',
  'Sensors',
  'Aquastat',
  'Burner blower motors / fans (5 HP and under)',
  'Magnetic motor starters',
];

// Standard items NOT covered for labor (or materials) under the agreement.
const DEFAULT_NOT_COVERED = [
  'Plugging boiler tubes',
  'Coil or tube replacement',
  'Re-gasket boiler doors',
  'Repair chamber or refractory',
  'Repair or replace rotted breeching',
  'Replace low water cut-offs',
  'Plumbing / electrical repairs',
  'Work needed to remove violations',
  'Start-up after boiler repair or tank cleaning unless service is performed by Clarke Mechanical',
  'Repair or replace mixing valve(s)',
];

function money(v) {
  const n = Number(v) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bulletList(items) {
  return (items || []).filter(Boolean).map(i => `• ${esc(i)}`).join('<br>');
}

/**
 * Build the full service-agreement body HTML.
 * @param {object} v
 *   owner            - the OWNER's name (person/company the contract is with)
 *   equipment        - e.g. "GAS FIRED CONDENSING BOILERS"
 *   service_type     - e.g. "oil burner service" (what Clarke agrees to render)
 *   service_address  - premises where the equipment is installed
 *   period_from      - coverage start (free text, e.g. "October 1st, 2024")
 *   period_to        - coverage end   (free text, e.g. "October 1st, 2025")
 *   term_label       - e.g. "TWELVE (12) months"
 *   response_window  - e.g. "8:00 AM – 5:30 PM Monday through Friday"
 *   max_response     - e.g. "four (4) hours"
 *   annual_visits    - number of scheduled visits (default 4)
 *   included         - array of included labor items (defaults to standard list)
 *   not_covered      - array of excluded items (defaults to standard list)
 *   contract_price   - numeric contract price (before tax)
 *   package_note     - e.g. "This is a Standard Service Contract"
 */
function buildServiceAgreementBody(v = {}) {
  const owner = esc(v.owner || '________________________');
  const equipment = esc(v.equipment || 'GAS FIRED CONDENSING BOILERS');
  const serviceType = esc(v.service_type || 'oil burner service');
  const premises = esc(v.service_address || '________________________');
  const from = esc(v.period_from || '____________');
  const to = esc(v.period_to || '____________');
  const term = esc(v.term_label || 'TWELVE (12) months');
  const responseWindow = esc(v.response_window || '8:00 AM - 5:30 PM Monday through Friday');
  const maxResponse = esc(v.max_response || 'four (4) hours');
  const visits = Number(v.annual_visits) || 4;
  const included = (Array.isArray(v.included) && v.included.length) ? v.included : DEFAULT_INCLUDED;
  const notCovered = (Array.isArray(v.not_covered) && v.not_covered.length) ? v.not_covered : DEFAULT_NOT_COVERED;
  const price = money(v.contract_price);
  const packageNote = esc(v.package_note || 'This is a Standard Service Contract');

  const P = []; // paragraphs / sections, joined with blank lines

  P.push(
    `Clarke Mechanical agrees to render ${serviceType} to the Owner's ${equipment} installed in premises: ` +
    `${premises} for the period from ${from} through ${to}. ${term}, under the following terms and conditions:`
  );

  P.push(
    `<h3><b>WORK TO BE PERFORMED:</b></h3>` +
    `The "Full Burner Service Agreement" includes labor services for the scope of work listed herein. ` +
    `The Owner(s) will receive service response, following receipt of your service request, from ${responseWindow}. ` +
    `Clarke Mechanical will respond (maximum response time is ${maxResponse}) to your call and repair defective operation of your burner.`
  );

  P.push(
    `<h3><b>INCLUDED IN THIS AGREEMENT:</b></h3>` +
    `All labor to service or replace the following:<br>` +
    bulletList(included)
  );

  P.push(
    `<h3><b>ANNUAL OVERHAUL:</b></h3>` +
    `Annual overhaul will be priced separately based on manufacturer specifications to service. ` +
    `Clarke Mechanical will conduct (${visits}) annual visits to check system operation and operational performance for optimum performance.`
  );

  P.push(
    `<h3><b>LABOR NOT COVERED UNDER THIS CONTRACT:</b></h3>` +
    `The following items are not covered for labor (or materials) under contract, but will be serviced at additional labor and material costs:<br>` +
    bulletList(notCovered)
  );

  P.push(
    `<h3><b>LIMITATION OF LIABILITY:</b></h3>` +
    `Clarke Mechanical shall not be liable for any damage or loss of any nature whatsoever caused by defective or faulty operation of the BOILER, regardless of the cause thereof. ` +
    `Clarke Mechanical shall only be responsible for the foreseeable damage caused by the negligent acts of its employees. ` +
    `Clarke Mechanical will not violate local and/or federal regulations regarding operation of GAS BOILER(s).`
  );

  P.push(
    `<h3><b>ACT OF GOD, ETC.:</b></h3>` +
    `Performance of any obligation hereunder by Clarke Mechanical will be excused if prevented by Acts of God, or the public enemy, fire or other casualty, labor disputes, or, without limiting the foregoing, any circumstances beyond its reasonable control.`
  );

  P.push(
    `<h3><b>DEFECTIVE OPERATION EXCLUSIONS:</b></h3>` +
    `Clarke Mechanical shall not be responsible for service or repairs required as the result of: lack of maintenance; fire damage; insufficient gas by utility company; low water level in boiler; blown fuses; shutdown due to boiler or burner repairs by others; negligence in operation; dirty oil strainers; lack of lubrication; dirty smoke alarm lenses, or CO2 detectors or ignition assemblies. ` +
    `These functions are not included as a part of this Contract and such work shall be billed to the Owner(s) at prevailing rates.`
  );

  P.push(
    `<h3><b>SERVICE BY OTHERS:</b></h3>` +
    `If at any time during the period hereof, service is performed to the equipment by any company or individual other than Clarke Mechanical, or if the equipment is removed from the premises without Clarke Mechanical's supervision and consent, then at Clarke Mechanical's option this Agreement shall immediately become null and void.`
  );

  P.push(
    `<h3><b>ASBESTOS EXCLUSION CLAUSE:</b></h3>` +
    `Seller's scope of work shall not include the identification, detection, abatement, encapsulation or removal of asbestos, or products or materials containing asbestos or other hazardous substances. ` +
    `In the event the seller encounters any such products or materials in the course of performing its work, seller shall have the right to discontinue its work and remove its employees from the project until such products or materials, and any hazards connected therewith, are abated, encapsulated or removed or it is determined that no hazard exists (as the case may require), and seller shall receive an extension of time to complete its work hereunder and compensation for delays encountered as a result of such situation and correction of same.`
  );

  P.push(
    `<h3><b>NON-ASSIGNABLE:</b></h3>` +
    `This Agreement shall not be assignable without the written consent of Clarke Mechanical.`
  );

  P.push(
    `<h3><b>PARTS &amp; PAYMENT:</b></h3>` +
    `All parts will be charged in addition to the price of this Agreement. All amounts due for work performed or parts supplied in connection with this Agreement shall be paid by the Owners "Net 30 Days". ` +
    `Amounts due and unpaid shall accrue interest at the rate of 1 1/2% per month. ` +
    `The Owners shall be responsible for all reasonable attorney and collection fees as may be required to secure payment of past due amounts.`
  );

  P.push(
    `<h3><b>TRIENNIAL RENEWAL:</b></h3>` +
    `Any and all work pertaining to obtaining the Triennial Renewal Certificate from the Department of Air Resources is excluded from this Agreement.`
  );

  P.push(
    `<h3><b>ACCESS TO EQUIPMENT:</b></h3>` +
    `The customer must agree to report immediately any conditions requiring service or correction and to grant free access to the location of the equipment to our company and its representatives. ` +
    `In any and all cases of non-access the customer will be charged at Clarke Mechanical's prevailing labor rate at the time of incident.`
  );

  P.push(
    `<h3><b>TERMS:</b></h3>` +
    `Payment in full shall be remitted simultaneously together with acceptance of this Agreement. This Agreement may not be changed or accepted orally. ` +
    `This Agreement will become effective after signature by both parties, and after payment of the full contract price is received by Clarke Mechanical.`
  );

  P.push(
    `<h3><b>CONTRACT PRICE:</b></h3>` +
    `${price} (Plus Applicable Sales Tax)<br>` +
    `(Please note: ${packageNote}.)<br>` +
    `There is an extended service package available - please advise.`
  );

  // Join sections with a blank line (double <br>) between them. Add a break
  // after each section header so it sits on its own line in the portal view
  // (the PDF already treats <h3> as a heading line).
  return P.join('<br><br>').replace(/<\/h3>/g, '</h3><br>');
}

module.exports = { buildServiceAgreementBody, DEFAULT_INCLUDED, DEFAULT_NOT_COVERED };
