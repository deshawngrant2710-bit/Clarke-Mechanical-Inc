/*
 * Branded PDF renderer for invoices, estimates and receipts.
 *
 * Draws the document directly with jsPDF (real vector text — selectable,
 * searchable, sharp at any zoom, and a fraction of the size of a screenshot).
 * No DOM is used, so the identical logic also runs on the server to attach the
 * same PDF to outgoing emails.  ── keep in sync with functions/lib/pdfDoc.js ──
 */

// ---- Brand ----
const NAVY = [11, 34, 101];
const RED = [216, 31, 38];
const GREEN = [15, 122, 61];
const INK = [17, 17, 17];
const MUTED = [90, 96, 106];
const LINE = [205, 209, 215];

const PAGE = { w: 612, h: 792, m: 44 };           // US Letter, points
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/**
 * Build the document.
 * @param jsPDFCtor the jsPDF constructor (passed in so this file stays env-agnostic)
 * @param opts { kind, doc, business, customer, receipt, logo }  logo = dataURL (optional)
 */
export function renderPdf(jsPDFCtor, { kind, doc = {}, business = {}, customer = {}, receipt = null, logo = null }) {
  const pdf = new jsPDFCtor({ unit: 'pt', format: 'letter', compress: true });
  const isReceipt = kind === 'receipt';
  const isQuote = kind === 'quote';
  const isInvoice = !isReceipt && !isQuote;

  const title = isReceipt ? 'RECEIPT' : isQuote ? 'SERVICE ESTIMATE' : 'INVOICE';
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const number = receipt ? receipt.receipt_number : (isQuote ? doc.quote_number : doc.invoice_number);

  const payments = doc.payments || [];
  const total = Number(doc.total) || 0;
  const paid = receipt ? (Number(receipt.amount) || 0) : payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = receipt ? Math.max(0, Number(receipt.balance_after) || 0) : Math.max(0, total - paid);

  let y = PAGE.m;
  const L = PAGE.m;
  const R = PAGE.w - PAGE.m;

  const setFont = (size, style = 'normal', color = INK) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };
  const line = (x1, y1, x2, y2, color = LINE, w = 0.8) => {
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(w);
    pdf.line(x1, y1, x2, y2);
  };
  const box = (x, yy, w, h, color) => { pdf.setFillColor(color[0], color[1], color[2]); pdf.rect(x, yy, w, h, 'F'); };

  /* ---------------- Header ---------------- */
  let logoDrawn = false;
  if (logo) {
    // The brand lockup is 480x264 (≈1.82:1); keep that ratio so it never distorts.
    try { pdf.addImage(logo, 'PNG', L, y - 6, 148, 81, undefined, 'FAST'); logoDrawn = true; } catch { /* fall back to text */ }
  }
  if (!logoDrawn) {
    setFont(17, 'bold', NAVY);
    pdf.text('CLARKE MECHANICAL', L, y + 14);
    setFont(8.5, 'normal', MUTED);
    pdf.text('HVAC  -  HEATING  -  VENTILATION', L, y + 26);
  }

  setFont(24, 'bold', NAVY);
  pdf.text(title, R, y + 22, { align: 'right' });

  y += logoDrawn ? 84 : 52;
  line(L, y, R, y, NAVY, 2);
  y += 18;

  /* ---------------- Meta (right column) ---------------- */
  const metaRows = [
    [`${isReceipt ? 'Receipt' : isQuote ? 'Estimate' : 'Invoice'} #`, number || ''],
    ...(receipt ? [['For invoice', receipt.invoice_number || doc.invoice_number || '']] : []),
    ['Date', fmtDate(doc.issue_date)],
    isReceipt ? ['Payment date', fmtDate(receipt ? receipt.paid_at : (payments.length ? payments[payments.length - 1].paid_at : null))]
      : isQuote ? ['Valid until', fmtDate(doc.expiry_date)]
      : ['Due date', fmtDate(doc.due_date)],
  ];

  /* ---------------- Parties (left) ---------------- */
  const bill = [
    customer.name,
    customer.address,
    [customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
    customer.phone,
    customer.email,
  ].filter(Boolean);

  const topY = y;
  setFont(8.5, 'bold', MUTED);
  pdf.text(isInvoice || isReceipt ? 'BILL TO' : 'CUSTOMER', L, y);
  y += 14;
  bill.forEach((t, i) => {
    setFont(i === 0 ? 10.5 : 9.5, i === 0 ? 'bold' : 'normal', i === 0 ? INK : MUTED);
    pdf.text(String(t), L, y);
    y += i === 0 ? 14 : 12;
  });
  const leftEnd = y;

  // meta on the right, aligned with the Bill To block
  let my = topY;
  metaRows.forEach(([label, val]) => {
    setFont(8.5, 'bold', MUTED);
    pdf.text(String(label).toUpperCase(), R - 150, my);
    setFont(9.5, 'normal', INK);
    pdf.text(String(val || '—'), R, my, { align: 'right' });
    my += 15;
  });

  y = Math.max(leftEnd, my) + 16;

  /* ---------------- Items table ---------------- */
  const cols = { desc: L, qty: R - 210, unit: R - 140, amt: R };
  box(L, y, R - L, 22, NAVY);
  setFont(8.5, 'bold', [255, 255, 255]);
  pdf.text('DESCRIPTION', cols.desc + 8, y + 15);
  pdf.text('QTY', cols.qty, y + 15, { align: 'right' });
  pdf.text('UNIT PRICE', cols.unit + 46, y + 15, { align: 'right' });
  pdf.text('AMOUNT', cols.amt - 8, y + 15, { align: 'right' });
  y += 22;

  const items = doc.items || [];
  const newPage = () => { pdf.addPage(); y = PAGE.m; };

  items.forEach((it) => {
    const desc = plain(it.description);
    const note = plain(it.note);
    const descLines = pdf.splitTextToSize(desc, cols.qty - cols.desc - 26);
    const noteLines = note ? pdf.splitTextToSize(note, cols.qty - cols.desc - 26) : [];
    const rowH = Math.max(24, 10 + descLines.length * 12 + noteLines.length * 10);

    if (y + rowH > PAGE.h - 150) newPage();

    setFont(9.5, 'normal', INK);
    pdf.text(descLines, cols.desc + 8, y + 14);
    let ny = y + 14 + descLines.length * 12;
    if (noteLines.length) {
      setFont(8.5, 'italic', MUTED);
      pdf.text(noteLines, cols.desc + 8, ny - 2);
      ny += noteLines.length * 10;
    }
    setFont(9.5, 'normal', MUTED);
    pdf.text(String(it.quantity ?? ''), cols.qty, y + 14, { align: 'right' });
    pdf.text(money(it.unit_price), cols.unit + 46, y + 14, { align: 'right' });
    setFont(9.5, 'bold', INK);
    pdf.text(money(it.total), cols.amt - 8, y + 14, { align: 'right' });

    y += rowH;
    line(L, y, R, y);
  });

  if (!items.length) {
    setFont(9.5, 'italic', MUTED);
    pdf.text('No line items', cols.desc + 8, y + 16);
    y += 28;
    line(L, y, R, y);
  }

  /* ---------------- Totals ---------------- */
  if (y > PAGE.h - 230) newPage();
  y += 16;

  const tx = R - 220;
  const totRow = (label, value, opts = {}) => {
    setFont(opts.big ? 10.5 : 9.5, opts.bold ? 'bold' : 'normal', opts.color || MUTED);
    pdf.text(label, tx, y);
    setFont(opts.big ? 10.5 : 9.5, opts.bold ? 'bold' : 'normal', opts.color || INK);
    pdf.text(value, R, y, { align: 'right' });
    y += opts.gap || 16;
  };

  totRow('Subtotal', money(doc.subtotal));
  if (doc.discount) totRow('Discount', `-${money(doc.discount)}`);
  let taxPct = Number(doc.tax_rate);
  if (!taxPct && doc.subtotal) taxPct = Number(doc.tax_amount) / Number(doc.subtotal);
  totRow(taxPct ? `Tax (${(taxPct * 100).toFixed(3).replace(/\.?0+$/, '')}%)` : 'Tax', money(doc.tax_amount));

  // Grand total bar
  box(tx - 12, y - 12, R - tx + 12, 26, NAVY);
  setFont(11, 'bold', [255, 255, 255]);
  pdf.text(isQuote ? 'ESTIMATED TOTAL' : 'TOTAL', tx, y + 5);
  pdf.text(money(total), R - 8, y + 5, { align: 'right' });
  y += 32;

  if (!isQuote && paid > 0) {
    totRow('Amount paid', `-${money(paid)}`, { color: GREEN });
    const barColor = balance > 0 ? RED : GREEN;
    box(tx - 12, y - 12, R - tx + 12, 26, barColor);
    setFont(11, 'bold', [255, 255, 255]);
    pdf.text('BALANCE DUE', tx, y + 5);
    pdf.text(money(balance), R - 8, y + 5, { align: 'right' });
    y += 34;
  } else if (isQuote && doc.deposit) {
    totRow('Deposit requested', money(doc.deposit));
  }

  /* ---------------- Notes ---------------- */
  const notes = plain(doc.notes);
  if (notes) {
    if (y > PAGE.h - 160) newPage();
    y += 8;
    setFont(8.5, 'bold', MUTED);
    pdf.text(isQuote ? 'SCOPE OF WORK / NOTES' : 'NOTES', L, y);
    y += 13;
    setFont(9, 'normal', INK);
    const nl = pdf.splitTextToSize(notes, R - L);
    pdf.text(nl, L, y);
    y += nl.length * 12 + 6;
  }

  /* ---------------- How to pay (invoices) ---------------- */
  if (isInvoice && Array.isArray(business.paymentLines) && business.paymentLines.length) {
    if (y > PAGE.h - 150) newPage();
    y += 6;
    setFont(8.5, 'bold', MUTED);
    pdf.text('HOW TO PAY', L, y);
    y += 13;
    setFont(9, 'normal', INK);
    business.paymentLines.forEach((t) => { pdf.text(plain(t), L, y); y += 12; });
  }

  /* ---------------- Footer band on every page ---------------- */
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    const fy = PAGE.h - 58;
    box(0, fy, PAGE.w, 58, NAVY);
    setFont(8.5, 'normal', [235, 240, 250]);
    const contact = [business.phone, business.email, business.website].filter(Boolean).join('   •   ');
    pdf.text(contact || bizName, PAGE.w / 2, fy + 22, { align: 'center' });
    setFont(9, 'bold', [255, 255, 255]);
    pdf.text('HVAC SOLUTIONS YOU CAN TRUST.', PAGE.w / 2, fy + 38, { align: 'center' });
    if (pages > 1) {
      setFont(8, 'normal', [190, 200, 220]);
      pdf.text(`Page ${i} of ${pages}`, R, fy - 8, { align: 'right' });
    }
  }

  pdf.setProperties({
    title: `${title} ${number || ''}`.trim(),
    subject: `${title} from ${bizName}`,
    author: bizName,
    creator: bizName,
  });
  return pdf;
}

// Loads the print logo once and keeps it cached as a data URL.
// Served from the app's own origin, so it works offline-ish, in the iOS app and
// on the website without any CORS setup.
let _logo;
export async function loadPdfLogo() {
  if (_logo !== undefined) return _logo;
  try {
    const res = await fetch('/pdf-logo.png');
    if (!res.ok) throw new Error('not found');
    const blob = await res.blob();
    _logo = await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { _logo = null; }
  return _logo;
}

// Filename used for downloads, shares and email attachments.
export function pdfFilename({ kind, doc = {}, receipt = null }) {
  const label = kind === 'quote' ? 'Estimate' : kind === 'receipt' ? 'Receipt' : 'Invoice';
  const num = receipt ? receipt.receipt_number : (kind === 'quote' ? doc.quote_number : doc.invoice_number);
  return `${label}-${String(num || 'document').replace(/[^\w.-]+/g, '_')}.pdf`;
}
