import { useEffect, useState } from 'react';
import api from '../api/client';
import { Modal, Input, Textarea, Btn } from './UI';
import { FileText, Camera } from 'lucide-react';
import { fileToProof } from '../lib/imageProof';
import toast from 'react-hot-toast';

const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

export default function ServiceRequestModal({ open, onClose, onDone, initial }) {
  const [form, setForm] = useState({ title: '', description: '', preferred_date: '', booking_window: '' });
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState(null); // null = not loaded, [] = none
  const [loadingSlots, setLoadingSlots] = useState(false);
  const minDate = tomorrowStr();
  useEffect(() => {
    if (open) { setForm({ title: initial?.title || '', description: initial?.description || '', preferred_date: '', booking_window: '' }); setPhotos([]); setSlots(null); }
  }, [open, initial]);

  // Load real availability whenever the customer changes the date.
  useEffect(() => {
    if (!form.preferred_date) { setSlots(null); return; }
    setLoadingSlots(true);
    setForm(f => ({ ...f, booking_window: '' }));
    api.get(`/portal/availability?date=${form.preferred_date}`)
      .then(r => setSlots(r.data.windows || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [form.preferred_date]);

  async function pickPhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (photos.length + files.length > 10) return toast.error('You can attach up to 10 photos.');
    for (const file of files) {
      try { const p = await fileToProof(file); setPhotos(prev => [...prev, { ...p, name: file.name }]); }
      catch (err) { toast.error(`${file.name}: ${err.message || 'could not add'}`); }
    }
  }

  async function submit() {
    if (!form.title.trim()) return toast.error('Please describe the service you need');
    if (!form.preferred_date) return toast.error('Please pick a date.');
    if (!form.booking_window) return toast.error('Please choose an available arrival window.');
    setSaving(true);
    try {
      await api.post('/portal/service-request', {
        title: form.title, description: form.description, preferred_date: form.preferred_date,
        booking_window: form.booking_window, photos: photos.map(p => ({ proof: p.proof, proof_type: p.proof_type })),
      });
      toast.success("Slot held! We'll confirm your appointment shortly.");
      setForm({ title: '', description: '', preferred_date: '', booking_window: '' });
      setPhotos([]);
      onClose(); onDone();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not book that slot');
      // If the slot just filled, refresh availability so they can pick again.
      if (e.response?.status === 409 && form.preferred_date) {
        api.get(`/portal/availability?date=${form.preferred_date}`).then(r => setSlots(r.data.windows || [])).catch(() => {});
        setForm(f => ({ ...f, booking_window: '' }));
      }
    }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Book an Appointment" subtitle="Pick a day and an open arrival window">
      <div className="space-y-3">
        <Input label="What do you need? *" value={form.title} valid={form.title.trim().length > 2}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. AC not cooling, annual tune-up" />
        <Textarea label="Details (optional)" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Anything that helps us prepare — symptoms, unit location, access notes…" />
        <Input label="Date *" type="date" min={minDate} value={form.preferred_date}
          onChange={e => setForm(f => ({ ...f, preferred_date: e.target.value }))} />
        {form.preferred_date && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Arrival window *</label>
            {loadingSlots ? (
              <p className="text-sm text-slate-400">Checking availability…</p>
            ) : slots && slots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {slots.map(s => (
                  <button key={s.label} type="button" disabled={s.full}
                    onClick={() => setForm(f => ({ ...f, booking_window: s.label }))}
                    className={`text-sm rounded-lg px-3 py-2 ring-1 text-left transition-colors ${
                      s.full ? 'bg-slate-50 text-slate-300 ring-slate-200 cursor-not-allowed line-through'
                      : form.booking_window === s.label ? 'bg-blue-600 text-white ring-blue-600'
                      : 'bg-white text-slate-700 ring-slate-200 hover:border-slate-300'}`}>
                    <span className="block font-medium">{s.label}</span>
                    <span className={`text-xs ${form.booking_window === s.label ? 'text-blue-100' : 'text-slate-400'}`}>
                      {s.full ? 'Full' : `${s.remaining} left`}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-600">No openings on this day — please try another date.</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Photos (optional)</label>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {photos.map((p, i) => (
                <div key={i} className="relative group">
                  {p.proof_type === 'image'
                    ? <img src={p.proof} alt={p.name} className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                    : <div className="w-16 h-16 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400"><FileText size={20} /></div>}
                  <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center shadow hover:bg-red-700" title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
          {photos.length < 10 && (
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
              <Camera size={15} /> {photos.length ? 'Add more' : 'Add photos'}
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={pickPhotos} />
            </label>
          )}
          <p className="text-xs text-slate-400 mt-1">Pictures of the unit or problem help us prepare. Up to 10.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={saving}>{saving ? 'Sending…' : 'Send Request'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
