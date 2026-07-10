import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Badge, Modal, Input, Select, Spinner } from '../components/UI';
import { ArrowLeft, DollarSign, Send, CheckCircle2, Receipt, Mail, BellRing } from 'lucide-react';
import Logo from '../components/Logo';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'cash', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);

  function load() { api.get(`/billing/invoices/${id}`).then(r => setInvoice(r.data)); }
  useEffect(load, [id]);

  async function emailInvoice() {
    setEmailing(true);
    try { await sendEmail('invoice', id, 'Invoice'); load(); } catch { /* toast handled */ }
    finally { setEmailing(false); }
  }
  async function emailReceipt() {
    setEmailing(true);
    try { await sendEmail('receipt', id, 'Receipt'); } catch { /* toast handled */ }
    finally { setEmailing(false); }
  }
  async function sendReminder() {
    setEmailing(true);
    try { await api.post(`/billing/invoices/${id}/remind`); toast.success('Payment reminder sent'); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not send reminder'); }
    finally { setEmailing(false); }
  }

  async function handleMarkSent() {
    await api.put(`/billing/invoices/${id}`, { ...invoice, items: invoice.items, status: 'sent' });
    toast.success('Marked as sent'); load();
  }
  async function handlePayment() {
    if (!pay.amount) return toast.error('Amount required');
    setSaving(true);
    try {
      await api.post(`/billing/invoices/${id}/payments`, pay);
      toast.success('Payment recorded');
      setPayModal(false);
      setPay({ amount: '', method: 'cash', reference: '', notes: '' });
      load();
    } catch { toast.error('Error recording payment'); }
    finally { setSaving(false); }
  }

  if (!invoice) return <Spinner />;
  const amountPaid = invoice.payments?.reduce((s, p) => s + p.amount, 0) || 0;
  const balance = invoice.total - amountPaid;
  const steps = [
    { key: 'draft', label: 'Draft', icon: Receipt },
    { key: 'sent', label: 'Sent', icon: Send },
    { key: 'paid', label: 'Paid', icon: CheckCircle2 },
  ];
  const activeIdx = invoice.status === 'paid' ? 2 : invoice.status === 'sent' ? 1 : 0;

  return (
    <div className="animate-fade-in">
      <button onClick={() => navigate('/invoices')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to invoices
      </button>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Invoice document */}
        <div className="lg:col-span-2">
          <Card className="p-8">
            <div className="flex justify-between items-start mb-8">
              <Logo variant="full" height={48} />
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{invoice.invoice_number}</p>
                <div className="mt-1 flex justify-end"><Badge status={invoice.status} /></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wider">Bill To</p>
                <p className="font-semibold text-slate-800">{invoice.customer_name || '—'}</p>
                {invoice.customer_email && <p className="text-sm text-slate-500">{invoice.customer_email}</p>}
                {invoice.customer_phone && <p className="text-sm text-slate-500">{invoice.customer_phone}</p>}
                {invoice.customer_address && <p className="text-sm text-slate-500">{invoice.customer_address}</p>}
              </div>
              <div className="text-right space-y-2">
                <div><p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Issue Date</p><p className="text-sm text-slate-700">{invoice.issue_date || '—'}</p></div>
                <div><p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Due Date</p><p className="text-sm text-slate-700">{invoice.due_date || '—'}</p></div>
              </div>
            </div>

            <table className="w-full text-sm mb-6">
              <thead><tr className="border-b border-slate-200 text-left">
                <th className="pb-2.5 text-xs text-slate-500 font-semibold uppercase tracking-wider">Description</th>
                <th className="pb-2.5 text-xs text-slate-500 font-semibold uppercase tracking-wider text-right w-16">Qty</th>
                <th className="pb-2.5 text-xs text-slate-500 font-semibold uppercase tracking-wider text-right w-28">Unit Price</th>
                <th className="pb-2.5 text-xs text-slate-500 font-semibold uppercase tracking-wider text-right w-28">Total</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items?.map(item => (
                  <tr key={item.id}>
                    <td className="py-3 text-slate-700">{item.description}</td>
                    <td className="py-3 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-3 text-right text-slate-600">{money(item.unit_price)}</td>
                    <td className="py-3 text-right font-medium text-slate-800">{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 text-sm space-y-1.5">
                <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
                <div className="flex justify-between text-slate-600"><span>Tax</span><span>{money(invoice.tax_amount)}</span></div>
                <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200 text-base"><span>Total</span><span>{money(invoice.total)}</span></div>
                {amountPaid > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span>−{money(amountPaid)}</span></div>}
                {balance > 0 && <div className="flex justify-between text-orange-600 font-semibold pt-1"><span>Balance Due</span><span>{money(balance)}</span></div>}
              </div>
            </div>
            {invoice.notes && <div className="mt-8 pt-4 border-t border-slate-100"><p className="text-xs text-slate-400 uppercase font-semibold mb-1">Notes</p><p className="text-sm text-slate-600">{invoice.notes}</p></div>}
          </Card>
        </div>

        {/* Sticky summary panel */}
        <div className="space-y-6 lg:sticky lg:top-8">
          <Card className="p-5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Balance Due</p>
            <p className={`text-3xl font-bold tracking-tight ${balance > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>{money(balance)}</p>
            <p className="text-xs text-slate-400 mt-1">of {money(invoice.total)} total</p>

            {/* Timeline */}
            <div className="flex items-center justify-between mt-6 mb-6">
              {steps.map((s, i) => {
                const done = i <= activeIdx;
                const Icon = s.icon;
                return (
                  <div key={s.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${done ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Icon size={14} /></div>
                      <span className={`text-[10px] mt-1 font-medium ${done ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
                    </div>
                    {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 -mt-4 ${i < activeIdx ? 'bg-blue-600' : 'bg-slate-100'}`} />}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Btn variant="outline" className="w-full" onClick={emailInvoice} loading={emailing}><Mail size={15} /> Email Invoice to Customer</Btn>
              {invoice.status === 'draft' && <Btn variant="ghost" className="w-full" onClick={handleMarkSent}><Send size={15} /> Mark as Sent</Btn>}
              {invoice.status !== 'paid' && invoice.status !== 'cancelled' && <Btn variant="outline" className="w-full" onClick={sendReminder} loading={emailing}><BellRing size={15} /> Send Payment Reminder</Btn>}
              {invoice.status !== 'paid' && <Btn className="w-full" onClick={() => setPayModal(true)}><DollarSign size={16} /> Record Payment</Btn>}
              {invoice.status === 'paid' && <>
                <div className="text-center py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg flex items-center justify-center gap-1.5"><CheckCircle2 size={15} /> Paid in full</div>
                <Btn variant="outline" className="w-full" onClick={emailReceipt} loading={emailing}><Mail size={15} /> Email Receipt</Btn>
              </>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment History" icon={<Receipt size={15} />} />
            <div className="p-4">
              {!invoice.payments?.length ? (
                <p className="text-sm text-slate-400 text-center py-3">No payments recorded</p>
              ) : (
                <div className="space-y-2">
                  {invoice.payments.map(p => {
                    const online = /online/i.test(p.notes || '') || String(p.reference || '').startsWith('pi_');
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-emerald-700">{money(p.amount)}</p>
                          <p className="text-xs text-slate-500"><span className="capitalize">{p.method?.replace('_', ' ')}</span> · {p.paid_at?.slice(0, 10)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {online && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">Paid online</span>}
                          {p.reference && <span className="text-[11px] text-slate-400 truncate max-w-[130px]">#{p.reference}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Record Payment" subtitle={`Balance due: ${money(balance)}`}>
        <div className="space-y-3">
          <Input label="Amount ($)" type="number" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} placeholder={`Max: ${money(balance)}`} />
          <Select label="Payment Method" value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="credit_card">Credit Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </Select>
          <Input label="Reference / Check #" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setPayModal(false)}>Cancel</Btn>
            <Btn variant="success" onClick={handlePayment} loading={saving}>{saving ? 'Saving…' : 'Record Payment'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
