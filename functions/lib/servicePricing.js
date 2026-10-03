// Flat-rate service pricing engine. Reproduces the workbook's formulas EXACTLY
// (Clarke Mechanical NYC Commercial HVAC Flat-Rate Price Book):
//
//   loaded   = hours*labor + material + parts                         (col G)
//   standard = MAX( diagnostic+travel,                                 (col H)
//                   loaded/(1-markup_over_1000),   ← matches sheet (usually negative, ignored)
//                   hours*labor + (material+parts)*markup_under_250 + travel )
//   member   = standard * (1 - contract_discount)                     (col I)
//   afterHrs = standard + hours*labor*(after_hours_mult - 1)          (col J)  ← labor-only premium
//   emergncy = standard + hours*labor*(emergency_mult - 1)            (col K)  ← labor-only premium
//   grossProfit = standard - loaded                                   (col L)
//   grossMargin = grossProfit / standard                             (col M)
//
// IMPORTANT (verified against the sheet): after-hours and emergency are ALTERNATIVE
// prices, and the member/contract discount is a SEPARATE tier — they do NOT stack.
// A line item uses exactly ONE price depending on the job condition.
const { DEFAULT_PRICING_SETTINGS } = require('../data/servicePricebookSeed');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// The four price tiers a job condition can map to.
const CONDITIONS = [
  { key: 'standard', label: 'Standard', field: 'standard', desc: 'Normal business hours' },
  { key: 'member', label: 'Member / Contract', field: 'member', desc: 'Active service-agreement customer' },
  { key: 'after_hours', label: 'After-hours', field: 'after_hours', desc: 'After 4:00 PM, weekends' },
  { key: 'emergency', label: 'Emergency / Holiday', field: 'emergency', desc: 'Holiday or emergency dispatch' },
];
const conditionField = (cond) => (CONDITIONS.find(c => c.key === cond) || CONDITIONS[0]).field;

function computePrices(item = {}, settings = {}) {
  const s = { ...DEFAULT_PRICING_SETTINGS, ...settings };
  if (item.quote_required) {
    return { quote_required: true, loaded: 0, standard: 0, member: 0, after_hours: 0, emergency: 0, gross_profit: 0, gross_margin: 0 };
  }
  const hours = Number(item.hours) || 0;
  const material = Number(item.material) || 0;
  const parts = Number(item.parts) || 0;
  const labor = hours * Number(s.labor_rate);
  const loaded = labor + material + parts;

  const cand1 = Number(s.diagnostic_fee) + Number(s.travel_fee);
  const denom = 1 - Number(s.markup_over_1000);
  const cand2 = denom !== 0 ? loaded / denom : 0;
  const cand3 = labor + (material + parts) * Number(s.markup_under_250) + Number(s.travel_fee);

  const standard = r2(Math.max(cand1, cand2, cand3, 0));
  const member = r2(standard * (1 - Number(s.contract_discount)));
  const after_hours = r2(standard + labor * (Number(s.after_hours_mult) - 1));
  const emergency = r2(standard + labor * (Number(s.emergency_mult) - 1));
  const gross_profit = r2(standard - loaded);
  const gross_margin = standard > 0 ? gross_profit / standard : 0;

  return { quote_required: false, loaded: r2(loaded), standard, member, after_hours, emergency, gross_profit, gross_margin };
}

// Price for a specific job condition (defaults to standard).
function priceForCondition(prices, condition) {
  return Number(prices[conditionField(condition)]) || 0;
}

module.exports = { computePrices, priceForCondition, CONDITIONS, conditionField, DEFAULT_PRICING_SETTINGS };
