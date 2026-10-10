import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Spinner, Empty, Modal, Input, Select, StatCard } from '../components/UI';
import { Landmark, Link2, RefreshCw, Trash2, Building2, ArrowDownUp, Send, ShieldCheck, AlertTriangle } from 'lucide-react';

const money = (v) => (v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const STRIPE_JS = 'https://js.stripe.com/v3/';
const isNative = () => { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } };

function loadStripe() {
  return new Promise((resolve, reject) => {
    if (window.Stripe) return resolve();
    const s = document.createElement('script');
    s.src = STRIPE_JS; s.async = true;
    s.onload = () => (window.Stripe ? resolve() : reject(new Error('Could not load Stripe.')));
    s.onerror = () => reject(new Error('Could not load Stripe.'));
    document.head.appendChild(s);
  });
}

export default function Banking() {
  const [status, setStatus] = useState(null);
  const [role, setRole] = useState('admin');
  const [txns, setTxns] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [payHistory, setPayHistory] = useState([]);

  const isAdmin = role === 'admin';

  const loadStatus = useCallback(() => {
    api.get('/banking/status').then(r => setStatus(r.data)).catch(() => setStatus({ configured: false }));
  }, []);

  useEffect(() => {
    try { setRole(JSON.parse(localStorage.getItem('user') || '{}').role || 'admin'); } catch {}
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected) return;
    api.get('/banking/transactions').then(r => setTxns(r.data)).catch(() => setTxns({ transactions: [] }));
    api.get('/banking/payments').then(r => setPayHistory(r.data)).catch(() => {});
    if (status.transfer_enabled) api.get('/purchasing/vendors').then(r => setVendors(r.data)).catch(() => {});
  }, [status?.connected, status?.transfer_enabled]);

  const connect = async () => {
    setErr(''); setBusy('connect');
    try {
      await loadStripe();
      const { data } = await api.post('/banking/session');
      if (!data.publishable_key) throw new Error('Stripe publishable key is missing.');
      const stripe = window.Stripe(data.publishable_key);
      const result = await stripe.collectFinancialConnectionsAccounts({ clientSecret: data.client_secret });
      if (result.error) { setErr(result.error.message || 'Could not connect.'); setBusy(''); return; }
      const accts = (result.financialConnectionsSession?.accounts || []).map(a => ({
        id: a.id, institution_name: a.institution_name, last4: a.last4,
        category: a.category, subcategory: a.subcategory, display_name: a.display_name,
      }));
      if (!accts.length) { setBusy(''); return; } // user closed without linking
      await api.post('/banking/connect', { accounts: accts });
      loadStatus();
    } catch (e) { setErr(e.response?.data?.error || e.message || 'Could not start the connection.'); }
    finally { setBusy(''); }
  };

  const refreshBalances = async () => {
    setBusy('refresh'); setErr('');
    try { const { data } = await api.get('/banking/accounts'); setStatus(s => ({ ...s, accounts: data.accounts })); }
    catch (e) { setErr(e.response?.data?.error || 'Could not refresh balances.'); }
    finally { setBusy(''); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this bank account? You can reconnect anytime.')) return;
    setBusy('disconnect');
    try { await api.delete('/banking/disconnect'); setTxns(null); loadStatus(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not disconnect.'); }
    finally { setBusy(''); }
  };

  if (!status) return <Spinner />;

  // Not set up in Render yet
  if (!status.configured) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Banking" subtitle="Connect your business bank account" icon={<Landmark size={20} />} />
        <Card className="p-6">
          <Empty icon={<Landmark size={24} />} title="Bank connection isn't set up yet"
            message="To connect Bank of America, the Stripe keys need to be added in Render (STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY). Once those are in, this page lets you securely link the account and see the balance." />
        </Card>
      </div>
    );
  }

  const accounts = status.accounts || [];
  const totalAvail = accounts.reduce((s, a) => s + (Number(a.available ?? a.current) || 0), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Banking" subtitle="Business bank account — balance, activity, and vendor payments" icon={<Landmark size={20} />}
        action={status.connected && isAdmin && (
          <div className="flex gap-2">
            <Btn variant="outline" size="sm" onClick={refreshBalances} loading={busy === 'refresh'}><RefreshCw size={14} /> Refresh</Btn>
            {status.transfer_enabled && <Btn size="sm" onClick={() => setPayOpen(true)}><Send size={14} /> Pay a vendor</Btn>}
          </div>
        )} />

      {status.environment === 'sandbox' && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={16} /> Test mode (Stripe test keys) — connect a sample bank with Stripe's test login. No real money or real account is touched.
        </div>
      )}
      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{err}</div>}

      {!status.connected ? (
        <Card className="p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Building2 size={22} /></div>
          <h2 className="text-lg font-semibold text-slate-800">Connect your bank</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4 max-w-md mx-auto">You'll sign in to Bank of America through Stripe's secure window. Clarke Mechanical never sees your banking password.</p>
          {isAdmin ? (
            <Btn onClick={connect} loading={busy === 'connect'}><Link2 size={16} /> Connect bank account</Btn>
          ) : (
            <p className="text-sm text-slate-400">Ask an admin to connect the account.</p>
          )}
          {isNative() && <p className="text-xs text-slate-400 mt-3">Tip: connect from the website for the smoothest sign-in.</p>}
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 flex items-center gap-2">
              <ShieldCheck size={15} className="text-emerald-600" /> Connected to <span className="font-semibold text-slate-700">{status.institution}</span>
              {status.connected_at && <span className="text-slate-400">· linked {fmtDate(status.connected_at)}</span>}
            </div>
            {isAdmin && <button onClick={disconnect} className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={13} /> Disconnect</button>}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <StatCard label="Total available" value={totalAvail} prefix="$" decimals={2} icon={<Landmark size={18} />} color="green" />
            <StatCard label="Accounts" value={accounts.length} icon={<Building2 size={18} />} color="blue" animate={false} />
          </div>

          <Card className="mb-6">
            <div className="px-5 py-3 border-b border-slate-100 text-card-title text-slate-800">Accounts</div>
            {accounts.length === 0 ? <div className="px-5 py-4 text-sm text-slate-400">No accounts returned.</div> : (
              <div className="divide-y divide-slate-100">
                {accounts.map(a => (
                  <div key={a.account_id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="font-medium text-slate-800">{a.name} {a.mask && <span className="text-slate-400 font-normal">••{a.mask}</span>}</div>
                      <div className="text-xs text-slate-400 capitalize">{a.subtype || a.type}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{money(a.available ?? a.current)}</div>
                      {a.available != null && a.current != null && a.available !== a.current && <div className="text-xs text-slate-400">{money(a.current)} current</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="mb-6">
            <div className="px-5 py-3 border-b border-slate-100 text-card-title text-slate-800 flex items-center gap-2"><ArrowDownUp size={15} /> Recent transactions</div>
            {txns === null ? <div className="p-5"><Spinner /></div> : (txns.transactions || []).length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-400">No transactions in the last 30 days.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {txns.transactions.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0 pr-3">
                      <div className="font-medium text-slate-700 truncate">{t.name}{t.pending && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">pending</span>}</div>
                      <div className="text-xs text-slate-400">{fmtDate(t.date)}{t.category ? ` · ${t.category}` : ''}</div>
                    </div>
                    <div className={`font-semibold whitespace-nowrap ${t.amount > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>{t.amount > 0 ? '-' : '+'}{money(Math.abs(t.amount))}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {payHistory.length > 0 && (
            <Card className="mb-6">
              <div className="px-5 py-3 border-b border-slate-100 text-card-title text-slate-800 flex items-center gap-2"><Send size={15} /> Vendor payments</div>
              <div className="divide-y divide-slate-100">
                {payHistory.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                    <div>
                      <div className="font-medium text-slate-700">{p.vendor_name || 'Vendor'}</div>
                      <div className="text-xs text-slate-400">{fmtDate(p.created_at)} · {p.status} · by {p.paid_by}</div>
                    </div>
                    <div className="font-semibold text-slate-900">{money(p.amount)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {payOpen && <PayVendorModal accounts={accounts} vendors={vendors} onClose={() => setPayOpen(false)}
        onPaid={() => { setPayOpen(false); api.get('/banking/payments').then(r => setPayHistory(r.data)).catch(() => {}); }} />}
    </div>
  );
}

function PayVendorModal({ accounts, vendors, onClose, onPaid }) {
  const [form, setForm] = useState({ account_id: accounts[0]?.account_id || '', vendor_id: '', amount: '', description: '' });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const vendorName = vendors.find(v => v.id === form.vendor_id)?.name;

  const submit = async () => {
    if (!(Number(form.amount) > 0)) { setErr('Enter an amount greater than zero'); return; }
    if (!form.vendor_id) { setErr('Choose a vendor'); return; }
    setBusy(true); setErr('');
    try { await api.post('/banking/pay', { ...form, vendor_name: vendorName }); onPaid(); }
    catch (e) { setErr(e.response?.data?.error || 'Payment failed.'); setConfirm(false); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Pay a vendor"
      footer={confirm ? (
        <>
          <Btn variant="outline" onClick={() => setConfirm(false)}>Back</Btn>
          <Btn onClick={submit} loading={busy}>Send {form.amount ? `$${Number(form.amount).toFixed(2)}` : 'payment'}</Btn>
        </>
      ) : (
        <>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { if (Number(form.amount) > 0 && form.vendor_id) { setErr(''); setConfirm(true); } else setErr('Choose a vendor and amount'); }}>Review</Btn>
        </>
      )}>
      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
      {!confirm ? (
        <div className="space-y-4">
          <Select label="Pay from" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
            {accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.name} ••{a.mask} — {money(a.available ?? a.current)}</option>)}
          </Select>
          <Select label="Vendor" value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}>
            <option value="">Select a vendor…</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Input label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
          <Input label="Memo (optional, max 15 chars)" maxLength={15} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Invoice #" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">You're about to send a real ACH payment:</p>
          <div className="rounded-xl border border-slate-200 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">To</span><span className="font-semibold text-slate-800">{vendorName}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-900">${Number(form.amount).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">From</span><span className="text-slate-700">{accounts.find(a => a.account_id === form.account_id)?.name}</span></div>
          </div>
          <p className="text-xs text-slate-400">This moves money out of your bank account and cannot be undone here.</p>
        </div>
      )}
    </Modal>
  );
}
