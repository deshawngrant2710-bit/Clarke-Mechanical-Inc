import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Badge, Input, Select, Textarea, Empty, SkeletonPage, StatCard, SearchInput, Table, Row, Cell, Modal,
} from '../components/UI';
import {
  FileSignature, Plus, Search, Trash2, PlusCircle, MinusCircle, Send, Printer, Download, Eye, ArrowLeft, CheckCircle2, DollarSign, Flame,
} from 'lucide-react';
import { printDocument, sharePdf, downloadPdf, buildDocumentHtml } from '../lib/printDoc';
import { PACKAGES, PRICING_GUIDE, packageFor, contractDocPayload, money } from '../lib/boilerContract';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().slice(0, 10);
const plusYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
const emptyBoiler = () => ({ type: 'Scotch marine', manufacturer: '', model: '', serial: '', capacity: '', fuel: 'Natural gas', system: 'Steam' });
const blank = () => ({
  customer_id: '', property_name: '', property_address: '', boilers: [emptyBoiler()],
  package: 'professional', annual_price: PACKAGES.professional.default_price,
  labor_discount: PACKAGES.professional.labor_discount, parts_discount: 0, visits: PACKAGES.professional.visits,
  service_frequency: PACKAGES.professional.frequency,
  normal_hours: 'Mon–Fri, 8:00 AM – 5:30 PM', emergency_availability: 'Priority emergency response',
  emergency_rate: '', after_hours_rate: '', min_charge: '', response_time: '4 hours',
  payment_schedule: 'Annual in advance', start_date: today(), expiry_date: plusYear(), renewal_date: '',
  status: 'draft', exclusions_text: '', notes: '',
});

const FUELS = ['Natural gas', 'Oil (#2)', 'Oil (#4)', 'Oil (#6)', 'Dual-fuel'];
const SYSTEMS = ['Steam', 'Hot water'];
const TYPES = ['Scotch marine', 'Fire-tube', 'Water-tube', 'Cast-iron sectional', 'Condensing', 'Other'];
const STATUSES = ['draft', 'proposal_sent', 'awaiting_signature', 'active', 'expiring_soon', 'expired', 'cancelled'];
const STATUS_LABEL = { draft: 'Draft', proposal_sent: 'Proposal Sent', awaiting_signature: 'Awaiting Signature', active: 'Active', expiring_soon: 'Expiring Soon', expired: 'Expired', cancelled: 'Cancelled' };

