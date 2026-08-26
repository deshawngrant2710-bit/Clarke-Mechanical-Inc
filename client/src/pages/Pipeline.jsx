import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Modal, Input, Textarea, Select, Empty, Spinner } from '../components/UI';
import { Filter, Plus, Phone, MessageSquare, PhoneCall, Trash2, UserPlus, CalendarClock, ChevronRight, Upload, FileSpreadsheet, Search, X, Voicemail } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

// Map a spreadsheet row (any header names) to lead fields, case-insensitively.
function mapRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).toLowerCase().trim();
    if (v == null || String(v).trim() === '') continue;
    if (/name/.test(key) && !out.name) out.name = String(v).trim();
    else if (/(phone|mobile|cell|number|tel)/.test(key) && !out.phone) out.phone = String(v).trim();
    else if (/(email|e-mail)/.test(key) && !out.email) out.email = String(v).trim();
    else if (/(address|street|location|city)/.test(key) && !out.address) out.address = String(v).trim();
    else if (/(source|referr|where|channel)/.test(key) && !out.source) out.source = String(v).trim();
    else if (/(value|amount|estimate|budget|price)/.test(key) && !out.value) out.value = v;
    else if (/(note|detail|comment|reason|need|message|description)/.test(key) && !out.notes) out.notes = String(v).trim();
  }
  return out;
}

