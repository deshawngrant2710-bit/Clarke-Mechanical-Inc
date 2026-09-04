// Receipts: one record per payment received, with its own RCT-#### sequence
// (kept separate from invoice numbers so bookkeeping lines up).
const { v4: uuid } = require('uuid');
const { list, create, getById } = require('./db');

const START_NUMBER = 4200;

// Next receipt number — always one above the highest issued, never below the start.
async function nextReceiptNumber() {
  const all = await list('receipts');
  let max = START_NUMBER - 1;
  for (const r of all) {
    const m = String(r.receipt_number || '').match(/^RCT-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `RCT-${String(max + 1).padStart(4, '0')}`;
}

// Create the receipt for a single payment. `balanceAfter` is what the customer
// still owes on that invoice once this payment is applied.
async function createForPayment({ invoice, payment, balanceAfter }) {
  const id = uuid();
  const receipt_number = await nextReceiptNumber();
  const saved = await create('receipts', id, {
    receipt_number,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number || null,
    customer_id: invoice.customer_id || null,
    payment_id: payment.id,
    amount: Number(payment.amount) || 0,
    method: payment.method || 'cash',
    reference: payment.reference || null,
    paid_at: payment.paid_at || new Date().toISOString(),
    invoice_total: Number(invoice.total) || 0,
    balance_after: Math.max(0, Number(balanceAfter) || 0),
    emailed_at: null,
  });
  return saved;
}

// Everything needed to render/print one receipt: the receipt, its invoice and
// the customer it belongs to.
async function loadFull(receiptId) {
  const receipt = await getById('receipts', receiptId);
  if (!receipt) return null;
  const [invoice, customer] = await Promise.all([
    receipt.invoice_id ? getById('invoices', receipt.invoice_id) : null,
    receipt.customer_id ? getById('customers', receipt.customer_id) : null,
  ]);
  return { receipt, invoice, customer };
}

module.exports = { createForPayment, nextReceiptNumber, loadFull, START_NUMBER };
