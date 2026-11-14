import { Card, CardHeader, Badge, Btn, Empty } from '../UI';
import { sanitizeRich } from '../../lib/richText';
import { isPayable, amountDue, amountPaid } from '../../lib/payable';
import { FileText, ClipboardList, ChevronDown, CreditCard, Eye, Receipt, Download, Check, X } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shared by the dashboard (Portal) and the Billing & Invoices page so both stay in
// lockstep. Mobile-first: nothing here may make the page wider than the screen.

// Collapsed row: identity on the left (wraps), amount + status stacked on the right.
function RowHeader({ open, onClick, title, subtitle, amount, status, extra }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      className="w-full flex items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-slate-50 text-left">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 break-all">{title}</p>
        <p className="text-xs text-slate-500 break-words">{subtitle}</p>
        {/* Phones: status under the identity so long numbers/amounts keep their room. */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 sm:hidden">{extra}<Badge status={status} /></div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0 max-w-[48%]">
        <span className="text-sm font-semibold text-slate-800 tabular-nums break-all text-right">{amount}</span>
        <div className="hidden sm:flex items-center gap-1.5">
          {extra}
          <Badge status={status} />
        </div>
      </div>
      <ChevronDown size={16} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

// Line items — each one labeled, descriptions/notes keep their paragraph breaks.
export function LineItems({ items }) {
  if (!items?.length) return <p className="text-sm text-slate-500 py-2">No line items.</p>;
  return (
    <ul className="divide-y divide-slate-200/70">
      {items.map((it, i) => (
        <li key={i} className="py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 font-medium whitespace-pre-line break-words [overflow-wrap:anywhere]">{it.description}</p>
            {it.note && (
              <div className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]"
                dangerouslySetInnerHTML={{ __html: sanitizeRich(it.note) }} />
            )}
            <p className="text-xs text-slate-500 mt-1 tabular-nums">Qty {it.quantity ?? 1} × {money(it.unit_price ?? (Number(it.total) / (Number(it.quantity) || 1)))}</p>
          </div>
          <span className="text-sm font-semibold text-slate-800 tabular-nums whitespace-nowrap">{money(it.total)}</span>
        </li>
      ))}
    </ul>
  );
}

// Totals in their own block: full width on phones, a right-hand column from sm up.
export function Totals({ doc, kind = 'invoice' }) {
  const isInv = kind === 'invoice';
  const paid = isInv ? amountPaid(doc) : 0;
  const due = isInv ? amountDue(doc) : 0;
  const row = (label, value, cls = 'text-slate-600') => (
    <div className={`flex items-baseline justify-between gap-4 ${cls}`}><span>{label}</span><span className="tabular-nums whitespace-nowrap">{value}</span></div>
  );
  return (
    <div className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-1 text-sm">
      {row('Subtotal', money(doc.subtotal))}
      {Number(doc.discount) > 0 && row('Discount', `−${money(doc.discount)}`, 'text-emerald-600')}
      {row('Tax', money(doc.tax_amount))}
      <div className="border-t border-slate-200 pt-1">{row(isInv ? 'Total' : 'Estimated total', money(doc.total), 'font-bold text-slate-900')}</div>
      {isInv && paid > 0 && row('Paid', `−${money(paid)}`, 'text-emerald-600')}
      {isInv && paid > 0 && row('Balance due', money(due), `font-bold ${due > 0 ? 'text-orange-600' : 'text-emerald-600'}`)}
    </div>
  );
}

// Buttons wrap into rows on phones (each at least ~half width), inline on desktop.
function Actions({ children }) {
  return <div className="flex flex-wrap gap-2 [&>*]:flex-1 [&>*]:min-w-[8.5rem] [&>*]:justify-center sm:[&>*]:flex-none sm:[&>*]:min-w-0">{children}</div>;
}

export function InvoiceList({ invoices, expanded, onToggle, onPay, onView, onDownload }) {
  return (
    <Card>
      <CardHeader title="Invoices" icon={<FileText size={15} />} />
      {invoices.length === 0 ? <Empty icon={<FileText size={24} />} title="No invoices" message="Your invoices will appear here." /> : (
        <div className="divide-y divide-slate-100">
          {invoices.map(inv => {
            const open = expanded === inv.id;
            const payable = isPayable(inv);
            const due = amountDue(inv);
            return (
              <div key={inv.id}>
                <RowHeader open={open} onClick={() => onToggle(inv.id)}
                  title={inv.invoice_number}
                  subtitle={`Issued ${inv.issue_date || 'N/A'} · Due ${inv.due_date || 'on receipt'}`}
                  amount={money(inv.total)} status={inv.status}
                  extra={payable && due < Number(inv.total) ? <span className="text-[11px] text-orange-600 font-medium whitespace-nowrap">{money(due)} due</span> : null} />
                {open && (
                  <div className="px-4 sm:px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                    <LineItems items={inv.items} />
                    {/* Phones: totals block, then buttons. Desktop: buttons left, totals right. */}
                    <div className="mt-2 pt-3 border-t border-slate-200 flex flex-col gap-3 sm:flex-row-reverse sm:items-end sm:justify-between">
                      <Totals doc={inv} kind="invoice" />
                      <Actions>
                        {payable && <Btn size="sm" onClick={() => onPay(inv)}><CreditCard size={14} /> Pay {money(due)}</Btn>}
                        <Btn size="sm" variant="outline" onClick={() => onView({ kind: 'invoice', doc: inv })}><Eye size={14} /> View</Btn>
                        {inv.status === 'paid' && <Btn size="sm" variant="outline" onClick={() => onView({ kind: 'receipt', doc: inv })}><Receipt size={14} /> Receipt</Btn>}
                        <Btn size="sm" variant="outline" onClick={() => onDownload({ kind: 'invoice', doc: inv })}><Download size={14} /> Download PDF</Btn>
                      </Actions>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function EstimateList({ quotes, expanded, onToggle, onView, onDownload, onRespond }) {
  return (
    <Card>
      <CardHeader title="Estimates" icon={<ClipboardList size={15} />} />
      {quotes.length === 0 ? <Empty icon={<ClipboardList size={24} />} title="No estimates" message="Estimates we send you will appear here — you can accept or decline them online." /> : (
        <div className="divide-y divide-slate-100">
          {quotes.map(q => {
            const open = expanded === q.id;
            const pending = ['sent', 'draft'].includes(q.status);
            return (
              <div key={q.id}>
                <RowHeader open={open} onClick={() => onToggle(q.id)}
                  title={q.quote_number} subtitle={`Expires ${q.expiry_date || 'N/A'}`}
                  amount={money(q.total)} status={q.status} />
                {open && (
                  <div className="px-4 sm:px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                    <LineItems items={q.items} />
                    <div className="mt-2 pt-3 border-t border-slate-200 flex flex-col gap-3 sm:flex-row-reverse sm:items-end sm:justify-between">
                      <Totals doc={q} kind="quote" />
                      <div className="space-y-2 min-w-0">
                        {!pending && <p className={`text-sm font-medium ${q.status === 'accepted' ? 'text-emerald-600' : 'text-slate-500'}`}>You {q.status} this estimate.</p>}
                        <Actions>
                          {pending && <Btn size="sm" variant="success" onClick={() => onRespond(q, 'accepted')}><Check size={14} /> Accept Estimate</Btn>}
                          {pending && <Btn size="sm" variant="outline" onClick={() => onRespond(q, 'declined')}><X size={14} /> Decline</Btn>}
                          <Btn size="sm" variant="outline" onClick={() => onView({ kind: 'quote', doc: q })}><Eye size={14} /> View</Btn>
                          <Btn size="sm" variant="outline" onClick={() => onDownload({ kind: 'quote', doc: q })}><Download size={14} /> Download PDF</Btn>
                        </Actions>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
