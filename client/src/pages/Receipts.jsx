import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, StatCard, Empty, Spinner, Btn, SearchInput, Modal, Input, Select, Textarea } from '../components/UI';
import { Receipt, DollarSign, Search, Printer, Share2, Mail, Download, FileText, Plus, MessageCircle } from 'lucide-react';
import { printDocument, sharePdf } from '../lib/printDoc';
import toast from 'react-hot-toast';

const telDigits = (p) => { let d = String(p || '').replace(/[^\d]/g, ''); if (d.length === 10) d = '1' + d; return d; };

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : '');
const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export default function Receipts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('all');
  const [busy, setBusy] = useState('');
  const [customers, setCustomers] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  function load() { api.get('/billing/receipts').then(r => setRows(r.data)).catch(() => setRows([])); }
  useEffect(load, []);
  useEffect(() => { api.get('/customers').then(r => setCustomers(r.data)).catch(() => {}); }, []);

  const openCreate = () => { setForm({ customer_id: '', customer_name: '', amount: '', method: 'cash', reference: '', description: '', paid_at: new Date().toISOString().slice(0, 10) }); setCreateOpen(true); };
  async function createReceipt() {
    if (!(Number(form.amount) > 0)) return toast.error('Enter an amount greater than zero');
    if (!form.customer_id && !form.customer_name.trim()) return toast.error('Choose a customer or type a name');
    setSaving(true);
    try {
      await api.post('/billing/receipts', { ...form, paid_at: form.paid_at ? new Date(form.paid_at + 'T12:00:00').toISOString() : undefined });
      toast.success('Receipt created — not sent. Use Email or WhatsApp to send it.');
      setCreateOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not create receipt'); } finally { setSaving(false); }
  }

  // Send to WhatsApp as a PDF. On a phone the native share sheet includes
  // WhatsApp (sends the actual PDF). On desktop the PDF downloads and we open
  // WhatsApp so the file can be attached.
  async function whatsapp(e, r) {
    e.stopPropagation();
    setBusy(r.id);
    try {
      const full = await loadFull(r);
      const res = await sharePdf(full);
      if (res.method === 'download') {
        toast.success('Receipt PDF downloaded — attach it in WhatsApp');
        const phone = telDigits(full.customer?.phone);
        window.open(`https://wa.me/${phone}`, '_blank', 'noopener');
      } else if (res.method === 'print') {
        toast('Save the PDF, then attach it in WhatsApp', { icon: '📄' });
      }
    } catch { toast.error('Could not prepare the receipt PDF'); } finally { setBusy(''); }
  }

  const months = useMemo(() => {
    if (!rows) return [];
    return Array.from(new Set(rows.map(r => monthKey(r.paid_at)).filter(Boolean))).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (month !== 'all' && monthKey(r.paid_at) !== month) return false;
      if (!needle) return true;
      return [r.receipt_number, r.invoice_number, r.customer_name, r.reference]
        .some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [rows, q, month]);

  const total = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // Fetches the full record (receipt + invoice + customer) so the printed page
  // shows the real line items, not just the payment.
  async function loadFull(r) {
    const [{ data }, biz] = await Promise.all([
      api.get(`/billing/receipts/${r.id}`),
      api.get('/auth/public-info').catch(() => ({ data: {} })),
    ]);
    const b = biz.data || {};
    // Manual receipts have no invoice — build a one-line doc from the receipt so
    // the PDF shows WHAT it was for (description), not just the total.
    const rec = data.receipt || r;
    const amt = Number(rec.amount) || 0;
    const desc = rec.description || r.description || 'Payment received';
    const manualDoc = {
      invoice_number: rec.invoice_number || null,
      total: amt, subtotal: amt,
      items: [{ description: desc, quantity: 1, unit_price: amt, total: amt }],
      notes: rec.description || r.description || null,
    };
    return {
      kind: 'receipt',
      doc: data.invoice || manualDoc,
      receipt: data.receipt,
      business: { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website },
      customer: {
        name: data.customer?.name || r.customer_name, email: data.customer?.email,
        phone: data.customer?.phone, address: data.customer?.address,
        city: data.customer?.city, state: data.customer?.state, zip: data.customer?.zip,
      },
    };
  }

  async function print(e, r) {
    e.stopPropagation();
    setBusy(r.id);
    try { printDocument(await loadFull(r)); }
    catch { toast.error('Could not open that receipt'); }
    finally { setBusy(''); }
  }

  async function share(e, r) {
    e.stopPropagation();
    setBusy(r.id);
    try {
      const res = await sharePdf(await loadFull(r));
      if (res.method === 'download') toast.success('PDF saved to your downloads');
    } catch { toast.error('Could not create the PDF'); }
    finally { setBusy(''); }
  }

  async function resend(e, r) {
    e.stopPropagation();
    setBusy(r.id);
    try { await api.post(`/billing/receipts/${r.id}/email`); toast.success('Receipt re-sent'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Could not send'); }
    finally { setBusy(''); }
  }

  // CSV of what's on screen — hand this straight to the bookkeeper.
  function exportCsv() {
    const head = ['Receipt #', 'Date', 'Customer', 'Invoice #', 'Method', 'Reference', 'Amount', 'Balance After'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map(r => [
      r.receipt_number, String(r.paid_at || '').slice(0, 10), r.customer_name || '', r.invoice_number || '',
      String(r.method || '').replace(/_/g, ' '), r.reference || '',
      (Number(r.amount) || 0).toFixed(2), (Number(r.balance_after) || 0).toFixed(2),
    ].map(esc).join(','));
    const csv = [head.map(esc).join(','), ...lines].join('\n');
    const name = `Clarke-Receipts-${month === 'all' ? 'all' : month}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success(`${filtered.length} receipt${filtered.length === 1 ? '' : 's'} exported`);
  }

  if (!rows) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Receipts" subtitle={`${rows.length} issued`} icon={<Receipt size={20} />}>
        <Btn variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download size={15} /> Export CSV</Btn>
        <Btn onClick={openCreate}><Plus size={15} /> Create receipt</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label={month === 'all' ? 'Total Received' : `${monthLabel(month)} received`} value={total} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="green" />
        <StatCard label="Receipts" value={filtered.length} icon={<Receipt size={18} />} color="blue" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search receipt #, invoice #, customer or check #…" icon={<Search size={16} />} />
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none cursor-pointer">
          <option value="all">All months</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <Card>
        <CardHeader title="Issued Receipts" icon={<Receipt size={15} />} />
        {filtered.length === 0 ? (
          <Empty icon={<Receipt size={22} />} title={q || month !== 'all' ? 'No matching receipts' : 'No receipts yet'}
            message={q || month !== 'all' ? 'Try a different search or month.' : 'A receipt is issued automatically on each payment — or create one by hand with “Create receipt”.'}
            action={!(q || month !== 'all') ? <Btn onClick={openCreate}><Plus size={15} /> Create receipt</Btn> : null} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">Receipt #</th>
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-5 py-2.5 font-semibold">Customer</th>
                  <th className="px-5 py-2.5 font-semibold">Invoice</th>
                  <th className="px-5 py-2.5 font-semibold">Method</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Amount</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Balance After</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Sent</th>
                  <th className="px-5 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} onClick={() => r.invoice_id && navigate(`/invoices/${r.invoice_id}`)}
                    className={r.invoice_id ? 'cursor-pointer hover:bg-slate-50' : ''}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{r.receipt_number}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(r.paid_at)}</td>
                    <td className="px-5 py-3 text-slate-700">{r.customer_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{r.invoice_number || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 capitalize">
                      {String(r.method || '').replace(/_/g, ' ')}{r.reference ? <span className="text-slate-400"> · #{r.reference}</span> : null}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-600">{money(r.amount)}</td>
                    <td className={`px-5 py-3 text-right ${Number(r.balance_after) > 0 ? 'text-orange-600 font-medium' : 'text-slate-400'}`}>
                      {money(r.balance_after)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.emailed_at
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Emailed</span>
                        : <span className="text-[11px] text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={e => whatsapp(e, r)} disabled={busy === r.id} title="Send PDF via WhatsApp"
                          className="text-slate-400 hover:text-green-600 p-1.5 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"><MessageCircle size={15} /></button>
                        <button onClick={e => resend(e, r)} disabled={busy === r.id} title="Email receipt to customer"
                          className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"><Mail size={15} /></button>
                        <button onClick={e => share(e, r)} disabled={busy === r.id} title="Download / share as PDF"
                          className="text-slate-400 hover:text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40"><Share2 size={15} /></button>
                        <button onClick={e => print(e, r)} disabled={busy === r.id} title="Print / Download PDF"
                          className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"><Printer size={15} /></button>
                        {r.invoice_id && (
                          <button onClick={e => { e.stopPropagation(); navigate(`/invoices/${r.invoice_id}`); }} title="Open invoice"
                            className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><FileText size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a receipt" subtitle="Nothing is sent — you send it after with Email or WhatsApp"
        footer={<><Btn variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Btn><Btn onClick={createReceipt} loading={saving}>Create receipt</Btn></>}>
        {form && (
          <div className="space-y-3">
            <Select label="Customer" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">Walk-in / type a name…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {!form.customer_id && <Input label="Or name on receipt" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Customer / company name" />}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              <Select label="Method" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                <option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="zelle">Zelle</option><option value="other">Other</option>
              </Select>
              <Input label="Date" type="date" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
              <Input label="Reference / check #" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
            </div>
            <Textarea label="For (what the payment is for)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="e.g. Boiler tune-up — 123 Main St" />
          </div>
        )}
      </Modal>
    </div>
  );
}
