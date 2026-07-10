// Opens a clean, branded printable view of an invoice or quote and triggers the
// browser's print dialog (→ "Save as PDF"). No dependencies, works everywhere.
const LOGO_URL = 'https://clarke-mechanical-inc.web.app/email-logo.png';
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
      <td class="desc">${esc(it.description)}</td>
      <td class="r">${it.quantity}</td>
      <td class="r">${money(it.unit_price)}</td>
      <td class="r">${money(it.total)}</td>
    </tr>`).join('');
  const loc = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(number || title)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; }
    .topbar { height: 7px; background: linear-gradient(90deg, #1e3a8a, #3b82f6); }
    .page { max-width: 780px; margin: 0 auto; padding: 46px 44px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 38px; }
    .brand img { height: 44px; margin-bottom: 10px; display: block; }
    .brand .biz { font-weight: 800; font-size: 15px; color: #0f172a; }
    .brand .biz-meta { color: #64748b; font-size: 12px; margin-top: 2px; }
    .doc-title { text-align: right; }
    .doc-title h1 { margin: 0; font-size: 30px; letter-spacing: 3px; color: #1d4ed8; font-weight: 800; }
    .doc-title .num { margin-top: 4px; font-size: 13px; color: #64748b; }
    .doc-title .num b { color: #0f172a; }
    .badge { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
    .badge.paid { background: #dcfce7; color: #15803d; }
    .badge.unpaid { background: #fef3c7; color: #b45309; }
    .badge.other { background: #e2e8f0; color: #475569; text-transform: capitalize; }
    .parties { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 28px; }
    .parties .col { flex: 1; }
    .label { text-transform: uppercase; font-size: 10px; letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px; font-weight: 700; }
    .parties .name { font-weight: 700; color: #0f172a; }
    .parties .line { color: #475569; }
    .dates { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; overflow: hidden; border-radius: 8px; }
    thead th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .06em; color: #fff; background: #1e3a8a; padding: 11px 12px; font-weight: 700; }
    thead th.r { text-align: right; }
    tbody td { padding: 11px 12px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    td.r { text-align: right; white-space: nowrap; }
    td.desc { color: #0f172a; }
    .totals { width: 280px; margin-left: auto; margin-top: 14px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 12px; color: #475569; }
    .totals .grand { margin-top: 6px; background: #1e3a8a; color: #fff; border-radius: 8px; padding: 13px 14px; display: flex; justify-content: space-between; font-weight: 800; font-size: 16px; }
    .receipt { margin-top: 20px; margin-left: auto; width: 320px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 14px 16px; }
    .receipt .prow { display: flex; justify-content: space-between; padding: 4px 0; color: #065f46; font-size: 13px; }
    .receipt .prow-total { margin-top: 6px; padding-top: 8px; border-top: 1px solid #a7f3d0; font-weight: 800; font-size: 15px; }
    .notes { margin-top: 34px; }
    .notes .body { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 8px; padding: 12px 14px; color: #475569; white-space: pre-wrap; }
    .thanks { margin-top: 36px; font-size: 15px; color: #0f172a; font-weight: 700; }
    .foot { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }
    .foot img { height: 30px; margin-bottom: 10px; opacity: .9; }
    @media print { .page { padding: 26px 30px; } tbody tr { page-break-inside: avoid; } }
  </style></head><body>
    <div class="topbar"></div>
    <div class="page">
      <div class="head">
        <div class="brand">
          <img src="${LOGO_URL}" alt="${esc(bizName)}" />
          <div class="biz">${esc(bizName)}</div>
          <div class="biz-meta">${esc(business.phone || '')}${business.phone && business.email ? ' · ' : ''}${esc(business.email || '')}</div>
        </div>
        <div class="doc-title">
          <h1>${title}</h1>
          <div class="num"># <b>${esc(number || '')}</b></div>
          ${statusBadge}
        </div>
      </div>

      <div class="parties">
        <div class="col">
          <div class="label">Billed To</div>
          <div class="name">${esc(customer.name || '')}</div>
          ${customer.email ? `<div class="line">${esc(customer.email)}</div>` : ''}
          ${customer.phone ? `<div class="line">${esc(customer.phone)}</div>` : ''}
          ${loc ? `<div class="line">${esc(loc)}</div>` : ''}
        </div>
        <div class="col dates">
          <div class="label">Issue Date</div>
          <div class="line">${esc(doc.issue_date || '—')}</div>
          <div class="label" style="margin-top:12px">${dateLabel}</div>
          <div class="line">${esc(dateVal || '—')}</div>
        </div>
      </div>

      <table>
        <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows || '<tr><td class="desc" colspan="4" style="color:#94a3b8">No line items</td></tr>'}</tbody>
      </table>

      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${money(doc.subtotal)}</span></div>
        <div class="row"><span>Tax</span><span>${money(doc.tax_amount)}</span></div>
        <div class="grand"><span>${isInvoice && !isPaid ? 'Amount Due' : 'Total'}</span><span>${money(doc.total)}</span></div>
      </div>

      ${receiptBlock}

      ${doc.notes ? `<div class="notes"><div class="label">Notes</div><div class="body">${esc(doc.notes)}</div></div>` : ''}

      <div class="thanks">Thank you for your business!</div>
      <div class="foot">
        <img src="${LOGO_URL}" alt="${esc(bizName)}" />
        <div>${esc(bizName)}${business.phone ? ' · ' + esc(business.phone) : ''}${business.email ? ' · ' + esc(business.email) : ''}${isInvoice ? ' · Pay securely online anytime through your customer portal.' : ''}</div>
      </div>
    </div>
    ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' : ''}
  </body></html>`;

  return html;
}

// Opens a new tab and triggers the print dialog (→ "Save as PDF").
export function printDocument(opts) {
  const html = buildDocumentHtml(opts, { autoPrint: true });
  const w = window.open('', '_blank');
  if (!w) return alert('Please allow pop-ups to download the PDF.');
  w.document.write(html);
  w.document.close();
}
