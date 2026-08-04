import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { ArrowLeft, MapPin, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ServiceAddresses() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [linked, setLinked] = useState(true);
  const [form, setForm] = useState({ address: '', city: '', state: '', zip: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/portal/me').then(r => {
      setLinked(!!r.data.linked);
      const p = r.data.profile || {};
      setProfile(p);
      setForm({ address: p.address || '', city: p.city || '', state: p.state || '', zip: p.zip || '' });
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.put('/portal/profile', {
        phone: profile?.phone || null,
        address: form.address || null, city: form.city || null, state: form.state || null, zip: form.zip || null,
        email_opt_in: profile?.email_opt_in !== false, sms_opt_in: !!profile?.sms_opt_in,
      });
      toast.success('Service address saved');
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  const field = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500';

  return (
    <div className="max-w-xl mx-auto pb-4">
      <button onClick={() => navigate('/more')} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Back</button>
      <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2"><MapPin size={22} className="text-blue-600" /> Service Addresses</h1>
      <p className="text-sm text-slate-500 mb-5">Where we perform your HVAC service.</p>

      {!linked ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">
          Your account isn't linked to a service record yet. Once we add you as a customer, your service address will appear here.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Street address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={field} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">State</label>
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">ZIP</label>
              <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} className={field} />
            </div>
          </div>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
            <Save size={16} /> {saving ? 'Saving…' : 'Save address'}
          </button>
        </div>
      )}
    </div>
  );
}
