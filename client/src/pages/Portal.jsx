import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Badge, Btn, StatCard, Empty, Spinner, Modal, Input, Textarea, Select } from '../components/UI';
import { printDocument, buildDocumentHtml } from '../lib/printDoc';
import PayInvoiceModal from '../components/PayInvoiceModal';
import ServiceRequestModal from '../components/ServiceRequestModal';
import AddressAutocomplete from '../components/AddressAutocomplete';
import Logo from '../components/Logo';
import {
  Briefcase, FileText, DollarSign, ClipboardList, Clock, CheckCircle, Calendar,
  UserCircle, Plus, Wrench, MapPin, ChevronDown, Check, X, Phone, Mail, Pencil,
  Download, Ban, CalendarClock, Lock, Star, PenLine, MessageSquare, HelpCircle, Sparkles, Send, CreditCard, Eye, Camera, Receipt, Navigation,
} from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shown in the Help & Support card. Edit to match your real hours.
const BUSINESS_HOURS = 'Mon–Fri · 8:00 AM – 6:00 PM  ·  24/7 emergency service';

const FAQ = [
  { q: 'How do I request a service?', a: 'Tap "Request Service" at the top of your portal, describe what you need, and pick a preferred date. You\'ll get a confirmation email, and the request will appear under "Appointments".' },
  { q: 'How do I pay an invoice?', a: 'Open the "My Invoices" tab and expand an unpaid invoice, then tap "Pay now" to pay securely by card. Prefer cash? Choose "Pay with cash" and our office will reach out to arrange it. Once paid, the invoice updates to "Paid" automatically. You can also download a PDF of any invoice.' },
  { q: 'Can I reschedule or cancel a visit?', a: 'Yes. Open the "Appointments" page, expand an upcoming visit, and use Reschedule or Cancel.' },
  { q: 'How do I accept or decline an estimate?', a: 'Open the "My Estimates" tab, expand the estimate to review the line items and total, and choose Accept or Decline. You can also download it as a PDF.' },
  { q: 'How do I get help or reach a live agent?', a: 'Use the "Assistant" tab to ask a question anytime. If you\'d like a human, just ask to speak with an agent and you\'ll be connected to our team in the same chat. You can also call, text, or email us from "Help & Support".' },
  { q: 'How do I sign off on completed work or leave a review?', a: 'When a job is marked complete, open it under "My Services" to add your signature, and you can leave a star rating and review there too.' },
  { q: 'How do I update my contact info?', a: 'Tap "My Info" at the top of your portal to update your phone, address, and other details.' },
];

