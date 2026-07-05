import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Badge, StatCard, Empty, Spinner } from '../components/UI';
import { Briefcase, FileText, DollarSign, ClipboardList, Clock, CheckCircle, Calendar, UserCircle } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Portal() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [tab, setTab] = useState('jobs');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/portal/me'),
      api.get('/portal/jobs'),
      api.get('/portal/invoices'),
      api.get('/portal/quotes'),
    ]).then(([m, j, i, q]) => {
      setMe(m.data); setJobs(j.data); setInvoices(i.data); setQuotes(q.data); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const tabs = [
    { id: 'jobs', label: 'My Jobs', count: jobs.length },
    { id: 'invoices', label: 'My Invoices', count: invoices.length },
    { id: 'quotes', label: 'My Quotes', count: quotes.length },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={`Welcome, ${me?.name?.split(' ')[0] || 'there'}`} subtitle="Your service account" icon={<UserCircle size={20} />} />

      {!me?.linked ? (
        <Card>
          <Empty
            icon={<UserCircle size={28} />}
            title="Your account isn't linked yet"
            message={`We couldn't find service records for ${me?.email}. Once Clarke Mechanical adds you as a customer with this email, your jobs, invoices, and quotes will appear here automatically.`}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Open Jobs" value={me.stats.openJobs} icon={<Briefcase size={18} />} color="blue" />
            <StatCard label="Invoices" value={me.stats.invoiceCount} icon={<FileText size={18} />} color="purple" />
            <StatCard label="Balance Due" value={me.stats.balanceDue} prefix="$" decimals={2} icon={<DollarSign size={18} />} color={me.stats.balanceDue > 0 ? 'orange' : 'green'} />
          </div>

          <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t.label} <span className="opacity-70">({t.count})</span>
              </button>
            ))}
          </div>

          {tab === 'jobs' && (
            <Card>
              <CardHeader title="Service History" icon={<Briefcase size={15} />} />
              {jobs.length === 0 ? <Empty icon={<Briefcase size={24} />} title="No jobs yet" message="Your scheduled and completed services will show here." /> : (
                <div className="divide-y divide-slate-100">
                  {jobs.map(j => (
                    <div key={j.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${j.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                          {j.status === 'completed' ? <CheckCircle size={15} /> : <Clock size={15} />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{j.title}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Calendar size={11} />{j.scheduled_date || 'Unscheduled'}{j.scheduled_time ? ` · ${j.scheduled_time}` : ''}
                            {j.technician_name && ` · Tech: ${j.technician_name}`}
                          </p>
                        </div>
                      </div>
                      <Badge status={j.status} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'invoices' && (
            <Card>
              <CardHeader title="Invoices" icon={<FileText size={15} />} />
              {invoices.length === 0 ? <Empty icon={<FileText size={24} />} title="No invoices" message="Your invoices will appear here." /> : (
                <div className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-500">Due {inv.due_date || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800">{money(inv.total)}</span>
                        <Badge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'quotes' && (
            <Card>
              <CardHeader title="Estimates" icon={<ClipboardList size={15} />} />
              {quotes.length === 0 ? <Empty icon={<ClipboardList size={24} />} title="No estimates" message="Estimates we send you will appear here." /> : (
                <div className="divide-y divide-slate-100">
                  {quotes.map(q => (
                    <div key={q.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{q.quote_number}</p>
                        <p className="text-xs text-slate-500">Expires {q.expiry_date || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800">{money(q.total)}</span>
                        <Badge status={q.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
