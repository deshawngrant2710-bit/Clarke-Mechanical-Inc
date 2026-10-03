// Client mirror of functions/lib/servicePricing.js — keep in sync.
// Reproduces the workbook's flat-rate pricing so the UI can show live prices and
// snapshot the right tier into estimate/invoice line items.
export const DEFAULT_PRICING_SETTINGS = {
  labor_rate: 195, diagnostic_fee: 250, after_hours_mult: 1.5, emergency_mult: 2,
  contract_discount: 0.1, markup_under_250: 1.8, markup_250_1000: 1.6, markup_over_1000: 1.45,
  target_margin: 0.55, helper_rate: 125, travel_fee: 65,
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const CONDITIONS = [
  { key: 'standard', label: 'Standard', field: 'standard', desc: 'Normal business hours' },
  { key: 'member', label: 'Member / Contract', field: 'member', desc: 'Active service-agreement customer' },
  { key: 'after_hours', label: 'After-hours', field: 'after_hours', desc: 'After 4:00 PM, weekends' },
  { key: 'emergency', label: 'Emergency / Holiday', field: 'emergency', desc: 'Holiday or emergency dispatch' },
];
export const conditionField = (cond) => (CONDITIONS.find(c => c.key === cond) || CONDITIONS[0]).field;
export const conditionLabel = (cond) => (CONDITIONS.find(c => c.key === cond) || CONDITIONS[0]).label;

export function computePrices(item = {}, settings = {}) {
  const s = { ...DEFAULT_PRICING_SETTINGS, ...(settings || {}) };
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

export function priceForCondition(prices, condition) {
  return Number(prices?.[conditionField(condition)]) || 0;
}

// "After 4 PM is an after-hours job." Suggests the default condition from the clock.
export function suggestedCondition(date = new Date()) {
  const day = date.getDay();      // 0 Sun … 6 Sat
  const hour = date.getHours();
  if (day === 0 || day === 6) return 'after_hours'; // weekend
  return hour >= 16 ? 'after_hours' : 'standard';
}
