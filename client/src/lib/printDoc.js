// Opens a clean, branded printable view of an invoice or quote and triggers the
// browser's print dialog (→ "Save as PDF"). No dependencies, works everywhere.
import { sanitizeRich } from './richText';
import { PAYMENT_INFO } from './paymentInfo';

const LOGO_URL = 'https://clarke-mechanical-inc.web.app/email-logo.png';
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? esc(d) : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
// Build the "Payment Method" lines from the office's saved payment details.
function paymentLines() {
  const p = PAYMENT_INFO || {};
  const out = [];
  if (p.zelle?.enabled && p.zelle.email) out.push(`Zelle: ${esc(p.zelle.email)}`);
  if (p.bank?.enabled && (p.bank.bankName || p.bank.accountNumber)) {
    if (p.bank.bankName) out.push(`Bank: ${esc(p.bank.bankName)}`);
    if (p.bank.accountName) out.push(`Account Name: ${esc(p.bank.accountName)}`);
    if (p.bank.accountNumber) out.push(`Account Number: ${esc(p.bank.accountNumber)}`);
    if (p.bank.routingNumber) out.push(`Routing (ACH): ${esc(p.bank.routingNumber)}`);
  }
  if (p.check?.enabled && p.check.payableTo) out.push(`Checks payable to: ${esc(p.check.payableTo)}`);
  return out;
}

// Small inline icons for the footer band (kept as SVG so they render identically
// in the browser, in print, and in the generated PDF).
const FOOT_ICONS = [
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2c1.5 4-2.5 5-2.5 8.5A4.5 4.5 0 0 0 14 15c2.2 0 3.8-1.6 3.8-3.9 0-3.6-3.6-5.2-5.8-9.1z"/><path d="M9 14c-1 1-1.6 2.2-1.6 3.4A4.6 4.6 0 0 0 12 22c-1.4-2 .4-3.4.4-5.2 0-1-.5-2-1.4-2.8z"/></svg>',
  '<svg viewBox="0 0 24 24" width="20" height="20" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>',
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="#ff3b30"><path d="M12 2c1.5 4-2.5 5-2.5 8.5A4.5 4.5 0 0 0 14 15c2.2 0 3.8-1.6 3.8-3.9 0-3.6-3.6-5.2-5.8-9.1z"/><path d="M9 14c-1 1-1.6 2.2-1.6 3.4A4.6 4.6 0 0 0 12 22c-1.4-2 .4-3.4.4-5.2 0-1-.5-2-1.4-2.8z"/></svg>',
  '<svg viewBox="0 0 24 24" width="20" height="20" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h9"/></svg>',
  '<svg viewBox="0 0 24 24" width="20" height="20" stroke="#fff" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="2.2"/><path d="M12 10c0-4 1-6 3-6s2.6 3 .6 5M14 12c4 0 6 1 6 3s-3 2.6-5 .6M12 14c0 4-1 6-3 6s-2.6-3-.6-5M10 12c-4 0-6-1-6-3s3-2.6 5-.6"/></svg>',
];

