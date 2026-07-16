import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Badge, Input, Select, Textarea, Spinner } from '../components/UI';
import { ArrowLeft, Trash2, Camera, FileText, X, Save, Send, Building2, Home, Wrench, Printer, PlusCircle, PenLine, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { fileToProof } from '../lib/imageProof';
import SignaturePad from '../components/SignaturePad';
import {
  PROPERTY_TYPES, EQUIPMENT_TYPES, INFO_FIELDS, WORKORDER_FIELDS, ANSWERS, sectionsFor, propertyLabel, equipmentLabel,
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
        className="absolute top-1 right-1 p-1.5 rounded-md bg-white/90 text-red-600 shadow-sm hover:bg-white">
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
  const [parts, setParts] = useState([]);
  const [signature, setSignature] = useState(null);
  const [signedBy, setSignedBy] = useState('');
  const [signName, setSignName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const padRef = useRef(null);

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
      setParts(Array.isArray(d.parts) ? d.parts : []);
      setSignature(d.signature || null);
      setSignedBy(d.signed_by || '');
    }).catch(() => { toast.error('Could not load inspection'); navigate('/inspections'); });
  }
  useEffect(load, [id]);

  async function save(status) {
    setSaving(true);
    try {
      const payload = {
        property_type: property, equipment_type: equipment, info, checklist, notes, recommendations,
        parts: parts.filter(p => (p.name || '').trim()),
        signature: signature || null, signed_by: signature ? (signedBy || 'Customer') : null,
        signed_at: signature ? (insp.signed_at || new Date().toISOString()) : null,
      };
      if (status) payload.status = status;
      await api.put(`/inspections/${id}`, payload);
      toast.success(status === 'submitted' ? 'Inspection submitted' : 'Saved');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      try {
        const { proof, proof_type } = await fileToProof(file);
        await api.post(`/inspections/${id}/photos`, { proof, proof_type });
        ok++;
      } catch (err) { toast.error(`${file.name}: ${err.message || 'upload failed'}`); }
    }
    if (ok) toast.success(`${ok} file${ok === 1 ? '' : 's'} uploaded`);
    load();
    setUploading(false);
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
  function createEstimate() {
    const desc = recommendations?.trim() || `Recommended work — ${propertyLabel(property)} ${equipmentLabel(equipment)} inspection`;
    navigate('/quotes', { state: { prefill: {
      customer_id: insp.customer_id || '',
      items: [{ description: desc, quantity: 1, unit_price: 0 }],
      notes: `From ${propertyLabel(property)} ${equipmentLabel(equipment)} inspection`,
    } } });
  }

  function setPart(i, patch) { setParts(p => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x))); }
  function captureSignature() {
    if (!signName.trim()) return toast.error('Enter the customer name');
    if (padRef.current?.isEmpty()) return toast.error('Please have the customer sign');
    setSignature(padRef.current.toDataURL());
    setSignedBy(signName.trim());
    toast.success('Signature captured — click Save to keep it');
  }

  function printWorkOrder() {
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const sects = sectionsFor(property, equipment);
    const checkRows = sects.flatMap(s => s.items.map(it => { const v = checklist[it.key] || {}; return v.answer ? `<tr><td>${esc(it.label)}</td><td style="text-align:right;text-transform:uppercase">${esc(v.answer)}</td><td>${esc(v.note || '')}</td></tr>` : ''; })).join('') || '<tr><td colspan="3" style="color:#94a3b8">No items checked</td></tr>';
    const partRows = parts.filter(p => (p.name || '').trim()).map(p => `<tr><td>${esc(p.name)}</td><td style="text-align:right">${esc(p.quantity)}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#94a3b8">None</td></tr>';
    const infoRow = (label, val) => (val ? `<tr><td style="color:#64748b;padding:2px 12px 2px 0;white-space:nowrap">${label}</td><td>${esc(val)}</td></tr>` : '');
    const woRow = (label, val) => (val ? `<div style="margin:8px 0"><div style="font-size:11px;text-transform:uppercase;color:#94a3b8">${label}</div><div>${esc(val)}</div></div>` : '');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Work Order</title>
    <style>body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1e293b;padding:36px;font-size:13px;line-height:1.5}
    h1{color:#0b2545;font-size:22px;margin:0 0 2px}.muted{color:#64748b}
    .box{border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:14px 0}.h{font-weight:700;color:#0f172a;margin-bottom:8px;text-transform:uppercase;font-size:12px;letter-spacing:.04em}
    table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px solid #f1f5f9;vertical-align:top}
    .sig-img{height:60px}@media print{body{padding:20px}}</style></head><body>
    <h1>WORK ORDER</h1><p class="muted">${esc(propertyLabel(property))} · ${esc(equipmentLabel(equipment))} · ${new Date().toLocaleDateString('en-US')}</p>
    <div class="box"><div class="h">Equipment & Site</div><table>${INFO_FIELDS.map(f => infoRow(f.label, info[f.key])).join('')}</table></div>
    <div class="box"><div class="h">Service</div>${woRow('Problem reported', info.wo_complaint)}${woRow('Work performed', info.wo_work)}${woRow('Readings', info.wo_readings)}${woRow('Labor', info.wo_labor)}</div>
    <div class="box"><div class="h">Checklist</div><table><thead><tr><td style="color:#94a3b8">Item</td><td style="text-align:right;color:#94a3b8">Result</td><td style="color:#94a3b8">Note</td></tr></thead><tbody>${checkRows}</tbody></table></div>
    <div class="box"><div class="h">Parts used</div><table><thead><tr><td style="color:#94a3b8">Part</td><td style="text-align:right;color:#94a3b8">Qty</td></tr></thead><tbody>${partRows}</tbody></table></div>
    ${recommendations ? `<div class="box"><div class="h">Recommendations</div><div>${esc(recommendations)}</div></div>` : ''}
    ${notes ? `<div class="box"><div class="h">Notes</div><div>${esc(notes)}</div></div>` : ''}
    <div style="margin-top:24px"><div class="h">Customer sign-off</div>${signature ? `<img class="sig-img" src="${signature}"/><div class="muted">${esc(signedBy)}</div>` : '<div style="border-top:1px solid #94a3b8;width:260px;margin-top:36px;padding-top:4px;color:#64748b">Customer signature</div>'}</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('Allow pop-ups to print');
    w.document.write(html); w.document.close();
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
            {canDelete && <Btn variant="outline" size="sm" onClick={createEstimate}><FileText size={14} /> Create Estimate</Btn>}
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

      {/* Work order — service details */}
      <Card className="p-5 mb-6">
        <CardHeader title="Work Order" icon={<Wrench size={15} />} />
        <div className="space-y-3 mt-2">
          {WORKORDER_FIELDS.map(f => (
            <Textarea key={f.key} label={f.label} rows={f.rows || 2} placeholder={f.placeholder}
              value={info[f.key] || ''} onChange={e => setInfo(p => ({ ...p, [f.key]: e.target.value }))} />
          ))}
        </div>
      </Card>

      {/* Parts used */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between">
          <CardHeader title="Parts / materials used" />
          <button onClick={() => setParts(p => [...p, { name: '', quantity: 1 }])} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><PlusCircle size={14} /> Add part</button>
        </div>
        <div className="space-y-2 mt-3">
          {parts.length === 0 && <p className="text-sm text-slate-400">No parts added.</p>}
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={p.name} onChange={e => setPart(i, { name: e.target.value })} placeholder="Part / material"
                className="flex-1 px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
              <input type="number" min="0" value={p.quantity} onChange={e => setPart(i, { quantity: e.target.value })} placeholder="Qty"
                className="w-20 px-2.5 py-2 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
              <button onClick={() => setParts(ps => ps.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
            </div>
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

      {/* Customer sign-off */}
      <Card className="p-5 mb-6">
        <CardHeader title="Customer sign-off" icon={<PenLine size={15} />} />
        {signature ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> Signed by {signedBy}</p>
            <img src={signature} alt="signature" className="mt-2 h-16 bg-white border border-slate-200 rounded" />
            <button onClick={() => { setSignature(null); setSignedBy(''); }} className="mt-2 text-xs font-medium text-red-600">Clear signature</button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <Input label="Customer name" value={signName} onChange={e => setSignName(e.target.value)} placeholder="Name of person signing" />
            <SignaturePad ref={padRef} />
            <div className="flex justify-end"><Btn size="sm" onClick={captureSignature}><PenLine size={14} /> Capture signature</Btn></div>
          </div>
        )}
      </Card>

      {/* Photos */}
      <Card className="p-5 mb-6">
        <CardHeader title={`Photos & documents (${insp.photos?.length || 0})`} icon={<Camera size={15} />}
          action={
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              <Camera size={14} /> {uploading ? 'Uploading…' : 'Add photo / PDF'}
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
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
        <Btn variant="outline" onClick={printWorkOrder}><Printer size={15} /> Print work order</Btn>
        <Btn variant="outline" onClick={() => save()} loading={saving}><Save size={15} /> Save draft</Btn>
        <Btn onClick={() => save('submitted')} loading={saving}><Send size={15} /> {submitted ? 'Update & keep submitted' : 'Submit inspection'}</Btn>
      </div>
    </div>
  );
}
