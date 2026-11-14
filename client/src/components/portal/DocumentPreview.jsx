import { useEffect, useState } from 'react';
import { Modal, Btn } from '../UI';
import Logo from '../Logo';
import { Download, Phone, Mail, Globe, MapPin } from 'lucide-react';
import { buildDocumentHtml, downloadPdf, paymentLinesText, docTermsText, ESTIMATE_INFO_TEXT, docFooterText } from '../../lib/printDoc';
import { sanitizeRich } from '../../lib/richText';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
// Rich notes keep bold/underline AND the plain newlines typed by the office.
const Rich = ({ html, className = '' }) => (
  <div className={`whitespace-pre-line break-words [overflow-wrap:anywhere] ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeRich(html) }} />
);

// Below the lg breakpoint the modal is full-screen on a phone/tablet, where the
// fixed-width branded page can't fit — show the readable mobile layout instead.
function useNarrow(query = '(max-width: 1023px)') {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, [query]);
  return narrow;
}

const LABEL = { invoice: 'Invoice', receipt: 'Receipt', quote: 'Estimate' };

// Opens an invoice / receipt / estimate. Desktop keeps the branded page exactly as
// before; phones get a stacked, vertically-scrolling version of the same content.
// "Download PDF" always produces the branded PDF (share sheet on phones).
export default function DocumentPreviewModal({ view, onClose, business, customer }) {
  const narrow = useNarrow();
  const [downloading, setDownloading] = useState(false);
  if (!view) return null;
  const { kind, doc } = view;
  const opts = { kind, doc, business, customer };
  const number = doc.invoice_number || doc.quote_number || '';

  async function download() {
    setDownloading(true);
    try {
      const r = await downloadPdf(opts);
      if (r?.method === 'download') toast.success('PDF downloaded');
    } catch { toast.error('Could not create the PDF'); }
    finally { setDownloading(false); }
  }

  const footer = (
    <div className="flex gap-2 justify-end">
      <Btn variant="outline" className="shrink-0 justify-center" onClick={onClose}>Close</Btn>
      <Btn className="flex-1 sm:flex-none justify-center whitespace-nowrap" loading={downloading} onClick={download}><Download size={15} /> Download PDF</Btn>
    </div>
  );

  return (
    <Modal open onClose={onClose} size="xl" title={`${LABEL[kind] || 'Document'} ${number}`} footer={footer}>
      {narrow
        ? <MobileDocument kind={kind} doc={doc} business={business || {}} customer={customer || {}} />
        : <iframe title="Document preview" srcDoc={buildDocumentHtml(opts)} className="w-full h-[68vh] rounded-lg border border-slate-200 bg-white" />}
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <section className="py-4 border-t border-slate-200 first:border-t-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-900 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 font-medium break-words [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function TotalRow({ label, value, strong, tone }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'text-base font-bold' : 'text-sm'} ${tone || 'text-slate-700'}`}>
      <span className="min-w-0">{label}</span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

export function MobileDocument({ kind, doc, business, customer }) {
  const isReceipt = kind === 'receipt';
  const isInv = kind === 'invoice' || isReceipt;
  const bizName = business.name || 'Clarke Mechanical Inc.';
  const number = isInv ? doc.invoice_number : doc.quote_number;
  const payments = doc.payments || [];
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const total = Number(doc.total) || 0;
  const balance = Math.max(0, total - paid);
  const lastPay = payments.length ? payments[payments.length - 1] : null;

  let taxPct = Number(doc.tax_rate);
  if (!taxPct && doc.subtotal) taxPct = Number(doc.tax_amount) / Number(doc.subtotal);
  const taxLabel = taxPct ? `Tax (${(taxPct * 100).toFixed(3).replace(/\.?0+$/, '')}%)` : 'Tax';

  const custLoc = [customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
  const svcAddr = doc.service_address || doc.job_address || customer.address || '';
  const svcLoc = doc.service_city || custLoc;
  const title = isReceipt ? 'Receipt' : isInv ? 'Invoice' : 'Service Estimate';
  const footerNote = docFooterText(kind);
  const howToPay = paymentLinesText();

  return (
    <article className="text-slate-900 -mx-1">
      {/* Branded header */}
      <header className="rounded-xl bg-gradient-to-br from-blue-950 to-blue-800 text-white p-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-1.5 shrink-0"><Logo variant="icon" height={34} /></div>
          <div className="min-w-0">
            <p className="text-xs text-blue-200 truncate">{bizName}</p>
            <h2 className="text-xl font-extrabold tracking-wide uppercase leading-tight">{title}</h2>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div className="min-w-0"><dt className="text-blue-200">{isInv ? 'Invoice #' : 'Estimate #'}</dt><dd className="font-semibold break-all">{number || '—'}</dd></div>
          <div className="min-w-0"><dt className="text-blue-200">Date</dt><dd className="font-semibold">{fmtDate(doc.issue_date || doc.created_at)}</dd></div>
          {isReceipt
            ? <div className="min-w-0"><dt className="text-blue-200">Payment date</dt><dd className="font-semibold">{fmtDate(lastPay?.paid_at)}</dd></div>
            : isInv
              ? <div className="min-w-0"><dt className="text-blue-200">Due date</dt><dd className="font-semibold">{doc.due_date ? fmtDate(doc.due_date) : 'Upon receipt'}</dd></div>
              : <div className="min-w-0"><dt className="text-blue-200">Valid until</dt><dd className="font-semibold">{fmtDate(doc.expiry_date)}</dd></div>}
          {isReceipt && lastPay?.method && <div className="min-w-0"><dt className="text-blue-200">Method</dt><dd className="font-semibold capitalize">{String(lastPay.method).replace(/_/g, ' ')}</dd></div>}
        </dl>
      </header>

      <Section title={isInv ? 'Bill to' : 'Customer information'}>
        <dl>
          <Field label="Name" value={customer.name} />
          <Field label="Address" value={customer.address} />
          <Field label="City, State, ZIP" value={custLoc} />
          <Field label="Phone" value={customer.phone} />
          <Field label="Email" value={customer.email} />
        </dl>
      </Section>

      <Section title="Service location">
        <dl>
          <Field label="Name" value={doc.service_name || customer.name} />
          <Field label="Address" value={svcAddr} />
          <Field label="City, State, ZIP" value={svcLoc} />
          <Field label="Contact person" value={doc.contact_person} />
          <Field label="Technician" value={doc.technician_name} />
        </dl>
      </Section>

      <Section title={isInv ? 'Description of work' : 'Description of work'}>
        {(doc.items || []).length === 0 ? <p className="text-sm text-slate-500">No line items.</p> : (
          <ul className="space-y-3">
            {doc.items.map((it, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-sm font-semibold whitespace-pre-line break-words [overflow-wrap:anywhere]">{it.description || 'Item'}</p>
                {it.note && <Rich html={it.note} className="text-[13px] text-slate-700 leading-relaxed mt-1.5" />}
                <dl className="mt-2.5 grid grid-cols-3 gap-2 text-xs border-t border-slate-200 pt-2">
                  <div><dt className="text-slate-500">Qty</dt><dd className="font-semibold tabular-nums">{it.quantity ?? '—'}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-500">Unit price</dt><dd className="font-semibold tabular-nums break-all">{money(it.unit_price)}</dd></div>
                  <div className="min-w-0 text-right"><dt className="text-slate-500">Amount</dt><dd className="font-bold tabular-nums break-all">{money(it.total)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Totals">
        <div className="rounded-lg border border-slate-200 px-3 py-1">
          <TotalRow label="Subtotal" value={money(doc.subtotal)} />
          {Number(doc.discount) > 0 && <TotalRow label="Discount" value={`−${money(doc.discount)}`} tone="text-emerald-700" />}
          <TotalRow label={taxLabel} value={money(doc.tax_amount)} />
          <div className="border-t border-slate-200 mt-1">
            <TotalRow label={isInv ? 'Total' : 'Estimated total'} value={money(total)} strong />
          </div>
          {isInv && paid > 0 && <TotalRow label="Amount paid" value={`−${money(paid)}`} tone="text-emerald-700" />}
          {isInv && (
            <div className="border-t border-slate-200">
              <TotalRow label="Balance due" value={money(balance)} strong tone={balance > 0 ? 'text-orange-600' : 'text-emerald-700'} />
            </div>
          )}
          {!isInv && Number(doc.deposit) > 0 && <TotalRow label="Deposit requested" value={money(doc.deposit)} />}
        </div>
      </Section>

      {doc.notes && (
        <Section title={isInv ? 'Notes' : 'Scope of work / notes'}>
          <Rich html={doc.notes} className="text-sm text-slate-800 leading-relaxed" />
        </Section>
      )}

      {isInv && !isReceipt && (
        <Section title="How to pay">
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 break-words">
            {(howToPay.length ? howToPay : ['Please contact our office for payment details.']).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </Section>
      )}
      {!isInv && (
        <Section title="Important information">
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">{ESTIMATE_INFO_TEXT.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </Section>
      )}
      {!isReceipt && (
        <Section title="Terms & conditions">
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 break-words">
            {docTermsText({ isInv, number: number || '', bizName }).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </Section>
      )}

      {footerNote && <p className="text-center text-xs font-bold tracking-wide text-blue-900 py-3 border-t border-slate-200">{footerNote}</p>}

      <Section title="Prepared by">
        <dl>
          <Field label="Prepared by" value={doc.prepared_by || bizName} />
          <Field label="Date" value={fmtDate(doc.issue_date || doc.created_at)} />
        </dl>
      </Section>

      <footer className="rounded-xl bg-blue-950 text-blue-100 text-xs p-3 space-y-1.5 mb-2">
        {business.phone && <p className="flex items-center gap-2"><Phone size={13} className="shrink-0" /> {business.phone}</p>}
        {business.email && <p className="flex items-center gap-2 min-w-0"><Mail size={13} className="shrink-0" /> <span className="break-all">{business.email}</span></p>}
        {business.website && <p className="flex items-center gap-2 min-w-0"><Globe size={13} className="shrink-0" /> <span className="break-all">{business.website}</span></p>}
        {business.address && <p className="flex items-start gap-2"><MapPin size={13} className="shrink-0 mt-0.5" /> {business.address}</p>}
      </footer>
    </article>
  );
}
