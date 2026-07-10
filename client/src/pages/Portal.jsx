import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Badge, Btn, StatCard, Empty, Spinner, Modal, Input, Textarea } from '../components/UI';
import { printDocument, buildDocumentHtml } from '../lib/printDoc';
import SignaturePad from '../components/SignaturePad';
import PayInvoiceModal from '../components/PayInvoiceModal';
import Logo from '../components/Logo';
import {
  Briefcase, FileText, DollarSign, ClipboardList, Clock, CheckCircle, Calendar,
  UserCircle, Plus, Wrench, MapPin, ChevronDown, Check, X, Phone, Mail, Pencil,
  Download, Ban, CalendarClock, Lock, Star, PenLine, MessageSquare, HelpCircle, Sparkles, Send, CreditCard, Eye, Camera, Receipt, Navigation,
} from 'lucide-react';
import { fileToProof } from '../lib/imageProof';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shown in the Help & Support card. Edit to match your real hours.
const BUSINESS_HOURS = 'Mon–Fri · 8:00 AM – 6:00 PM  ·  24/7 emergency service';

const FAQ = [
  { q: 'How do I request a service?', a: 'Tap "Request Service" at the top of your portal, describe what you need, and pick a preferred date. You\'ll get a confirmation email, and the request will appear under "My Services".' },
  { q: 'How do I pay an invoice?', a: 'Open the "My Invoices" tab and expand an unpaid invoice, then tap "Pay now" to pay securely by card. Prefer cash? Choose "Pay with cash" and our office will reach out to arrange it. Once paid, the invoice updates to "Paid" automatically. You can also download a PDF of any invoice.' },
  { q: 'Can I reschedule or cancel a visit?', a: 'Yes. Open the "My Services" tab, expand an upcoming job, and use Reschedule or Cancel.' },
  { q: 'How do I accept or decline an estimate?', a: 'Open the "My Estimates" tab, expand the estimate to review the line items and total, and choose Accept or Decline. You can also download it as a PDF.' },
  { q: 'How do I get help or reach a live agent?', a: 'Use the "Assistant" tab to ask a question anytime. If you\'d like a human, just ask to speak with an agent and you\'ll be connected to our team in the same chat. You can also call, text, or email us from "Help & Support".' },
  { q: 'How do I sign off on completed work or leave a review?', a: 'When a job is marked complete, open it under "My Services" to add your signature, and you can leave a star rating and review there too.' },
  { q: 'How do I update my contact info?', a: 'Tap "My Info" at the top of your portal to update your phone, address, and other details.' },
];

function Stars({ value, size = 14, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type={onChange ? 'button' : undefined} disabled={!onChange}
          onClick={onChange ? () => onChange(n) : undefined}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}>
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'} />
        </button>
      ))}
    </div>
  );
}

