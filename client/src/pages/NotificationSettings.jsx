import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { ArrowLeft, Bell, Mail, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [linked, setLinked] = useState(true);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/portal/me').then(r => {
      setLinked(!!r.data.linked);
      const p = r.data.profile || {};
      setProfile(p);
      setEmail(p.email_opt_in !== false);
      setSms(!!p.sms_opt_in);
    }).catch(() => {});
  }, []);

  async function save(nextEmail, nextSms) {
    setSaving(true);
    try {
      await api.put('/portal/profile', {
        phone: profile?.phone || null,
        address: profile?.address || null, city: profile?.city || null, state: profile?.state || null, zip: profile?.zip || null,
        email_opt_in: nextEmail, sms_opt_in: nextSms,
      });
      toast.success('Preferences saved');
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  const Row = ({ icon: Icon, title, desc, on, set, note }) => (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 last:border-0">
      <Icon size={18} className="text-slate-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{desc}</p>
        {note && <p className="text-[11px] text-amber-600 mt-0.5">{note}</p>}
      </div>
      <Toggle on={on} onChange={(v) => { set(v); save(title === 'Email updates' ? v : email, title === 'Text updates' ? v : sms); }} />
    </div>
  );

  return (
    <div className="max-w-xl mx-auto pb-4">
      <button onClick={() => navigate('/more')} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Back</button>
      <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2"><Bell size={22} className="text-blue-600" /> Notification Settings</h1>
      <p className="text-sm text-slate-500 mb-5">Choose how we keep you updated.</p>

      {!linked ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">
          Preferences will be available once your account is linked to a service record.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <Row icon={Mail} title="Email updates" desc="Appointment confirmations, reminders, receipts, and estimates." on={email} set={setEmail} />
          <Row icon={MessageSquare} title="Text updates" desc="Text-message reminders and on-the-way alerts." on={sms} set={setSms} note="Text messaging is coming soon." />
        </div>
      )}
      {saving && <p className="text-xs text-slate-400 mt-3">Saving…</p>}
    </div>
  );
}
