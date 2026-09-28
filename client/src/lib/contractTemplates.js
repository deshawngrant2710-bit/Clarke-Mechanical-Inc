/*
 * Built-in proposal/contract templates that always appear in the Proposals
 * editor ("Start from template"), in addition to any the office saves itself.
 *
 * Bodies are simple HTML: <h3><b>…</b></h3> section titles (they render as
 * headings in the PDF), <br> line breaks, and "• " bullets. Fill-in blanks are
 * written as underscores so staff can complete them per job.
 *
 * NOTE: these are professional starting points, not legal advice. Clarke's
 * attorney should review contract wording before it's used on a large job.
 */

// Underscore placeholder helper.
const B = '________________';

// --- Scotch Marine Boiler Installation Contract (New York City) -------------
const scotchMarineNYC = [
  `This Boiler Installation Contract ("Contract") is made between Clarke Mechanical Inc. ("Contractor") and ${B} ("Owner") for work at the premises: ${B}, in the City of New York.`,

  `<h3><b>1. SCOPE OF WORK:</b></h3>` +
  `Contractor shall furnish all labor, materials, equipment and supervision to install one (1) ${B} HP Scotch marine boiler (the "Boiler"), including burner, controls, breeching/venting connections, fuel train, feed-water and blow-down piping, and associated appurtenances, and place the Boiler into safe operating condition at the premises. ` +
  `The Boiler shall bear a valid ASME stamp and National Board registration.`,

  `<h3><b>2. APPLICABLE CODE PATH:</b></h3>` +
  `All work shall be designed, performed, tested and completed in accordance with the following applicable codes and standards, as amended and as enforced by the authorities having jurisdiction in the City of New York:<br>` +
  `• 2022 NYC Construction Codes, including the NYC Building Code, NYC Mechanical Code, NYC Fuel Gas Code, NYC Plumbing Code, and NYC Energy Conservation Code (NYCECC)<br>` +
  `• ASME Boiler and Pressure Vessel Code — Section I (Power Boilers) or Section IV (Heating Boilers), as applicable to the Boiler's pressure and service, and ASME CSD-1 (Controls and Safety Devices for Automatically Fired Boilers)<br>` +
  `• National Board Inspection Code (NBIC) for installation, testing and registration<br>` +
  `• NFPA 54 / ANSI Z223.1 (National Fuel Gas Code) for gas-fired units, or NFPA 31 for oil-fired units, and NFPA 85 where applicable<br>` +
  `• New York City Department of Buildings (DOB) permitting, filing and inspection requirements<br>` +
  `• New York City Department of Environmental Protection (DEP) requirements, including Title 15 of the Rules of the City of New York (boiler registration, work permit and emissions), and NYC Fire Department (FDNY) requirements where applicable<br>` +
  `Welding shall be performed by qualified welders in accordance with ASME Section IX. Work requiring a licensed trade shall be performed by or under the supervision of a New York City Licensed Master Plumber and/or other appropriately licensed personnel.`,

  `<h3><b>3. APPROVED DRAWINGS:</b></h3>` +
  `All work shall be performed in strict conformance with the drawings, plans and specifications prepared and sealed by a New York State Licensed Professional Engineer or Registered Architect and approved by the NYC Department of Buildings (the "Approved Drawings"). ` +
  `Contractor shall keep a current, approved set of the Approved Drawings at the job site at all times. ` +
  `No deviation, substitution or change from the Approved Drawings shall be made without (a) the Owner's prior written authorization by executed Change Order, and (b) where required, review, re-filing and re-approval by the design professional of record and the NYC Department of Buildings. ` +
  `Any work performed that does not conform to the Approved Drawings and applicable code shall be corrected by Contractor at no additional cost to the Owner unless the non-conformance results from Owner-directed changes.`,

  `<h3><b>4. PERMITS, FILINGS &amp; INSPECTIONS:</b></h3>` +
  `Contractor shall obtain the required DOB work permits and coordinate all required inspections and sign-offs, including hydrostatic testing, boiler inspection, and DEP registration/permit, as applicable. ` +
  `Filing and design-professional fees are ${B} (included / not included — strike one). The installation shall not be placed into permanent service until all required inspections are passed and sign-offs obtained.`,

  `<h3><b>5. CONTRACT PRICE:</b></h3>` +
  `The total contract price for the work is $${B}, plus applicable sales tax. The price is based on the Approved Drawings and existing site conditions.`,

  `<h3><b>6. PAYMENT SCHEDULE:</b></h3>` +
  `Payment shall be made in accordance with the Payment Schedule set forth in this proposal. Amounts unpaid for more than thirty (30) days shall accrue interest at 1½% per month.`,

  `<h3><b>7. CHANGE ORDERS:</b></h3>` +
  `Any change in the scope of work, materials, or schedule shall be authorized by a written Change Order signed by both parties before the changed work proceeds, stating the adjustment to the price and time.`,

  `<h3><b>8. CONCEALED &amp; UNFORESEEN CONDITIONS:</b></h3>` +
  `Should concealed or unforeseen conditions (including asbestos or other hazardous materials, deteriorated structures, or conditions differing from the Approved Drawings) be encountered, Contractor shall notify the Owner and the work affected shall be performed at additional cost by Change Order. Contractor's scope does not include abatement or removal of hazardous materials.`,

  `<h3><b>9. WARRANTY:</b></h3>` +
  `Contractor warrants its workmanship for a period of one (1) year from substantial completion. Manufacturer warranties on the Boiler and components are assigned to the Owner. This warranty excludes damage from misuse, lack of maintenance, or work performed by others.`,

  `<h3><b>10. INSURANCE &amp; INDEMNIFICATION:</b></h3>` +
  `Contractor shall maintain commercial general liability and workers' compensation insurance as required by law, and shall provide certificates upon request. Each party shall indemnify the other for loss arising from its own negligent acts, to the extent permitted by law.`,

  `<h3><b>11. DELAYS:</b></h3>` +
  `Contractor shall not be liable for delays beyond its reasonable control, including Acts of God, labor disputes, utility or agency delays, or delays in permit or drawing approval, and shall be entitled to a reasonable extension of time.`,

  `<h3><b>12. COMPLIANCE WITH LAW &amp; TERMS:</b></h3>` +
  `Contractor shall comply with all applicable laws and regulations. This Contract may not be changed or accepted orally and becomes effective upon signature by both parties. This Contract, together with the Approved Drawings and any executed Change Orders, constitutes the entire agreement between the parties.`,

  `<h3><b>ACCEPTANCE:</b></h3>` +
  `By signing, the Owner accepts the scope, price, code path and terms set forth above and authorizes Contractor to proceed in accordance with the Approved Drawings.`,
].join('<br><br>');

export const BUILTIN_PROPOSAL_TEMPLATES = [
  {
    id: 'builtin-scotch-marine-nyc',
    name: 'Scotch Marine Boiler Installation (NYC)',
    builtin: true,
    body: scotchMarineNYC,
    items: [
      { description: 'Furnish & install Scotch marine boiler (per approved drawings)', note: '', quantity: 1, unit_price: 0 },
    ],
    milestones: [
      { label: 'Deposit on signing', percent: 30, amount: '', due: '' },
      { label: 'On delivery of boiler to site', percent: 40, amount: '', due: '' },
      { label: 'On start-up / first fire', percent: 20, amount: '', due: '' },
      { label: 'On final DOB/DEP sign-off', percent: 10, amount: '', due: '' },
    ],
  },
];