const STAGES = [
  { id: 'new', label: 'New', dot: 'bg-slate-400', head: 'text-slate-600' },
  { id: 'contacted', label: 'Contacted', dot: 'bg-blue-500', head: 'text-blue-600' },
  { id: 'quoted', label: 'Quoted', dot: 'bg-amber-500', head: 'text-amber-600' },
  { id: 'won', label: 'Won', dot: 'bg-emerald-500', head: 'text-emerald-600' },
  { id: 'lost', label: 'Lost', dot: 'bg-red-500', head: 'text-red-600' },
];
const OUTCOMES = ['Reached — interested', 'Left voicemail', 'No answer', 'Callback scheduled', 'Not interested', 'Wrong number'];
const tel = (p) => (p || '').replace(/[^\d+]/g, '');
const money = (v) => (v == null || v === '' ? null : `$${Number(v).toLocaleString('en-US')}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null);

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [active, setActive] = useState(null); // lead being viewed
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  function load() {
    return api.get('/leads').then(r => { setLeads(r.data); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function moveStage(lead, stage) {
    setLeads(ls => ls.map(l => (l.id === lead.id ? { ...l, stage } : l)));
    try { await api.put(`/leads/${lead.id}`, { stage }); } catch { toast.error('Could not move lead'); load(); }
  }

  // Quick "left a voicemail" — logs it and sets a follow-up for tomorrow.
  async function markVoicemail(lead) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    try {
      const { data } = await api.post(`/leads/${lead.id}/log`, { outcome: 'Left voicemail', next_follow_up: tomorrow });
      setLeads(ls => ls.map(l => (l.id === lead.id ? data : l)));
      toast.success('Voicemail logged — reminder set for tomorrow');
    } catch { toast.error('Could not log voicemail'); }
  }

  if (loading) return <Spinner />;

  const open = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost').length;
  const wonValue = leads.filter(l => l.stage === 'won').reduce((s, l) => s + Number(l.value || 0), 0);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? leads.filter(l => [l.name, l.phone, l.email, l.address, l.source, l.notes].some(v => String(v || '').toLowerCase().includes(term)))
    : leads;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Pipeline" subtitle={`${open} open lead${open === 1 ? '' : 's'}${wonValue ? ` · ${money(wonValue)} won` : ''}`} icon={<Filter size={20} />}>
        <Btn variant="outline" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</Btn>
        <Btn onClick={() => setAddOpen(true)}><Plus size={16} /> Add Lead</Btn>
      </PageHeader>

      {leads.length === 0 ? (
        <Card className="p-2"><Empty icon={<Filter size={26} />} title="No leads yet" message='Click "Add Lead" to start building your pipeline. Phone messages captured by Sona also show up here automatically.' /></Card>
      ) : (
        <>
        <div className="relative mb-4 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, phone, city, source…"
            className="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
        {term && <p className="text-xs text-slate-500 mb-3">{filtered.length} match{filtered.length === 1 ? '' : 'es'} for "{q}"</p>}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const items = filtered.filter(l => (l.stage || 'new') === stage.id);
            return (
              <div key={stage.id} className="shrink-0 w-[290px]">
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className={`text-sm font-semibold ${stage.head}`}>{stage.label}</span>
                  <span className="text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {items.map(lead => (
                    <div key={lead.id} onClick={() => setActive(lead)}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-blue-300 hover:shadow transition-all cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
                        {money(lead.value) && <span className="text-xs font-semibold text-emerald-600 shrink-0">{money(lead.value)}</span>}
                      </div>
                      {lead.source && <p className="text-[11px] text-slate-400 mt-0.5">{lead.source}</p>}
                      {lead.phone && (
                        <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                          <a href={`tel:${tel(lead.phone)}`} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg"><Phone size={12} /> Call</a>
                          <a href={`sms:${tel(lead.phone)}`} className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg"><MessageSquare size={12} /> Text</a>
                          <button onClick={() => markVoicemail(lead)} title="Left a voicemail — remind me tomorrow" className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg"><Voicemail size={12} /> VM</button>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                        {lead.next_follow_up && <span className="flex items-center gap-1 text-amber-600"><CalendarClock size={12} /> {fmtDate(lead.next_follow_up)}</span>}
                        {lead.last_contacted && <span>Last: {fmtDate(lead.last_contacted)}</span>}
                        {(lead.call_log?.length || 0) > 0 && <span className="flex items-center gap-1"><PhoneCall size={11} /> {lead.call_log.length}</span>}
                      </div>
                      <select value={lead.stage || 'new'} onClick={e => e.stopPropagation()} onChange={e => moveStage(lead, e.target.value)}
                        className="mt-2 w-full text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-slate-50 outline-none focus:border-blue-400">
                        {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} onDone={load} />
      <ImportLeadsModal open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      {active && <LeadModal lead={active} onClose={() => setActive(null)} onDone={load} navigate={navigate} />}
    </div>
  );
}

function AddLeadModal({ open, onClose, onDone }) {
  const empty = { name: '', phone: '', email: '', address: '', source: 'Manual', value: '', notes: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(empty); /* eslint-disable-next-line */ }, [open]);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try { await api.post('/leads', form); toast.success('Lead added'); onClose(); onDone(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not add lead'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Lead">
      <div className="space-y-3">
        <Input label="Name" value={form.name} onChange={set('name')} placeholder="Jane Homeowner" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="(347) 000-0000" />
          <Input label="Email" value={form.email} onChange={set('email')} placeholder="optional" />
        </div>
        <Input label="Address" value={form.address} onChange={set('address')} placeholder="optional" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Source" value={form.source} onChange={set('source')} placeholder="Referral, Ad, Website…" />
          <Input label="Est. value ($)" type="number" value={form.value} onChange={set('value')} placeholder="optional" />
        </div>
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="What do they need? Any details from the call…" rows={3} />
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>Add Lead</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ImportLeadsModal({ open, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => { if (open) { setRows([]); setFileName(''); } }, [open]);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setParsing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const mapped = raw.map(mapRow).filter(r => r.name);
        setRows(mapped);
        if (!mapped.length) toast.error('No rows with a name column were found. Make sure the sheet has a "Name" header.');
      } catch {
        toast.error('Could not read that file. Use an .xlsx or .csv exported from Excel/Sheets.');
      } finally { setParsing(false); }
    };
    reader.onerror = () => { setParsing(false); toast.error('Could not read that file.'); };
    reader.readAsArrayBuffer(file);
  }

  async function doImport() {
    if (!rows.length) return;
    setImporting(true);
    try {
      const { data } = await api.post('/leads/import', { leads: rows });
      toast.success(`Imported ${data.added} lead${data.added === 1 ? '' : 's'}${data.skipped ? ` (${data.skipped} skipped)` : ''}`);
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Import failed'); }
    finally { setImporting(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import Leads from a Spreadsheet">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Upload an <strong>Excel (.xlsx)</strong> or <strong>CSV</strong> file. The first row should be column headers.
          We'll match columns automatically — include at least a <strong>Name</strong> column, plus any of:
          Phone, Email, Address, Source, Value, Notes.
        </p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
          <FileSpreadsheet size={28} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-600">{fileName || 'Choose a file…'}</span>
          <span className="text-xs text-slate-400">.xlsx, .xls, or .csv</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </label>

        {parsing && <p className="text-sm text-slate-500 text-center">Reading file…</p>}

        {rows.length > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 text-sm font-semibold text-slate-700">{rows.length} lead{rows.length === 1 ? '' : 's'} ready to import</div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {rows.slice(0, 50).map((r, i) => (
                <div key={i} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800 truncate">{r.name}</span>
                  <span className="text-xs text-slate-400 truncate">{[r.phone, r.email, r.source].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
              {rows.length > 50 && <div className="px-4 py-2 text-xs text-slate-400">…and {rows.length - 50} more</div>}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={doImport} loading={importing} disabled={!rows.length}><Upload size={15} /> Import {rows.length || ''} lead{rows.length === 1 ? '' : 's'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function LeadModal({ lead, onClose, onDone, navigate }) {
  const [form, setForm] = useState(lead);
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [createJob, setCreateJob] = useState(true);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await api.put(`/leads/${lead.id}`, {
        name: form.name, phone: form.phone, email: form.email, address: form.address,
        source: form.source, value: form.value, notes: form.notes, stage: form.stage,
        next_follow_up: form.next_follow_up,
      });
      toast.success('Saved'); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  async function quickVoicemail() {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    try {
      const { data } = await api.post(`/leads/${lead.id}/log`, { outcome: 'Left voicemail', next_follow_up: tomorrow });
      setForm(data); toast.success('Voicemail logged — reminder set for tomorrow'); onDone();
    } catch { toast.error('Could not log voicemail'); }
  }

  async function logCall() {
    setLogging(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/log`, { outcome, note, next_follow_up: followUp || undefined });
      setForm(data); setNote(''); setFollowUp('');
      toast.success('Call logged'); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not log call'); }
    finally { setLogging(false); }
  }

  async function convert() {
    setConverting(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/convert`, { createJob });
      toast.success('Converted to customer' + (data.jobId ? ' + job' : ''));
      onClose(); onDone();
      if (data.customerId) navigate(`/customers/${data.customerId}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not convert'); }
    finally { setConverting(false); }
  }

  async function del() {
    if (!window.confirm('Delete this lead?')) return;
    try { await api.delete(`/leads/${lead.id}`); toast.success('Lead deleted'); onClose(); onDone(); }
    catch { toast.error('Could not delete'); }
  }

  const converted = !!form.customer_id;

  return (
    <Modal open={!!lead} onClose={onClose} title={form.name || 'Lead'} size="lg">
      <div className="space-y-4">
        {converted && (
          <button onClick={() => { onClose(); navigate(`/customers/${form.customer_id}`); }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100">
            <span>Converted to a customer</span><ChevronRight size={16} />
          </button>
        )}

        {form.phone && (
          <div className="flex items-center gap-2">
            <a href={`tel:${tel(form.phone)}`} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"><Phone size={15} /> Call {form.phone}</a>
            <a href={`sms:${tel(form.phone)}`} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-semibold"><MessageSquare size={15} /> Text</a>
            <button onClick={quickVoicemail} title="Left a voicemail — remind me tomorrow" className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 text-sm font-semibold"><Voicemail size={15} /> Voicemail</button>
          </div>
        )}

        {/* Details */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={form.name || ''} onChange={set('name')} />
          <Input label="Phone" value={form.phone || ''} onChange={set('phone')} />
          <Input label="Email" value={form.email || ''} onChange={set('email')} />
          <Input label="Est. value ($)" type="number" value={form.value ?? ''} onChange={set('value')} />
          <Input label="Address" className="col-span-2" value={form.address || ''} onChange={set('address')} />
          <Select label="Stage" value={form.stage || 'new'} onChange={set('stage')}>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <Input label="Next follow-up" type="date" value={form.next_follow_up || ''} onChange={set('next_follow_up')} />
        </div>
        <Textarea label="Notes" value={form.notes || ''} onChange={set('notes')} rows={2} />
        <div className="flex justify-end"><Btn onClick={save} loading={saving} size="sm">Save changes</Btn></div>

        {/* Call log */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><PhoneCall size={15} /> Call log</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Select label="Outcome" value={outcome} onChange={e => setOutcome(e.target.value)}>
              {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
            </Select>
            <Input label="Next follow-up" type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} />
          </div>
          <Textarea label="Note" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What happened on the call?" />
          <div className="flex justify-end mt-2"><Btn onClick={logCall} loading={logging} size="sm" variant="outline"><PhoneCall size={14} /> Log call</Btn></div>

          {(form.call_log?.length || 0) > 0 && (
            <div className="mt-3 space-y-2">
              {[...form.call_log].reverse().map((c, i) => (
                <div key={i} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{c.outcome}</span>
                    <span className="text-[11px] text-slate-400">{new Date(c.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  {c.note && <p className="text-slate-600 text-xs mt-0.5">{c.note}</p>}
                  {c.by && <p className="text-[11px] text-slate-400 mt-0.5">by {c.by}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Convert + delete */}
        <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={del} className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1"><Trash2 size={13} /> Delete lead</button>
          {!converted && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={createJob} onChange={e => setCreateJob(e.target.checked)} className="rounded border-slate-300 text-blue-600" /> also create a job</label>
              <Btn onClick={convert} loading={converting} variant="success" size="sm"><UserPlus size={14} /> Convert to customer</Btn>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
