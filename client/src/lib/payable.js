// Client mirror of functions/lib/payable.js. The server computes `payable` and
// `balance_due` for every portal invoice — always prefer those. The fallback only
// exists so an older cached payload can never show a Pay button it shouldn't.
//
// Rule: payable = issued (not draft) AND not paid/cancelled AND balance > 0.
const CLOSED = ['paid', 'cancelled', 'void', 'draft'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function amountDue(inv) {
  if (!inv) return 0;
  if (inv.balance_due != null) return round2(inv.balance_due);
  const paid = (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.max(0, round2((Number(inv.total) || 0) - paid));
}

export function amountPaid(inv) {
  if (!inv) return 0;
  if (inv.amount_paid != null) return round2(inv.amount_paid);
  return round2((inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

export function isPayable(inv) {
  if (!inv) return false;
  if (typeof inv.payable === 'boolean') return inv.payable && amountDue(inv) > 0;
  return !CLOSED.includes(String(inv.status || '').toLowerCase()) && amountDue(inv) > 0;
}
