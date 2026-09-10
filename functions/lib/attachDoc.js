// Builds the branded PDF attachment for outgoing invoice / estimate / receipt
// emails. Always fails soft: if anything goes wrong the email still sends, just
// without the attachment.
const { getById } = require('./db');
const settings = require('./settings');

// Mirrors the "How to pay" block printed on invoices.
function paymentLines(s) {
  const out = [];
  if (s.pay_zelle_email) out.push(`Zelle: ${s.pay_zelle_email}`);
  if (s.pay_bank_name) out.push(`Bank: ${s.pay_bank_name}`);
  if (s.pay_account_name) out.push(`Account name: ${s.pay_account_name}`);
  if (s.pay_account_number) out.push(`Account number: ${s.pay_account_number}`);
  if (s.pay_routing_number) out.push(`Routing (ACH): ${s.pay_routing_number}`);
  if (s.pay_check_payable_to) out.push(`Checks payable to: ${s.pay_check_payable_to}`);
  if (!out.length) out.push('Zelle: clarkemechanical@gmail.com', 'Checks payable to: Clarke Mechanical Inc.');
  return out;
}

/**
 * @param kind 'invoice' | 'quote' | 'receipt'
 * @param entity the invoice/quote already loaded for the email template
 * @param extra  { receipt }  for receipts, the receipt record
 * @returns [{ filename, content: Buffer }] or [] when unavailable
 */
async function buildAttachment(kind, entity, extra = {}) {
  try {
    const { pdfBuffer, pdfFilename } = require('./pdfDoc');
    const s = await settings.getAll();
    const customer = entity.customer_id ? await getById('customers', entity.customer_id) : null;

    const opts = {
      kind,
      doc: entity,
      receipt: extra.receipt || null,
      business: {
        name: s.business_name,
        phone: s.business_phone,
        email: s.business_email,
        address: s.business_address,
        website: s.business_website,
        paymentLines: (kind === 'invoice' || kind === 'proposal') ? paymentLines(s) : [],
      },
      customer: {
        name: customer?.name || entity.customer_name,
        email: customer?.email,
        phone: customer?.phone,
        address: customer?.address,
        city: customer?.city,
        state: customer?.state,
        zip: customer?.zip,
      },
    };
    return [{ filename: pdfFilename(opts), content: pdfBuffer(opts) }];
  } catch (e) {
    console.error('[email] PDF attachment skipped:', e.message);
    return [];
  }
}

module.exports = { buildAttachment };
