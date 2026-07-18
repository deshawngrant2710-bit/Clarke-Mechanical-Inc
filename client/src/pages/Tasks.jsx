import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage } from '../components/UI';
import { CheckSquare, Plus, Trash2, User, Calendar, Circle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null);

export default function Tasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState(null);
  const [staff, setStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState('open'); // open | mine | done | all
  const [modal, setModal] = useState(false);

  function load() {
    api.get('/tasks').then(r => setTasks(r.data));
    api.get('/employees').then(r => setStaff(r.data.filter(u => u.role && u.role !== 'customer'))).catch(() => {});
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => {});
  }
  useEffect(load, []);

  async function toggle(t) {
    try { await api.put(`/tasks/${t.id}`, { status: t.status === 'done' ? 'open' : 'done' }); load(); }
    catch { toast.error('Could not update'); }
  }
  async function del(t) {
    if (!window.confirm('Delete this task?')) return;
    try { await api.delete(`/tasks/${t.id}`); load(); }
    catch { toast.error('Could not delete'); }
  }

  if (!tasks) return <SkeletonPage stats={0} />;

  const shown = tasks.filter(t => {
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'mine') return t.status !== 'done' && t.assigned_to === user?.id;
    if (filter === 'done') return t.status === 'done';
    return true;
  });
  const FILTERS = [['open', 'Open'], ['mine', 'Assigned to me'], ['done', 'Done'], ['all', 'All']];

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="To-Do" subtitle="Tasks and follow-ups for the team" icon={<CheckSquare size={20} />}>
        <Btn onClick={() => setModal(true)}><Plus size={16} /> New Task</Btn>
      </PageHeader>

      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <Empty icon={<CheckSquare size={26} />} title="Nothing here" message="No tasks in this view. Add one to get started." />
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map(t => (
              <div key={t.id} className="flex items-start gap-3 p-4 hover:bg-slate-50">
                <button onClick={() => toggle(t)} className="mt-0.5 shrink-0" title={t.status === 'done' ? 'Mark open' : 'Mark done'}>
                  {t.status === 'done' ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} className="text-slate-300 hover:text-blue-500" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.title}</p>
                  {t.notes && <p className="text-sm text-slate-500 mt-0.5 whitespace-pre-wrap">{t.notes}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400">
                    {t.priority === 'high' && <span className="text-red-600 font-semibold">High priority</span>}
                    {t.assigned_name && <span className="inline-flex items-center gap-1"><User size={11} /> {t.assigned_name}</span>}
                    {t.customer_name && <button onClick={() => t.customer_id && navigate(`/customers/${t.customer_id}`)} className="text-blue-500 hover:underline">{t.customer_name}</button>}
                    {t.due_date && <span className="inline-flex items-center gap-1"><Calendar size={11} /> {fmtDate(t.due_date)}</span>}
                    {t.created_by && <span>· from {t.created_by}</span>}
                  </div>
                </div>
                <button onClick={() => del(t)} className="text-slate-300 hover:text-red-600 shrink-0"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <TaskModal open={modal} onClose={() => setModal(false)} staff={staff} customers={customers} onDone={load} />
    </div>
  );
}

export function TaskModal({ open, onClose, staff, customers, onDone, initial }) {
  const [form, setForm] = useState({ title: '', notes: '', assigned_to: '', customer_id: '', due_date: '', priority: 'normal' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ title: '', notes: '', assigned_to: '', customer_id: '', due_date: '', priority: 'normal', ...(initial || {}) }); }, [open, initial]);

  async function save() {
    if (!form.title.trim()) return toast.error('Enter a task');
    setSaving(true);
    try {
      await api.post('/tasks', form);
      toast.success('Task added');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not add'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Task" subtitle="Assign a to-do to a teammate" size="md">
      <div className="space-y-3">
        <Input label="Task *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Draft an estimate for Kirk Wright" />
        <Textarea label="Details" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. installed a 1½&quot; valve today — quote a replacement of the second one" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Assign to" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
            <option value="">Anyone</option>
            {(staff || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Customer (optional)" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
            <option value="">None</option>
            {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Due date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>Add Task</Btn>
        </div>
      </div>
    </Modal>
  );
}
