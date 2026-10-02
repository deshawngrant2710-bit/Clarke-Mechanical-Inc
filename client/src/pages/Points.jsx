import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage, StatCard, Table, Row, Cell,
} from '../components/UI';
import { Award, Plus, Trash2, Trophy, Phone, TrendingUp, DollarSign, Sparkles } from 'lucide-react';
import { POINT_TYPES, MANUAL_TYPES, labelFor, pointsFor } from '../lib/points';
import toast from 'react-hot-toast';

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export default function Points() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = ['admin', 'office'].includes(user?.role);
  const isAdmin = user?.role === 'admin';
  const firstName = user?.name?.trim()?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [rate, setRate] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [form, setForm] = useState({ type: 'completed_call', customer_id: '', note: '', agent_id: '' });
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([api.get('/points/summary'), api.get('/points?limit=300')])
      .then(([s, e]) => { setSummary(s.data); setEvents(e.data); setRate(s.data.dollar_value ? String(s.data.dollar_value) : ''); })
      .catch(() => setSummary({ leaderboard: [], dollar_value: 0, is_manager: isManager, me_id: user?.id }));
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => setCustomers([]));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const myRow = useMemo(
    () => (summary?.leaderboard || []).find(a => a.agent_id === (summary?.me_id || user?.id)),
    [summary, user]
  );
  const myTotal = myRow?.points || 0;
  const rateNum = Number(summary?.dollar_value) || 0;

  async function saveRate() {
    try {
      await api.put('/settings', { points_dollar_value: rate === '' ? '' : String(Number(rate) || 0) });
      toast.success('Point value saved');
      load();
    } catch { toast.error('Could not save the point value'); }
  }

  async function submitLog() {
    if (!form.type) return toast.error('Pick an activity');
    setBusy(true);
    try {
      await api.post('/points', {
        type: form.type,
        customer_id: form.customer_id || null,
        note: form.note || null,
        ...(isManager && form.agent_id ? { agent_id: form.agent_id } : {}),
      });
      toast.success(`+${pointsFor(form.type)} points logged`);
      setLogOpen(false); setForm({ type: 'completed_call', customer_id: '', note: '', agent_id: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not log the activity'); }
    finally { setBusy(false); }
  }

  async function removeEntry(id) {
    if (!confirm('Remove this point entry?')) return;
    try { await api.delete(`/points/${id}`); toast.success('Removed'); load(); }
    catch { toast.error('Could not remove'); }
  }

  if (!summary) return <SkeletonPage stats={3} />;

  const agentsForPicker = (summary.leaderboard || []);

  return (
    <div className="animate-fade-in">
      {/* Welcome hero */}
      <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-[var(--shadow-sm)] px-6 py-5 relative overflow-hidden">
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-gradient-to-br from-orange-500/10 to-transparent blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{greeting}, {firstName} 👋</h1>
            <p className="mt-1 text-sm text-slate-500">
              {myTotal > 0
                ? `You've racked up ${myTotal} point${myTotal === 1 ? '' : 's'} so far — keep those calls coming!`
                : "Welcome aboard! Make your first calls in the Pipeline to start earning points."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Btn onClick={() => navigate('/pipeline')}><Phone size={16} /> Go to Pipeline</Btn>
            <Btn variant="outline" onClick={() => navigate('/customers')}>Customers</Btn>
            {isManager && <Btn variant="outline" onClick={() => setLogOpen(true)}><Plus size={16} /> Manual adjust</Btn>}
          </div>
        </div>
      </div>

      {/* Personal scoreboard (everyone sees their own) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="My points" value={myTotal} icon={<Trophy size={18} />} color="orange" />
        <StatCard label="My activities" value={myRow?.count || 0} icon={<Phone size={18} />} color="blue" />
        <StatCard label={rateNum ? 'My points value' : 'Point value'} value={rateNum ? Number((myTotal * rateNum).toFixed(2)) : 0} prefix={rateNum ? '$' : ''} decimals={2} icon={<DollarSign size={18} />} color="green" sub={rateNum ? `${money(rateNum)} / point` : 'Not set yet'} />
      </div>

      {/* How points are earned */}
      <Card className="p-5 mb-6">
        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5"><Sparkles size={15} className="text-blue-500" /> How to earn points</h3>
        <p className="text-xs text-slate-500 mb-3">Points log automatically — just record the outcome when you log a call in the <span className="font-semibold text-slate-700">Pipeline</span>. New customers and completed jobs credit on their own.</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {Object.entries(POINT_TYPES).map(([id, t]) => (
            <div key={id} className="flex items-start justify-between gap-3 py-1 border-b border-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">{t.label}</p>
                <p className="text-xs text-slate-500">{t.desc}</p>
              </div>
              <div className="shrink-0 text-right whitespace-nowrap">
                <span className="text-sm font-bold text-blue-600">+{t.points}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{MANUAL_TYPES.includes(id) ? 'log a call' : 'automatic'}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Manager: leaderboard + point value */}
      {isManager && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><TrendingUp size={15} className="text-emerald-500" /> Leaderboard</h3>
            {isAdmin && (
              <div className="flex items-end gap-2">
                <Input label="$ per point" type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className="w-32" placeholder="0.00" />
                <Btn variant="outline" onClick={saveRate}>Save rate</Btn>
              </div>
            )}
          </div>
          {agentsForPicker.length === 0 ? (
            <Empty icon={<Trophy size={24} />} title="No points yet" message="Points will show here as the team logs calls and leads." />
          ) : (
            <Table head={[{ label: 'Agent' }, { label: 'Activities', align: 'right' }, { label: 'Points', align: 'right' }, { label: 'Value', align: 'right' }]}>
              {agentsForPicker.map((a, i) => (
                <Row key={a.agent_id}>
                  <Cell><span className="font-semibold text-slate-800">{i === 0 ? '🏆 ' : ''}{a.agent_name}</span></Cell>
                  <Cell align="right"><span className="text-sm text-slate-600">{a.count}</span></Cell>
                  <Cell align="right"><span className="font-bold text-slate-900">{a.points}</span></Cell>
                  <Cell align="right"><span className="text-sm text-slate-600">{a.value != null ? money(a.value) : '—'}</span></Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      )}

      {/* Activity history */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">{isManager ? 'All activity' : 'My activity'}</h3>
        {events.length === 0 ? (
          <Empty icon={<Award size={24} />} title="No activity yet" message="Log your first call or lead to start earning points." />
        ) : (
          <Table head={[{ label: 'When' }, ...(isManager ? [{ label: 'Agent' }] : []), { label: 'Activity' }, { label: 'Customer' }, { label: 'Points', align: 'right' }, ...(isAdmin ? [{ label: '', align: 'right' }] : [])]}>
            {events.map(e => (
              <Row key={e.id}>
                <Cell><span className="text-sm text-slate-500">{fmtDate(e.created_at)}</span></Cell>
                {isManager && <Cell><span className="text-sm text-slate-700">{e.agent_name || '—'}</span></Cell>}
                <Cell><span className="text-sm text-slate-800">{labelFor(e.type)}{e.source === 'auto' ? <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">AUTO</span> : ''}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{e.customer_name || '—'}</span></Cell>
                <Cell align="right"><span className="font-bold text-blue-600">+{e.points}</span></Cell>
                {isAdmin && <Cell align="right"><button onClick={() => removeEntry(e.id)} title="Remove" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button></Cell>}
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* Log activity modal */}
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log an activity" subtitle="Record a call outcome or a lead you generated" size="md">
        <div className="space-y-4">
          {isManager && (
            <Select label="Agent" value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}>
              <option value="">Me ({user?.name})</option>
              {agentsForPicker.map(a => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
            </Select>
          )}
          <Select label="Activity" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {MANUAL_TYPES.map(t => <option key={t} value={t}>{POINT_TYPES[t].label} (+{POINT_TYPES[t].points})</option>)}
          </Select>
          <p className="text-[11px] text-slate-400 -mt-2">New Customer (+20) and Job Closed (+30) are awarded automatically when a lead converts and when the job is completed.</p>
          <Select label="Customer / lead (optional)" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
            <option value="">— none —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Textarea label="Note (optional)" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Spoke with building manager, wants a quote for 2 boilers" />
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setLogOpen(false)}>Cancel</Btn>
            <Btn onClick={submitLog} loading={busy}><Plus size={15} /> Log +{pointsFor(form.type)}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
