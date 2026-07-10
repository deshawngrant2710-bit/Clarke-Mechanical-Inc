import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Badge, Input, Select, Textarea, Spinner } from '../components/UI';
import { ArrowLeft, Trash2, Camera, FileText, X, Save, Send, Building2, Home, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { fileToProof } from '../lib/imageProof';
import {
  PROPERTY_TYPES, EQUIPMENT_TYPES, INFO_FIELDS, ANSWERS, sectionsFor, propertyLabel, equipmentLabel,
} from '../lib/inspectionForms';

const ANSWER_STYLE = {
  pass: 'bg-emerald-600 text-white border-emerald-600',
  fail: 'bg-red-600 text-white border-red-600',
  na: 'bg-slate-500 text-white border-slate-500',
};

function PhotoThumb({ inspId, photo, onDelete }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/inspections/${inspId}/photos/${photo.id}`).then(r => setData(r.data)).catch(() => {});
  }, [inspId, photo.id]);
  const isPdf = (data?.proof_type || photo.proof_type) === 'pdf';
  return (
    <div className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      {!data ? (
        <div className="h-28 animate-pulse bg-slate-100" />
      ) : isPdf ? (
        <a href={data.proof} target="_blank" rel="noreferrer" download={photo.caption || 'inspection.pdf'}
          className="h-28 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-100">
          <FileText size={26} /><span className="text-xs mt-1">Open PDF</span>
        </a>
      ) : (
        <a href={data.proof} target="_blank" rel="noreferrer" className="block">
          <img src={data.proof} alt={photo.caption || 'inspection photo'} className="h-28 w-full object-cover" />
        </a>
      )}
      <button onClick={() => onDelete(photo.id)} aria-label="Remove"
        className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = user?.role === 'admin' || user?.role === 'office';

  const [insp, setInsp] = useState(null);
  const [property, setProperty] = useState('residential');
  const [equipment, setEquipment] = useState('boiler');
  const [info, setInfo] = useState({});
  const [checklist, setChecklist] = useState({});
  const [notes, setNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function load() {
    api.get(`/inspections/${id}`).then(r => {
      const d = r.data;
      setInsp(d);
      setProperty(d.property_type || 'residential');
      setEquipment(d.equipment_type || 'boiler');
      setInfo(d.info || {});
      setChecklist(d.checklist || {});
      setNotes(d.notes || '');
      setRecommendations(d.recommendations || '');
    }).catch(() => { toast.error('Could not load inspection'); navigate('/inspections'); });
  }
  useEffect(load, [id]);

  async function save(status) {
    setSaving(true);
    try {
      const payload = { property_type: property, equipment_type: equipment, info, checklist, notes, recommendations };
      if (status) payload.status = status;
      await api.put(`/inspections/${id}`, payload);
      toast.success(status === 'submitted' ? 'Inspection submitted' : 'Saved');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { proof, proof_type } = await fileToProof(file);
      await api.post(`/inspections/${id}/photos`, { proof, proof_type });
      toast.success('Uploaded'); load();
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  }

  async function deletePhoto(pid) {
    if (!confirm('Remove this photo?')) return;
    try { await api.delete(`/inspections/${id}/photos/${pid}`); load(); }
    catch { toast.error('Could not remove'); }
  }

  async function handleDelete() {
    if (!confirm('Delete this entire inspection?')) return;
    try { await api.delete(`/inspections/${id}`); toast.success('Deleted'); navigate('/inspections'); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not delete'); }
  }

  const setAnswer = (key, answer) => setChecklist(p => ({ ...p, [key]: { ...p[key], answer } }));
  const setItemNote = (key, note) => setChecklist(p => ({ ...p, [key]: { ...p[key], note } }));

  if (!insp) return <Spinner />;

  const submitted = insp.status === 'submitted';
  const sections = sectionsFor(property, equipment);

  return (
    <div className="animate-fade-in max-w-4xl">
      <button onClick={() => navigate('/inspections')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft size={15} /> All inspections
      </button>

      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shrink-0">
              {property === 'commercial' ? <Building2 size={20} /> : <Home size={20} />}
            </div>
            <div>
              <h1 className="text-section-title text-slate-900">{propertyLabel(property)} Inspection</h1>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Wrench size={12} /> {equipmentLabel(equipment)} · {insp.technician_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge status={submitted ? 'completed' : 'pending'} />
            {canDelete && <Btn variant="danger" size="sm" onClick={handleDelete}><Trash2 size={14} /> Delete</Btn>}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <Select label="Property type" value={property} onChange={e => setProperty(e.target.value)}>
            {PROPERTY_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
          <Select label="Equipment" value={equipment} onChange={e => setEquipment(e.target.value)}>
            {EQUIPMENT_TYPES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </div>
      </Card>

      {/* Equipment & site info */}
      <Card className="p-5 mb-6">
        <CardHeader title="Equipment & Site" />
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          {INFO_FIELDS.map(f => (
            <Input key={f.key} label={f.label} placeholder={f.placeholder}
              value={info[f.key] || ''} onChange={e => setInfo(p => ({ ...p, [f.key]: e.target.value }))} />
          ))}
        </div>
      </Card>

      {/* Checklist */}
      {sections.map(section => (
        <Card key={section.id} className="mb-6">
          <CardHeader title={section.title} />
          <div className="divide-y divide-slate-100">
            {section.items.map(item => {
              const val = checklist[item.key] || {};
              return (
                <div key={item.key} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm text-slate-700 flex-1 min-w-[55%]">{item.label}</p>
                    <div className="flex gap-1.5">
                      {ANSWERS.map(a => (
                        <button key={a.id} onClick={() => setAnswer(item.key, a.id)}
                          className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${val.answer === a.id ? ANSWER_STYLE[a.id] : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {val.answer === 'fail' && (
                    <input
                      value={val.note || ''}
                      onChange={e => setItemNote(item.key, e.target.value)}
                      placeholder="Add a note about this issue…"
                      className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {/* Recommendations for pricing */}
      <Card className="p-5 mb-6">
        <CardHeader title="Recommended work / notes for pricing" />
        <Textarea className="mt-2" rows={4} value={recommendations}
          onChange={e => setRecommendations(e.target.value)}
          placeholder="What needs doing, sizes/quantities, access issues — anything that helps the office price the work." />
      </Card>

      {/* General notes */}
      <Card className="p-5 mb-6">
        <CardHeader title="General notes" />
        <Textarea className="mt-2" rows={3} value={notes}
          onChange={e => setNotes(e.target.value)} placeholder="Any other observations." />
      </Card>

      {/* Photos */}
      <Card className="p-5 mb-6">
        <CardHeader title={`Photos & documents (${insp.photos?.length || 0})`} icon={<Camera size={15} />}
          action={
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              <Camera size={14} /> {uploading ? 'Uploading…' : 'Add photo / PDF'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          } />
        {(!insp.photos || insp.photos.length === 0) ? (
          <p className="text-sm text-slate-400 mt-3">No photos yet. Upload site or equipment photos so the office can see what you're dealing with.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
            {insp.photos.map(p => <PhotoThumb key={p.id} inspId={id} photo={p} onDelete={deletePhoto} />)}
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-slate-50/80 backdrop-blur py-3">
        <Btn variant="outline" onClick={() => save()} loading={saving}><Save size={15} /> Save draft</Btn>
        <Btn onClick={() => save('submitted')} loading={saving}><Send size={15} /> {submitted ? 'Update & keep submitted' : 'Submit inspection'}</Btn>
      </div>
    </div>
  );
}
