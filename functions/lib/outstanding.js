// Shared helpers so every "outstanding" figure accounts for partial payments.
const { list } = require('./db');

// Map of invoice_id -> total amount paid so far (across all recorded payments).
async function paidMap() {
  const payments = await list('payments');
  const m = {};
  for (const p of payments) {
    if (!p.invoice_id) continue;
    m[p.invoice_id] = (m[p.invoice_id] || 0) + (Number(p.amount) || 0);
  }
  return m;
}

// Remaining balance on an invoice given the paid-map (never negative).
const balanceOf = (inv, paid) => Math.max(0, (Number(inv.total) || 0) - (paid[inv.id] || 0));

module.exports = { paidMap, balanceOf };
