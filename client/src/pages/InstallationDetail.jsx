import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, Btn, Spinner, Empty, Modal, Input, Select, Textarea } from '../components/UI';
import SignaturePad from '../components/SignaturePad';
import { STATUS } from './Installations';
import {
  HardHat, ArrowLeft, Save, Upload, FileText, Trash2, Plus, Wrench, ShieldCheck,
  Printer, ClipboardCheck, Package, FileSignature, ExternalLink, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => (v == null || v === '' ? '—' : `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtDate = (d) => { if (!d) return '—'; const x = new Date(String(d).length <= 10 ? d + 'T00:00:00' : d); return isNaN(x) ? d : x.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }); };

// ---- Commissioning report field spec (mirrors the 6-page form) ----
const EQUIP_TYPES = ['Gas boiler', 'Oil boiler', 'Steam boiler', 'Scotch marine / firetube', 'Industrial burner', 'Dual-fuel burner', 'Furnace', 'Rooftop unit', 'Central AC / heat pump', 'Water heater'];
const INSTALL_CHECKS = ['Approved plans / manuals reviewed', 'Required permits / inspections addressed', 'Equipment location and clearances verified', 'Equipment supports / anchorage inspected', 'Electrical disconnect and grounding verified', 'Voltage / phase / polarity checked', 'Fuel piping / valves / regulators inspected', 'Required piping pressure test documented', 'Vent / chimney / flue routing inspected', 'Combustion and ventilation air verified', 'Condensate / drain piping completed', 'Hydronic piping / expansion / relief verified', 'Strainers / filters / water treatment addressed', 'Refrigerant piping / insulation checked', 'Controls / interlocks / safeties wired', 'Pump / fan rotation verified where applicable', 'Access panels / guards / labeling complete', 'System flushed / evacuated as applicable'];
const RECORDS = ['Permit / inspection reference', 'Fuel pressure / leak test reference', 'Electrical inspection / test reference', 'Refrigerant / hydronic test reference'];
const READINGS = ['Gas inlet pressure (in. w.c.)', 'Gas manifold pressure (in. w.c.)', 'Oil pump pressure (PSI)', 'Supply voltage / phase (V)', 'Control voltage (V)', 'Motor / fan running amperage (A)', 'Fan / motor speed (RPM)', 'External static pressure (in. w.c.)', 'Airflow (CFM)', 'Boiler / hydronic pressure (PSI)', 'Supply water temperature (F)', 'Return water temperature (F)', 'Refrigerant type / charge', 'Suction / liquid pressure (PSI)', 'Superheat / subcooling (F)', 'Supply / return air temperature (F)', 'Flue / breeching draft (in. w.c.)'];
const COMBUSTION = ['O2 (%)', 'CO2 (%)', 'CO (ppm)', 'Flue gas temperature (F)', 'Stack draft (in. w.c.)', 'Overfire draft (in. w.c.)', 'Oil smoke spot number', 'Combustion efficiency (%)'];
const SAFETY_TESTS = ['Normal start / ignition sequence', 'Pilot / main flame proving', 'Normal shutdown sequence', 'Flame failure / safety lockout', 'High-limit / operating limits', 'Low-water cutoff where applicable', 'Fuel safety shutoff / valve proving', 'Combustion air / draft interlocks', 'Emergency stop / disconnect', 'Thermostat / BAS / alarms', 'Pumps / fans / flow interlocks', 'Leak checks after operation'];
const FINAL_STATUS = ['Started / operating; tests completed', 'Operating with documented deficiencies', 'Start-up incomplete; further work required', 'Shut down / not released for operation'];
const TRAINING = ['Operating controls explained', 'Emergency shutdown explained', 'Maintenance schedule reviewed', 'Warranty / manuals provided', 'BAS / building controls handed over', 'Final inspection / test reports provided'];
const DOC_TYPES = [['permit', 'Permit'], ['receipt', 'Receipt / Invoice'], ['material_sheet', 'Material sheet'], ['spec_manual', 'Spec / Manual'], ['inspection', 'Inspection'], ['photo', 'Photo'], ['other', 'Other']];
const key = (s) => s.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40);

export default function InstallationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [tab, setTab] = useState('overview');
  const load = () => api.get(`/installations/${id}`).then(r => setP(r.data)).catch(() => setP(false));
  useEffect(() => { load(); }, [id]);

  if (p === false) return <Empty icon={<HardHat size={22} />} title="Project not found" message="It may have been deleted." action={<Btn onClick={() => nav('/installations')}>Back</Btn>} />;
  if (!p) return <Spinner />;
  const st = STATUS[p.status] || STATUS.planning;

  const setStatus = async (status) => { try { const { data } = await api.put(`/installations/${id}`, { status }); setP(data); } catch { toast.error('Could not update status'); } };

  return (
    <div className="animate-fade-in pb-16">
      <button onClick={() => nav('/installations')} className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-3"><ArrowLeft size={15} /> Installation Projects</button>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shadow"><HardHat size={20} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{p.project_number}</h1>
            <p className="text-sm text-slate-500">{p.customer_name || 'No customer'}{p.address ? ` · ${p.address}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={p.status} onChange={e => setStatus(e.target.value)} className="!w-auto">
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Btn variant="outline" onClick={() => printReport(p)}><Printer size={15} /> Print report</Btn>
        </div>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[['overview', 'Overview', ClipboardCheck], ['documents', `Documents (${p.documents?.length || 0})`, FileText], ['equipment', `Equipment & warranty (${p.equipment?.length || 0})`, Package], ['report', 'Commissioning report', FileSignature]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 ${tab === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview p={p} setP={setP} />}
      {tab === 'documents' && <Documents p={p} reload={load} />}
      {tab === 'equipment' && <Equipment p={p} reload={load} />}
      {tab === 'report' && <Report p={p} setP={setP} />}
    </div>
  );
}

// ---------------- Overview ----------------
function Overview({ p, setP }) {
  const [f, setF] = useState(p);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const toggleType = (t) => setF(s => { const cur = s.equipment_types || []; return { ...s, equipment_types: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] }; });
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/installations/${p.id}`, {
        customer_name: f.customer_name, address: f.address, city_state_zip: f.city_state_zip,
        site_contact: f.site_contact, site_phone: f.site_phone, wo_number: f.wo_number,
        technician: f.technician, technician_license: f.technician_license, start_up_date: f.start_up_date,
        property_class: f.property_class, equipment_types: f.equipment_types, notes: f.notes,
      });
      setP(data); toast.success('Saved');
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <Card className="p-5 space-y-5">
      {(p.quote_id || p.job_id) && (
        <div className="flex gap-2 flex-wrap">
          {p.quote_id && <a href={`/quotes`} className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><ExternalLink size={12} /> From quote {p.wo_number || ''}</a>}
          {p.job_id && <a href={`/jobs/${p.job_id}`} className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><ExternalLink size={12} /> Linked job</a>}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Customer / company" value={f.customer_name || ''} onChange={e => set('customer_name', e.target.value)} />
        <Input label="Job / work-order number" value={f.wo_number || ''} onChange={e => set('wo_number', e.target.value)} />
        <Input label="Installation address" value={f.address || ''} onChange={e => set('address', e.target.value)} />
        <Input label="City / State / ZIP" value={f.city_state_zip || ''} onChange={e => set('city_state_zip', e.target.value)} />
        <Input label="Site contact" value={f.site_contact || ''} onChange={e => set('site_contact', e.target.value)} />
        <Input label="Site phone" value={f.site_phone || ''} onChange={e => set('site_phone', e.target.value)} />
        <Input label="Technician" value={f.technician || ''} onChange={e => set('technician', e.target.value)} />
        <Input label="Technician / license number" value={f.technician_license || ''} onChange={e => set('technician_license', e.target.value)} />
        <Input label="Start-up date" type="date" value={(f.start_up_date || '').slice(0, 10)} onChange={e => set('start_up_date', e.target.value)} />
        <Select label="Property class" value={f.property_class || ''} onChange={e => set('property_class', e.target.value)}>
          <option value="">—</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="industrial">Industrial</option>
        </Select>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">Equipment on this install</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {EQUIP_TYPES.map(t => (
            <label key={t} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={(f.equipment_types || []).includes(t)} onChange={() => toggleType(t)} className="rounded border-slate-300 text-blue-600" /> {t}</label>
          ))}
        </div>
      </div>
      <Textarea label="Project notes" value={f.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} />
      <div className="flex justify-end"><Btn onClick={save} loading={saving}><Save size={15} /> Save overview</Btn></div>
    </Card>
  );
}

// ---------------- Documents vault ----------------
function Documents({ p, reload }) {
  const [type, setType] = useState('permit');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error('File is larger than 25 MB'); return; }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post(`/installations/${p.id}/documents`, { type, filename: file.name, mimeType: file.type || 'application/octet-stream', data: reader.result, note });
        toast.success('Uploaded'); setNote(''); if (fileRef.current) fileRef.current.value = ''; reload();
      } catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); } finally { setBusy(false); }
    };
    reader.onerror = () => { setBusy(false); toast.error('Could not read file'); };
    reader.readAsDataURL(file);
  };
  const view = async (d) => { try { const r = await api.get(`/installations/${p.id}/documents/${d.id}`, { responseType: 'blob' }); window.open(URL.createObjectURL(r.data), '_blank', 'noopener'); } catch { toast.error('Could not open'); } };
  const del = async (d) => { if (!window.confirm(`Delete ${d.filename}?`)) return; try { await api.delete(`/installations/${p.id}/documents/${d.id}`); reload(); } catch { toast.error('Could not delete'); } };

  const label = (t) => (DOC_TYPES.find(([k]) => k === t) || [, 'Other'])[1];
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm font-bold text-slate-900 mb-3">Add a document</p>
        <div className="grid sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
          <Select label="Type" value={type} onChange={e => setType(e.target.value)}>{DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Input label="Note (optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. AF Supply receipt for boiler" />
          <div>
            <input ref={fileRef} type="file" className="hidden" onChange={onFile} accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx,.xls,.xlsx" />
            <Btn onClick={() => fileRef.current?.click()} loading={busy}><Upload size={15} /> Upload file</Btn>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Permits, receipts, material/spec sheets, inspection records, photos. Office-only — never shown to the customer.</p>
      </Card>

      {(p.documents?.length || 0) === 0 ? (
        <Empty icon={<FileText size={22} />} title="No documents yet" message="Upload permits, vendor receipts and material sheets to keep them with this install." />
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {p.documents.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                <FileText size={18} className="text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{d.filename}</div>
                  <div className="text-[11px] text-slate-500"><span className="font-semibold text-slate-600">{label(d.type)}</span>{d.note ? ` · ${d.note}` : ''} · {d.uploaded_by} · {fmtDate(d.uploaded_at)}</div>
                </div>
                <button onClick={() => view(d)} title="Open" className="text-slate-400 hover:text-blue-600 p-1.5"><ExternalLink size={16} /></button>
                <button onClick={() => del(d)} title="Delete" className="text-slate-400 hover:text-red-600 p-1.5"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------- Equipment & warranty register ----------------
function Equipment({ p, reload }) {
  const [modal, setModal] = useState(null); // {item} for edit, {} for new
  const [vendors, setVendors] = useState([]);
  useEffect(() => { api.get('/purchasing/vendors').then(r => setVendors(r.data)).catch(() => {}); }, []);

  const del = async (e) => { if (!window.confirm('Remove this equipment item?')) return; try { await api.delete(`/installations/${p.id}/equipment/${e.id}`); reload(); } catch { toast.error('Could not delete'); } };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">What was installed and <span className="font-semibold text-slate-700">who you bought each unit from</span> — your warranty trail.</p>
        <Btn onClick={() => setModal({})}><Plus size={15} /> Add equipment</Btn>
      </div>
      {(p.equipment?.length || 0) === 0 ? (
        <Empty icon={<Package size={22} />} title="No equipment logged" message="Add each unit with its vendor, serial, purchase date and warranty length." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2.5 font-semibold">Unit</th><th className="px-5 py-2.5 font-semibold">Bought from</th><th className="px-5 py-2.5 font-semibold">Serial</th><th className="px-5 py-2.5 font-semibold">Purchased</th><th className="px-5 py-2.5 font-semibold">Warranty ends</th><th className="px-5 py-2.5 text-right font-semibold">Cost</th><th></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {p.equipment.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3"><div className="font-medium text-slate-800">{[e.category, e.manufacturer, e.model].filter(Boolean).join(' · ') || 'Unit'}</div></td>
                    <td className="px-5 py-3 text-slate-700">{e.vendor_name || '—'}{e.po_ref ? <div className="text-[11px] text-slate-400">{e.po_ref}</div> : ''}</td>
                    <td className="px-5 py-3 text-slate-500">{e.serial || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtDate(e.purchase_date)}</td>
                    <td className="px-5 py-3">{e.warranty_expiry ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.warranty_expiry < new Date().toISOString().slice(0, 10) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{fmtDate(e.warranty_expiry)}</span> : <span className="text-slate-400 text-xs">—</span>}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{money(e.cost)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setModal({ item: e })} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                      <button onClick={() => del(e)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {modal && <EquipModal p={p} vendors={vendors} item={modal.item} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function EquipModal({ p, vendors, item, onClose, onDone }) {
  const [f, setF] = useState(item || { category: '', manufacturer: '', model: '', serial: '', vendor_id: '', vendor_name: '', po_ref: '', purchase_date: '', cost: '', warranty_months: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    const body = { ...f };
    if (body.vendor_id) body.vendor_name = vendors.find(v => v.id === body.vendor_id)?.name || body.vendor_name;
    try {
      if (item?.id) await api.put(`/installations/${p.id}/equipment/${item.id}`, body);
      else await api.post(`/installations/${p.id}/equipment`, body);
      onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={item?.id ? 'Edit equipment' : 'Add equipment'} size="md"
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save} loading={busy}>Save</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Type / category" value={f.category || ''} onChange={e => set('category', e.target.value)} placeholder="Boiler, Hot water tank…" />
          <Input label="Manufacturer" value={f.manufacturer || ''} onChange={e => set('manufacturer', e.target.value)} />
          <Input label="Model" value={f.model || ''} onChange={e => set('model', e.target.value)} />
          <Input label="Serial / unit tag" value={f.serial || ''} onChange={e => set('serial', e.target.value)} />
        </div>
        <Select label="Bought from (vendor)" value={f.vendor_id || ''} onChange={e => set('vendor_id', e.target.value)}>
          <option value="">{f.vendor_name ? `${f.vendor_name} (unlinked)` : 'Select a vendor…'}</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        {!f.vendor_id && <Input label="Or type vendor name" value={f.vendor_name || ''} onChange={e => set('vendor_name', e.target.value)} placeholder="e.g. AF Supply, Heating & Burner" />}
        <div className="grid grid-cols-2 gap-3">
          <Input label="PO / receipt ref" value={f.po_ref || ''} onChange={e => set('po_ref', e.target.value)} />
          <Input label="Cost" type="number" step="0.01" value={f.cost ?? ''} onChange={e => set('cost', e.target.value)} />
          <Input label="Purchase date" type="date" value={(f.purchase_date || '').slice(0, 10)} onChange={e => set('purchase_date', e.target.value)} />
          <Input label="Warranty (months)" type="number" value={f.warranty_months ?? ''} onChange={e => set('warranty_months', e.target.value)} placeholder="e.g. 60" />
        </div>
        <Textarea label="Notes" value={f.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
      </div>
    </Modal>
  );
}

// ---------------- Commissioning report ----------------
function Report({ p, setP }) {
  const [r, setR] = useState(() => ({ install: {}, records: {}, readings: {}, combustion: {}, safety: {}, training: {}, ...p.report }));
  const [saving, setSaving] = useState(false);
  const techSig = useRef(null), custSig = useRef(null);
  const grp = (g, k, v) => setR(s => ({ ...s, [g]: { ...s[g], [k]: v } }));
  const fld = (k, v) => setR(s => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    const out = { ...r };
    if (techSig.current && !techSig.current.isEmpty()) out.tech_sig = techSig.current.toDataURL();
    if (custSig.current && !custSig.current.isEmpty()) out.cust_sig = custSig.current.toDataURL();
    try { const { data } = await api.put(`/installations/${p.id}`, { report: out }); setP(data); setR(s => ({ ...s, ...out })); toast.success('Report saved'); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };

  const CheckGroup = ({ title, items, g }) => (
    <Section title={title}>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {items.map(it => <label key={it} className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!r[g]?.[key(it)]} onChange={e => grp(g, key(it), e.target.checked)} className="rounded border-slate-300 text-blue-600 mt-0.5" /> {it}</label>)}
      </div>
    </Section>
  );
  const ReadGroup = ({ title, items, g }) => (
    <Section title={title}>
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map(it => (
          <div key={it} className="flex items-center gap-2">
            <span className="text-xs text-slate-600 flex-1">{it}</span>
            <input value={r[g]?.[key(it)] || ''} onChange={e => grp(g, key(it), e.target.value)} className="w-28 text-sm border border-slate-300 rounded-lg px-2 py-1 outline-none focus:border-blue-400" />
          </div>
        ))}
      </div>
    </Section>
  );

  return (
    <div className="space-y-4">
      <CheckGroup title="4 · Installation / pre-start verification" items={INSTALL_CHECKS} g="install" />
      <Section title="5 · Required test / inspection records">
        <div className="grid sm:grid-cols-2 gap-3">{RECORDS.map(it => <Input key={it} label={it} value={r.records?.[key(it)] || ''} onChange={e => grp('records', key(it), e.target.value)} />)}</div>
        <Textarea label="Pre-start deficiencies / corrective actions" value={r.deficiencies || ''} onChange={e => fld('deficiencies', e.target.value)} rows={2} className="mt-3" />
        <Textarea label="Additional installation notes" value={r.add_notes || ''} onChange={e => fld('add_notes', e.target.value)} rows={2} className="mt-3" />
      </Section>
      <ReadGroup title="6 · Initial operating readings" items={READINGS} g="readings" />
      <Section title="7 · Combustion analysis">
        <div className="grid sm:grid-cols-2 gap-3">{COMBUSTION.map(it => (<div key={it} className="flex items-center gap-2"><span className="text-xs text-slate-600 flex-1">{it}</span><input value={r.combustion?.[key(it)] || ''} onChange={e => grp('combustion', key(it), e.target.value)} className="w-28 text-sm border border-slate-300 rounded-lg px-2 py-1 outline-none focus:border-blue-400" /></div>))}</div>
        <Input label="Analyzer make / model · calibration due" value={r.analyzer || ''} onChange={e => fld('analyzer', e.target.value)} className="mt-3" />
      </Section>
      <CheckGroup title="8 · Functional / safety tests" items={SAFETY_TESTS} g="safety" />
      <Section title="Test results / failed tests / safety exceptions"><Textarea value={r.test_results || ''} onChange={e => fld('test_results', e.target.value)} rows={2} /></Section>
      <Section title="9 · Final commissioning status">
        <Select value={r.final_status || ''} onChange={e => fld('final_status', e.target.value)}><option value="">—</option>{FINAL_STATUS.map(s => <option key={s} value={s}>{s}</option>)}</Select>
      </Section>
      <CheckGroup title="10 · Customer training / documents" items={TRAINING} g="training" />
      <Section title="Handover">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Follow-up date" type="date" value={r.follow_up_date || ''} onChange={e => fld('follow_up_date', e.target.value)} />
          <Input label="Responsible party / customer notified" value={r.responsible || ''} onChange={e => fld('responsible', e.target.value)} />
        </div>
        <Textarea label="Outstanding deficiencies / required corrective work" value={r.outstanding || ''} onChange={e => fld('outstanding', e.target.value)} rows={2} className="mt-3" />
      </Section>
      <Section title="11 · Technician / customer sign-off">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <Input label="Technician printed name" value={r.tech_name || ''} onChange={e => fld('tech_name', e.target.value)} />
            <Input label="Date" type="date" value={r.tech_date || ''} onChange={e => fld('tech_date', e.target.value)} className="mt-2" />
            <p className="text-xs font-medium text-slate-600 mt-3 mb-1">Technician signature</p>
            {r.tech_sig && <img src={r.tech_sig} alt="tech signature" className="h-16 border border-slate-200 rounded mb-1 bg-white" />}
            <div className="border border-slate-300 rounded-lg overflow-hidden"><SignaturePad ref={techSig} height={120} /></div>
          </div>
          <div>
            <Input label="Customer / site representative" value={r.cust_name || ''} onChange={e => fld('cust_name', e.target.value)} />
            <Input label="Date" type="date" value={r.cust_date || ''} onChange={e => fld('cust_date', e.target.value)} className="mt-2" />
            <p className="text-xs font-medium text-slate-600 mt-3 mb-1">Customer signature</p>
            {r.cust_sig && <img src={r.cust_sig} alt="customer signature" className="h-16 border border-slate-200 rounded mb-1 bg-white" />}
            <div className="border border-slate-300 rounded-lg overflow-hidden"><SignaturePad ref={custSig} height={120} /></div>
          </div>
        </div>
      </Section>
      <div className="flex justify-end gap-2 sticky bottom-3">
        <Btn variant="outline" onClick={() => printReport({ ...p, report: r })}><Printer size={15} /> Print</Btn>
        <Btn onClick={save} loading={saving}><Save size={15} /> Save report</Btn>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return <Card className="p-5"><p className="text-sm font-bold text-slate-900 mb-3">{title}</p>{children}</Card>;
}

// ---------------- Print (Save as PDF) ----------------
function printReport(p) {
  const r = p.report || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const chk = (g, items) => items.map(it => `<div>${r[g]?.[key(it)] ? '☑' : '☐'} ${esc(it)}</div>`).join('');
  const reads = (g, items) => items.map(it => `<tr><td>${esc(it)}</td><td class="val">${esc(r[g]?.[key(it)] || '')}</td></tr>`).join('');
  const eq = (p.equipment || []).map(e => `<tr><td>${esc([e.category, e.manufacturer, e.model].filter(Boolean).join(' '))}</td><td>${esc(e.serial)}</td><td>${esc(e.vendor_name)}</td><td>${esc(e.po_ref)}</td><td>${esc(e.purchase_date)}</td><td>${esc(e.warranty_expiry)}</td></tr>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(p.project_number)} — Installation / Commissioning</title>
  <style>
    @page{margin:14mm}
    body{font:12px/1.4 -apple-system,Arial,sans-serif;color:#111}
    h1{font-size:18px;margin:0 0 2px} h2{font-size:12px;letter-spacing:.5px;color:#0d3c82;border-bottom:2px solid #0d3c82;padding-bottom:3px;margin:16px 0 8px;text-transform:uppercase}
    .sub{color:#555;font-size:11px;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 22px;font-size:11px}
    table{width:100%;border-collapse:collapse;font-size:11px} td,th{border:1px solid #ccc;padding:4px 6px;text-align:left} th{background:#f2f5fa}
    td.val{width:90px;text-align:right}
    .checks{display:grid;grid-template-columns:1fr 1fr;gap:2px 22px;font-size:11px}
    .sig{display:flex;gap:30px;margin-top:8px} .sig img{height:60px;border-bottom:1px solid #333}
    .box{border:1px solid #ccc;border-radius:6px;padding:8px;margin-top:6px;white-space:pre-wrap;min-height:28px;font-size:11px}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d3c82;padding-bottom:8px}
  </style>
  <div class="hd"><div><h1>New Installation &amp; Start-Up / Commissioning Report</h1><div class="sub">Residential / Commercial / Industrial · Gas / Oil / HVAC</div></div><div style="text-align:right"><strong>Clarke Mechanical Inc.</strong><br>${esc(p.project_number)}</div></div>
  <h2>1 · Company / Customer / Project</h2>
  <div class="grid">
    <div><b>Customer / company:</b> ${esc(p.customer_name)}</div><div><b>Job / WO #:</b> ${esc(p.wo_number)}</div>
    <div><b>Installation address:</b> ${esc(p.address)}</div><div><b>City / State / ZIP:</b> ${esc(p.city_state_zip)}</div>
    <div><b>Site contact / phone:</b> ${esc(p.site_contact)} ${esc(p.site_phone)}</div><div><b>Technician / license:</b> ${esc(p.technician)} ${esc(p.technician_license)}</div>
    <div><b>Property class:</b> ${esc(p.property_class)}</div><div><b>Start-up date:</b> ${esc(p.start_up_date)}</div>
  </div>
  <h2>2 · Equipment installed (warranty trail)</h2>
  <table><tr><th>Unit</th><th>Serial</th><th>Bought from</th><th>PO / ref</th><th>Purchased</th><th>Warranty ends</th></tr>${eq || '<tr><td colspan=6>—</td></tr>'}</table>
  <h2>4 · Installation / pre-start verification</h2><div class="checks">${chk('install', INSTALL_CHECKS)}</div>
  <h2>5 · Required records</h2><div class="grid">${RECORDS.map(it => `<div><b>${esc(it)}:</b> ${esc(r.records?.[key(it)] || '')}</div>`).join('')}</div>
  <div class="box"><b>Deficiencies:</b> ${esc(r.deficiencies)}</div><div class="box"><b>Notes:</b> ${esc(r.add_notes)}</div>
  <h2>6 · Initial operating readings</h2><table>${reads('readings', READINGS)}</table>
  <h2>7 · Combustion analysis</h2><table>${reads('combustion', COMBUSTION)}</table><div class="box"><b>Analyzer:</b> ${esc(r.analyzer)}</div>
  <h2>8 · Functional / safety tests</h2><div class="checks">${chk('safety', SAFETY_TESTS)}</div><div class="box"><b>Test results / exceptions:</b> ${esc(r.test_results)}</div>
  <h2>9 · Final commissioning status</h2><div>${esc(r.final_status) || '—'}</div>
  <h2>10 · Customer training / documents</h2><div class="checks">${chk('training', TRAINING)}</div>
  <div class="grid"><div><b>Follow-up date:</b> ${esc(r.follow_up_date)}</div><div><b>Responsible / notified:</b> ${esc(r.responsible)}</div></div>
  <div class="box"><b>Outstanding deficiencies:</b> ${esc(r.outstanding)}</div>
  <h2>11 · Sign-off</h2>
  <div class="sig">
    <div><div>${r.tech_sig ? `<img src="${r.tech_sig}">` : '<div style="height:60px;border-bottom:1px solid #333;width:200px"></div>'}</div><b>Technician:</b> ${esc(r.tech_name)} · ${esc(r.tech_date)}</div>
    <div><div>${r.cust_sig ? `<img src="${r.cust_sig}">` : '<div style="height:60px;border-bottom:1px solid #333;width:200px"></div>'}</div><b>Customer:</b> ${esc(r.cust_name)} · ${esc(r.cust_date)}</div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>`;
  const w = window.open('', '_blank');
  if (!w) { toast.error('Allow pop-ups to print the report'); return; }
  w.document.write(html); w.document.close();
}
