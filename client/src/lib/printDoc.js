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

// Builds the full branded HTML document. Set autoPrint to open the print dialog
// automatically (for "Download PDF"); leave it off for an on-screen preview.
export function buildDocumentHtml({ kind, doc, business = {}, customer = {} }, { autoPrint = false } = {}) {
  const isReceipt = kind === 'receipt';
  const isInvoice = kind === 'invoice' || isReceipt;
  const number = isInvoice ? doc.invoice_number : doc.quote_number;
  const payments = doc.payments || [];
  const lastPaidAt = payments.length ? payments[payments.length - 1].paid_at : null;
  const title = isReceipt ? 'RECEIPT' : kind === 'invoice' ? 'INVOICE' : 'ESTIMATE';
  const dateLabel = isReceipt ? 'Paid On' : kind === 'invoice' ? 'Due Date' : 'Valid Until';
  const dateVal = isReceipt ? (lastPaidAt ? String(lastPaidAt).slice(0, 10) : '—') : (kind === 'invoice' ? doc.due_date : doc.expiry_date);
  const bizName = business.name || 'Clarke Mechanical Inc.';

  const st = String(doc.status || '').toLowerCase();
  const isPaid = st === 'paid' || isReceipt;
  let badgeClass = 'other';
  let badgeText = doc.status || '';
  if (isPaid) { badgeClass = 'paid'; badgeText = 'Paid'; }
  else if (kind === 'invoice') { badgeClass = 'unpaid'; badgeText = st === 'overdue' ? 'Overdue' : 'Unpaid'; }
  const statusBadge = (doc.status || isReceipt) ? `<span class="badge ${badgeClass}">${esc(badgeText)}</span>` : '';

  const paidTotal = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const paymentRows = payments.map(p => `
    <div class="prow"><span><span style="text-transform:capitalize">${esc((p.method || 'payment').replace('_', ' '))}</span> · ${esc(String(p.paid_at || '').slice(0, 10))}${p.reference ? ` · #${esc(p.reference)}` : ''}</span><span>${money(p.amount)}</span></div>`).join('');
  const receiptBlock = isReceipt ? `
    <div class="receipt">
      <div class="label" style="margin-bottom:8px">Payment received</div>
      ${paymentRows || `<div class="prow"><span>Payment</span><span>${money(doc.total)}</span></div>`}
      <div class="prow prow-total"><span>Total paid</span><span>${money(paidTotal || doc.total)}</span></div>
    </div>` : '';

  const rows = (doc.items || []).map(it => `
    <tr>
      <td class="desc"><span class="d-name">${esc(it.description)}</span>${it.note ? `<div class="d-note">${sanitizeRich(it.note)}</div>` : ''}</td>
      <td class="r">${money(it.unit_price)}</td>
      <td class="c">${it.quantity}</td>
      <td class="r">${money(it.total)}</td>
    </tr>`).join('');
  const custLoc = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  const bizAddr = (business.address || '').split('\n').map(s => s.trim()).filter(Boolean);

  // Tax percentage for the "Tax (x%)" label.
  let taxPct = Number(doc.tax_rate);
  if (!taxPct && doc.subtotal) taxPct = Number(doc.tax_amount) / Number(doc.subtotal);
  const taxLabel = taxPct ? `Tax (${(taxPct * 100).toFixed(3).replace(/\.?0+$/, '')}%)` : 'Tax';

  const notesText = doc.notes
    ? sanitizeRich(doc.notes)
    : (kind === 'invoice' ? 'Payment is due within 15 days of receiving this invoice. Thank you for your business.'
      : kind === 'quote' ? 'This estimate is valid for 30 days. Prices subject to change after expiration.'
      : 'Thank you for your business.');

  const payLines = paymentLines();
  const preparedBy = business.website || business.email || '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(number || title)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 13px; line-height: 1.55; }
    .page { max-width: 800px; margin: 0 auto; padding: 54px 52px 40px; position: relative; min-height: 1040px; }
    /* Header */
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 40px; }
    .doc-title h1 { margin: 0 0 10px; font-size: 40px; letter-spacing: 1px; color: #111827; font-weight: 800; line-height: 1; }
    .doc-title .meta { font-size: 13px; color: #374151; }
    .doc-title .meta div { margin-top: 2px; }
    .badge { display: inline-block; margin-top: 12px; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
    .badge.paid { background: #dcfce7; color: #15803d; }
    .badge.unpaid { background: #fef3c7; color: #b45309; }
    .badge.other { background: #e5e7eb; color: #4b5563; text-transform: capitalize; }
    .logo { text-align: right; flex-shrink: 0; }
    .logo img { height: 66px; display: block; margin-left: auto; }
    /* Parties */
    .parties { display: flex; gap: 40px; margin-bottom: 34px; }
    .parties .col { flex: 1; }
    .label { text-transform: uppercase; font-size: 11px; letter-spacing: .04em; color: #111827; margin-bottom: 8px; font-weight: 800; }
    .parties .line { color: #374151; }
    /* Items table */
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 26px; }
    table.items th { text-align: left; font-size: 12px; font-weight: 800; color: #111827; padding: 12px 14px; border: 1px solid #d1d5db; background: #f9fafb; }
    table.items th.r { text-align: right; }
    table.items th.c { text-align: center; }
    table.items td { padding: 12px 14px; border: 1px solid #d1d5db; vertical-align: top; }
    table.items td.r { text-align: right; white-space: nowrap; }
    table.items td.c { text-align: center; }
    .d-name { color: #111827; }
    .d-note { font-size: 12px; color: #4b5563; margin-top: 3px; }
    /* Notes + totals row */
    .lower { display: flex; justify-content: space-between; gap: 40px; align-items: flex-start; margin-bottom: 40px; }
    .notes { flex: 1; max-width: 340px; }
    .notes .body { color: #374151; white-space: pre-wrap; }
    .totals { width: 300px; flex-shrink: 0; border: 1px solid #d1d5db; border-radius: 2px; }
    .totals .row { display: flex; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid #d1d5db; color: #374151; }
    .totals .row:last-child { border-bottom: 0; }
    .totals .grand { font-weight: 800; font-size: 15px; color: #111827; background: #f9fafb; }
    .receipt { margin: 0 0 34px auto; width: 320px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px 16px; }
    .receipt .prow { display: flex; justify-content: space-between; padding: 4px 0; color: #065f46; font-size: 13px; }
    .receipt .prow-total { margin-top: 6px; padding-top: 8px; border-top: 1px solid #a7f3d0; font-weight: 800; font-size: 15px; }
    /* Footer */
    .footcols { display: flex; gap: 40px; margin-top: 8px; }
    .footcols .col { flex: 1; }
    .footcols .line { color: #374151; }
    .accent { position: absolute; left: 52px; right: 52px; bottom: 20px; height: 8px; border-radius: 2px; background: #1e3a8a; }
    @media print { .page { padding: 30px 34px 40px; min-height: 0; } .accent { left: 34px; right: 34px; } table.items tr { page-break-inside: avoid; } }
  </style></head><body>
    <div class="page">
      <div class="head">
        <div class="doc-title">
          <h1>${title}</h1>
          <div class="meta">
            <div>${kind === 'invoice' ? 'Invoice' : kind === 'quote' ? 'Estimate' : 'Receipt'} Number: #${esc(number || '')}</div>
            <div>${kind === 'quote' ? 'Estimate' : 'Invoice'} Date: ${fmtDate(doc.issue_date)}</div>
            <div>${esc(dateLabel)}: ${dateVal ? fmtDate(dateVal) : '—'}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="logo"><img src="${LOGO_URL}" alt="${esc(bizName)}" /></div>
      </div>

      <div class="parties">
        <div class="col">
          <div class="label">${esc(bizName)}</div>
          ${bizAddr.map(l => `<div class="line">${esc(l)}</div>`).join('')}
          ${business.phone ? `<div class="line">${esc(business.phone)}</div>` : ''}
          ${business.email ? `<div class="line">${esc(business.email)}</div>` : ''}
        </div>
        <div class="col">
          <div class="label">Bill To</div>
          <div class="line" style="font-weight:700;color:#111827">${esc(customer.name || '')}</div>
          ${custLoc ? `<div class="line">${esc(custLoc)}</div>` : ''}
          ${customer.phone ? `<div class="line">${esc(customer.phone)}</div>` : ''}
          ${customer.email ? `<div class="line">${esc(customer.email)}</div>` : ''}
        </div>
      </div>

      <table class="items">
        <thead><tr><th>Item &amp; Description</th><th class="r">Unit Price</th><th class="c">Qty</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows || '<tr><td class="desc" colspan="4" style="color:#9ca3af">No line items</td></tr>'}</tbody>
      </table>

      <div class="lower">
        <div class="notes">
          <div class="label">Notes / Terms:</div>
          <div class="body">${notesText}</div>
        </div>
        <div class="totals">
          <div class="row"><span>Sub-Total</span><span>${money(doc.subtotal)}</span></div>
          ${doc.discount ? `<div class="row"><span>Discount</span><span>−${money(doc.discount)}</span></div>` : ''}
          <div class="row"><span>${taxLabel}</span><span>${money(doc.tax_amount)}</span></div>
          <div class="row grand"><span>Total</span><span>${money(doc.total)}</span></div>
          ${isInvoice && !isPaid && paidTotal ? `<div class="row"><span>Amount Paid</span><span>−${money(paidTotal)}</span></div><div class="row grand"><span>Balance Due</span><span>${money((doc.total || 0) - paidTotal)}</span></div>` : ''}
          ${doc.deposit ? `<div class="row"><span>Deposit Requested</span><span>${money(doc.deposit)}</span></div>` : ''}
        </div>
      </div>

      ${receiptBlock}

      <div class="footcols">
        <div class="col">
          <div class="label">Payment Method</div>
          ${payLines.length ? payLines.map(l => `<div class="line">${l}</div>`).join('') : '<div class="line">Contact our office for payment details.</div>'}
        </div>
        <div class="col">
          <div class="label">Prepared By</div>
          <div class="line" style="font-weight:700;color:#111827">${esc(bizName)}</div>
          ${preparedBy ? `<div class="line">${esc(preparedBy)}</div>` : ''}
          ${business.phone ? `<div class="line">${esc(business.phone)}</div>` : ''}
        </div>
      </div>

      <div class="accent"></div>
    </div>
    ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' : ''}
  </body></html>`;

  return html;
}

// Builds a branded customer account statement (a summary of a customer's invoices
// and outstanding balance), styled to match the invoice/receipt documents.
export function buildStatementHtml({ business = {}, customer = {}, invoices = [] }, { autoPrint = true } = {}) {
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const owe = (i) => (['paid', 'cancelled'].includes(String(i.status || '').toLowerCase()) ? 0 : (i.total || 0));
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