// Builds the full branded HTML document. Set autoPrint to open the print dialog
// automatically (for "Download PDF"); leave it off for an on-screen preview.
// `receipt` (optional) makes this a receipt for ONE specific payment: its own
// RCT number, that payment's amount/method/date, and the balance left afterwards.
// Without it, a receipt summarises every payment on the invoice.
export function buildDocumentHtml({ kind, doc, business = {}, customer = {}, receipt = null }, { autoPrint = false } = {}) {
  const isReceipt = kind === 'receipt';
  const isInvoice = kind === 'invoice' || isReceipt;
  const isQuote = kind === 'quote';
  const payments = doc.payments || [];
  const lastPaidAt = receipt ? receipt.paid_at : (payments.length ? payments[payments.length - 1].paid_at : null);
  const title = isReceipt ? 'RECEIPT' : isInvoice ? 'INVOICE' : 'ESTIMATE';
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const number = receipt ? receipt.receipt_number : (isInvoice ? doc.invoice_number : doc.quote_number);

  const total = Number(doc.total) || 0;
  const paidTotal = receipt ? (Number(receipt.amount) || 0) : payments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = receipt ? Math.max(0, Number(receipt.balance_after) || 0) : Math.max(0, total - paidTotal);

  // Line items — description (with optional note and qty x unit price) + amount.
  const rows = (doc.items || []).map(it => {
    const q = Number(it.quantity) || 0;
    const unit = Number(it.unit_price) || 0;
    const detail = q && unit ? `<div class="d-qty">${q} &times; ${money(unit)}</div>` : '';
    return `<tr>
      <td class="desc">${esc(it.description)}${it.note ? `<div class="d-note">${sanitizeRich(it.note)}</div>` : ''}${detail}</td>
      <td class="amt">${money(it.total)}</td>
    </tr>`;
  }).join('');
  // Keep the table looking like the printed form even with only a couple of lines.
  const minRows = Math.max(0, 4 - (doc.items || []).length);
  const filler = Array.from({ length: minRows }, () => '<tr><td class="desc">&nbsp;</td><td class="amt"></td></tr>').join('');

  const custLoc = [customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  const svcAddr = doc.service_address || doc.job_address || customer.address || '';
  const svcLoc = doc.service_city || custLoc;

  // Tax percentage for the "TAX (x%)" label.
  let taxPct = Number(doc.tax_rate);
  if (!taxPct && doc.subtotal) taxPct = Number(doc.tax_amount) / Number(doc.subtotal);
  const taxLabel = taxPct ? `TAX (${(taxPct * 100).toFixed(3).replace(/\.?0+$/, '')}%)` : 'TAX';

  // Tick the payment method actually used (falls back to "Other").
  const usedMethod = (receipt ? receipt.method : (payments.length ? payments[payments.length - 1].method : doc.payment_method)) || '';
  const m = String(usedMethod).toLowerCase().replace(/[\s-]/g, '_');
  const isChecked = (key) => (key === 'other'
    ? !!m && !['cash', 'credit_card', 'check', 'cheque'].includes(m)
    : key === 'check' ? (m === 'check' || m === 'cheque') : m === key);
  const box = (key, label, extra = '') =>
    `<div class="pm"><span class="cb">${isChecked(key) ? '&#10005;' : ''}</span>${label}${extra}</div>`;
  const otherLabelExtra = isChecked('other') && m
    ? ` <span class="pm-other">${esc(String(usedMethod).replace(/_/g, ' '))}</span>` : ' <span class="pm-line"></span>';

  const notesText = doc.notes ? sanitizeRich(doc.notes) : '';
  // A receipt is already paid, so it carries no payment terms.
  const footerNote = isReceipt ? ''
    : isInvoice ? 'PAYMENT IS DUE UPON RECEIPT. THANK YOU!'
    : 'THIS ESTIMATE IS VALID FOR 30 DAYS.';

  const dateRow3 = isReceipt
    ? `<div class="mrow"><span class="mlabel">Payment Date:</span><span class="mval">${fmtDate(lastPaidAt)}</span></div>`
    : isInvoice
      ? `<div class="mrow"><span class="mlabel">Due Date:</span><span class="mval">${doc.due_date ? fmtDate(doc.due_date) : '&mdash;'}</span></div>`
      : `<div class="mrow"><span class="mlabel">Valid Until:</span><span class="mval">${doc.expiry_date ? fmtDate(doc.expiry_date) : '&mdash;'}</span></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(number || title)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Poppins', 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; font-size: 13px; line-height: 1.5; }
    .page { max-width: 820px; margin: 0 auto; padding: 34px 40px 0; position: relative; }
    /* Masthead */
    .brand { text-align: center; margin-bottom: 4px; }
    .brand img { height: 96px; display: inline-block; }
    .title-wrap { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 6px 0 18px; }
    .title-wrap .rule { height: 3px; width: 120px; background: #0b2265; border-radius: 2px; }
    h1.title { margin: 0; font-size: 46px; line-height: 1; font-weight: 800; letter-spacing: 1px; color: #0b2265; }
    /* Meta */
    .meta { width: 62%; margin-left: auto; }
    .mrow { display: flex; align-items: baseline; gap: 10px; margin-bottom: 7px; }
    .mlabel { font-weight: 700; color: #111; white-space: nowrap; }
    .mval { flex: 1; border-bottom: 1px solid #111; padding-left: 6px; min-height: 18px; }
    .divider { border-top: 1px solid #999; margin: 14px 0 14px; }
    /* Blocks */
    .block { margin-bottom: 12px; }
    .block h2 { margin: 0 0 8px; font-size: 14px; font-weight: 800; color: #0b2265; letter-spacing: .02em; }
    .frow { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; max-width: 88%; }
    .flabel { min-width: 118px; color: #111; }
    .fval { flex: 1; border-bottom: 1px solid #111; padding-left: 6px; min-height: 17px; }
    /* Items table */
    table.items { width: 100%; border-collapse: collapse; margin: 14px 0 16px; }
    table.items th { background: #0b2265; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .04em; padding: 10px 12px; border: 1px solid #0b2265; }
    table.items th.amt, table.items td.amt { text-align: center; width: 32%; }
    table.items td { border: 1px solid #111; padding: 9px 12px; vertical-align: top; height: 34px; }
    .d-note { font-size: 11.5px; color: #444; margin-top: 2px; }
    .d-qty { font-size: 11.5px; color: #666; margin-top: 2px; }
    /* Lower band: payment method | notes | totals */
    .lower { display: flex; gap: 18px; align-items: flex-start; }
    .pm-col { width: 27%; }
    .pm-col h3, .notes-col h3 { margin: 0 0 10px; font-size: 13px; font-weight: 800; color: #0b2265; }
    .pm { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
    .cb { width: 15px; height: 15px; border: 1.5px solid #111; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #0b2265; flex: none; }
    .pm-line { display: inline-block; width: 74px; border-bottom: 1px solid #111; }
    .pm-other { text-transform: capitalize; border-bottom: 1px solid #111; padding: 0 4px; }
    .notes-col { width: 24%; border-left: 1px solid #ccc; padding-left: 16px; }
    .notes-box { border: 1px solid #111; border-radius: 4px; min-height: 118px; padding: 8px; font-size: 11.5px; white-space: pre-wrap; }
    .tot-col { flex: 1; }
    table.tot { width: 100%; border-collapse: collapse; }
    table.tot td { border: 1px solid #111; padding: 9px 12px; font-size: 13px; }
    table.tot td.lbl { font-weight: 600; }
    table.tot td.val { width: 45%; }
    table.tot tr.grand td { background: #0b2265; color: #fff; font-weight: 800; border-color: #0b2265; }
    table.tot tr.due td { background: #d81f26; color: #fff; font-weight: 800; border-color: #d81f26; }
    table.tot tr.settled td { background: #0f7a3d; color: #fff; font-weight: 800; border-color: #0f7a3d; }
    /* Thanks */
    .thanks { text-align: center; margin: 22px 0 4px; display: flex; align-items: center; justify-content: center; gap: 16px; }
    .thanks .rule { height: 2px; width: 110px; background: #d81f26; }
    .thanks .script { font-family: 'Brush Script MT', 'Snell Roundhand', cursive; font-size: 36px; color: #d81f26; line-height: 1; }
    .thanks-sub { text-align: center; font-weight: 700; letter-spacing: .04em; font-size: 14px; }
    .terms { text-align: center; font-size: 12.5px; margin: 6px 0 18px; }
    /* Sign-off */
    .signoff { display: flex; gap: 40px; margin-bottom: 16px; }
    .signoff .frow { flex: 1; max-width: none; }
    /* Footer band */
    .footband { background: #0b2265; color: #fff; padding: 12px 0 10px; text-align: center; margin: 0 -40px; }
    .footband .icons { display: flex; align-items: center; justify-content: center; gap: 0; margin-bottom: 6px; }
    .footband .icons span.sep { width: 1px; height: 22px; background: rgba(255,255,255,.45); margin: 0 26px; display: inline-block; }
    .footband .tag { font-size: 13px; letter-spacing: .06em; font-weight: 600; }
    @media print { .page { padding: 18px 26px 0; } table.items tr { page-break-inside: avoid; } .footband { margin: 0 -26px; } }
  </style></head><body>
    <div class="page">
      <div class="brand"><img src="${LOGO_URL}" alt="${esc(bizName)}" /></div>

      <div class="title-wrap"><span class="rule"></span><h1 class="title">${title}</h1><span class="rule"></span></div>

      <div class="meta">
        <div class="mrow"><span class="mlabel">${isReceipt ? 'Receipt' : isQuote ? 'Estimate' : 'Invoice'} #:</span><span class="mval">${esc(number || '')}</span></div>
        ${receipt ? `<div class="mrow"><span class="mlabel">For Invoice #:</span><span class="mval">${esc(receipt.invoice_number || doc.invoice_number || '')}</span></div>` : ''}
        <div class="mrow"><span class="mlabel">Date:</span><span class="mval">${fmtDate(doc.issue_date)}</span></div>
        ${dateRow3}
      </div>

      <div class="divider"></div>

      <div class="block">
        <h2>BILL TO:</h2>
        <div class="frow"><span class="flabel">Name:</span><span class="fval">${esc(customer.name || '')}</span></div>
        <div class="frow"><span class="flabel">Address:</span><span class="fval">${esc(customer.address || '')}</span></div>
        <div class="frow"><span class="flabel">City, State, ZIP:</span><span class="fval">${esc(custLoc)}</span></div>
        <div class="frow"><span class="flabel">Phone:</span><span class="fval">${esc(customer.phone || '')}</span></div>
        <div class="frow"><span class="flabel">Email:</span><span class="fval">${esc(customer.email || '')}</span></div>
      </div>

      <div class="divider"></div>

      <div class="block">
        <h2>SERVICE LOCATION:</h2>
        <div class="frow"><span class="flabel">Address:</span><span class="fval">${esc(svcAddr)}</span></div>
        <div class="frow"><span class="flabel">City, State, ZIP:</span><span class="fval">${esc(svcLoc)}</span></div>
        <div class="frow"><span class="flabel">Phone:</span><span class="fval">${esc(customer.phone || '')}</span></div>
        <div class="frow"><span class="flabel">Technician:</span><span class="fval">${esc(doc.technician_name || '')}</span></div>
      </div>

      <table class="items">
        <thead><tr><th>DESCRIPTION</th><th class="amt">AMOUNT</th></tr></thead>
        <tbody>${rows}${filler}</tbody>
      </table>

      <div class="lower">
        <div class="pm-col">
          <h3>PAYMENT METHOD:</h3>
          ${box('cash', 'Cash')}
          ${box('credit_card', 'Credit Card')}
          ${box('check', 'Check')}
          ${box('other', 'Other', otherLabelExtra)}
        </div>
        <div class="notes-col">
          <h3>NOTES:</h3>
          <div class="notes-box">${notesText}</div>
        </div>
        <div class="tot-col">
          <table class="tot">
            <tr><td class="lbl">SUBTOTAL</td><td class="val">${money(doc.subtotal)}</td></tr>
            ${doc.discount ? `<tr><td class="lbl">DISCOUNT</td><td class="val">&minus;${money(doc.discount)}</td></tr>` : ''}
            <tr><td class="lbl">${taxLabel}</td><td class="val">${money(doc.tax_amount)}</td></tr>
            <tr class="grand"><td class="lbl">TOTAL</td><td class="val">${money(total)}</td></tr>
            <tr><td class="lbl">AMOUNT PAID</td><td class="val">${money(paidTotal)}</td></tr>
            <tr class="${balance > 0 ? 'due' : 'settled'}"><td class="lbl">BALANCE DUE</td><td class="val">${money(balance)}</td></tr>
          </table>
        </div>
      </div>

      <div class="thanks"><span class="rule"></span><span class="script">Thank You!</span><span class="rule"></span></div>
      <div class="thanks-sub">FOR YOUR BUSINESS!</div>
      ${footerNote ? `<div class="terms">${footerNote}</div>` : '<div style="height:14px"></div>'}

      <div class="signoff">
        <div class="frow"><span class="flabel" style="min-width:96px">Prepared By:</span><span class="fval">${esc(doc.prepared_by || bizName)}</span></div>
        <div class="frow"><span class="flabel" style="min-width:46px">Date:</span><span class="fval">${fmtDate(doc.issue_date)}</span></div>
      </div>

      <div class="footband">
        <div class="icons">${FOOT_ICONS.join('<span class="sep"></span>')}</div>
        <div class="tag">HVAC SOLUTIONS YOU CAN TRUST.</div>
      </div>
    </div>
    ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' : ''}
  </body></html>`;

  return html;
}

// Builds a branded customer account statement (a summary of a customer's invoices
// and outstanding balance), styled to match the invoice/receipt documents.
export function buildStatementHtml({ business = {}, customer = {}, invoices = [] }, { autoPrint = true } = {}) {
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const owe = (i) => (['paid', 'cancelled'].includes(String(i.status || '').toLowerCase()) ? 0 : (i.balance != null ? i.balance : (i.total || 0)));
  const outstanding = invoices.reduce((s, i) => s + owe(i), 0);
  const custLoc = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  const bizAddr = (business.address || '').split('\n').map(esc).join('<br>');

  const rows = invoices.length
    ? invoices.map(i => {
        const bal = owe(i);
        return `<tr>
          <td class="desc">${esc(i.invoice_number || '')}</td>
          <td>${esc(i.issue_date || '')}</td>
          <td>${esc(i.due_date || '')}</td>
          <td class="r">${money(i.total)}</td>
          <td style="text-transform:capitalize">${esc(i.status || '')}</td>
          <td class="r" style="${bal > 0 ? 'color:#b45309;font-weight:700' : 'color:#94a3b8'}">${money(bal)}</td>
        </tr>`;
      }).join('')
    : '<tr><td class="desc" colspan="6" style="color:#94a3b8">No invoices on file</td></tr>';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${esc(customer.name || bizName)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; }
    .topbar { height: 7px; background: linear-gradient(90deg, #1e3a8a, #3b82f6); }
    .page { max-width: 780px; margin: 0 auto; padding: 46px 44px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 36px; }
    .brand img { height: 44px; margin-bottom: 10px; display: block; }
    .brand .biz { font-weight: 800; font-size: 15px; color: #0f172a; }
    .brand .biz-meta { color: #64748b; font-size: 12px; margin-top: 2px; }
    .doc-title { text-align: right; }
    .doc-title h1 { margin: 0; font-size: 30px; letter-spacing: 3px; color: #1d4ed8; font-weight: 800; }
    .doc-title .num { margin-top: 4px; font-size: 13px; color: #64748b; }
    .parties { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 26px; }
    .label { text-transform: uppercase; font-size: 10px; letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px; font-weight: 700; }
    .parties .name { font-weight: 700; color: #0f172a; }
    .parties .line { color: #475569; }
    .dates { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; overflow: hidden; border-radius: 8px; }
    thead th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .06em; color: #fff; background: #1e3a8a; padding: 11px 12px; font-weight: 700; }
    thead th.r { text-align: right; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid #eef2f7; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    td.r { text-align: right; white-space: nowrap; }
    td.desc { color: #0f172a; font-weight: 600; }
    .grand { width: 300px; margin-left: auto; margin-top: 14px; background: #1e3a8a; color: #fff; border-radius: 8px; padding: 13px 16px; display: flex; justify-content: space-between; font-weight: 800; font-size: 16px; }
    .thanks { margin-top: 34px; font-size: 14px; color: #0f172a; font-weight: 700; }
    .foot { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print { .page { padding: 26px 30px; } tbody tr { page-break-inside: avoid; } }
  </style></head><body>
    <div class="topbar"></div>
    <div class="page">
      <div class="head">
        <div class="brand">
          <img src="${LOGO_URL}" alt="${esc(bizName)}" />
          <div class="biz">${esc(bizName)}</div>
          <div class="biz-meta">
            ${bizAddr ? bizAddr + '<br>' : ''}
            ${esc(business.phone || '')}${business.phone && business.email ? ' · ' : ''}${esc(business.email || '')}
            ${business.website ? `<br>${esc(business.website)}` : ''}
          </div>
        </div>
        <div class="doc-title">
          <h1>STATEMENT</h1>
          <div class="num">${esc(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</div>
        </div>
      </div>

      <div class="parties">
        <div class="col">
          <div class="label">Statement For</div>
          <div class="name">${esc(customer.name || '')}</div>
          ${customer.email ? `<div class="line">${esc(customer.email)}</div>` : ''}
          ${customer.phone ? `<div class="line">${esc(customer.phone)}</div>` : ''}
          ${custLoc ? `<div class="line">${esc(custLoc)}</div>` : ''}
        </div>
        <div class="col dates">
          <div class="label">Account Summary</div>
          <div class="line">${invoices.length} invoice${invoices.length === 1 ? '' : 's'} on file</div>
        </div>
      </div>

      <table>
        <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th class="r">Total</th><th>Status</th><th class="r">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="grand"><span>Total balance due</span><span>${money(outstanding)}</span></div>

      <div class="thanks">Thank you for your business!</div>
      <div class="foot">${esc(bizName)}${business.phone ? ' · ' + esc(business.phone) : ''}${business.email ? ' · ' + esc(business.email) : ''}${business.website ? ' · ' + esc(business.website) : ''}</div>
    </div>
    ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' : ''}
  </body></html>`;
}

// Fetches the logo once and caches it as a data URL, so the PDF renderer (which
// can't reach across origins) always embeds it. Returns null if it can't be loaded.
let _logoData;
async function logoDataUrl() {
  if (_logoData !== undefined) return _logoData;
  try {
    const res = await fetch(LOGO_URL, { mode: 'cors' });
    const blob = await res.blob();
    _logoData = await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { _logoData = null; }
  return _logoData;
}

// Generates a real PDF of the invoice/estimate and shares it via the device's
// native share sheet — so the user can send it straight to WhatsApp, Mail, etc.
// Works in the app and on mobile browsers (Web Share API with files). On desktop
// (or anywhere file-sharing isn't supported) it downloads the PDF instead.
// Returns { shared: bool } or throws on a real failure.
export async function sharePdf(opts) {
  const { kind, doc } = opts;
  const number = kind === 'invoice' || kind === 'receipt' ? doc.invoice_number : doc.quote_number;
  const label = kind === 'quote' ? 'Estimate' : kind === 'receipt' ? 'Receipt' : 'Invoice';
  const filename = `${label}-${(number || 'document').toString().replace(/[^\w.-]+/g, '_')}.pdf`;

  // Can this device share files (mobile share sheet with WhatsApp, Mail, etc.)?
  let canShareFiles = false;
  try {
    const probe = new File([new Blob(['%PDF-'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' });
    canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch { canShareFiles = false; }

  // Desktop (or anywhere file-sharing isn't supported): use the browser's own
  // print-to-PDF engine — crisp, vector, selectable text. Far more professional
  // than a rasterized screenshot. The in-app preview offers "Save as PDF".
  if (!canShareFiles) {
    printDocument(opts);
    return { shared: false, method: 'print' };
  }

  // Mobile: render a high-resolution PDF file and open the native share sheet.
  let html = buildDocumentHtml(opts, { autoPrint: false });
  const logo = await logoDataUrl();
  if (logo) html = html.split(LOGO_URL).join(logo); // inline the logo for the renderer

  // Render off-screen in the MAIN document (not an iframe) so html2canvas can read
  // the styles. The CSS is scoped to a `.pdf-body` wrapper so it never touches the app.
  let style = (html.match(/<style>([\s\S]*?)<\/style>/i) || [, ''])[1];
  const bodyInner = (html.match(/<body>([\s\S]*?)<\/body>/i) || [, html])[1].replace(/<script>[\s\S]*?<\/script>/gi, '');
  style = style
    .replace('* {', '.pdf-body, .pdf-body * {')
    .replace(/html,\s*body\s*\{/g, '.pdf-body {')
    .replace(/(^|[^-.\w])body\s*\{/g, '$1.pdf-body {');

  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;background:#fff;z-index:-1;';
  holder.innerHTML = `<style>${style}</style><div class="pdf-body">${bodyInner}</div>`;
  document.body.appendChild(holder);

  try {
    await new Promise((r) => setTimeout(r, 150)); // let layout settle
    const target = holder.querySelector('.page') || holder;

    const { default: html2pdf } = await import('html2pdf.js');
    const blob = await html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.95 }, // sharp, but keeps the file small enough to send
      html2canvas: { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', windowWidth: 816 },
      jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(target).outputPdf('blob');

    const file = new File([blob], filename, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], title: `${label} ${number || ''}`.trim() });
      return { shared: true, method: 'share' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { shared: false, method: 'cancel' };
      // Rare: sharing threw — fall back to a download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { shared: false, method: 'download' };
    }
  } finally {
    holder.remove();
  }
}

// Shows the document in a full-screen in-app preview with Print / Save-PDF and
// Close buttons. Works inside the native app (where pop-up windows are blocked)
// and in the browser. Tapping "Print / Save PDF" opens the system print/share
// sheet (iOS: AirPrint / "Save to Files"; desktop: the print → Save as PDF dialog).
export function printDocument(opts) {
  printHtml(buildDocumentHtml(opts, { autoPrint: false }));
}

// Shows arbitrary print-ready HTML in a full-screen in-app preview with
// Print / Save-PDF and Close buttons. Works in the native app (where pop-up
// windows are blocked) and in the browser. Any embedded auto-print script is
// stripped so it never fires on its own.
export function printHtml(rawHtml) {
  const html = String(rawHtml || '').replace(/<script>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, '');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;flex-direction:column;';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top));background:#1e293b;';

  const btn = (label, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `background:${bg};color:#fff;border:none;border-radius:8px;padding:9px 16px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer;`;
    return b;
  };
  const printBtn = btn('Print / Save PDF', '#2563eb');
  const closeBtn = btn('Close', '#334155');

  const frame = document.createElement('iframe');
  frame.style.cssText = 'flex:1;border:0;background:#fff;width:100%;';
  frame.setAttribute('srcdoc', html);

  bar.appendChild(printBtn);
  bar.appendChild(closeBtn);
  overlay.appendChild(bar);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);
  document.documentElement.classList.add('modal-open');

  const cleanup = () => { overlay.remove(); document.documentElement.classList.remove('modal-open'); };
  closeBtn.onclick = cleanup;
  printBtn.onclick = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { try { window.print(); } catch { /* ignore */ } }
  };
}
