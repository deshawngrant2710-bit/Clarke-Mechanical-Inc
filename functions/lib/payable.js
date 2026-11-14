// Single source of truth for "can the customer pay this invoice online, and how much?"
//
// Existing business rules this encodes (see routes/email.js + InvoiceDetail "Mark as Sent"):
//   • A DRAFT invoice is unissued — the office hasn't finalized/sent it yet (jobs
//     auto-create drafts on completion for review). Customers can't pay it and it
//     doesn't count toward their balance. It becomes payable once it's sent.
//   • PAID and CANCELLED invoices are never payable.
//   • The amount due is the remaining balance (total − recorded payments), never
//     negative. A zero balance is never payable.
const { findWhere } = require('./db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CLOSED = ['paid', 'cancelled', 'void'];

// Pure rule — given an invoice and the sum already paid against it.
function eligibility(invoice, amountPaid = 0) {
  const status = String(invoice?.status || '').toLowerCase();
  const total = round2(invoice?.total);
  const paid = round2(amountPaid);
  const balance = Math.max(0, round2(total - paid));
  let reason = null;
  if (status === 'draft') reason = 'not_issued';
  else if (CLOSED.includes(status)) reason = status === 'paid' ? 'paid' : 'cancelled';
  else if (!(balance > 0)) reason = 'no_balance';
  return { payable: !reason, balance_due: balance, amount_paid: paid, reason };
}

const REASON_TEXT = {
  not_issued: 'This invoice is still being finalized and isn’t ready to pay yet.',
  paid: 'This invoice is already paid.',
  cancelled: 'This invoice was cancelled.',
  no_balance: 'Nothing left to pay on this invoice.',
};

// Async helper for routes: looks up payments, returns the rule + a message.
async function invoiceEligibility(invoice) {
  const pays = await findWhere('payments', 'invoice_id', invoice.id);
  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const e = eligibility(invoice, paid);
  return { ...e, message: e.reason ? REASON_TEXT[e.reason] : null };
}

// Customers only ever see issued invoices.
const isIssued = (invoice) => String(invoice?.status || '').toLowerCase() !== 'draft';

module.exports = { eligibility, invoiceEligibility, isIssued, REASON_TEXT };
