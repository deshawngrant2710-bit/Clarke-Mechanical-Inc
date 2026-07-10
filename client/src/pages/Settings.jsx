import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Btn, Input, Spinner } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { Settings as Cog, Building2, Server, BellRing, Mail, ShieldAlert, CheckCircle2, Send, Play } from 'lucide-react';
import toast from 'react-hot-toast';

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.get('/settings').then(r => { setData(r.data); setTestTo(r.data.business_email || ''); });
  }, [user]);

  if (user?.role !== 'admin') {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Settings" icon={<Cog size={20} />} />
        <Card className="p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4"><ShieldAlert size={26} /></div>
          <p className="font-semibold text-slate-800">Admins only</p>
          <p className="text-sm text-slate-500 mt-1">You need administrator access to manage settings.</p>
        </Card>
      </div>
    );
  }

  if (!data) return <Spinner />;
  const set = (k) => (e) => setData(d => ({ ...d, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const payload = { ...data };
      if (!payload.smtp_pass) delete payload.smtp_pass; // don't clear existing password
      await api.put('/settings', payload);
      toast.success('Settings saved');
      const r = await api.get('/settings');
      setData({ ...r.data, smtp_pass: '' });
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  async function sendTest() {
    setBusy('test');
    const tId = toast.loading('Sending test…');
    try {
      const { data: res } = await api.post('/settings/test-email', { to: testTo });
      toast.success(res.status === 'simulated' ? `Test logged (demo mode) → ${res.to}` : `Test sent to ${res.to}`, { id: tId, duration: 4000 });
    } catch (e) { toast.error(e.response?.data?.error || 'Test failed', { id: tId }); }
    finally { setBusy(''); }
  }

  async function runReminders() {
    setBusy('reminders');
    const tId = toast.loading('Running reminders…');
    try {
      const { data: s } = await api.post('/settings/run-reminders');
      toast.success(`Done — ${s.jobReminders} appointment reminder(s), ${s.overdueNotices} overdue notice(s), ${s.skipped} skipped`, { id: tId, duration: 5000 });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed', { id: tId }); }
    finally { setBusy(''); }
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="Settings" subtitle="Business email & automated reminders" icon={<Cog size={20} />}>
        <Btn onClick={save} loading={saving}>Save Changes</Btn>
      </PageHeader>

      {/* Status */}
      <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 ${data.configured ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {data.configured ? <CheckCircle2 size={20} className="shrink-0" /> : <Mail size={20} className="shrink-0" />}
        <div>
          <p className="text-sm font-semibold">{data.configured ? 'Live email is active' : 'Demo mode — email is simulated'}</p>
          <p className="text-xs opacity-80">{data.configured
            ? 'Emails are delivered via your configured SMTP server.'
            : 'Emails are rendered and logged but not delivered. Add SMTP details below to go live.'}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Business info */}
        <Card>
          <CardHeader title="Business Identity" icon={<Building2 size={16} />} />
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <Input label="Business name" value={data.business_name} onChange={set('business_name')} />
            <Input label="Public email" icon={<Mail size={15} />} value={data.business_email} onChange={set('business_email')} hint="Shown in email footers & reply-to" />
            <Input label="Phone" value={data.business_phone} onChange={set('business_phone')} />
            <Input label="Business hours" value={data.business_hours || ''} onChange={set('business_hours')} hint="Shown to customers in the portal" />
            <Input label="Default tax rate (%)" type="number" step="0.01" value={(Number(data.default_tax_rate || 0) * 100).toFixed(2)}
              onChange={e => setData(d => ({ ...d, default_tax_rate: String((Number(e.target.value) || 0) / 100) }))} hint="Applied to new invoices & estimates" />
            <Input label="From address" value={data.email_from} onChange={set('email_from')} hint={'e.g. Clarke Mechanical <no-reply@…>'} />
          </div>
        </Card>

        {/* SMTP */}
        <Card>
          <CardHeader title="Email Server (SMTP)" icon={<Server size={16} />} />
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <Input label="SMTP host" value={data.smtp_host} onChange={set('smtp_host')} placeholder="smtp.gmail.com" />
            <Input label="Port" type="number" value={data.smtp_port} onChange={set('smtp_port')} placeholder="587" />
            <Input label="Username" value={data.smtp_user} onChange={set('smtp_user')} placeholder="you@yourdomain.com" autoComplete="off" />
            <Input label="Password / App key" type="password" value={data.smtp_pass || ''} onChange={set('smtp_pass')}
              placeholder={data.smtp_pass_set ? '•••••••• (unchanged)' : 'Enter to set'} autoComplete="new-password" />
          </div>
          <div className="px-5 pb-5 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="test@email.com"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
            </div>
            <Btn variant="outline" onClick={sendTest} loading={busy === 'test'}><Send size={15} /> Send Test</Btn>
          </div>
        </Card>

        {/* Reminders */}
        <Card>
          <CardHeader title="Automated Reminders" icon={<BellRing size={16} />} />
          <div className="p-5">
            <div className="divide-y divide-slate-100">
              <Toggle label="Appointment reminders"
                desc="Automatically email customers the day before a scheduled job."
                checked={data.reminders_job_enabled}
                onChange={v => setData(d => ({ ...d, reminders_job_enabled: v }))} />
              <Toggle label="Overdue invoice notices"
                desc="Automatically email a friendly reminder when an invoice passes its due date."
                checked={data.reminders_overdue_enabled}
                onChange={v => setData(d => ({ ...d, reminders_overdue_enabled: v }))} />
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-500">Reminders run automatically every hour. You can also trigger a pass now.</p>
              <Btn variant="outline" onClick={runReminders} loading={busy === 'reminders'}><Play size={15} /> Run Reminders Now</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
