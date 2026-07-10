import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Modal, Input, Select, Empty, SkeletonPage, StatCard, SearchInput, Avatar } from '../components/UI';
import { Plus, UserCog, Users, Wrench, ShieldCheck, Mail, Phone, Trash2, Search, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const empty = { name: '', email: '', password: '', role: 'customer', phone: '' };
const ROLES = ['customer', 'technician', 'office', 'admin'];
const ROLE_STYLE = {
  customer: 'bg-slate-100 text-slate-600',
  technician: 'bg-blue-100 text-blue-700',
  office: 'bg-emerald-100 text-emerald-700',
  admin: 'bg-violet-100 text-violet-700',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Employees() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  function load() { api.get('/employees').then(r => { setUsers(r.data); setLoading(false); }); }
  useEffect(load, []);

  const stats = {
    total: users.length,
    customers: users.filter(u => u.role === 'customer').length,
    technicians: users.filter(u => u.role === 'technician').length,
    staff: users.filter(u => ['admin', 'office'].includes(u.role)).length,
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  async function handleSave() {
    if (!form.name || !form.email || !form.password) return toast.error('Name, email, and password required');
    setSaving(true);
    try {
      await api.post('/employees', form);
      toast.success('User added');
      setModal(false); setForm(empty); load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error adding user');
    } finally { setSaving(false); }
  }

  async function handleRoleChange(id, role) {
    try {
      await api.put(`/employees/${id}/role`, { role });
      toast.success(`Role updated to ${cap(role)}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not update role');
      load();
    }
  }

  async function handleDelete(id) {
    if (id === user?.id) return toast.error("You can't delete yourself");
    if (!confirm('Remove this user?')) return;
    await api.delete(`/employees/${id}`);
    toast.success('Removed'); load();
  }

  if (loading) return <SkeletonPage stats={4} rows={4} />;

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'customer', label: 'Customers' },
    { id: 'technician', label: 'Technicians' },
    { id: 'office', label: 'Office' },
    { id: 'admin', label: 'Admins' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Team & Roles" subtitle={`${users.length} users · ${stats.customers} customers`} icon={<UserCog size={20} />}>
        {isAdmin && <Btn onClick={() => setModal(true)}><Plus size={16} /> Add User</Btn>}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={stats.total} icon={<Users size={18} />} color="blue" />
        <StatCard label="Customers" value={stats.customers} icon={<UserRound size={18} />} color="slate" />
        <StatCard label="Technicians" value={stats.technicians} icon={<Wrench size={18} />} color="green" />
        <StatCard label="Staff & Admins" value={stats.staff} icon={<ShieldCheck size={18} />} color="purple" />
      </div>

      {!isAdmin && (
        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700 flex items-center gap-2">
          <ShieldCheck size={16} className="shrink-0" /> Only administrators can change user roles.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…" icon={<Search size={16} />} />
        <div className="flex flex-wrap gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {filters.map(f => (
            <button key={f.id} onClick={() => setRoleFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${roleFilter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><Empty icon={<UserCog size={28} />} title="No users found" message="Try adjusting your search or role filter." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {filtered.map(u => {
            const isSelf = u.id === user?.id;
            return (
              <Card key={u.id} className="p-5" hover>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={u.name} className="w-12 h-12 text-sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{u.name}{isSelf && <span className="text-xs text-slate-400 font-normal"> (you)</span>}</p>
                      <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_STYLE[u.role] || 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                    </div>
                  </div>
                  {isAdmin && !isSelf && (
                    <button onClick={() => handleDelete(u.id)} className="text-slate-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors shrink-0"><Trash2 size={15} /></button>
                  )}
                </div>
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <p className="flex items-center gap-2 text-sm text-slate-600 truncate"><Mail size={13} className="text-slate-400 shrink-0" />{u.email}</p>
                  {u.phone && <p className="flex items-center gap-2 text-sm text-slate-600"><Phone size={13} className="text-slate-400 shrink-0" />{u.phone}</p>}
                </div>
                {/* Admin-only role management */}
                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Role</label>
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                      title={isSelf ? "You can't change your own role" : 'Change role'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none transition-all focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed capitalize"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{cap(r)}</option>)}
                    </select>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Add User" subtitle="Create a user account and assign a role">
        <div className="space-y-3">
          <Input label="Full Name *" value={form.name} valid={form.name.trim().length > 1} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email *" icon={<Mail size={15} />} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input label="Phone" icon={<Phone size={15} />} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <Input label="Password *" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <Select label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {ROLES.map(r => <option key={r} value={r}>{cap(r)}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Adding…' : 'Add User'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
