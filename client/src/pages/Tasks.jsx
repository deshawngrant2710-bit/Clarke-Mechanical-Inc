import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage } from '../components/UI';
import { CheckSquare, Plus, Trash2, User, Calendar, Circle, CheckCircle2, Repeat, MessageSquare, Briefcase, FileText, Send, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null);
const RECUR_LABEL = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };

// Overdue → red, due today → amber, else muted.
function dueClass(due, status) {
  if (!due || status === 'done') return 'text-slate-400';
  if (due < today()) return 'text-red-600 font-semibold';
  if (due === today()) return 'text-amber-600 font-semibold';
  return 'text-slate-500';
}

export default function Tasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState(null);
  const [staff, setStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState('open'); // open | mine | done | all
  const [modal, setModal] = useState(false);
  const [openComments, setOpenComments] = useState(null);

  function load() {
    api.get('/tasks').then(r => setTasks(r.data));
    api.get('/employees').then(r => setStaff(r.data.filter(u => u.role && u.role !== 'customer'))).catch(() => {});
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => {});
    api.get('/jobs').then(r => setJobs(r.data)).catch(() => {});
    api.get('/billing/invoices').then(r => setInvoices(r.data)).catch(() => {});
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
  async function addComment(t, text) {
    try { await api.post(`/tasks/${t.id}/comments`, { text }); load(); }
    catch { toast.error('Could not add comment'); }
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
            {shown.map(t => {
              const comments = t.comments || [];
              const expanded = openComments === t.id;
              return (
                <div key={t.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
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
                        {t.job_id && <button onClick={() => navigate(`/jobs/${t.job_id}`)} className="inline-flex items-center gap-1 text-blue-500 hover:underline"><Briefcase size={11} /> {t.job_title || 'Job'}</button>}
                        {t.invoice_id && <button onClick={() => navigate(`/invoices/${t.invoice_id}`)} className="inline-flex items-center gap-1 text-blue-500 hover:underline"><FileText size={11} /> {t.invoice_number || 'Invoice'}</button>}
                        {t.due_date && <span className={`inline-flex items-center gap-1 ${dueClass(t.due_date, t.status)}`}><Calendar size={11} /> {fmtDate(t.due_date)}{t.status !== 'done' && t.due_date < today() ? ' · overdue' : ''}</span>}
                        {t.remind_at && <span className="inline-flex items-center gap-1"><Bell size={11} /> reminder</span>}
                        {t.recurrence && t.recurrence !== 'none' && <span className="inline-flex items-center gap-1 text-violet-600"><Repeat size={11} /> {RECUR_LABEL[t.recurrence]}</span>}
                        {t.created_by && <span>· from {t.created_by}</span>}
                        <button onClick={() => setOpenComments(expanded ? null : t.id)} className="inline-flex items-center gap-1 hover:text-slate-600">
                          <MessageSquare size={11} /> {comments.length || 'Comment'}
                        </button>
                      </div>
                    </div>
                    <button onClick={() => del(t)} className="text-slate-300 hover:text-red-600 shrink-0"><Trash2 size={15} /></button>
                  </div>

                  {expanded && (
                    <div className="ml-8 mt-3 border-l-2 border-slate-100 pl-3">
                      {comments.map(c => (
                        <div key={c.id} className="mb-2">
                          <p className="text-sm text-slate-700">{c.text}</p>
                          <p className="text-[11px] text-slate-400">{c.by} · {new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                      ))}
                      <CommentInput onAdd={(text) => addComment(t, text)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TaskModal open={modal} onClose={() => setModal(false)} staff={staff} customers={customers} jobs={jobs} invoices={invoices} onDone={load} />
    </div>
  );
}

function CommentInput({ onAdd }) {
  const [text, setText] = useState('');
  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  }
  return (
    <form onSubmit={submit} className="flex gap-2 mt-1">
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…"
        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500" />
      <button type="submit" className="text-blue-600 px-2"><Send size={16} /></button>
    </form>
  );
}

export function TaskModal({ open, onClose, staff, customers, jobs, invoices, onDone, initial }) {
  const empty = { title: '', notes: '', assigned_to: '', customer_id: '', job_id: '', invoice_id: '', due_date: '', remind_at: '', priority: 'normal', recurrence: 'none' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ ...empty, ...(initial || {}) }); }, [open, initial]);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

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
        <Input label="Task *" value={form.title} onChange={set('title')} placeholder="e.g. Follow up with Shore View Coop about quote #1042" />
        <Textarea label="Details" value={form.notes} onChange={set('notes')} placeholder="e.g. installed a 1½&quot; valve today — quote a replacement of the second one" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Assign to" value={form.assigned_to} onChange={set('assigned_to')}>
            <option value="">Anyone</option>
            {(staff || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Priority" value={form.priority} onChange={set('priority')}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Customer (optional)" value={form.customer_id} onChange={set('customer_id')}>
            <option value="">None</option>
            {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Job (optional)" value={form.job_id} onChange={set('job_id')}>
            <option value="">None</option>
            {(jobs || []).map(j => <option key={j.id} value={j.id}>{j.title}{j.customer_name ? ` — ${j.customer_name}` : ''}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Invoice (optional)" value={form.invoice_id} onChange={set('invoice_id')}>
            <option value="">None</option>
            {(invoices || []).map(iv => <option key={iv.id} value={iv.id}>{iv.invoice_number}{iv.customer_name ? ` — ${iv.customer_name}` : ''}</option>)}
          </Select>
          <Select label="Repeat" value={form.recurrence} onChange={set('recurrence')}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Due date" type="date" value={form.due_date} onChange={set('due_date')} />
          <Input label="Reminder" type="datetime-local" value={form.remind_at} onChange={set('remind_at')} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>Add Task</Btn>
        </div>
      </div>
    </Modal>
  );
}
