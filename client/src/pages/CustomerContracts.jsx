import { useEffect, useState } from 'react';
import api from '../api/client';
import { Card, Btn, Badge, Spinner, Empty } from '../components/UI';
import { Flame, Download, Printer, CheckCircle2 } from 'lucide-react';
import { printDocument, downloadPdf } from '../lib/printDoc';
import { contractDocPayload, packageFor, money } from '../lib/boilerContract';
import toast from 'react-hot-toast';

const fmtDate = (d) => (d ? new Date(String(d).length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function CustomerContracts() {
  const [list, setList] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    api.get('/portal/contracts').then(r => setList(r.data)).catch(() => setList([]));
    api.get('/auth/public-info').then(r => setMe(r.data)).catch(() => setMe({}));
  }, []);

  async function buildDoc(id) {
    const { data: c } = await api.get(`/portal/contracts/${id}`);
    const customer = { name: c.customer_name };
    return contractDocPayload({ ...c, contract_number: c.contract_number }, me || {}, customer);
  }
  async function view(id) { try { printDocument(await buildDoc(id)); } catch { toast.error('Could not open the contract'); } }
  async function download(id) { try { await downloadPdf(await buildDoc(id)); toast.success('Saved'); } catch { toast.error('Could not download'); } }

  if (list === null) return <Spinner />;

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-5">
        <Flame size={22} className="text-slate-400" />
        <h1 className="text-xl font-bold text-slate-900">Service Contracts</h1>
      </div>
      {list.length === 0 ? (
        <Empty icon={<Flame size={28} />} title="No service contracts" message="When we set up a boiler service agreement for you, it'll appear here." />
      ) : (
        <div className="space-y-3">
          {list.map(c => {
            const pk = packageFor(c.package);
            return (
              <Card key={c.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Contract {c.contract_number}</p>
                    <h2 className="font-bold text-slate-900">{c.property_name || c.property_address || 'Boiler service agreement'}</h2>
                  </div>
                  <Badge status={c.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                  <div className="text-slate-500">Package</div><div className="text-slate-800 font-medium text-right">{pk ? pk.name : c.package}</div>
                  <div className="text-slate-500">Annual price</div><div className="text-slate-800 font-medium text-right">{money(c.annual_price)}</div>
                  <div className="text-slate-500">Service frequency</div><div className="text-slate-800 text-right">{c.service_frequency || '—'}</div>
                  <div className="text-slate-500">Term</div><div className="text-slate-800 text-right">{fmtDate(c.start_date)} – {fmtDate(c.expiry_date)}</div>
                </div>
                {(c.boilers || []).length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Covered equipment</p>
                    <ul className="text-sm text-slate-600 space-y-0.5">
                      {c.boilers.map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5"><CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />{[b.type, b.manufacturer, b.model, b.capacity, b.fuel, b.system].filter(Boolean).join(' · ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2">
                  <Btn variant="outline" size="sm" onClick={() => view(c.id)}><Printer size={14} /> View</Btn>
                  <Btn variant="outline" size="sm" onClick={() => download(c.id)}><Download size={14} /> PDF</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
