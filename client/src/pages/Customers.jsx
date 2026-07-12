import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Textarea, Empty, SkeletonPage, StatCard,
  SearchInput, Table, Row, Cell, Avatar,
} from '../components/UI';
import { Plus, Search, Phone, Mail, MapPin, Users, UserPlus, CalendarPlus, DollarSign, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const empty = { business_name: '', first_name: '', last_name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', notes: '' };
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | balance | new
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  function load() {
    api.get('/customers').then(r => { setCustomers(r.data); setLoading(false); });
  }
  useEffect(load, []);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(search) ||
      c.city?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q);
    const matchFilter =
      filter === 'all' ||
      (filter === 'active' && c.open_jobs > 0) ||
      (filter === 'balance' && c.balance_due > 0) ||
      (filter === 'new' && isThisMonth(c.created_at));
    return matchSearch && matchFilter;
  });

  const stats = {
    total: customers.length,
    newMonth: customers.filter(c => isThisMonth(c.created_at)).length,
    active: customers.filter(c => c.open_jobs > 0).length,
    outstanding: customers.reduce((s, c) => s + (c.balance_due || 0), 0),
  };

  async function handleSave() {
    if (!form.business_name.trim() && !form.first_name.trim() && !form.last_name.trim()) return toast.error('Enter a business name or a contact name');
    setSaving(true);
    try {
      const contact = [form.first_name, form.last_name].map(s => (s || '').trim()).filter(Boolean).join(' ');
      const name = form.business_name.trim() || contact;
      await api.post('/customers', { ...form, name });
      toast.success('Customer added');
      setModal(false);
      setForm(empty);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error saving customer');
    } finally { setSaving(false); }
  }

  if (loading) return <SkeletonPage stats={4} />;

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active Jobs' },
    { id: 'balance', label: 'Has Balance' },
    { id: 'new', label: 'New This Month' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Customers" subtitle={`${customers.length} total accounts`} icon={<Users size={20} />}>
        <Btn onClick={() => setModal(true)}><Plus size={16} /> Add Customer</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Customers" value={stats.total} icon={<Users size={18} />} color="blue" />
        <StatCard label="New This Month" value={stats.newMonth} icon={<UserPlus size={18} />} color="green" />
        <StatCard label="With Active Jobs" value={stats.active} icon={<CalendarPlus size={18} />} color="purple" />
        <StatCard label="Outstanding Balance" value={stats.outstanding} prefix="$" decimals={0} icon={<DollarSign size={18} />} color="orange" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, address…" icon={<Search size={16} />} />
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty
            icon={<Users size={28} />}
            title={search || filter !== 'all' ? 'No matching customers' : 'No customers yet'}
            message={search || filter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first customer to begin managing jobs and invoices.'}
            action={!search && filter === 'all' && <Btn onClick={() => setModal(true)}><Plus size={16} /> Add Customer</Btn>}
          />
        ) : (
          <Table head={[
            { label: 'Customer' }, { label: 'Contact' }, { label: 'Location' },
            { label: 'Open Jobs', align: 'right' }, { label: 'Lifetime', align: 'right' },
            { label: 'Balance', align: 'right' }, { label: '' },
          ]}>
            {filtered.map(c => (
              <Row key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                <Cell>
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} className="w-9 h-9 text-xs" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                      {c.business_name && (c.first_name || c.last_name) && (
                        <p className="text-xs text-slate-500 truncate">{[c.first_name, c.last_name].filter(Boolean).join(' ')}</p>
                      )}
                      {isThisMonth(c.created_at) && <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">New</span>}
                    </div>
                  </div>
                </Cell>
                <Cell>
                  <div className="space-y-0.5">
                    {c.phone && <p className="flex items-center gap-1.5 text-xs text-slate-600"><Phone size={11} className="text-slate-400" />{c.phone}</p>}
                    {c.email && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Mail size={11} className="text-slate-400" />{c.email}</p>}
                    {!c.phone && !c.email && <span className="text-xs text-slate-300">—</span>}
                  </div>
                </Cell>
                <Cell>
                  {c.city ? (
                    <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin size={12} className="text-slate-400" />{c.city}{c.state ? `, ${c.state}` : ''}</p>
                  ) : <span className="text-xs text-slate-300">—</span>}
                </Cell>
                <Cell align="right">
                  {c.open_jobs > 0
                    ? <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">{c.open_jobs}</span>
                    : <span className="text-slate-400 text-sm">0</span>}
                </Cell>
                <Cell align="right"><span className="text-sm font-medium text-slate-700">{money(c.lifetime_revenue)}</span></Cell>
                <Cell align="right">
                  {c.balance_due > 0
                    ? <span className="text-sm font-semibold text-red-600">{money(c.balance_due)}</span>
                    : <span className="text-sm text-emerald-600">Paid</span>}
                </Cell>
                <Cell align="right"><ChevronRight size={16} className="text-slate-300 inline" /></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Customer" subtitle="Create a new customer account">
        <div className="space-y-3">
          <Input label="Business name (optional)" icon={<Users size={15} />} value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} hint="Leave blank for a residential customer and use the contact name below" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact first name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label="Contact last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" icon={<Phone size={15} />} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
            <Input label="Email" icon={<Mail size={15} />} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@email.com" />
          </div>
          <Input label="Address" icon={<MapPin size={15} />} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            <Input label="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            <Input label="ZIP" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Saving…' : 'Add Customer'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
