import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell,
} from '../components/UI';
import { Plus, Search, AlertTriangle, Package, PackageX, Boxes, DollarSign, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const empty = { name: '', sku: '', description: '', category: '', quantity: 0, min_quantity: 5, unit_price: 0, supplier: '', location: '' };
const CATEGORIES = ['Filters', 'Refrigerant', 'Belts & Motors', 'Electrical', 'Controls', 'Ductwork', 'Fittings', 'Tools', 'Other'];
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() { api.get('/inventory').then(r => { setItems(r.data); setLoading(false); }); }
  useEffect(load, []);

  const filtered = items.filter(it => {
    const matchSearch = it.name.toLowerCase().includes(search.toLowerCase()) ||
      it.sku?.toLowerCase().includes(search.toLowerCase()) || it.category?.toLowerCase().includes(search.toLowerCase());
    const matchLow = !lowOnly || it.quantity <= it.min_quantity;
    return matchSearch && matchLow;
  });

  const stats = {
    total: items.length,
    value: items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    low: items.filter(i => i.quantity <= i.min_quantity && i.quantity > 0).length,
    out: items.filter(i => i.quantity === 0).length,
  };

  function openAdd() { setForm(empty); setEditId(null); setModal(true); }
  function openEdit(e, item) { e.stopPropagation(); setForm(item); setEditId(item.id); setModal(true); }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      if (editId) { await api.put(`/inventory/${editId}`, form); toast.success('Updated'); }
      else { await api.post('/inventory', form); toast.success('Item added'); }
      setModal(false); load();
    } catch { toast.error('Error saving'); }
    finally { setSaving(false); }
  }
  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this item?')) return;
    await api.delete(`/inventory/${id}`);
    toast.success('Deleted'); load();
  }
  const f = v => setForm(prev => ({ ...prev, ...v }));

  if (loading) return <SkeletonPage stats={4} />;

  function stockPill(item) {
    if (item.quantity === 0) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/20 px-2 py-0.5 rounded-full"><PackageX size={11} /> Out</span>;
    if (item.quantity <= item.min_quantity) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 ring-1 ring-inset ring-orange-600/20 px-2 py-0.5 rounded-full"><AlertTriangle size={11} /> Low</span>;
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20 px-2 py-0.5 rounded-full">In stock</span>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Inventory" subtitle={`${items.length} items tracked`} icon={<Package size={20} />}>
        <Btn onClick={openAdd}><Plus size={16} /> Add Item</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Items" value={stats.total} icon={<Boxes size={18} />} color="blue" />
        <StatCard label="Inventory Value" value={stats.value} prefix="$" decimals={0} icon={<DollarSign size={18} />} color="green" />
        <StatCard label="Low Stock" value={stats.low} icon={<AlertTriangle size={18} />} color="orange" />
        <StatCard label="Out of Stock" value={stats.out} icon={<PackageX size={18} />} color="red" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, SKU, or category…" icon={<Search size={16} />} />
        <button onClick={() => setLowOnly(!lowOnly)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${lowOnly ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          <AlertTriangle size={14} /> Low Stock Only {lowOnly && `(${stats.low + stats.out})`}
        </button>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<Package size={28} />}
            title={search || lowOnly ? 'No matching items' : 'No inventory items'}
            message={search || lowOnly ? 'Try adjusting your search or filter.' : 'Add parts and materials to track stock levels.'}
            action={!search && !lowOnly && <Btn onClick={openAdd}><Plus size={16} /> Add Item</Btn>} />
        ) : (
          <Table head={[
            { label: 'Item' }, { label: 'Category' }, { label: 'Location' },
            { label: 'In Stock', align: 'right' }, { label: 'Unit Price', align: 'right' },
            { label: 'Stock', align: 'right' }, { label: '', align: 'right' },
          ]}>
            {filtered.map(item => (
              <Row key={item.id}>
                <Cell>
                  <p className="font-semibold text-slate-800">{item.name}</p>
                  {item.sku && <p className="text-xs text-slate-400 font-mono">{item.sku}</p>}
                </Cell>
                <Cell><span className="text-sm text-slate-600">{item.category || 'Uncategorized'}</span></Cell>
                <Cell><span className="text-sm text-slate-500">{item.location || '—'}</span></Cell>
                <Cell align="right">
                  <span className={`text-sm font-bold ${item.quantity === 0 ? 'text-red-600' : item.quantity <= item.min_quantity ? 'text-orange-600' : 'text-slate-800'}`}>{item.quantity}</span>
                  <span className="text-xs text-slate-400"> / {item.min_quantity} min</span>
                </Cell>
                <Cell align="right"><span className="text-sm font-medium text-slate-700">{money(item.unit_price)}</span></Cell>
                <Cell align="right">{stockPill(item)}</Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={e => openEdit(e, item)} className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                    <button onClick={e => handleDelete(e, item.id)} className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Item' : 'Add Inventory Item'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name *" value={form.name} valid={form.name.trim().length > 1} onChange={e => f({ name: e.target.value })} />
            <Input label="SKU" value={form.sku} onChange={e => f({ sku: e.target.value })} />
          </div>
          <Select label="Category" value={form.category} onChange={e => f({ category: e.target.value })}>
            <option value="">Select category</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Quantity" type="number" value={form.quantity} onChange={e => f({ quantity: Number(e.target.value) })} />
            <Input label="Min Qty (alert)" type="number" value={form.min_quantity} onChange={e => f({ min_quantity: Number(e.target.value) })} />
            <Input label="Unit Price ($)" type="number" value={form.unit_price} onChange={e => f({ unit_price: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Supplier" value={form.supplier} onChange={e => f({ supplier: e.target.value })} />
            <Input label="Location" value={form.location} onChange={e => f({ location: e.target.value })} placeholder="e.g. Shelf B-3" />
          </div>
          <Textarea label="Description" value={form.description} onChange={e => f({ description: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Item'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