export default function Portal() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [tab, setTab] = useState('invoices');
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
  const [verifyKind, setVerifyKind] = useState(null);
  const [pwModal, setPwModal] = useState(false);
  const [payBillOpen, setPayBillOpen] = useState(false);

  function load() {
    return Promise.all([
      api.get('/portal/me'), api.get('/portal/jobs'), api.get('/portal/invoices'), api.get('/portal/quotes'),
    ]).then(([m, j, i, q]) => {
      setMe(m.data); setJobs(j.data); setInvoices(i.data); setQuotes(q.data); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  // Deep-links from the customer "More" screen: ?tab=… selects a tab, ?profile=1 opens My Info.
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get('tab');
    if (t) setTab(t === 'jobs' ? 'invoices' : t); // 'jobs' now lives on /appointments
    if (p.get('profile') === '1') setProfileModal(true);
    if (p.get('request') === '1') setReqModal(true);
  }, [location.search]);

  const toggle = (id) => setExpanded(e => (e === id ? null : id));

  // "Pay Balance" opens the oldest unpaid invoice; if none, just show the invoices tab.
  function payBalance() {
    const unpaid = invoices.find(i => i.status !== 'paid' && i.status !== 'cancelled');
    if (unpaid) setPayInvoice(unpaid);
    else setTab('invoices');
  }

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

  // Account tabs stay on the dashboard; support lives in its own view (from More).
  const accountTabs = [
    { id: 'invoices', label: 'Invoices', count: invoices.length },
    { id: 'quotes', label: 'Estimates', count: quotes.length },
  ];
  const supportTabs = [
    { id: 'help', label: 'Help & Support' },
    { id: 'faq', label: 'FAQ' },
    { id: 'assistant', label: 'Assistant' },
  ];
  const inSupport = supportTabs.some(t => t.id === tab);
  const tabs = inSupport ? supportTabs : accountTabs;

  const today = new Date().toISOString().slice(0, 10);
  const nextAppt = [...jobs]
    .filter(j => j.scheduled_date && j.scheduled_date >= today && !['completed', 'cancelled'].includes(j.status))
    .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || '')))[0] || null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={inSupport ? 'Support' : `Welcome, ${me?.name?.split(' ')[0] || 'there'}`}
        subtitle={inSupport ? 'Help, FAQ & live chat' : 'Your Clarke Mechanical account'}
        icon={inSupport ? <HelpCircle size={20} /> : <UserCircle size={20} />}>
        {inSupport
          ? <Btn variant="outline" onClick={() => setTab('jobs')}>← Account</Btn>
          : me?.linked && <>
              <Btn variant="outline" onClick={() => navigate('/account')}><Pencil size={15} /> My Profile</Btn>
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
          {!inSupport && (<>
          {/* Quick actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Request service', icon: <Wrench size={20} />, color: 'bg-blue-50 text-blue-600', onClick: () => setReqModal(true) },
              { label: 'Appointments', icon: <Calendar size={20} />, color: 'bg-violet-50 text-violet-600', onClick: () => navigate('/appointments') },
              { label: 'Pay Bill', icon: <CreditCard size={20} />, color: 'bg-emerald-50 text-emerald-600', onClick: () => setPayBillOpen(true) },
              { label: 'Contact us', icon: <MessageSquare size={20} />, color: 'bg-slate-100 text-slate-600', onClick: () => setTab('help') },
            ].map(a => (
              <button key={a.label} type="button" onClick={a.onClick}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.98] transition-all">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.color}`}>{a.icon}</span>
                <span className="text-xs font-medium text-slate-700 text-center leading-tight">{a.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full">
            <Card className="p-4 mb-6 border-l-4 border-blue-500 bg-blue-50/40">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 shrink-0"><Calendar size={18} /></div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{nextAppt ? 'Next appointment' : 'Appointments'}</p>
                  {nextAppt ? (
                    <>
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {new Date(nextAppt.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{nextAppt.scheduled_time ? ` · ${nextAppt.scheduled_time}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {nextAppt.job_type || nextAppt.title}{nextAppt.technician_name ? ` · ${nextAppt.technician_name}` : ' · Technician TBD'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-slate-500">No upcoming appointments</p>
                  )}
                </div>
                {nextAppt && (
                  <div className="ml-auto shrink-0 flex items-center gap-2">
                    <Badge status={nextAppt.status} />
                    <Btn size="sm" variant="outline" onClick={() => navigate('/appointments')}>View Details</Btn>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Active Services', value: me.stats.openJobs, icon: <Wrench size={16} />, color: 'text-blue-600 bg-blue-50', onClick: () => navigate('/appointments') },
              { label: 'Open Requests', value: jobs.filter(j => j.status === 'pending').length, icon: <ClipboardList size={16} />, color: 'text-amber-600 bg-amber-50', onClick: () => navigate('/appointments') },
              { label: 'Balance Due', value: `$${Number(me.stats.balanceDue || 0).toFixed(2)}`, icon: <DollarSign size={16} />, color: me.stats.balanceDue > 0 ? 'text-orange-600 bg-orange-50' : 'text-emerald-600 bg-emerald-50', valueClass: me.stats.balanceDue > 0 ? 'text-orange-600' : 'text-emerald-600', onClick: () => setTab('invoices') },
              { label: 'Invoices', value: me.stats.invoiceCount, icon: <FileText size={16} />, color: 'text-violet-600 bg-violet-50', onClick: () => setTab('invoices') },
            ].map(s => (
              <button key={s.label} type="button" onClick={s.onClick}
                className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col items-center gap-1 hover:border-blue-300 active:scale-[0.98] transition-all">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</span>
                <span className={`text-lg font-bold tabular-nums leading-tight ${s.valueClass || 'text-slate-900'}`}>{s.value}</span>
                <span className="text-[11px] font-medium text-slate-500 text-center leading-tight">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Active service requests + billing */}
          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <Card className="lg:col-span-2">
              <CardHeader title="Active Service Requests" icon={<ClipboardList size={15} />} />
              {(() => {
                const active = jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
                if (active.length === 0) return <Empty icon={<ClipboardList size={22} />} title="No active requests" message="Your open service requests will appear here." />;
                return (
                  <div className="divide-y divide-slate-100">
                    {active.slice(0, 5).map(j => (
                      <div key={j.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{j.job_type || j.title || 'Service request'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge status={j.status} />
                            {j.scheduled_date && <span className="text-xs text-slate-500">{new Date(j.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                          </div>
                        </div>
                        <Btn size="sm" variant="outline" onClick={() => navigate('/appointments')}>View Request</Btn>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Card>

            <Card className="p-5 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5"><DollarSign size={14} className="text-slate-400" /> Billing</p>
                <p className="text-xs text-slate-500 mt-4">Balance Due</p>
                <p className={`text-3xl font-bold tabular-nums leading-tight ${me.stats.balanceDue > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{money(me.stats.balanceDue)}</p>
              </div>
              <div className="mt-4">
                {me.stats.balanceDue > 0 ? (
                  <Btn onClick={payBalance} className="w-full justify-center"><CreditCard size={15} /> Pay Balance</Btn>
                ) : (
                  <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5"><CheckCircle size={15} /> You're all paid up</p>
                )}
              </div>
            </Card>
          </div>
          </>)}

          <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit flex-wrap">
            {tabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setExpanded(null); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t.label}{t.count != null && <span className="opacity-70"> ({t.count})</span>}
              </button>
            ))}
          </div>

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
                                  <td className="py-1.5 text-slate-600">{it.description}{it.note && <div className="text-[11px] font-bold text-slate-700 mt-0.5">{it.note}</div>}</td>
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
                              {inv.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{money(inv.discount)}</span></div>}
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
                                    <td className="py-1.5 text-slate-600">{it.description}{it.note && <div className="text-[11px] font-bold text-slate-700 mt-0.5">{it.note}</div>}</td>
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

          {!inSupport && (
            <Card className="mt-6">
              <CardHeader title="Account Information" icon={<UserCircle size={15} />} />
              <div className="p-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
                <span className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400" />{me.email}
                  {me.profile?.email_verified
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle size={12} /> Verified</span>
                    : <button onClick={() => setVerifyKind('email')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Verify</button>}
                </span>
                {me.profile?.phone && (
                  <span className="flex items-center gap-2">
                    <Phone size={14} className="text-slate-400" />{me.profile.phone}
                    {me.profile?.phone_verified
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle size={12} /> Verified</span>
                      : <button onClick={() => setVerifyKind('phone')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Verify</button>}
                  </span>
                )}
                {(me.profile?.address || me.profile?.city) && <span className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{[me.profile.address, me.profile.city, me.profile.state].filter(Boolean).join(', ')}</span>}
              </div>
            </Card>
          )}
        </>
      )}

      <ServiceRequestModal open={reqModal} initial={reqPrefill} onClose={() => { setReqModal(false); setReqPrefill(null); }} onDone={load} />
      <ProfileModal open={profileModal} onClose={() => setProfileModal(false)} profile={me?.profile} onDone={load} />
      <VerifyModal kind={verifyKind} target={verifyKind === 'phone' ? me?.profile?.phone : me?.email} onClose={() => setVerifyKind(null)} onDone={load} />
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} />
      <PayBillModal
        open={payBillOpen}
        onClose={() => setPayBillOpen(false)}
        invoices={invoices}
        business={me?.business}
        balanceDue={me?.stats?.balanceDue || 0}
        onPay={(inv) => { setPayBillOpen(false); setPayInvoice(inv); }}
      />
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

function VerifyModal({ kind, target, onClose, onDone }) {
  const [stage, setStage] = useState('send'); // 'send' | 'code'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notAvailable, setNotAvailable] = useState('');
  const label = kind === 'phone' ? 'phone number' : 'email address';
  useEffect(() => { if (kind) { setStage('send'); setCode(''); setNotAvailable(''); } }, [kind]);

  async function sendCode() {
    setBusy(true); setNotAvailable('');
    try {
      await api.post(`/portal/verify/${kind}/send`);
      toast.success(kind === 'phone' ? 'Code texted to your phone' : 'Code sent to your email');
      setStage('code');
    } catch (e) {
      if (e.response?.status === 503) setNotAvailable(e.response?.data?.message || 'Text verification isn’t enabled yet.');
      else toast.error(e.response?.data?.error || 'Could not send the code');
    } finally { setBusy(false); }
  }
  async function confirmCode() {
    if (code.trim().length < 4) return toast.error('Enter the code we sent you');
    setBusy(true);
    try {
      await api.post(`/portal/verify/${kind}/confirm`, { code: code.trim() });
      toast.success(`Your ${label} is verified`);
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'That code did not work'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={!!kind} onClose={onClose} title={`Verify your ${label}`} size="sm">
      <div className="space-y-4">
        {notAvailable ? (
          <p className="text-sm text-slate-600">{notAvailable} Please verify your email instead, or contact the office.</p>
        ) : stage === 'send' ? (
          <>
            <p className="text-sm text-slate-600">We'll send a 6-digit code to <strong>{target}</strong>. Enter it to confirm this {label} is yours.</p>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={onClose}>Cancel</Btn>
              <Btn onClick={sendCode} loading={busy}>Send code</Btn>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">Enter the 6-digit code we sent to <strong>{target}</strong>.</p>
            <Input label="Verification code" value={code} inputMode="numeric" maxLength={6}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
            <div className="flex justify-between items-center">
              <button onClick={sendCode} disabled={busy} className="text-xs font-medium text-blue-600 hover:text-blue-700">Resend code</button>
              <div className="flex gap-2">
                <Btn variant="outline" onClick={onClose}>Cancel</Btn>
                <Btn onClick={confirmCode} loading={busy}>Verify</Btn>
              </div>
            </div>
          </>
        )}
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
  async function deleteAccount() {
    if (!window.confirm('Permanently delete your account? You will be signed out and lose access to the portal. This cannot be undone.')) return;
    try {
      await api.delete('/portal/account');
      localStorage.removeItem('token'); localStorage.removeItem('user');
      window.location.href = '/login';
    } catch (e) { toast.error(e.response?.data?.error || 'Could not delete your account'); }
  }
  return (
    <Modal open={open} onClose={onClose} title="My Contact Info" subtitle="Keep your details up to date">
      <div className="space-y-3">
        <Input label="Phone" icon={<Phone size={15} />} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <AddressAutocomplete label="Address" icon={<MapPin size={15} />} value={form.address}
          onChange={v => setForm(f => ({ ...f, address: v }))}
          onSelect={a => setForm(f => ({ ...f, address: a.address, city: a.city || f.city, state: a.state || f.state, zip: a.zip || f.zip }))} />
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
        <div className="border-t border-slate-100 pt-3 mt-1">
          <button onClick={deleteAccount} className="text-xs font-medium text-red-600 hover:text-red-700">Delete my account</button>
          <p className="text-[11px] text-slate-400 mt-1">Permanently removes your login and portal access.</p>
        </div>
      </div>
    </Modal>
  );
}

function PayBillModal({ open, onClose, invoices, business, balanceDue, onPay }) {
  const unpaid = (invoices || []).filter(i => i.status !== 'paid' && i.status !== 'cancelled');
  const total = balanceDue || unpaid.reduce((s, i) => s + Number(i.balance ?? i.total ?? 0), 0);

  return (
    <Modal open={open} onClose={onClose} title="Pay Your Bill" size="md">
      <div className="space-y-5">
        {/* Balance summary banner */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 text-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-blue-100 text-xs font-semibold uppercase tracking-wide">
            <CreditCard size={14} /> Total balance due
          </div>
          <p className="text-4xl font-bold tabular-nums mt-1.5">{money(total)}</p>
          {business?.name && <p className="text-xs text-blue-100 mt-2">Payable to {business.name}</p>}
        </div>

        {unpaid.length === 0 ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-3 flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle size={28} /></div>
            <p className="text-sm font-semibold text-slate-800">You're all caught up</p>
            <p className="text-xs text-slate-500 mt-1">You have no open invoices to pay right now.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Open invoices</p>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {unpaid.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-500">{inv.due_date ? `Due ${inv.due_date}` : 'Due on receipt'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">{money(inv.balance ?? inv.total)}</span>
                      <Btn size="sm" onClick={() => onPay(inv)}><CreditCard size={14} /> Pay</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Lock size={12} /> Pay by Zelle, bank transfer, check, or cash — tap Pay on an invoice for details.
            </div>
          </>
        )}
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
