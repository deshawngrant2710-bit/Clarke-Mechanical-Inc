import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Badge, Empty, Spinner } from '../components/UI';
import { Search, Users, Briefcase, FileText, ClipboardList } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    api.get(`/search?q=${encodeURIComponent(q)}`).then(r => setResults(r.data)).catch(() => setResults(null)).finally(() => setLoading(false));
  }, [q]);

  function submit(e) {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  }

  const total = results ? (results.customers.length + results.jobs.length + results.invoices.length + results.quotes.length) : 0;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Search" subtitle="Customers, jobs, invoices, and estimates" icon={<Search size={20} />} />

      <form onSubmit={submit} className="mb-6">
        <div className="relative max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={input} onChange={e => setInput(e.target.value)} placeholder="Search by name, number, phone, email…"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
        </div>
      </form>

      {loading && <Spinner />}
      {!loading && results && total === 0 && <Card><Empty icon={<Search size={22} />} title="No matches" message={`Nothing found for “${q}”.`} /></Card>}

      {!loading && results && total > 0 && (
        <div className="space-y-6">
          {results.customers.length > 0 && (
            <Card>
              <CardHeader title="Customers" icon={<Users size={15} />} />
              <div className="divide-y divide-slate-100">
                {results.customers.map(c => (
                  <button key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 text-left">
                    <span className="text-sm font-medium text-slate-800">{c.name}</span>
                    <span className="text-xs text-slate-400">{c.email}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {results.jobs.length > 0 && (
            <Card>
              <CardHeader title="Jobs" icon={<Briefcase size={15} />} />
              <div className="divide-y divide-slate-100">
                {results.jobs.map(j => (
                  <button key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 text-left">
                    <span className="min-w-0"><span className="text-sm font-medium text-slate-800">{j.title}</span> <span className="text-xs text-slate-400">· {j.customer_name || 'No customer'}</span></span>
                    <Badge status={j.status} />
                  </button>
                ))}
              </div>
            </Card>
          )}
          {results.invoices.length > 0 && (
            <Card>
              <CardHeader title="Invoices" icon={<FileText size={15} />} />
              <div className="divide-y divide-slate-100">
                {results.invoices.map(i => (
                  <button key={i.id} onClick={() => navigate(`/invoices/${i.id}`)} className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 text-left">
                    <span className="min-w-0"><span className="text-sm font-medium text-slate-800">{i.invoice_number}</span> <span className="text-xs text-slate-400">· {i.customer_name || '—'}</span></span>
                    <span className="flex items-center gap-2"><span className="text-sm text-slate-600">{money(i.total)}</span><Badge status={i.status} /></span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {results.quotes.length > 0 && (
            <Card>
              <CardHeader title="Estimates" icon={<ClipboardList size={15} />} />
              <div className="divide-y divide-slate-100">
                {results.quotes.map(x => (
                  <button key={x.id} onClick={() => navigate('/quotes')} className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 text-left">
                    <span className="min-w-0"><span className="text-sm font-medium text-slate-800">{x.quote_number}</span> <span className="text-xs text-slate-400">· {x.customer_name || '—'}</span></span>
                    <Badge status={x.status} />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
