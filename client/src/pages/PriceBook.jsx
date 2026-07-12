import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  SearchInput, Table, Row, Cell,
} from '../components/UI';
import { BookOpen, Plus, Pencil, Trash2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

const empty = { name: '', category: '', unit: '', unit_price: 0, notes: '' };
const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PriceBook() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() { api.get('/pricebook').then(r => setItems(r.data)); }
  useEffect(load, []);

  const categories = [...new Set((items || []).map(i => i.category).filter(Boolean))].sort();
  const filtered = (items || []).filter(i => {
    const matchSearch = !search || (i.name || '').toLowerCase().includes(search.toLowerCase()) || (i.category || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !category || i.category === category;
    return matchSearch && matchCat;
  });

  function openNew() { setForm(empty); setEditId(null); setModal(true); }
  function openEdit(it) { setForm({ name: it.name || '', category: it.category || '', unit: it.unit || '', unit_price: it.unit_price || 0, notes: it.notes || '' }); setEditId(it.id); setModal(true); }

  async function save() {
    if (!form.name.trim()) return toast.error('Enter an item name');
    setSaving(true);
    try {
      if (editId) await api.put(`/pricebook/${editId}`, form);
      else await api.post('/pricebook', form);
      toast.success(editId ? 'Item updated' : 'Item added');
      setModal(false); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  async function del(it) {
    if (!window.confirm(`Delete "${it.name}" from the price book?`)) return;
    try { await api.delete(`/pricebook/${it.id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  }

  if (!items) return <SkeletonPage />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Price Book" subtitle="Standard commercial pricing for quick quoting" icon={<BookOpen size={20} />}>
        <Btn onClick={openNew}><Plus size={16} /> New Item</Btn>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" className="flex-1" />
        <Select value={category} onChange={e => setCategory(e.target.value)} className="sm:w-52">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<BookOpen size={28} />}
            title={search || category ? 'No matching items' : 'Your price book is empty'}
            message={search || category ? 'Try a different search or filter.' : 'Add items so they auto-fill pricing on invoices and estimates.'}
            action={!search && !category && <Btn onClick={openNew}><Plus size={16} /> New Item</Btn>} />
        ) : (
          <Table head={[{ label: 'Item' }, { label: 'Category' }, { label: 'Unit' }, { label: 'Price', align: 'right' }, { label: '' }]}>
            {filtered.map(it => (
              <Row key={it.id}>
                <Cell>
                  <p className="font-semibold text-slate-800">{it.name}</p>
                  {it.notes && <p className="text-xs text-slate-400">{it.notes}</p>}
                </Cell>
                <Cell>{it.category ? <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5"><Tag size={10} /> {it.category}</span> : <span className="text-slate-300">—</span>}</Cell>
                <Cell><span className="text-sm text-slate-500">{it.unit || '—'}</span></Cell>
                <Cell align="right"><span className="font-medium text-slate-800 tabular-nums">{money(it.unit_price)}</span></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(it)} className="p-1.5 text-slate-400 hover:text-blue-600" title="Edit"><Pencil size={15} /></button>
                    <button onClick={() => del(it)} className="p-1.5 text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
      {items.length > 0 && <p className="text-xs text-slate-400 mt-3">{items.length} item{items.length === 1 ? '' : 's'} in the price book.</p>}

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Item' : 'New Price Book Item'}>
        <div className="space-y-3">
          <Input label="Item / service name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rooftop unit annual maintenance" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Maintenance" />
            <Input label="Unit" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. each, hour, ton" />
          </div>
          <Input label="Price ($) *" type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="0.00" />
          <Textarea label="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything to remember about this pricing" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={save} loading={saving}>{editId ? 'Save' : 'Add Item'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