const JOB_STEPS = [
  { key: 'pending', label: 'Requested' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

function JobPhotoThumb({ jobId, photo }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/portal/jobs/${jobId}/photos/${photo.id}`).then(r => setData(r.data)).catch(() => {});
  }, [jobId, photo.id]);
  if (!data) return <div className="w-16 h-16 rounded-lg bg-slate-100 animate-pulse" />;
  const isPdf = (data.proof_type || photo.proof_type) === 'pdf';
  return isPdf ? (
    <a href={data.proof} target="_blank" rel="noreferrer" download="photo.pdf" className="w-16 h-16 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50">
      <FileText size={18} /><span className="text-[9px]">PDF</span>
    </a>
  ) : (
    <a href={data.proof} target="_blank" rel="noreferrer" className="block">
      <img src={data.proof} alt="job photo" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
    </a>
  );
}

function JobTimeline({ status }) {
  if (status === 'cancelled') {
    return <div className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><Ban size={14} /> This service was cancelled.</div>;
  }
  const idx = JOB_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center pt-1 pb-2">
      {JOB_STEPS.map((s, i) => {
        const done = i <= idx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 ${done ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>{s.label}</span>
            </div>
            {i < JOB_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 -mt-4 ${i < idx ? 'bg-blue-600' : 'bg-slate-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function Portal() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [tab, setTab] = useState('jobs');
  const [payInvoice, setPayInvoice] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [supportChatId, setSupportChatId] = useState(null);
  const [supportStatus, setSupportStatus] = useState(null);
  const chatEndRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [reqModal, setReqModal] = useState(false);
  const [reqPrefill, setReqPrefill] = useState(null);
  const [profileModal, setProfileModal] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [rescheduleJob, setRescheduleJob] = useState(null);
  const [reviewJob, setReviewJob] = useState(null);
  const [signoffJob, setSignoffJob] = useState(null);

  function load() {
    return Promise.all([
      api.get('/portal/me'), api.get('/portal/jobs'), api.get('/portal/invoices'), api.get('/portal/quotes'),
    ]).then(([m, j, i, q]) => {
      setMe(m.data); setJobs(j.data); setInvoices(i.data); setQuotes(q.data); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const toggle = (id) => setExpanded(e => (e === id ? null : id));

  async function respondQuote(quote, decision) {
    const id = typeof quote === 'string' ? quote : quote.id;
    try {
      await api.post(`/portal/quotes/${id}/respond`, { decision });
      toast.success(decision === 'accepted' ? 'Estimate accepted — thank you!' : 'Estimate declined');
      load();
      if (decision === 'accepted' && typeof quote === 'object') {
        setReqPrefill({
          title: `Work from estimate ${quote.quote_number || ''}`.trim(),
          description: (quote.items || []).map(it => `${it.description} × ${it.quantity}`).join('\n'),
        });
        setReqModal(true);
      }
    } catch (e) { toast.error(e.response?.data?.error || 'Could not update'); }
  }
  async function cancelJob(id) {
    if (!confirm('Cancel this service request?')) return;
    try { await api.post(`/portal/jobs/${id}/cancel`); toast.success('Service cancelled'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not cancel'); }
  }

  async function sendChat(override) {
    const text = (typeof override === 'string' ? override : chatInput).trim();
    if (!text || chatSending) return;

    // If the last live chat was closed, start fresh with the assistant.
    const wasClosed = supportChatId && supportStatus === 'closed';
    const liveChat = supportChatId && !wasClosed;
    if (wasClosed) { setSupportChatId(null); setSupportStatus(null); }

    const history = wasClosed ? [] : chatMessages;
    const outgoing = [...history, { role: 'user', text }];
    setChatMessages(outgoing);
    setChatInput('');
    setChatSending(true);
    try {
      if (liveChat) {
        await api.post(`/portal/support/${supportChatId}/messages`, { text });
        // The agent's reply arrives via polling below.
      } else {
        const r = await api.post('/portal/assistant', { message: text, history: history.filter(m => m.role === 'user' || m.role === 'assistant') });
        const withReply = [...outgoing, { role: 'assistant', text: r.data.reply }];
        setChatMessages(withReply);
        if (r.data.handoff) {
          const esc = await api.post('/portal/support/escalate', { history: withReply });
          setSupportChatId(esc.data.chatId);
          setSupportStatus('waiting');
          setChatMessages([...withReply, { role: 'system', text: 'Connecting you with our team — someone will reply here shortly. You can keep typing.' }]);
        }
      }
    } catch (e) {
      setChatMessages(m => [...m, { role: 'system', text: e.response?.data?.error || 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setChatSending(false);
    }
  }

  async function leaveChat() {
    if (!supportChatId) return;
    const id = supportChatId;
    setSupportChatId(null);
    setSupportStatus(null);
    setChatMessages([{ role: 'system', text: 'You left the chat. Ask a question to start over with the assistant.' }]);
    try { await api.post(`/portal/support/${id}/leave`); } catch { /* best effort */ }
  }

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, chatSending]);

  // While connected to a live agent, poll the chat for new messages.
  useEffect(() => {
    if (!supportChatId) return;
    let active = true;
    const poll = async () => {
      try {
        const r = await api.get(`/portal/support/${supportChatId}`);
        if (!active) return;
        setSupportStatus(r.data.status);
        setChatMessages(r.data.messages.map(m => ({
          role: m.sender === 'customer' ? 'user' : m.sender === 'agent' ? 'agent' : m.sender === 'system' ? 'system' : 'assistant',
          text: m.text,
          who: m.sender_name,
        })));
      } catch { /* ignore transient poll errors */ }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { active = false; clearInterval(iv); };
  }, [supportChatId]);

  if (loading) return <Spinner />;

  const tabs = [
    { id: 'jobs', label: 'My Services', count: jobs.length },
    { id: 'invoices', label: 'My Invoices', count: invoices.length },
    { id: 'quotes', label: 'My Estimates', count: quotes.length },
    { id: 'help', label: 'Help & Support' },
    { id: 'faq', label: 'FAQ' },
    { id: 'assistant', label: 'Assistant' },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const nextAppt = [...jobs]
    .filter(j => j.scheduled_date && j.scheduled_date >= today && !['completed', 'cancelled'].includes(j.status))
    .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || '')))[0] || null;

  return (
    <div className="animate-fade-in">
      <PageHeader title={`Welcome, ${me?.name?.split(' ')[0] || 'there'}`} subtitle="Your Clarke Mechanical account" icon={<UserCircle size={20} />}>
        {me?.linked && <>
          <Btn variant="outline" onClick={() => setProfileModal(true)}><Pencil size={15} /> My Info</Btn>
          <Btn onClick={() => setReqModal(true)}><Plus size={16} /> Request Service</Btn>
        </>}
      </PageHeader>

      {!me?.linked ? (
        <Card>
          <Empty
            icon={<UserCircle size={28} />}
            title="Your account isn't linked yet"
            message={`We couldn't find service records for ${me?.email}. Once Clarke Mechanical adds you as a customer with this email, your services, invoices, and estimates will appear here automatically.`}
          />
        </Card>
      ) : (
        <>
          {nextAppt && (
            <Card className="p-4 mb-6 border-l-4 border-blue-500 bg-blue-50/40">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 shrink-0"><Calendar size={18} /></div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Next appointment</p>
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {nextAppt.title} · {new Date(nextAppt.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{nextAppt.scheduled_time ? ` at ${nextAppt.scheduled_time}` : ''}
                  </p>
                </div>
                <span className="ml-auto shrink-0"><Badge status={nextAppt.status} /></span>
              </div>
            </Card>
          )}

          {/* Contact card */}
          <Card className="p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
                <span className="flex items-center gap-2"><Mail size={14} className="text-slate-400" />{me.email}</span>
                {me.profile?.phone && <span className="flex items-center gap-2"><Phone size={14} className="text-slate-400" />{me.profile.phone}</span>}
                {(me.profile?.address || me.profile?.city) && <span className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{[me.profile.address, me.profile.city, me.profile.state].filter(Boolean).join(', ')}</span>}
              </div>
              <button onClick={() => setPwModal(true)} className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1.5"><Lock size={12} /> Change password</button>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Active Services" value={me.stats.openJobs} icon={<Briefcase size={18} />} color="blue" />
            <StatCard label="Invoices" value={me.stats.invoiceCount} icon={<FileText size={18} />} color="purple" />
            <button type="button" onClick={() => setTab('invoices')} className="text-left w-full transition-transform hover:-translate-y-0.5" title="View invoices">
              <StatCard label="Balance Due" value={me.stats.balanceDue} prefix="$" decimals={2} icon={<DollarSign size={18} />} color={me.stats.balanceDue > 0 ? 'orange' : 'green'} sub={me.stats.balanceDue > 0 ? 'Tap to view invoices' : ''} />
            </button>
          </div>

          <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit flex-wrap">
            {tabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setExpanded(null); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t.label}{t.count != null && <span className="opacity-70"> ({t.count})</span>}
              </button>
            ))}
          </div>

          {/* JOBS */}
          {tab === 'jobs' && (
            <Card>
              <CardHeader title="Service History" icon={<Briefcase size={15} />}
                action={<Btn size="sm" onClick={() => setReqModal(true)}><Plus size={14} /> Request Service</Btn>} />
              {jobs.length === 0 ? (
                <Empty icon={<Briefcase size={24} />} title="No services yet"
                  message="Request your first service and it'll show up here."
                  action={<Btn onClick={() => setReqModal(true)}><Plus size={16} /> Request Service</Btn>} />
              ) : (
                <div className="divide-y divide-slate-100">
                  {jobs.map(j => {
                    const editable = ['pending', 'scheduled'].includes(j.status);
                    return (
                      <div key={j.id}>
                        <button onClick={() => toggle(j.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 text-left">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${j.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                              {j.status === 'completed' ? <CheckCircle size={15} /> : <Clock size={15} />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{j.title}</p>
                              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Calendar size={11} />{j.scheduled_date || 'To be scheduled'}{j.scheduled_time ? ` · ${j.scheduled_time}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {j.en_route_at && !['completed', 'cancelled'].includes(j.status) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold"><Navigation size={10} /> On the way</span>
                            )}
                            <Badge status={j.status} />
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded === j.id ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        {expanded === j.id && (
                          <div className="px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                            <JobTimeline status={j.status} />
                            <div className="text-sm text-slate-600 space-y-1.5 mt-2">
                              {j.job_type && <p><span className="text-slate-400">Type:</span> {j.job_type}</p>}
                              {j.description && <p><span className="text-slate-400">Details:</span> {j.description}</p>}
                              {j.technician_name && <p className="flex items-center gap-1.5"><Wrench size={12} className="text-slate-400" /> Technician: {j.technician_name}</p>}
                              {j.address && <p className="flex items-center gap-1.5"><MapPin size={12} className="text-slate-400" /> {j.address}</p>}
                            </div>
                            {j.photos?.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5"><Camera size={12} /> Photos</p>
                                <div className="flex flex-wrap gap-2">
                                  {j.photos.map(p => <JobPhotoThumb key={p.id} jobId={j.id} photo={p} />)}
                                </div>
                              </div>
                            )}
                            {editable && (
                              <div className="flex gap-2 mt-3">
                                <Btn size="sm" variant="outline" onClick={() => setRescheduleJob(j)}><CalendarClock size={14} /> Reschedule</Btn>
                                <Btn size="sm" variant="outline" className="!text-red-600 !border-red-200 hover:!bg-red-50" onClick={() => cancelJob(j.id)}><Ban size={14} /> Cancel</Btn>
                              </div>
                            )}
                            {j.status === 'completed' && (
                              <div className="mt-3 space-y-3">
                                {/* Sign-off */}
                                {j.signed_at ? (
                                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                                    <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle size={14} /> Signed off by {j.signed_by}</p>
                                    <p className="text-xs text-slate-500">{new Date(j.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                                    {j.signature && <img src={j.signature} alt="signature" className="mt-2 h-14 bg-white border border-slate-200 rounded" />}
                                  </div>
                                ) : (
                                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-sm text-amber-800">Please confirm this work was completed to your satisfaction.</p>
                                    <Btn size="sm" onClick={() => setSignoffJob(j)}><PenLine size={14} /> Sign off</Btn>
                                  </div>
                                )}
                                {/* Review */}
                                {j.review ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-slate-500">Your rating:</span>
                                    <Stars value={j.review.rating} />
                                    {j.review.comment && <span className="text-sm text-slate-500 italic">"{j.review.comment}"</span>}
                                  </div>
                                ) : (
                                  <Btn size="sm" variant="outline" onClick={() => setReviewJob(j)}><Star size={14} /> Leave a review</Btn>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* INVOICES */}
          {tab === 'invoices' && (
            <Card>
              <CardHeader title="Invoices" icon={<FileText size={15} />} />
              {invoices.length === 0 ? <Empty icon={<FileText size={24} />} title="No invoices" message="Your invoices will appear here." /> : (
                <div className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <div key={inv.id}>
                      <button onClick={() => toggle(inv.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 text-left">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{inv.invoice_number}</p>
                          <p className="text-xs text-slate-500">Issued {inv.issue_date || 'N/A'} · Due {inv.due_date || 'N/A'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-slate-800">{money(inv.total)}</span>
                          <Badge status={inv.status} />
                          <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded === inv.id ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {expanded === inv.id && (
                        <div className="px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-200/70">
                              {(inv.items || []).map((it, i) => (
                                <tr key={i}>
                                  <td className="py-1.5 text-slate-600">{it.description}</td>
                                  <td className="py-1.5 text-right text-slate-500 w-16">×{it.quantity}</td>
                                  <td className="py-1.5 text-right text-slate-800 font-medium w-24">{money(it.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex items-end justify-between mt-2 pt-2 border-t border-slate-200">
                            <div className="flex gap-2">
                              {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                <Btn size="sm" onClick={() => setPayInvoice(inv)}><CreditCard size={14} /> Pay now</Btn>
                              )}
                              <Btn size="sm" variant="outline" onClick={() => setViewDoc({ kind: 'invoice', doc: inv })}><Eye size={14} /> View</Btn>
                              {inv.status === 'paid' && (
                                <Btn size="sm" variant="outline" onClick={() => setViewDoc({ kind: 'receipt', doc: inv })}><Receipt size={14} /> Receipt</Btn>
                              )}
                              <Btn size="sm" variant="outline" onClick={() => printDocument({ kind: 'invoice', doc: inv, business: me.business, customer: me.profile })}><Download size={14} /> Download PDF</Btn>
                            </div>
                            <div className="w-48 space-y-0.5 text-sm">
                              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
                              <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(inv.tax_amount)}</span></div>
                              <div className="flex justify-between font-bold text-slate-800"><span>Total</span><span>{money(inv.total)}</span></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* QUOTES */}
          {tab === 'quotes' && (
            <Card>
              <CardHeader title="Estimates" icon={<ClipboardList size={15} />} />
              {quotes.length === 0 ? <Empty icon={<ClipboardList size={24} />} title="No estimates" message="Estimates we send you will appear here — you can accept or decline them online." /> : (
                <div className="divide-y divide-slate-100">
                  {quotes.map(q => {
                    const pending = ['sent', 'draft'].includes(q.status);
                    return (
                      <div key={q.id}>
                        <button onClick={() => toggle(q.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 text-left">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{q.quote_number}</p>
                            <p className="text-xs text-slate-500">Expires {q.expiry_date || 'N/A'}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-800">{money(q.total)}</span>
                            <Badge status={q.status} />
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded === q.id ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        {expanded === q.id && (
                          <div className="px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                            <table className="w-full text-sm mb-3">
                              <tbody className="divide-y divide-slate-200/70">
                                {(q.items || []).map((it, i) => (
                                  <tr key={i}>
                                    <td className="py-1.5 text-slate-600">{it.description}</td>
                                    <td className="py-1.5 text-right text-slate-500 w-16">×{it.quantity}</td>
                                    <td className="py-1.5 text-right text-slate-800 font-medium w-24">{money(it.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <Btn size="sm" variant="outline" onClick={() => setViewDoc({ kind: 'quote', doc: q })}><Eye size={14} /> View</Btn>
                              <Btn size="sm" variant="outline" onClick={() => printDocument({ kind: 'quote', doc: q, business: me.business, customer: me.profile })}><Download size={14} /> Download PDF</Btn>
                              {pending ? (
                                <div className="flex gap-2">
                                  <Btn size="sm" variant="outline" onClick={() => respondQuote(q, 'declined')}><X size={14} /> Decline</Btn>
                                  <Btn size="sm" variant="success" onClick={() => respondQuote(q, 'accepted')}><Check size={14} /> Accept Estimate</Btn>
                                </div>
                              ) : (
                                <p className={`text-sm font-medium ${q.status === 'accepted' ? 'text-emerald-600' : 'text-slate-500'}`}>You {q.status} this estimate.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {tab === 'help' && me.business && (
            <Card>
              <CardHeader title="Help & Support" icon={<HelpCircle size={15} />} />
              <div className="p-5">
                <p className="text-sm text-slate-500 mb-4">Questions about a service, invoice, or appointment? Reach our team:</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {me.business.phone && (
                    <>
                      <a href={`tel:${me.business.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"><Phone size={14} /> Call us</a>
                      <a href={`sms:${me.business.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors"><MessageSquare size={14} /> Text us</a>
                    </>
                  )}
                  {me.business.email && <a href={`mailto:${me.business.email}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"><Mail size={14} /> Email us</a>}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-slate-500">
                  {me.business.phone && <span className="flex items-center gap-1.5"><Phone size={13} className="text-slate-400" />{me.business.phone}</span>}
                  {me.business.email && <span className="flex items-center gap-1.5"><Mail size={13} className="text-slate-400" />{me.business.email}</span>}
                  <span className="flex items-center gap-1.5"><Clock size={13} className="text-slate-400" />{me.business?.hours || BUSINESS_HOURS}</span>
                </div>
              </div>
            </Card>
          )}

          {tab === 'faq' && (
            <Card>
              <CardHeader title="Frequently Asked Questions" icon={<HelpCircle size={15} />} />
              <div className="px-5 pb-2 divide-y divide-slate-100">
                {FAQ.map((item, i) => (
                  <details key={i} className="group py-3">
                    <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-medium text-slate-800">
                      {item.q}
                      <ChevronDown size={16} className="text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
                  </details>
                ))}
              </div>
            </Card>
          )}
          {tab === 'assistant' && (
            <Card className="overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white shrink-0 overflow-hidden p-1 shadow-sm">
                  <Logo variant="icon" height={26} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white leading-tight">
                    {supportChatId ? (supportStatus === 'live' ? 'Clarke Mechanical — Live' : supportStatus === 'closed' ? 'Chat ended' : 'Connecting you…') : 'Clarke Assistant'}
                  </p>
                  <p className="text-[11px] text-blue-100 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${supportStatus === 'closed' ? 'bg-slate-300' : 'bg-emerald-300'}`} />
                    {supportChatId
                      ? (supportStatus === 'live' ? 'A team member is with you' : supportStatus === 'closed' ? 'This chat has ended' : 'Waiting for a team member…')
                      : 'Usually replies instantly'}
                  </p>
                </div>
                {supportChatId && supportStatus !== 'closed' && (
                  <button onClick={leaveChat} className="shrink-0 text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 rounded-full px-3 py-1 transition-colors">Leave chat</button>
                )}
              </div>

              <div className="flex flex-col h-[30rem] bg-slate-50/60">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="text-center mt-6 px-4">
                      <div className="mx-auto mb-3 flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden p-2"><Logo variant="icon" height={36} /></div>
                      <p className="text-sm font-semibold text-slate-700">Hi{me?.name ? `, ${me.name.split(' ')[0]}` : ''}! How can we help?</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Ask about your service, scheduling, or billing — or ask for an agent and we’ll connect you.</p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {['How do I pay my invoice?', 'When is my next appointment?', 'I need to talk to an agent'].map(q => (
                          <button key={q} onClick={() => sendChat(q)} disabled={chatSending}
                            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-50">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((m, i) => {
                    if (m.role === 'system') return <p key={i} className="text-center text-[11px] text-slate-400 py-1">{m.text}</p>;
                    const isUser = m.role === 'user';
                    const isAgent = m.role === 'agent';
                    return (
                      <div key={i} className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                        {!isUser && (
                          <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${isAgent ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                            {isAgent ? <UserCircle size={16} /> : <Sparkles size={14} />}
                          </div>
                        )}
                        <div className="max-w-[78%]">
                          {isAgent && <p className="text-[10px] font-semibold text-emerald-600 mb-0.5 ml-1">{m.who || 'Agent'}</p>}
                          <div className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${isUser ? 'bg-blue-600 text-white rounded-br-md' : isAgent ? 'bg-white text-slate-700 border border-emerald-100 rounded-bl-md' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-md'}`}>
                            {m.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {chatSending && !supportChatId && (
                    <div className="flex items-end gap-2">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600 shrink-0"><Sparkles size={14} /></div>
                      <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-sm">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t border-slate-100 bg-white p-3">
                  <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-4 pr-1.5 py-1 focus-within:ring-2 focus-within:ring-blue-500/30">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      placeholder={supportStatus === 'closed' ? 'Ask a new question…' : supportChatId ? 'Message our team…' : 'Type your message…'}
                      className="flex-1 bg-transparent text-sm outline-none py-1.5"
                    />
                    <button onClick={() => sendChat()} disabled={!chatInput.trim() || chatSending}
                      className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center mt-2">{supportChatId ? 'A team member will reply here.' : 'AI can make mistakes and can’t access your account. Ask for an agent anytime.'}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <ServiceRequestModal open={reqModal} initial={reqPrefill} onClose={() => { setReqModal(false); setReqPrefill(null); }} onDone={load} />
      <ProfileModal open={profileModal} onClose={() => setProfileModal(false)} profile={me?.profile} onDone={load} />
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} />
      <RescheduleModal job={rescheduleJob} onClose={() => setRescheduleJob(null)} onDone={load} />
      <ReviewModal job={reviewJob} onClose={() => setReviewJob(null)} onDone={load} />
      <SignoffModal job={signoffJob} defaultName={me?.name} onClose={() => setSignoffJob(null)} onDone={load} />
      {payInvoice && <PayInvoiceModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onPaid={() => { setPayInvoice(null); load(); }} />}
      {viewDoc && (
        <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} size="xl"
          title={`${viewDoc.kind === 'invoice' ? 'Invoice' : viewDoc.kind === 'receipt' ? 'Receipt' : 'Estimate'} ${viewDoc.doc.invoice_number || viewDoc.doc.quote_number || ''}`}>
          <iframe
            title="Document preview"
            srcDoc={buildDocumentHtml({ kind: viewDoc.kind, doc: viewDoc.doc, business: me?.business, customer: me?.profile })}
            className="w-full h-[68vh] rounded-lg border border-slate-200 bg-white"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Btn variant="outline" onClick={() => setViewDoc(null)}>Close</Btn>
            <Btn onClick={() => printDocument({ kind: viewDoc.kind, doc: viewDoc.doc, business: me?.business, customer: me?.profile })}><Download size={14} /> Download PDF</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SignoffModal({ job, defaultName, onClose, onDone }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);
  useEffect(() => { if (job) setName(defaultName || ''); }, [job, defaultName]);
  async function submit() {
    if (!name.trim()) return toast.error('Please type your name');
    if (padRef.current?.isEmpty()) return toast.error('Please sign in the box');
    setSaving(true);
    try {
      await api.post(`/portal/jobs/${job.id}/signoff`, { signed_by: name.trim(), signature: padRef.current.toDataURL() });
      toast.success('Signed off — thank you!');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not sign off'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} title="Sign Off on Completed Work" subtitle={job?.title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">By signing below, you confirm the work described above was completed to your satisfaction.</p>
        <Input label="Your name" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Signature</label>
          <SignaturePad ref={padRef} />
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={saving}>{saving ? 'Submitting…' : 'Confirm & Sign Off'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ReviewModal({ job, onClose, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (job) { setRating(0); setComment(''); } }, [job]);
  async function save() {
    if (!rating) return toast.error('Please choose a star rating');
    setSaving(true);
    try {
      await api.post('/portal/reviews', { job_id: job.id, rating, comment });
      toast.success('Thanks for your feedback!');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not submit review'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} title="Leave a Review" subtitle={job?.title} size="sm">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 py-2">
          <Stars value={rating} size={34} onChange={setRating} />
          <span className="text-xs text-slate-400">{rating ? `${rating} of 5 stars` : 'Tap to rate'}</span>
        </div>
        <Textarea label="Comments (optional)" value={comment} onChange={e => setComment(e.target.value)} placeholder="How was your experience?" />
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{saving ? 'Submitting…' : 'Submit Review'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ServiceRequestModal({ open, onClose, onDone, initial }) {
  const [form, setForm] = useState({ title: '', description: '', preferred_date: '' });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ title: initial?.title || '', description: initial?.description || '', preferred_date: '' });
  }, [open, initial]);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { const p = await fileToProof(file); setPhoto({ ...p, name: file.name }); }
    catch (err) { toast.error(err.message || 'Could not add that photo'); }
  }

  async function submit() {
    if (!form.title.trim()) return toast.error('Please describe the service you need');
    setSaving(true);
    try {
      await api.post('/portal/service-request', { ...form, photo: photo?.proof, photo_type: photo?.proof_type });
      toast.success("Request sent! We'll be in touch to schedule.");
      setForm({ title: '', description: '', preferred_date: '' });
      setPhoto(null);
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not send request'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Request Service" subtitle="Tell us what you need and we'll schedule it">
      <div className="space-y-3">
        <Input label="What do you need? *" value={form.title} valid={form.title.trim().length > 2}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. AC not cooling, annual tune-up" />
        <Textarea label="Details (optional)" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Anything that helps us prepare — symptoms, unit location, access notes…" />
        <Input label="Preferred date (optional)" type="date" value={form.preferred_date}
          onChange={e => setForm(f => ({ ...f, preferred_date: e.target.value }))} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Photo (optional)</label>
          {photo ? (
            <div className="flex items-center gap-3">
              {photo.proof_type === 'image'
                ? <img src={photo.proof} alt="attachment" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                : <div className="w-14 h-14 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400"><FileText size={20} /></div>}
              <span className="text-sm text-slate-600 truncate flex-1">{photo.name}</span>
              <button onClick={() => setPhoto(null)} className="text-xs font-medium text-red-600">Remove</button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
              <Camera size={15} /> Add a photo
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={pickPhoto} />
            </label>
          )}
          <p className="text-xs text-slate-400 mt-1">A picture of the unit or problem helps us prepare.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={saving}>{saving ? 'Sending…' : 'Send Request'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ProfileModal({ open, onClose, profile, onDone }) {
  const [form, setForm] = useState({ phone: '', address: '', city: '', state: '', zip: '', email_opt_in: true, sms_opt_in: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && profile) setForm({ phone: profile.phone || '', address: profile.address || '', city: profile.city || '', state: profile.state || '', zip: profile.zip || '', email_opt_in: profile.email_opt_in !== false, sms_opt_in: !!profile.sms_opt_in });
  }, [open, profile]);
  async function save() {
    setSaving(true);
    try {
      await api.put('/portal/profile', form);
      toast.success('Contact info updated');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not update'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="My Contact Info" subtitle="Keep your details up to date">
      <div className="space-y-3">
        <Input label="Phone" icon={<Phone size={15} />} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <Input label="Address" icon={<MapPin size={15} />} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          <Input label="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
          <Input label="ZIP" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
        </div>
        <div className="pt-1">
          <p className="text-sm font-medium text-slate-700 mb-2">Notifications</p>
          <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
            <input type="checkbox" checked={form.email_opt_in} onChange={e => setForm(f => ({ ...f, email_opt_in: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-slate-600">Email me about appointments, invoices, and updates</span>
          </label>
          <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
            <input type="checkbox" checked={form.sms_opt_in} onChange={e => setForm(f => ({ ...f, sms_opt_in: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-slate-600">Text me appointment reminders</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (form.newPassword.length < 6) return toast.error('New password must be at least 6 characters');
    if (form.newPassword !== form.confirm) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password changed');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not change password'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm">
      <div className="space-y-3">
        <Input label="Current password" type="password" value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} />
        <Input label="New password" type="password" value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} hint="At least 6 characters" />
        <Input label="Confirm new password" type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{saving ? 'Saving…' : 'Change Password'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function RescheduleModal({ job, onClose, onDone }) {
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (job) setDate(job.scheduled_date || ''); }, [job]);
  async function save() {
    setSaving(true);
    try {
      await api.put(`/portal/jobs/${job.id}/reschedule`, { preferred_date: date });
      toast.success('Preferred date updated');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not reschedule'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} title="Reschedule Service" subtitle={job?.title} size="sm">
      <div className="space-y-3">
        <Input label="New preferred date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{saving ? 'Saving…' : 'Update Date'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
