// Opens a clean, branded printable view of an invoice or quote and triggers the
// browser's print dialog (→ "Save as PDF"). No dependencies, works everywhere.
const LOGO_URL = 'https://clarke-mechanical-inc.web.app/email-logo.png';
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function printDocument({ kind, doc, business = {}, customer = {} }) {
  const isInvoice = kind === 'invoice';
  const number = isInvoice ? doc.invoice_number : doc.quote_number;
  const title = isInvoice ? 'INVOICE' : 'ESTIMATE';
  const dateLabel = isInvoice ? 'Due Date' : 'Valid Until';
  const dateVal = isInvoice ? doc.due_date : doc.expiry_date;
  const rows = (doc.items || []).map(it => `
    <tr>
      <td>${esc(it.description)}</td>
      <td class="r">${it.quantity}</td>
      <td class="r">${money(it.unit_price)}</td>
      <td class="r">${money(it.total)}</td>
    </tr>`).join('');
  const loc = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .head img { height: 46px; }
    .title { text-align: right; }
    .title h1 { margin: 0; font-size: 26px; letter-spacing: 2px; color: #1d4ed8; }
    .title .num { font-weight: 700; font-size: 15px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; }
    .label { text-transform: uppercase; font-size: 10px; letter-spacing: .06em; color: #94a3b8; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; color: #94a3b8; border-bottom: 2px solid #e2e8f0; padding: 8px 6px; }
    td { padding: 9px 6px; border-bottom: 1px solid #f1f5f9; }
    .r { text-align: right; }
    .totals { width: 240px; margin-left: auto; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
    .totals .grand { border-top: 2px solid #e2e8f0; margin-top: 4px; padding-top: 8px; font-weight: 800; font-size: 16px; }
    .foot { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 12px; color: #64748b; }
    @media print { body { padding: 24px; } }
  </style></head><body>
    <div class="head">
      <img src="${LOGO_URL}" alt="${esc(business.name || 'Clarke Mechanical')}" />
      <div class="title"><h1>${title}</h1><div class="num">${esc(number)}</div></div>
    </div>
    <div class="meta">
      <div>
        <div class="label">Billed To</div>
        <div><strong>${esc(customer.name || '')}</strong></div>
        <div>${esc(customer.email || '')}</div>
        <div>${esc(customer.phone || '')}</div>
        <div>${esc(loc)}</div>
      </div>
      <div style="text-align:right">
        <div class="label">Issue Date</div><div>${esc(doc.issue_date || '—')}</div>
        <div class="label" style="margin-top:8px">${dateLabel}</div><div>${esc(dateVal || '—')}</div>
        <div class="label" style="margin-top:8px">Status</div><div style="text-transform:capitalize">${esc(doc.status)}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${money(doc.subtotal)}</span></div>
      <div><span>Tax</span><span>${money(doc.tax_amount)}</span></div>
      <div class="grand"><span>Total</span><span>${money(doc.total)}</span></div>
    </div>
    <div class="foot">${esc(business.name || 'Clarke Mechanical Inc.')} · ${esc(business.phone || '')} · ${esc(business.email || '')}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return alert('Please allow pop-ups to download the PDF.');
  w.document.write(html);
  w.document.close();
}