export default function CommercialContracts() {
  const [rows, setRows] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [prices, setPrices] = useState({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  function load() {
    Promise.all([api.get('/boiler-contracts'), api.get('/customers'), api.get('/boiler-contracts/packages')])
      .then(([c, cu, p]) => { setRows(c.data); setCustomers(cu.data); setPrices(p.data.prices || {}); })
      .catch(() => setRows([]));
  }
  useEffect(load, []);

  const setField = (k, v) => setEditing(e => ({ ...e, [k]: v }));
  function setBoiler(i, k, v) { setEditing(e => { const boilers = [...e.boilers]; boilers[i] = { ...boilers[i], [k]: v }; return { ...e, boilers }; }); }
  function addBoiler() { setEditing(e => ({ ...e, boilers: [...e.boilers, emptyBoiler()] })); }
  function removeBoiler(i) { setEditing(e => ({ ...e, boilers: e.boilers.filter((_, idx) => idx !== i) })); }

  function openNew() { setEditing(blank()); setEditId(null); }
  function openEdit(id) {
    api.get(`/boiler-contracts/${id}`).then(({ data }) => {
      setEditing({
        ...blank(), ...data,
        boilers: (data.boilers && data.boilers.length) ? data.boilers : [emptyBoiler()],
        emergency_rate: data.emergency_rate ?? '', after_hours_rate: data.after_hours_rate ?? '', min_charge: data.min_charge ?? '',
        exclusions_text: (data.exclusions || []).join('\n'),
      });
      setEditId(id);
    }).catch(() => toast.error('Could not open contract'));
  }
  function choosePackage(id) {
    const pk = packageFor(id);
    setEditing(e => ({ ...e, package: id, annual_price: (prices[id] || pk.default_price), labor_discount: pk.labor_discount, parts_discount: pk.parts_discount, visits: pk.visits, service_frequency: pk.frequency }));
  }

  function payload() {
    const e = editing;
    return {
      customer_id: e.customer_id || null, property_name: e.property_name, property_address: e.property_address,
      boilers: e.boilers, package: e.package, annual_price: Number(e.annual_price) || 0,
      labor_discount: Number(e.labor_discount) || 0, parts_discount: Number(e.parts_discount) || 0,
      visits: Number(e.visits) || 0, service_frequency: e.service_frequency,
      normal_hours: e.normal_hours, emergency_availability: e.emergency_availability,
      emergency_rate: e.emergency_rate === '' ? null : Number(e.emergency_rate),
      after_hours_rate: e.after_hours_rate === '' ? null : Number(e.after_hours_rate),
      min_charge: e.min_charge === '' ? null : Number(e.min_charge),
      response_time: e.response_time, payment_schedule: e.payment_schedule,
      start_date: e.start_date || null, expiry_date: e.expiry_date || null, renewal_date: e.renewal_date || null,
      status: e.status, notes: e.notes,
      exclusions: e.exclusions_text.trim() ? e.exclusions_text.split('\n').map(s => s.trim()).filter(Boolean) : null,
    };
  }

  async function save(opts = {}) {
    if (!editing.customer_id) return toast.error('Pick a customer');
    setBusy('save');
    try {
      const body = payload();
      const { data } = editId
        ? await api.put(`/boiler-contracts/${editId}`, body)
        : await api.post('/boiler-contracts', body);
      const id = editId || data.id;
      if (!editId) setEditId(id);
      toast.success('Contract saved');
      if (opts.send) {
        try { await api.post(`/boiler-contracts/${id}/send`); toast.success('Contract emailed to customer'); }
        catch (e) { toast.error(e.response?.data?.error || 'Saved, but email failed'); }
      }
      load();
      if (opts.close) { setEditing(null); setEditId(null); }
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setBusy(''); }
  }

  async function docPayload() {
    let b = {};
    try { b = (await api.get('/auth/public-info')).data || {}; } catch { /* defaults */ }
    const c = customers.find(x => x.id === editing.customer_id) || {};
    const form = { ...payload(), contract_number: editing.contract_number, tax_rate: editing.tax_rate };
    return contractDocPayload(form, b, c);
  }
  async function doPrint() { printDocument(await docPayload()); }
  async function doDownload() { await downloadPdf(await docPayload()); toast.success('PDF saved'); }
  async function doShare() { const r = await sharePdf(await docPayload()); if (r.method === 'download') toast.success('PDF saved'); }
  async function previewCustomer() { try { setPreview(buildDocumentHtml(await docPayload(), { autoPrint: false })); } catch { toast.error('Could not build preview'); } }

  async function del(e, r) {
    e.stopPropagation();
    if (!window.confirm(`Delete contract ${r.contract_number}?`)) return;
    try { await api.delete(`/boiler-contracts/${r.id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  }

  const filtered = useMemo(() => (rows || []).filter(r =>
    (r.contract_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.property_name || '').toLowerCase().includes(search.toLowerCase())), [rows, search]);

  const stats = useMemo(() => {
    const list = rows || [];
    return {
      total: list.length,
      active: list.filter(r => ['active', 'expiring_soon'].includes(r.status)).length,
      expiring: list.filter(r => r.status === 'expiring_soon').length,
      revenue: list.filter(r => ['active', 'expiring_soon'].includes(r.status)).reduce((s, r) => s + (Number(r.annual_price) || 0), 0),
    };
  }, [rows]);

  if (rows === null) return <SkeletonPage stats={4} />;

  /* ---------------- Editor ---------------- */
  if (editing) {
    const e = editing;
    const cardCls = (id) => `text-left rounded-xl border p-3 transition ${e.package === id ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/40' : 'border-slate-200 hover:border-blue-300'}`;
    return (
      <div className="animate-fade-in max-w-4xl">
        <button onClick={() => { setEditing(null); setEditId(null); }} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"><ArrowLeft size={15} /> Back to contracts</button>
        <Card className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-blue-600" />
            <h1 className="text-lg font-bold text-slate-900">{editId ? `Contract ${e.contract_number || ''}` : 'New boiler service contract'}</h1>
            {e.status && <span className="ml-auto"><Badge status={e.status} /></span>}
          </div>

          {/* Customer + property */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Select label="Customer *" value={e.customer_id} onChange={ev => setField('customer_id', ev.target.value)}>
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Status" value={e.status} onChange={ev => setField('status', ev.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
            <Input label="Property name" value={e.property_name} onChange={ev => setField('property_name', ev.target.value)} placeholder="e.g. 1577 Tenants Corp" />
            <Input label="Property address" value={e.property_address} onChange={ev => setField('property_address', ev.target.value)} placeholder="Street, city, state ZIP" />
          </div>

          {/* Boiler inventory */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">Boiler equipment</label>
              <button onClick={addBoiler} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><PlusCircle size={14} /> Add boiler</button>
            </div>
            <div className="space-y-2">
              {e.boilers.map((b, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Select label="Type" value={b.type} onChange={ev => setBoiler(i, 'type', ev.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</Select>
                    <Input label="Manufacturer" value={b.manufacturer} onChange={ev => setBoiler(i, 'manufacturer', ev.target.value)} placeholder="Cleaver-Brooks" />
                    <Input label="Model" value={b.model} onChange={ev => setBoiler(i, 'model', ev.target.value)} />
                    <Input label="Serial #" value={b.serial} onChange={ev => setBoiler(i, 'serial', ev.target.value)} />
                    <Input label="Capacity" value={b.capacity} onChange={ev => setBoiler(i, 'capacity', ev.target.value)} placeholder="200 HP / MBH" />
                    <Select label="Fuel" value={b.fuel} onChange={ev => setBoiler(i, 'fuel', ev.target.value)}>{FUELS.map(f => <option key={f}>{f}</option>)}</Select>
                    <Select label="System" value={b.system} onChange={ev => setBoiler(i, 'system', ev.target.value)}>{SYSTEMS.map(s => <option key={s}>{s}</option>)}</Select>
                    <div className="flex items-end">
                      {e.boilers.length > 1 && <button onClick={() => removeBoiler(i)} className="text-slate-400 hover:text-red-600 flex items-center gap-1 text-xs pb-2"><MinusCircle size={14} /> Remove</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Service package */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">Service package</label>
            <div className="grid sm:grid-cols-3 gap-2">
              {Object.values(PACKAGES).map(pk => (
                <button key={pk.id} onClick={() => choosePackage(pk.id)} className={cardCls(pk.id)}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{pk.name}</span>
                    <span className="text-sm font-bold text-blue-700">{money(prices[pk.id] || pk.default_price)}/yr</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {pk.scope.slice(0, 5).map((s, k) => <li key={k} className="text-[11px] text-slate-500 leading-snug">• {s}</li>)}
                    {pk.scope.length > 5 && <li className="text-[11px] text-slate-400">+ {pk.scope.length - 5} more…</li>}
                  </ul>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Selecting a package fills the price and scope — you can change any of it below. <button type="button" onClick={() => setShowGuide(v => !v)} className="text-blue-600 hover:underline">{showGuide ? 'Hide' : 'Show'} large-boiler pricing guide</button></p>
            {showGuide && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                {PRICING_GUIDE.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-0.5"><span className="text-slate-600">{k}</span><span className="font-medium text-slate-800 whitespace-nowrap">{v}</span></div>)}
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Annual price ($)" type="number" min="0" value={e.annual_price} onChange={ev => setField('annual_price', ev.target.value)} />
            <Input label="Visits / year" type="number" min="0" value={e.visits} onChange={ev => setField('visits', ev.target.value)} />
            <Input label="Labor discount (%)" type="number" min="0" value={e.labor_discount} onChange={ev => setField('labor_discount', ev.target.value)} />
            <Input label="Parts discount (%)" type="number" min="0" value={e.parts_discount} onChange={ev => setField('parts_discount', ev.target.value)} />
            <Input label="Service frequency" value={e.service_frequency} onChange={ev => setField('service_frequency', ev.target.value)} className="sm:col-span-2" />
            <Input label="Payment schedule" value={e.payment_schedule} onChange={ev => setField('payment_schedule', ev.target.value)} className="sm:col-span-2" />
          </div>

          {/* Emergency terms */}
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">Emergency service terms</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Input label="Normal hours" value={e.normal_hours} onChange={ev => setField('normal_hours', ev.target.value)} />
              <Input label="Availability" value={e.emergency_availability} onChange={ev => setField('emergency_availability', ev.target.value)} />
              <Input label="Response target" value={e.response_time} onChange={ev => setField('response_time', ev.target.value)} />
              <Input label="Emergency rate ($/hr)" type="number" value={e.emergency_rate} onChange={ev => setField('emergency_rate', ev.target.value)} />
              <Input label="After-hours ($/hr)" type="number" value={e.after_hours_rate} onChange={ev => setField('after_hours_rate', ev.target.value)} />
              <Input label="Min. emergency charge ($)" type="number" value={e.min_charge} onChange={ev => setField('min_charge', ev.target.value)} />
            </div>
          </div>

          {/* Term */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input label="Start date" type="date" value={e.start_date} onChange={ev => setField('start_date', ev.target.value)} />
            <Input label="Expiration date" type="date" value={e.expiry_date} onChange={ev => setField('expiry_date', ev.target.value)} />
            <Input label="Renewal date" type="date" value={e.renewal_date} onChange={ev => setField('renewal_date', ev.target.value)} />
          </div>

          {/* Exclusions override + notes */}
          <Textarea label="Custom exclusions (optional — one per line, overrides the standard list)" value={e.exclusions_text} onChange={ev => setField('exclusions_text', ev.target.value)} rows={3} />
          <Textarea label="Internal notes (not on the contract)" value={e.notes} onChange={ev => setField('notes', ev.target.value)} rows={2} />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            <Btn onClick={() => save()} loading={busy === 'save'}>Save</Btn>
            <Btn variant="outline" onClick={() => save({ send: true })} loading={busy === 'save'}><Send size={15} /> Save &amp; email</Btn>
            <div className="flex-1" />
            <Btn variant="outline" onClick={previewCustomer}><Eye size={15} /> Preview</Btn>
            <Btn variant="outline" onClick={doDownload}><Download size={15} /> PDF</Btn>
            <Btn variant="outline" onClick={doPrint}><Printer size={15} /> Print</Btn>
          </div>
        </Card>

        <Modal open={!!preview} onClose={() => setPreview(null)} title="Contract preview" subtitle="Exactly what the customer receives" size="xl">
          <iframe title="contract preview" srcDoc={preview || ''} className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white" />
        </Modal>
      </div>
    );
  }

  /* ---------------- List ---------------- */
  return (
    <div className="animate-fade-in">
      <PageHeader title="Boiler Contracts" subtitle={`${rows.length} commercial service agreements`} icon={<FileSignature size={20} />}>
        <Btn onClick={openNew}><Plus size={16} /> New Contract</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={stats.total} icon={<FileSignature size={18} />} color="blue" />
        <StatCard label="Active" value={stats.active} icon={<CheckCircle2 size={18} />} color="green" />
        <StatCard label="Expiring soon" value={stats.expiring} icon={<Flame size={18} />} color="orange" />
        <StatCard label="Annual revenue" value={stats.revenue} prefix="$" decimals={0} icon={<DollarSign size={18} />} color="purple" />
      </div>

      <SearchInput className="mb-4" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number, customer or property…" icon={<Search size={16} />} />

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<FileSignature size={28} />} title="No contracts yet" message="Create a commercial boiler service agreement to get started." action={<Btn onClick={openNew}><Plus size={16} /> New Contract</Btn>} />
        ) : (
          <Table head={[{ label: 'Contract' }, { label: 'Customer' }, { label: 'Property' }, { label: 'Package' }, { label: 'Annual', align: 'right' }, { label: 'Expires' }, { label: 'Status', align: 'right' }, { label: '' }]}>
            {filtered.map(r => (
              <Row key={r.id} onClick={() => openEdit(r.id)}>
                <Cell><span className="font-semibold text-slate-800">{r.contract_number}</span></Cell>
                <Cell><span className="text-sm text-slate-700">{r.customer_name || '—'}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{r.property_name || r.property_address || '—'}</span></Cell>
                <Cell><span className="text-sm text-slate-600 capitalize">{r.package}</span></Cell>
                <Cell align="right"><span className="text-sm font-semibold text-slate-800">{money(r.annual_price)}</span></Cell>
                <Cell><span className="text-sm text-slate-500">{r.expiry_date || '—'}</span></Cell>
                <Cell align="right"><Badge status={r.status} /></Cell>
                <Cell align="right"><button onClick={e => del(e, r)} title="Delete" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
