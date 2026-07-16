import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage, Badge,
  Table, Row, Cell,
} from '../components/UI';
import { ShoppingCart, Plus, PlusCircle, Trash2, Mail, Printer, PackageCheck, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emptyItem = () => ({ description: '', quantity: 1, unit_cost: 0, inventory_id: null });
const emptyPO = () => ({ vendor_id: '', order_date: new Date().toISOString().slice(0, 10), expected_date: '', notes: '', items: [emptyItem()] });

export default function Purchasing() {
  const [orders, setOrders] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyPO());
  const [saving, setSaving] = useState(false);
  const [vendorModal, setVendorModal] = useState(false);
  const [busy, setBusy] = useState('');

  function load() {
    Promise.all([api.get('/purchasing/orders'), api.get('/purchasing/vendors'), api.get('/inventory')])
      .then(([o, v, inv]) => { setOrders(o.data); setVendors(v.data); setInventory(inv.data); });
  }
  useEffect(load, []);

  function setItem(i, patch) {
    setForm(f => { const items = [...f.items]; items[i] = { ...items[i], ...patch }; return { ...f, items }; });
  }
  function onItemDesc(i, val) {
    const match = inventory.find(x => (x.name || '').toLowerCase() === val.trim().toLowerCase());
    setItem(i, match ? { description: val, inventory_id: match.id, unit_cost: Number(match.unit_price) || 0 } : { description: val, inventory_id: null });
  }
  const poTotal = form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0);

  async function save() {
    if (!form.vendor_id) return toast.error('Pick a vendor');
    if (!form.items.some(i => i.description.trim())) return toast.error('Add at least one item');
    setSaving(true);
    try {
      await api.post('/purchasing/orders', form);
      toast.success('Purchase order created');
      setModal(false); setForm(emptyPO()); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not create'); }
    finally { setSaving(false); }
  }

  async function emailPO(po) {
    setBusy(po.id);
    try { await api.post(`/purchasing/orders/${po.id}/email`); toast.success(`PO emailed to ${po.vendor_name}`); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not email'); }
    finally { setBusy(''); }
  }
  async function receivePO(po) {
    if (!window.confirm(`Mark ${po.po_number} received? Its items will be added to Inventory.`)) return;
    setBusy(po.id);
    try { await api.post(`/purchasing/orders/${po.id}/receive`); toast.success('Received — inventory updated'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not receive'); }
    finally { setBusy(''); }
  }
  async function del(po) {
    if (!window.confirm(`Delete ${po.po_number}?`)) return;
    try { await api.delete(`/purchasing/orders/${po.id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  }

  function printPO(po) {
    const rows = (po.items || []).map(i => `<tr><td>${i.description}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${money(i.unit_cost)}</td><td style="text-align:right">${money(i.total)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${po.po_number}</title>
      <style>body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1e293b;padding:40px;font-size:14px}
      h1{color:#0b2545;font-size:24px;margin:0 0 4px}.muted{color:#64748b}
      table{width:100%;border-collapse:collapse;margin:20px 0}th{text-align:left;font-size:11px;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #e2e8f0;padding:6px 0}
      td{padding:8px 0;border-bottom:1px solid #f1f5f9}.tot{text-align:right;font-size:18px;font-weight:800;margin-top:10px}
      @media print{body{padding:24px}}</style></head><body>
      <h1>PURCHASE ORDER</h1><p class="muted">${po.po_number} · ${po.order_date || ''}</p>
      <p><strong>Vendor:</strong> ${po.vendor_name || ''}${po.vendor_email ? ` · ${po.vendor_email}` : ''}<br/>
      ${po.expected_date ? `<strong>Needed by:</strong> ${po.expected_date}` : ''}</p>
      <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tot">Total: ${money(po.total)}</div>
      ${po.notes ? `<p class="muted">Notes: ${po.notes}</p>` : ''}
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('Allow pop-ups to print');
    w.document.write(html); w.document.close();
  }

  if (!orders) return <SkeletonPage stats={0} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Purchasing" subtitle="Order parts & materials from vendors" icon={<ShoppingCart size={20} />}>
        <Btn variant="outline" onClick={() => setVendorModal(true)}><Building2 size={15} /> Vendors</Btn>
        <Btn onClick={() => { setForm(emptyPO()); setModal(true); }}><Plus size={16} /> New PO</Btn>
      </PageHeader>

      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <Empty icon={<ShoppingCart size={28} />} title="No purchase orders yet"
            message="Create a PO to order parts from a vendor — it generates a PO number automatically."
            action={<Btn onClick={() => setModal(true)}><Plus size={16} /> New PO</Btn>} />
        ) : (
          <Table head={[{ label: 'PO #' }, { label: 'Vendor' }, { label: 'Date' }, { label: 'Total', align: 'right' }, { label: 'Status' }, { label: '', align: 'right' }]}>
            {orders.map(po => (
              <Row key={po.id}>
                <Cell><span className="font-semibold text-slate-800">{po.po_number}</span></Cell>
                <Cell><span className="text-sm text-slate-700">{po.vendor_name || '—'}</span></Cell>
                <Cell><span className="text-sm text-slate-500">{po.order_date || '—'}</span></Cell>
                <Cell align="right"><span className="font-medium text-slate-800 tabular-nums">{money(po.total)}</span></Cell>
                <Cell><Badge status={po.status} /></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => printPO(po)} title="Print" className="p-1.5 text-slate-400 hover:text-blue-600"><Printer size={15} /></button>
                    {po.vendor_email && <button onClick={() => emailPO(po)} disabled={busy === po.id} title="Email vendor" className="p-1.5 text-slate-400 hover:text-blue-600"><Mail size={15} /></button>}
                    {po.status !== 'received' && <button onClick={() => receivePO(po)} disabled={busy === po.id} title="Mark received (add to inventory)" className="p-1.5 text-slate-400 hover:text-emerald-600"><PackageCheck size={15} /></button>}
                    <button onClick={() => del(po)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* New PO */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Purchase Order" subtitle="A PO number is generated automatically" size="xl">
        <datalist id="inv-items">{inventory.map(x => <option key={x.id} value={x.name} />)}</datalist>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Vendor *" value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
              <option value="">Select vendor</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Input label="Order date" type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))} />
            <Input label="Needed by" type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
          </div>
          {vendors.length === 0 && <p className="text-xs text-amber-600">No vendors yet — add one from the Vendors button first.</p>}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Items</label>
              <button onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><PlusCircle size={14} /> Add item</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Type an item — matching inventory fills its cost, and receiving updates that item's stock.</p>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input list="inv-items" placeholder="Item / part" value={it.description} onChange={e => onItemDesc(i, e.target.value)}
                    className="col-span-12 sm:col-span-6 px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <input placeholder="Qty" type="number" min="0" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })}
                    className="col-span-4 sm:col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <div className="col-span-5 sm:col-span-3 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input placeholder="Unit cost" type="number" min="0" step="0.01" value={it.unit_cost} onChange={e => setItem(i, { unit_cost: e.target.value })}
                      className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  </div>
                  <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))} className="col-span-3 sm:col-span-1 text-slate-400 hover:text-red-600 flex justify-center"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3 text-slate-800 font-bold">Total: {money(poTotal)}</div>
          </div>

          <Textarea label="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Delivery instructions, account #, etc." />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={save} loading={saving}>Create PO</Btn>
          </div>
        </div>
      </Modal>

      <VendorsModal open={vendorModal} onClose={() => setVendorModal(false)} vendors={vendors} onDone={load} />
    </div>
  );
}

function VendorsModal({ open, onClose, vendors, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!form.name.trim()) return toast.error('Vendor name is required');
    setSaving(true);
    try { await api.post('/purchasing/vendors', form); toast.success('Vendor added'); setForm({ name: '', email: '', phone: '' }); onDone(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not add'); }
    finally { setSaving(false); }
  }
  async function del(v) {
    if (!window.confirm(`Delete vendor "${v.name}"?`)) return;
    try { await api.delete(`/purchasing/vendors/${v.id}`); toast.success('Deleted'); onDone(); }
    catch { toast.error('Could not delete'); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Vendors" subtitle="Suppliers you order from" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input label="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. H & B Supply" />
          <Input label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="orders@vendor.com" />
          <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
        </div>
        <div className="flex justify-end"><Btn size="sm" onClick={add} loading={saving}><Plus size={14} /> Add vendor</Btn></div>
        <div className="border-t border-slate-100 pt-3">
          {vendors.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-2">No vendors yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {vendors.map(v => (
                <div key={v.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{v.name}</p>
                    <p className="text-xs text-slate-400 truncate">{[v.email, v.phone].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <button onClick={() => del(v)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
