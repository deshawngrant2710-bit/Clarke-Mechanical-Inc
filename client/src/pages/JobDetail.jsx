import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Badge, Modal, Input, Select, Textarea, Spinner, Avatar, Empty } from '../components/UI';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { ArrowLeft, Pencil, Trash2, Camera, Upload, User, MapPin, Calendar, Wrench, CheckCircle2, MailCheck, BellRing, PenLine, Navigation, Phone, MessageSquare, ClipboardCheck, Plus, Package, FileText, Printer, Clock, CalendarCheck, CheckSquare, Send, HardHat } from 'lucide-react';
import { TaskModal } from './Tasks';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';
import DirectionsButton from '../components/DirectionsButton';
import { propertyLabel, equipmentLabel } from '../lib/inspectionForms';
import { fileToProof } from '../lib/imageProof';
import { useAuth } from '../context/AuthContext';
import SignaturePad from '../components/SignaturePad';
import { printHtml } from '../lib/printDoc';

const JOB_TYPES = ['AC Repair', 'AC Installation', 'Heating Repair', 'Heating Installation', 'Maintenance', 'Inspection', 'Ductwork', 'Ventilation', 'Emergency', 'Other'];
const TIMELINE = ['pending', 'scheduled', 'in-progress', 'awaiting-signoff', 'completed'];
const TIMELINE_LABEL = { pending: 'Created', scheduled: 'Scheduled', 'in-progress': 'In Progress', 'awaiting-signoff': 'Awaiting Sign-off', completed: 'Completed' };

// The technician can advance up to "work done" (awaiting-signoff). Only the customer's
// sign-off moves a job to "completed", so there's no "Mark Complete" button here.
const NEXT_STATUS_LABEL = { scheduled: 'Mark Scheduled', 'in-progress': 'Start Job', 'awaiting-signoff': 'Mark Work Done' };

// Default exact start time to prefill when confirming an arrival-window booking.
const WINDOW_START = {
  '8:00–10:00 AM': '08:00', '10:00 AM–12:00 PM': '10:00', '12:00–2:00 PM': '12:00',
  '2:00–4:00 PM': '14:00', '4:00–6:00 PM': '16:00',
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTech = user?.role === 'technician';
  const isManager = ['admin', 'office'].includes(user?.role);
  // Admin/office users flagged "also a technician" get the field-tech tools too.
  const canTech = isTech || !!user?.also_technician;
  const [job, setJob] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [jobInspections, setJobInspections] = useState([]);
  const [enRouting, setEnRouting] = useState(false);
  const [partForm, setPartForm] = useState({ name: '', quantity: '1', unit_price: '', note: '' });
  const [addingPart, setAddingPart] = useState(false);
  const [emailing, setEmailing] = useState('');
  const [signModal, setSignModal] = useState(false);
  const [signMode, setSignMode] = useState('customer'); // 'customer' | 'management' | 'technician'
  const [authorizingTech, setAuthorizingTech] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [resign, setResign] = useState(false); // manager correcting an existing sign-off
  const [approving, setApproving] = useState(false);
  const [bizPhone, setBizPhone] = useState('');
  const [biz, setBiz] = useState({});
  const [taskModal, setTaskModal] = useState(false);
  const [signName, setSignName] = useState('');
  const [signing, setSigning] = useState(false);
  const padRef = useRef(null);
  const fileRef = useRef();
  const [confirmTime, setConfirmTime] = useState('');
  const [confirmTech, setConfirmTech] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestDate, setSuggestDate] = useState('');
  const [suggestWindow, setSuggestWindow] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [declining, setDeclining] = useState(false);

  async function approveSignoff() {
    setApproving(true);
    try {
      await api.post(`/jobs/${id}/approve-signoff`);
      toast.success('Customer sign-off approved');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not approve'); }
    finally { setApproving(false); }
  }

  function openSign(mode) {
    setSignMode(mode);
    setSignName(mode === 'customer' ? (job.customer_name || '') : (user?.name || ''));
    setSignModal(true);
  }

  async function requestSignoff() {
    setRequesting(true);
    try {
      await api.post(`/jobs/${id}/request-signoff`);
      toast.success('Approval request sent to the office');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not send the request'); }
    finally { setRequesting(false); }
  }

  async function authorizeTechSignoff() {
    setAuthorizingTech(true);
    try {
      await api.post(`/jobs/${id}/authorize-tech-signoff`);
      toast.success('Technician authorized to sign off for the customer');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not authorize'); }
    finally { setAuthorizingTech(false); }
  }

  async function captureSignoff() {
    if (!signName.trim()) return toast.error('Enter a name');
    // The customer's own signature is required; management/technician sign-offs
    // record the staff member's name — a drawn signature is optional.
    if (signMode === 'customer' && padRef.current?.isEmpty()) return toast.error('Please have the customer sign');
    setSigning(true);
    try {
      const signature = padRef.current && !padRef.current.isEmpty() ? padRef.current.toDataURL() : null;
      await api.post(`/jobs/${id}/signoff`, { signoff_type: signMode, signed_by: signName.trim(), signature });
      toast.success(signMode === 'customer' ? 'Signature captured' : 'Job signed off');
      setSignModal(false); setSignName(''); setResign(false); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save signature'); }
    finally { setSigning(false); }
  }

  function load() {
    Promise.all([api.get(`/jobs/${id}`), api.get('/customers'), api.get('/employees')])
      .then(([j, c, e]) => { setJob(j.data); setForm(j.data); setNotesDraft(''); setCustomers(c.data); setEmployees(e.data); });
    api.get('/inspections').then(r => setJobInspections(r.data.filter(x => x.job_id === id))).catch(() => {});
  }

  async function confirmBooking() {
    setConfirming(true);
    try {
      await api.post(`/jobs/${id}/confirm-booking`, { scheduled_time: confirmTime || null, technician_id: confirmTech || null });
      toast.success('Appointment confirmed — customer notified');
      setConfirmTime(''); setConfirmTech(''); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not confirm the appointment'); }
    finally { setConfirming(false); }
  }

  async function suggestTime() {
    if (!suggestDate) return toast.error('Pick a date to suggest');
    if (!suggestWindow) return toast.error('Pick an arrival window');
    setSuggesting(true);
    try {
      await api.post(`/jobs/${id}/suggest-time`, { scheduled_date: suggestDate, booking_window: suggestWindow });
      toast.success('New time suggested — customer notified');
      setSuggestOpen(false); setSuggestDate(''); setSuggestWindow(''); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not send suggestion'); }
    finally { setSuggesting(false); }
  }

  async function declineBooking() {
    if (!window.confirm('Decline this appointment request? The customer will be emailed and asked to book another time.')) return;
    setDeclining(true);
    try {
      await api.post(`/jobs/${id}/decline-booking`, {});
      toast.success('Request declined — customer notified');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not decline'); }
    finally { setDeclining(false); }
  }

  async function createInspectionForJob() {
    try {
      const { data } = await api.post('/inspections', {
        job_id: id,
        customer_id: job?.customer_id || null,
        property_type: 'residential',
        equipment_type: 'boiler',
        info: job?.address ? { site_address: job.address } : {},
      });
      navigate(`/inspections/${data.id}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not start inspection'); }
  }
  useEffect(load, [id]);
  useEffect(() => { api.get('/auth/public-info').then(r => { setBiz(r.data || {}); setBizPhone(r.data.business_phone || ''); }).catch(() => {}); }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/jobs/${id}`, form);
      toast.success('Job updated');
      setEditModal(false); load();
    } catch { toast.error('Error updating job'); }
    finally { setSaving(false); }
  }
  async function handleDelete() {
    if (!confirm('Delete this job?')) return;
    await api.delete(`/jobs/${id}`);
    toast.success('Deleted'); navigate('/jobs');
  }
  async function updateStatus(newStatus) {
    // Technicians must be clocked in before starting a job.
    if (canTech && newStatus === 'in-progress') {
      try {
        const { data: active } = await api.get('/time/active');
        if (!active) {
          toast.error('Please clock in before starting the job.');
          if (window.confirm('You need to clock in first. Go to the Time Clock now?')) navigate('/time-clock');
          return;
        }
      } catch { /* if the check fails, fall through and let them proceed */ }
    }
    setSaving(true);
    try {
      await api.put(`/jobs/${id}`, { ...job, status: newStatus });
      toast.success(`Marked ${TIMELINE_LABEL[newStatus]}`);
      load();
    } catch { toast.error('Could not update status'); }
    finally { setSaving(false); }
  }
  async function enRoute() {
    setEnRouting(true);
    try { await api.post(`/jobs/${id}/en-route`); toast.success('Customer notified you’re on the way'); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not notify the customer'); }
    finally { setEnRouting(false); }
  }
  async function addPart() {
    if (!partForm.name.trim()) return toast.error('Enter a part or material name');
    setAddingPart(true);
    try {
      await api.post(`/jobs/${id}/parts`, partForm);
      setPartForm({ name: '', quantity: '1', unit_price: '', note: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not add that'); }
    finally { setAddingPart(false); }
  }
  async function removePart(pid) {
    try { await api.delete(`/jobs/${id}/parts/${pid}`); load(); }
    catch { toast.error('Could not remove'); }
  }
  // Rebuild the full notes string from the parsed entries (keeps each entry's meta line).
  function rebuildNotes(entries) {
    return entries.map(e => (e.meta ? `${e.meta}\n${e.body}` : e.body)).join('\n\n---\n');
  }
  async function saveNoteEdit(idx) {
    const text = editNoteText.trim();
    if (!text) return toast.error('Note cannot be empty');
    const entries = noteEntries.map((e, i) => (i === idx ? { ...e, body: text } : e));
    setSavingNotes(true);
    try {
      await api.put(`/jobs/${id}`, { ...job, notes: rebuildNotes(entries) });
      toast.success('Note updated');
      setEditingNote(null); setEditNoteText(''); load();
    } catch { toast.error('Could not update note'); }
    finally { setSavingNotes(false); }
  }

  async function addNote() {
    const text = notesDraft.trim();
    if (!text) return;
    const meta = `${user?.name || 'Technician'} · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    const entry = `${meta}\n${text}`;
    const updated = job.notes ? `${entry}\n\n---\n${job.notes}` : entry;
    setSavingNotes(true);
    try {
      await api.put(`/jobs/${id}`, { ...job, notes: updated });
      toast.success('Note added');
      setNotesDraft('');
      load();
    } catch { toast.error('Could not add note'); }
    finally { setSavingNotes(false); }
  }
  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    let ok = 0, failed = 0;
    for (const file of files) {
      try {
        const { proof, proof_type } = await fileToProof(file);
        await api.post(`/jobs/${id}/photos`, { proof, proof_type });
        ok++;
      } catch (err) { failed++; toast.error(`${file.name}: ${err.message || 'upload failed'}`); }
    }
    if (ok) toast.success(`${ok} photo${ok === 1 ? '' : 's'} uploaded`);
    load();
  }
  async function removePhoto(pid) {
    if (!confirm('Remove this photo?')) return;
    try { await api.delete(`/jobs/${id}/photos/${pid}`); load(); }
    catch { toast.error('Could not remove'); }
  }
  function createInvoice() {
    // Open the editable New Invoice form pre-filled from this job — the admin
    // reviews/edits line items and prices, then clicks Create.
    const items = (job.parts || []).map(p => ({ description: p.name, quantity: p.quantity || 1, unit_price: p.unit_price || 0 }));
    navigate('/invoices', {
      state: {
        newInvoice: {
          customer_id: job.customer_id,
          job_id: id,
          items: items.length ? items : undefined,
          notes: job.title ? `Service: ${job.title}` : '',
        },
      },
    });
  }
  async function scheduleFollowUp() {
    const months = parseInt(window.prompt('Schedule a follow-up visit in how many months?', '6'), 10);
    if (!months || months < 1) return;
    const d = new Date(); d.setMonth(d.getMonth() + months);
    const scheduled_date = d.toISOString().slice(0, 10);
    try {
      const { data } = await api.post('/jobs', {
        title: job.title, description: job.description, customer_id: job.customer_id, technician_id: job.technician_id,
        status: 'scheduled', priority: 'normal', job_type: job.job_type, scheduled_date, address: job.address,
        notes: `Follow-up to ${job.title}`,
      });
      toast.success(`Follow-up scheduled for ${scheduled_date}`);
      navigate(`/jobs/${data.id}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not schedule follow-up'); }
  }
  function printWorkOrder() {
    const e = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const name = e(biz.business_name || 'Clarke Mechanical Inc.');
    const phone = e(biz.business_phone || '(516) 206-6256');
    const email = e(biz.business_email || 'clarkemechanical@gmail.com');
    const web = e(biz.business_website || 'clarkemechanicalinc.org');
    const addr = e(biz.business_address || '');
    const jtype = (job.job_type || '').toLowerCase();
    const cb = (label, checked) => `<span class="cb">${checked ? '☑' : '☐'} ${e(label)}</span>`;
    const checks = (arr) => `<div class="checks">${arr.map(l => cb(l, jtype && l.toLowerCase().split(' ').some(w => w.length > 3 && jtype.includes(w)))).join('')}</div>`;
    const blankChecks = (arr) => `<div class="checks">${arr.map(l => cb(l, false)).join('')}</div>`;
    const fld = (label, val, w = '1fr') => `<div class="fld" style="grid-column:span 1"><span class="lb">${e(label)}</span><span class="vl">${val ? e(val) : ''}</span></div>`;
    const readingRow = (m) => `<tr><td>${e(m)}</td><td></td><td></td></tr>`;
    const billRow = (d, bold) => `<tr><td class="${bold ? 'b' : ''}">${e(d)}</td><td class="amt ${bold ? 'b' : ''}"></td></tr>`;
    const partRows = (job.parts || []).length
      ? (job.parts || []).map(p => `<tr><td class="c">${e(String(p.quantity ?? ''))}</td><td>${e(p.name)}</td><td></td></tr>`).join('')
      : `<tr><td class="c"></td><td></td><td></td></tr><tr><td class="c"></td><td></td><td></td></tr>`;
    const extraPartRows = Array(Math.max(0, 4 - (job.parts || []).length)).fill('<tr><td class="c"></td><td></td><td></td></tr>').join('');

    const SERVICE_TYPES = ['Service / Diagnostic', 'Preventive Maintenance', 'Emergency', 'Repair / Parts', 'Start-Up / Commissioning', 'Inspection / Combustion', 'No Heat / No Hot Water', 'Installation / Replacement', 'Warranty / Callback'];
    const EQUIP = ['Gas Boiler', 'Oil Boiler', 'Steam Boiler', 'Hot Water Boiler', 'Scotch Marine / Firetube', 'Gas / Oil Furnace', 'Rooftop Unit (RTU)', 'Central AC / Heat Pump', 'Water Heater', 'Industrial Gas Burner', 'Industrial Oil Burner', 'Dual-Fuel Burner'];
    const ARRIVAL = ['Operating Normally', 'Not Operating', 'Lockout / Safety Trip', 'Intermittent', 'No Heat / Hot Water', 'Water Leak', 'Fuel / Gas Concern', 'Noise / Vibration', 'Pressure Issue'];
    const DIAG = ['Thermostat / Controls', 'Electrical / Wiring', 'Safety / Limit Controls', 'Flame Safeguard', 'Gas Pressure / Supply', 'Oil Pump / Nozzle / Filter', 'Ignition / Pilot', 'Flame Scanner / Cad Cell', 'Combustion Air / Ventilation', 'Draft / Venting', 'Boiler Water Level / Pressure', 'Pumps / Valves', 'Heat Exchanger / Fireside', 'Condenser / Evaporator Coils'];
    const WORK = ['Control Repair / Reset', 'Cleaned Burner / Combustion Assembly', 'Ignition Components', 'Oil Nozzle / Filter / Pump', 'Gas Train / Fuel System', 'Electrical / Controls', 'Heat Exchanger / Fireside', 'Boiler Maintenance', 'Coil Cleaning', 'Burner Adjustment / Combustion', 'Leak Check', 'Safety Controls Test'];
    const READINGS = ['O₂ (%)', 'CO₂ (%)', 'CO (ppm)', 'Flue Gas Temp. (°F)', 'Stack Draft (in. w.c.)', 'Overfire Draft (in. w.c.)', 'Gas Inlet Pressure (in. w.c.)', 'Gas Manifold Pressure (in. w.c.)', 'Oil Pump Pressure (PSI)', 'Smoke Spot Number (oil)', 'Boiler Operating Pressure', 'Boiler Water Temp. (°F)', 'Supply / Return Temp. (°F)'];
    const SAFETY = ['Fuel Connections Checked', 'Applicable Leak Test', 'Ignition Sequence Verified', 'Flame Detection Verified', 'Operating Controls Tested', 'Limit Controls Tested', 'Flame Safeguard / Shutdown Tested', 'Venting / Draft Checked', 'Combustion Air Checked', 'CO Screening as Applicable', 'Operating Sequence Verified', 'Final Conditions Recorded'];
    const FINAL = ['Operational — Tested', 'Operating; Recommendations', 'Temporary Operation / Follow-Up', 'Out of Service', 'Shut Down for Safety', 'Unable to Complete'];
    const BILL = ['Service Call / Diagnostic Fee', 'Labor', 'Parts / Materials', 'Additional Services', 'Emergency / After-Hours Charges'];

    const logo = `<svg viewBox="0 0 200 228" width="54" height="62" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wr" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4dd0e1"/><stop offset="35%" stop-color="#1e88e5"/><stop offset="100%" stop-color="#0d3c82"/></linearGradient><linearGradient id="wa" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#e53935"/><stop offset="100%" stop-color="#f57c00"/></linearGradient><linearGradient id="wo" x1="0.5" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#fff176"/><stop offset="18%" stop-color="#ffb300"/><stop offset="58%" stop-color="#f4511e"/><stop offset="100%" stop-color="#bf360c"/></linearGradient><linearGradient id="wb" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0%" stop-color="#42a5f5"/><stop offset="100%" stop-color="#1a237e"/></linearGradient><linearGradient id="wrr" x1="0.5" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#ef5350"/><stop offset="100%" stop-color="#e64a19"/></linearGradient></defs><circle cx="104" cy="116" r="84" fill="none" stroke="url(#wr)" stroke-width="22"/><path d="M 104,32 A 84,84 0 0,1 188,116" fill="none" stroke="url(#wa)" stroke-width="22"/><path d="M 60,172 C 46,142 50,96 68,56 C 74,40 80,20 88,18 C 96,15 100,34 108,62 C 115,84 114,132 108,172 Z" fill="url(#wb)"/><path d="M 64,188 C 50,150 54,98 74,50 C 84,28 98,4 112,4 C 126,4 140,26 152,56 C 163,84 164,144 150,188 Z" fill="url(#wo)"/><path d="M 124,184 C 120,152 127,106 142,68 C 150,46 158,18 167,18 C 176,18 182,40 189,68 C 196,94 195,146 186,184 Z" fill="url(#wrr)"/></svg>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Work Order ${e(id.slice(0, 8).toUpperCase())}</title>
    <style>
    @page{size:letter;margin:12mm}
    *{box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#15233b;margin:0;font-size:10.5px;line-height:1.35}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d3c82;padding-bottom:10px}
    .brand{display:flex;gap:12px;align-items:center}
    .brand .nm{font-size:19px;font-weight:900;color:#0d3c82;letter-spacing:.5px;line-height:1}
    .brand .tg{font-size:9px;color:#5a6b86;letter-spacing:2px;margin-top:3px}
    .co{text-align:right;font-size:9.5px;color:#41506a;line-height:1.5}
    .title{display:flex;justify-content:space-between;align-items:center;background:#0d3c82;color:#fff;padding:7px 12px;border-radius:5px;margin:12px 0 10px}
    .title h1{font-size:15px;letter-spacing:2px;margin:0;font-weight:800}
    .title .meta{font-size:10px;text-align:right;opacity:.95}
    h2{font-size:9.5px;letter-spacing:.6px;color:#fff;background:#1e5aa8;padding:4px 8px;border-radius:4px;margin:12px 0 7px;text-transform:uppercase;font-weight:800}
    .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px 14px}
    .grid.two{grid-template-columns:1fr 1fr}
    .fld{display:flex;flex-direction:column;border-bottom:1px solid #c7d2e3;padding-bottom:1px;min-height:26px}
    .fld .lb{font-size:8px;color:#6a7a94;text-transform:uppercase;letter-spacing:.3px}
    .fld .vl{font-size:11px;color:#15233b;font-weight:600;min-height:14px;padding-top:1px}
    .checks{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 12px;font-size:10px;margin-top:2px}
    .cb{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .box{border:1px solid #c7d2e3;border-radius:5px;min-height:34px;padding:5px 7px;margin-top:3px}
    .lbl{font-size:8px;color:#6a7a94;text-transform:uppercase;letter-spacing:.3px;margin-top:8px;margin-bottom:1px;display:block}
    table{width:100%;border-collapse:collapse;margin-top:3px}
    th{background:#eef3fb;color:#41506a;font-size:8px;text-transform:uppercase;letter-spacing:.3px;text-align:left;padding:4px 6px;border:1px solid #c7d2e3}
    td{border:1px solid #c7d2e3;padding:5px 6px;font-size:10px;height:20px}
    td.c{text-align:center;width:40px} td.amt{text-align:right;width:120px} td.b,.b{font-weight:800;background:#f3f7fd}
    .reads td:nth-child(2),.reads td:nth-child(3){text-align:center;width:120px}
    .page{page-break-before:always}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:10px}
    .sigline{border-top:1px solid #15233b;margin-top:26px;padding-top:4px;font-size:8.5px;color:#6a7a94}
    .cert{font-size:8.5px;color:#41506a;border:1px solid #c7d2e3;border-radius:5px;padding:6px 8px;background:#fafcff}
    .foot{margin-top:14px;text-align:center;font-size:9px;letter-spacing:3px;color:#6a7a94;border-top:1px solid #c7d2e3;padding-top:6px}
    .small{font-size:8.5px;color:#6a7a94}
    </style></head><body>

    <div class="hdr">
      <div class="brand">${logo}<div><div class="nm">${name}</div><div class="tg">HVAC • HEATING • VENTILATION</div></div></div>
      <div class="co">${addr ? addr + '<br>' : ''}${phone}<br>${email}<br>${web}</div>
    </div>
    <div class="title"><h1>SERVICE CALL WORK ORDER</h1><div class="meta">WO# ${e(id.slice(0, 8).toUpperCase())}<br>${e(new Date().toLocaleDateString('en-US'))}</div></div>

    <h2>1 · Customer &amp; Job Information</h2>
    <div class="grid">
      ${fld('Customer / Company', job.customer_name)}${fld('Contact Person', job.customer_name)}${fld('Phone', job.customer_phone || bizPhone === job.customer_phone ? job.customer_phone : job.customer_phone)}
      ${fld('Service Address', job.address)}${fld('Email', job.customer_email)}${fld('PO No.', '')}
      ${fld('Date', [job.scheduled_date].filter(Boolean).join(' '))}${fld('Arrival Time', job.scheduled_time || '')}${fld('Departure Time', '')}
      ${fld('Technician(s)', job.technician_name)}${fld('Contract No.', '')}${fld('Job Type', job.job_type)}
    </div>
    <span class="lbl">Service Type</span>${checks(SERVICE_TYPES)}

    <h2>2 · Property &amp; System Classification</h2>
    <span class="lbl">Property Type</span>${blankChecks(['Residential', 'Commercial', 'Industrial'])}
    <span class="lbl">Equipment Type</span>${blankChecks(EQUIP)}
    <div class="grid" style="margin-top:7px">${fld('Other Equipment', '')}${fld('Equipment Location', '')}${fld('No. of Units', '')}</div>

    <div class="page"></div>
    <h2>3 · Equipment Identification</h2>
    <div class="grid">${fld('Manufacturer', '')}${fld('Model', '')}${fld('Serial No.', '')}${fld('Boiler / Furnace / Burner Size', '')}${fld('Fuel Type', '')}${fld('Primary Control', '')}${fld('Burner Mfr / Model', '')}${fld('Flame Safeguard / Control', '')}${fld('Operating Hours / Cycles', '')}</div>

    <h2>4 · Customer Reported Problem</h2>
    <span class="lbl">Reason for Service / Customer Complaint</span><div class="box">${e(job.description || '')}</div>
    <span class="lbl">Condition Upon Arrival</span>${blankChecks(ARRIVAL)}

    <h2>5 · Diagnostic Findings</h2>${blankChecks(DIAG)}
    <span class="lbl">Fault Codes / Diagnostic Readings</span><div class="box"></div>
    <span class="lbl">Cause of Failure / Technician Findings</span><div class="box"></div>

    <h2>6 · Work Performed</h2>${blankChecks(WORK)}
    <span class="lbl">Detailed Description of Work Completed</span><div class="box" style="min-height:48px"></div>

    <div class="page"></div>
    <h2>7 · Combustion &amp; Operating Readings</h2>
    <table class="reads"><thead><tr><th>Measurement</th><th style="text-align:center">Before Service</th><th style="text-align:center">After Service</th></tr></thead><tbody>${READINGS.map(readingRow).join('')}</tbody></table>
    <div class="grid two" style="margin-top:7px">${fld('Analyzer Make / Model', '')}${fld('Calibration / Due Date', '')}</div>
    <span class="lbl">Combustion Test Result</span>${blankChecks(['Acceptable', 'Adjustment Required', 'Not Tested'])}
    <span class="lbl">Additional Measurements / Notes</span><div class="box"></div>

    <h2>8 · Safety &amp; Operational Checklist</h2>${blankChecks(SAFETY)}
    <span class="lbl">Outstanding Defects / Safety Concerns</span><div class="box"></div>

    <h2>9 · Final Equipment Status</h2>${blankChecks(FINAL)}
    <span class="lbl">Status Explanation / Recommended Follow-Up</span><div class="box"></div>
    <div class="grid" style="margin-top:7px">${fld('Parts Required?', '')}${fld('Return Visit Needed?', '')}${fld('Return Visit Date', '')}</div>

    <div class="page"></div>
    <h2>10 · Parts / Materials Installed</h2>
    <table><thead><tr><th class="c" style="text-align:center">Qty</th><th>Part Description</th><th style="width:150px">Part / Model No.</th></tr></thead><tbody>${partRows}${extraPartRows}</tbody></table>
    <span class="lbl">Additional Labor / Subcontractor Work</span><div class="box"></div>

    <h2>11 · Customer Approval &amp; Billing</h2>
    <table><thead><tr><th>Description</th><th class="amt" style="text-align:right">Amount ($)</th></tr></thead><tbody>${BILL.map(b => billRow(b)).join('')}${billRow('Subtotal', true)}${billRow('Applicable Tax', true)}${billRow('TOTAL AMOUNT DUE', true)}</tbody></table>
    <span class="lbl">Payment Method</span>${blankChecks(['Cash', 'Check', 'Credit Card', 'Invoice / PO'])}
    <div class="grid two" style="margin-top:7px">${fld('Payment Status', '')}${fld('Customer PO / Invoice Reference', '')}</div>

    <h2>12 · Technician Certification</h2>
    <div class="cert">I certify that the work described above was performed to the best of my knowledge and that the recorded readings reflect measurements taken during this visit. Outstanding deficiencies and recommendations have been documented.</div>
    <div class="sign"><div><div class="vl" style="font-weight:600;min-height:16px">${e(job.technician_name || '')}</div><div class="sigline">Technician name &amp; signature</div></div><div><div class="sigline" style="margin-top:34px">Date</div></div></div>

    <h2>13 · Customer Acknowledgment</h2>
    <div class="cert">I acknowledge the service visit and receipt of the service information. Any work authorization and applicable rights or warranties remain subject to the service agreement and applicable law.</div>
    <div class="sign"><div><div class="vl" style="min-height:16px">&nbsp;</div><div class="sigline">Customer / authorized representative &amp; signature</div></div><div><div class="sigline" style="margin-top:34px">Title &amp; date</div></div></div>
    <span class="lbl">Additional Notes</span><div class="box"></div>
    <div class="foot">CUSTOMER COPY · COMPANY COPY</div>

    <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>`;
    printHtml(html);
  }
  async function notify(type, label) {
    setEmailing(type);
    try { await sendEmail(type, id, label); } catch { /* toast handled */ }
    finally { setEmailing(''); }
  }
  const f = v => setForm(prev => ({ ...prev, ...v }));
  if (!job) return <Spinner />;

  const cancelled = job.status === 'cancelled';
  const activeIdx = TIMELINE.indexOf(job.status);
  const nextStatus = activeIdx >= 0 && activeIdx < TIMELINE.length - 1 ? TIMELINE[activeIdx + 1] : null;
  const noteEntries = (job.notes || '')
    .split('\n\n---\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(chunk => {
      const nl = chunk.indexOf('\n');
      const first = nl === -1 ? chunk : chunk.slice(0, nl);
      const rest = nl === -1 ? '' : chunk.slice(nl + 1);
      return first.includes(' · ') && rest ? { meta: first, body: rest } : { meta: null, body: chunk };
    });

  return (
    <div className="animate-fade-in">
      <button onClick={() => navigate('/jobs')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to jobs
      </button>

      {/* Header */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Badge status={job.status} />
              <Badge status={job.priority} />
              {job.job_type && <span className="text-xs font-medium text-slate-400">{job.job_type}</span>}
            </div>
            <h1 className="text-section-title text-slate-900">{job.title}</h1>
            <p className="text-xs text-slate-400 mt-1 font-mono">Job #{id.slice(0, 8).toUpperCase()}</p>
            {job.quote_number && (
              <p className="text-xs text-blue-600 mt-1 inline-flex items-center gap-1"><FileText size={12} /> From estimate {job.quote_number}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {!cancelled && <Btn variant="outline" onClick={() => setTaskModal(true)}><CheckSquare size={15} /> Task for office</Btn>}
            {!cancelled && (
              <Btn variant="outline" onClick={async () => {
                try { const { data } = await api.post('/installations', { from_job_id: job.id }); toast.success(data.already ? 'Opening installation project' : 'Installation project created'); navigate(`/installations/${data.id}`); }
                catch (e) { toast.error(e.response?.data?.error || 'Could not create project'); }
              }}><HardHat size={15} /> Installation project</Btn>
            )}
            {/* Technician field tools (also shown to admins flagged as technicians) */}
            {canTech && (
              <>
                {!cancelled && job.status === 'scheduled' && job.customer_email && (
                  <Btn variant="outline" onClick={enRoute} loading={enRouting}><Navigation size={15} /> On my way</Btn>
                )}
                {!cancelled && nextStatus && nextStatus !== 'completed' && (
                  <Btn onClick={() => updateStatus(nextStatus)} loading={saving}>
                    {nextStatus === 'awaiting-signoff' ? <CheckCircle2 size={15} /> : nextStatus === 'in-progress' ? <Wrench size={15} /> : <Calendar size={15} />}
                    {NEXT_STATUS_LABEL[nextStatus]}
                  </Btn>
                )}
                {!cancelled && job.status === 'awaiting-signoff' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 bg-teal-50 ring-1 ring-teal-600/20 rounded-lg px-2.5 py-1.5"><Clock size={14} /> Waiting for customer sign-off</span>
                )}
              </>
            )}
            {/* Office / admin controls */}
            {!isTech && (
              <>
                <Btn variant="outline" onClick={() => notify('job_confirmation', 'Confirmation')} loading={emailing === 'job_confirmation'}><MailCheck size={15} /> Send Confirmation</Btn>
                <Btn variant="outline" onClick={() => notify('job_reminder', 'Reminder')} loading={emailing === 'job_reminder'}><BellRing size={15} /> Send Reminder</Btn>
                {job.customer_id && <Btn variant="outline" onClick={createInvoice}><FileText size={15} /> Create Invoice</Btn>}
                <Btn variant="outline" onClick={printWorkOrder}><Printer size={15} /> Work Order</Btn>
                <Btn variant="outline" onClick={scheduleFollowUp}><Calendar size={15} /> Follow-up</Btn>
                <Btn variant="outline" onClick={() => setEditModal(true)}><Pencil size={15} /> Edit</Btn>
                <Btn variant="danger" onClick={handleDelete}><Trash2 size={15} /> Delete</Btn>
              </>
            )}
          </div>
        </div>

        {/* Status timeline */}
        {!cancelled ? (
          <div className="flex items-center pt-2">
            {TIMELINE.map((step, i) => {
              const done = i <= activeIdx;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done ? <CheckCircle2 size={16} /> : i + 1}
                    </div>
                    <span className={`text-[11px] mt-1.5 font-medium ${done ? 'text-slate-700' : 'text-slate-400'}`}>{TIMELINE_LABEL[step]}</span>
                  </div>
                  {i < TIMELINE.length - 1 && <div className={`flex-1 h-0.5 mx-2 -mt-5 ${i < activeIdx ? 'bg-blue-600' : 'bg-slate-100'}`} />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-4 py-2.5">This job has been cancelled.</div>
        )}
      </Card>

      {/* Office: confirm a customer's held online booking */}
      {!isTech && !cancelled && job.status === 'pending' && job.booking_window && (
        <Card className="p-5 mt-4 border-blue-200 bg-blue-50/40">
          <div className="flex items-start gap-2.5">
            <CalendarCheck size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Appointment request awaiting confirmation</p>
              <p className="text-sm text-slate-600 mt-0.5">{job.customer_name} booked <strong>{job.scheduled_date}</strong> · arrival window <strong>{job.booking_window}</strong>. Set the exact time, then confirm to notify the customer.</p>
              <div className="flex flex-wrap items-end gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Exact time</label>
                  <input type="time" value={confirmTime || WINDOW_START[job.booking_window] || ''}
                    onChange={e => setConfirmTime(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Technician (optional)</label>
                  <select value={confirmTech} onChange={e => setConfirmTech(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white min-w-[160px]">
                    <option value="">Assign later</option>
                    {employees.filter(u => u.role === 'technician' || u.also_technician).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <Btn onClick={confirmBooking} loading={confirming}><CalendarCheck size={15} /> Confirm & notify customer</Btn>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Btn size="sm" variant="outline" onClick={() => setSuggestOpen(o => !o)}><Calendar size={14} /> Suggest another time</Btn>
                <Btn size="sm" variant="outline" className="!text-red-600 !border-red-200 hover:!bg-red-50" onClick={declineBooking} loading={declining}><Trash2 size={14} /> Decline request</Btn>
              </div>
              {suggestOpen && (
                <div className="flex flex-wrap items-end gap-3 mt-3 p-3 rounded-lg bg-white ring-1 ring-slate-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">New date</label>
                    <input type="date" value={suggestDate} onChange={e => setSuggestDate(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Arrival window</label>
                    <select value={suggestWindow} onChange={e => setSuggestWindow(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white min-w-[160px]">
                      <option value="">Choose…</option>
                      {Object.keys(WINDOW_START).map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <Btn size="sm" onClick={suggestTime} loading={suggesting}>Send suggestion</Btn>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" icon={<Calendar size={15} />} />
            <div className="p-5 space-y-3 text-sm">
              {job.customer_name && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <User size={14} className="text-slate-400" />
                  <button className="text-blue-600 hover:underline font-medium" onClick={() => navigate(`/customers/${job.customer_id}`)}>{job.customer_name}</button>
                </div>
              )}
              {job.customer_phone && (
                <div className="flex items-center gap-2 pl-6">
                  <a
                    href={`tel:${job.customer_phone.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                  >
                    <Phone size={12} /> Call
                  </a>
                  <a
                    href={`sms:${job.customer_phone.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                  >
                    <MessageSquare size={12} /> Text
                  </a>
                  <span className="text-xs text-slate-400">{job.customer_phone}</span>
                </div>
              )}
              {(job.scheduled_date || job.scheduled_time) && (
                <div className="flex items-center gap-2.5 text-slate-600"><Calendar size={14} className="text-slate-400" />{job.scheduled_date}{job.scheduled_time ? ` at ${job.scheduled_time}` : ''}</div>
              )}
              {job.booking_window && (
                <div className="flex items-center gap-2.5 text-slate-500"><Clock size={14} className="text-slate-400" />Booked arrival window: {job.booking_window}</div>
              )}
              {job.address && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p>{job.address}</p>
                    <div className="mt-1">
                      <DirectionsButton address={job.address}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors" />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100">
                {job.technician_name ? (
                  <><Avatar name={job.technician_name} className="w-8 h-8 text-xs" /><div><p className="text-sm font-medium text-slate-800">{job.technician_name}</p><p className="text-xs text-slate-400">Assigned technician</p></div></>
                ) : <span className="text-xs text-slate-400 flex items-center gap-1.5"><Wrench size={14} /> Unassigned</span>}
              </div>
              {job.additional_technician_names?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400">Also on this job:</span>
                  {job.additional_technician_names.map(n => (
                    <span key={n} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5"><Wrench size={10} /> {n}</span>
                  ))}
                </div>
              )}
              {job.completed_date && <p className="text-emerald-600 text-xs font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Completed {job.completed_date}</p>}
            </div>
          </Card>

          {job.description && (
            <Card><CardHeader title="Description" /><p className="p-5 text-sm text-slate-700 whitespace-pre-wrap">{job.description}</p></Card>
          )}
          {(canTech || noteEntries.length > 0) && (
            <Card>
              <CardHeader title={`Notes${noteEntries.length ? ` (${noteEntries.length})` : ''}`} />
              <div className="p-5 space-y-4">
                {canTech && (
                  <div className="space-y-2">
                    <Textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      rows={3}
                      placeholder="Add a note — work performed, what you found, or parts needed for a return visit…"
                    />
                    <div className="flex justify-end">
                      <Btn size="sm" onClick={addNote} loading={savingNotes} disabled={!notesDraft.trim()}>Add Note</Btn>
                    </div>
                  </div>
                )}
                {noteEntries.length > 0 ? (
                  <div className="space-y-2.5">
                    {noteEntries.map((entry, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        {entry.meta && <p className="text-xs font-semibold text-slate-500 mb-1">{entry.meta}</p>}
                        {editingNote === idx ? (
                          <div className="space-y-2">
                            <Textarea value={editNoteText} onChange={e => setEditNoteText(e.target.value)} rows={3} />
                            <div className="flex justify-end gap-2">
                              <Btn size="sm" variant="outline" onClick={() => { setEditingNote(null); setEditNoteText(''); }}>Cancel</Btn>
                              <Btn size="sm" onClick={() => saveNoteEdit(idx)} loading={savingNotes} disabled={!editNoteText.trim()}>Save</Btn>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-slate-700 whitespace-pre-wrap flex-1">{entry.body}</p>
                            {canTech && (
                              <button onClick={() => { setEditingNote(idx); setEditNoteText(entry.body); }}
                                className="text-slate-400 hover:text-blue-600 shrink-0" title="Edit note"><Pencil size={13} /></button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  canTech && <p className="text-sm text-slate-400">No notes yet.</p>
                )}
              </div>
            </Card>
          )}

          {/* Job sign-off */}
          <Card>
            <CardHeader title="Job Sign-off" icon={<PenLine size={15} />} />
            <div className="p-5">
              {job.signed_at && !resign ? (
                <div>
                  <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={14} />
                    {job.signoff_type === 'management' ? `Signed off by management · ${job.signed_by}`
                      : job.signoff_type === 'technician' ? `Signed off by technician · ${job.signed_by}`
                      : `Signed by ${job.signed_by}`}
                  </p>
                  <p className="text-xs text-slate-500 mb-2">{new Date(job.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                  {job.signature && <img src={job.signature} alt="signature" className="h-16 bg-white border border-slate-200 rounded" />}
                  {isManager && <button onClick={() => setResign(true)} className="mt-2 block text-xs font-semibold text-blue-600 hover:text-blue-700">Correct sign-off</button>}
                </div>
              ) : !['awaiting-signoff', 'completed'].includes(job.status) ? (
                <p className="text-sm text-slate-400">Available once the work is marked done.</p>
              ) : isManager ? (
                // Office / admin: can sign off as management, run the customer flow, or authorize the tech
                <div className="space-y-3">
                  {resign && (
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs text-amber-800">Correcting the sign-off{job.signed_by ? ` (was: ${job.signed_by})` : ''}. Re-signing replaces it.</p>
                      <button onClick={() => setResign(false)} className="text-xs font-semibold text-amber-800 underline shrink-0">Cancel</button>
                    </div>
                  )}
                  <Btn size="sm" onClick={() => openSign('management')}><PenLine size={14} /> Sign off as management</Btn>

                  {job.signoff_requested && !job.signoff_approved && !job.signoff_tech_authorized && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><BellRing size={12} /> {job.signoff_requested_by || 'The technician'} requested sign-off approval</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Customer signature</p>
                    {job.signoff_approved ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={13} /> Approved{job.signoff_approved_by ? ` by ${job.signoff_approved_by}` : ''}</p>
                        <Btn size="sm" variant="outline" onClick={() => openSign('customer')}><PenLine size={14} /> Capture customer signature</Btn>
                      </div>
                    ) : (
                      <Btn size="sm" variant="outline" onClick={approveSignoff} loading={approving}><CheckCircle2 size={14} /> Approve customer sign-off</Btn>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">If the customer isn't on site</p>
                    {job.signoff_tech_authorized ? (
                      <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={13} /> Technician authorized to sign off{job.signoff_tech_authorized_by ? ` by ${job.signoff_tech_authorized_by}` : ''}</p>
                    ) : (
                      <Btn size="sm" variant="outline" onClick={authorizeTechSignoff} loading={authorizingTech}><CheckCircle2 size={14} /> Authorize technician to sign off</Btn>
                    )}
                  </div>
                </div>
              ) : (
                // Technician view
                <div className="space-y-3">
                  {job.signoff_approved ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> Approved — have the customer sign.</p>
                      <Btn size="sm" onClick={() => openSign('customer')}><PenLine size={14} /> Customer signature</Btn>
                    </div>
                  ) : job.signoff_tech_authorized ? null : (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-sm font-semibold text-amber-800">Sign-off needs office approval</p>
                      <p className="text-xs text-amber-700 mt-0.5">Request approval below — the office can approve the customer to sign here, or authorize you to sign off if the customer isn't on site.</p>
                      {job.signoff_requested && <p className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1.5"><CheckCircle2 size={12} /> Request sent{job.signoff_requested_at ? ` · ${new Date(job.signoff_requested_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Btn size="sm" onClick={requestSignoff} loading={requesting}><Send size={13} /> {job.signoff_requested ? 'Resend request' : 'Request approval'}</Btn>
                        {bizPhone && <a href={`tel:${bizPhone}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-blue-700 text-xs font-semibold border border-amber-200 hover:bg-blue-50"><Phone size={12} /> Call the office</a>}
                        <button onClick={load} className="text-xs font-semibold text-amber-800 underline">Check again</button>
                      </div>
                    </div>
                  )}

                  {job.signoff_tech_authorized && (
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs text-emerald-700 flex items-center gap-1.5 mb-1.5"><CheckCircle2 size={13} /> Authorized to sign off for the customer{job.signoff_tech_authorized_by ? ` by ${job.signoff_tech_authorized_by}` : ''}</p>
                      <Btn size="sm" variant="outline" onClick={() => openSign('technician')}><PenLine size={14} /> Sign off as technician (customer absent)</Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`Photos (${job.photos?.length || 0})`} icon={<Camera size={15} />}
              action={<><input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handlePhotoUpload} />
                <Btn size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload</Btn></>} />
            <div className="p-5">
              {!job.photos?.length ? (
                <Empty icon={<Camera size={24} />} title="No photos yet" message="Upload before & after photos, or photos the customer sent, to document this job."
                  action={<Btn size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Upload First Photo</Btn>} />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {job.photos.map(p => (
                    <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200">
                      {p.proof_type === 'pdf' ? (
                        <a href={p.proof} target="_blank" rel="noreferrer" download className="h-32 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50">
                          <Camera size={22} /><span className="text-xs mt-1">Open PDF</span>
                        </a>
                      ) : (
                        <a href={p.proof} target="_blank" rel="noreferrer" className="block">
                          <img src={p.proof} alt={p.caption || 'job photo'} className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300" />
                        </a>
                      )}
                      <button onClick={() => removePhoto(p.id)} aria-label="Delete photo" className="absolute top-1 right-1 p-1.5 rounded-md bg-white/90 text-red-600 shadow-sm hover:bg-white"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader title={`Inspections (${jobInspections.length})`} icon={<ClipboardCheck size={15} />}
              action={<Btn size="sm" onClick={createInspectionForJob}><Plus size={14} /> New</Btn>} />
            <div className="p-5">
              {jobInspections.length === 0 ? (
                <p className="text-sm text-slate-400">No inspections for this job yet. Start one to capture a checklist and site photos.</p>
              ) : (
                <div className="divide-y divide-slate-100 -my-1">
                  {jobInspections.map(insp => (
                    <button key={insp.id} onClick={() => navigate(`/inspections/${insp.id}`)}
                      className="w-full flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-lg text-left hover:bg-slate-50 transition-colors">
                      <span className="text-sm text-slate-700 truncate">{propertyLabel(insp.property_type)} · {equipmentLabel(insp.equipment_type)}</span>
                      <Badge status={insp.status === 'submitted' ? 'completed' : 'pending'} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader title={`Parts & Materials (${job.parts?.length || 0})`} icon={<Package size={15} />} />
            <div className="p-5 space-y-3">
              {job.parts?.length > 0 ? (
                <div className="divide-y divide-slate-100 -mt-2">
                  {job.parts.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{p.name}{p.quantity > 1 && <span className="text-slate-400"> × {p.quantity}</span>}</p>
                        {(p.note || p.unit_price != null) && <p className="text-xs text-slate-400">{p.unit_price != null ? `$${Number(p.unit_price).toFixed(2)} ea` : ''}{p.unit_price != null && p.note ? ' · ' : ''}{p.note || ''}</p>}
                      </div>
                      <button onClick={() => removePart(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No parts logged yet.</p>
              )}
              <div className="space-y-2 pt-1">
                <Input label="Part / material" value={partForm.name} onChange={e => setPartForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Capacitor 45/5 MFD" />
                <div className="flex gap-2">
                  <Input label="Qty" type="number" min="1" className="w-20" value={partForm.quantity} onChange={e => setPartForm(f => ({ ...f, quantity: e.target.value }))} />
                  <Input label="Unit $ (optional)" type="number" min="0" className="flex-1" value={partForm.unit_price} onChange={e => setPartForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="Cost each" />
                </div>
              </div>
              <div className="flex justify-end">
                <Btn size="sm" onClick={addPart} loading={addingPart} disabled={!partForm.name.trim()}><Plus size={14} /> Add part</Btn>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Job">
        <div className="space-y-3">
          <Input label="Title" value={form.title || ''} onChange={e => f({ title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Status" value={form.status || 'pending'} onChange={e => f({ status: e.target.value })}>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="in-progress">In Progress</option>
              <option value="awaiting-signoff">Awaiting Sign-off</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select label="Priority" value={form.priority || 'normal'} onChange={e => f({ priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Customer" value={form.customer_id || ''} onChange={e => f({ customer_id: e.target.value })}>
              <option value="">No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Technician" value={form.technician_id || ''} onChange={e => f({ technician_id: e.target.value })} disabled={job.status === 'completed'}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional technicians {job.status === 'completed' && <span className="text-xs text-slate-400">(locked — job completed)</span>}</label>
            <div className="flex flex-wrap gap-1.5">
              {employees.filter(e => (e.role === 'technician' || e.also_technician) && e.id !== form.technician_id).map(e => {
                const on = (form.additional_technician_ids || []).includes(e.id);
                const locked = job.status === 'completed';
                return (
                  <button key={e.id} type="button" disabled={locked}
                    onClick={() => { const cur = form.additional_technician_ids || []; f({ additional_technician_ids: on ? cur.filter(id => id !== e.id) : [...cur, e.id] }); }}
                    className={`text-xs px-2.5 py-1.5 rounded-lg ring-1 transition-colors ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:border-slate-300'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    {e.name}
                  </button>
                );
              })}
              {employees.filter(e => (e.role === 'technician' || e.also_technician) && e.id !== form.technician_id).length === 0 && <span className="text-xs text-slate-400">No other technicians.</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Scheduled Date" type="date" value={form.scheduled_date || ''} onChange={e => f({ scheduled_date: e.target.value })} />
            <Input label="Scheduled Time" type="time" value={form.scheduled_time || ''} onChange={e => f({ scheduled_time: e.target.value })} />
          </div>
          <Select label="Job Type" value={form.job_type || ''} onChange={e => f({ job_type: e.target.value })}>
            <option value="">Select type</option>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <AddressAutocomplete label="Address" value={form.address || ''}
            onChange={v => f({ address: v })}
            onSelect={a => f({ address: a.formatted || a.address })} />
          {form.status === 'completed' && (
            <Input label="Completed Date" type="date" value={form.completed_date || ''} onChange={e => f({ completed_date: e.target.value })} />
          )}
          <Textarea label="Description" value={form.description || ''} onChange={e => f({ description: e.target.value })} />
          <Textarea label="Notes" value={form.notes || ''} onChange={e => f({ notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setEditModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
          </div>
        </div>
      </Modal>

      <TaskModal open={taskModal} onClose={() => setTaskModal(false)}
        staff={employees.filter(u => u.role && u.role !== 'customer')} customers={customers} jobs={[job]} onDone={() => {}}
        initial={{ customer_id: job.customer_id || '', job_id: id, title: `Follow-up: ${job.title}` }} />

      <Modal open={signModal} onClose={() => setSignModal(false)}
        title={signMode === 'management' ? 'Sign off as management' : signMode === 'technician' ? 'Technician sign-off' : 'Capture Customer Sign-off'}
        subtitle={job.title}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {signMode === 'management' ? 'You are signing off on this job on behalf of management. This records your name as the authorizer.'
              : signMode === 'technician' ? 'You are signing off on the customer’s behalf because they are not on site. A drawn signature is optional.'
              : 'Hand the device to the customer to confirm the work is complete.'}
          </p>
          <Input label={signMode === 'customer' ? 'Customer name' : signMode === 'management' ? 'Manager name' : 'Technician name'}
            value={signName} onChange={e => setSignName(e.target.value)} placeholder={signMode === 'customer' ? (job.customer_name || 'Full name') : (user?.name || 'Full name')} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Signature{signMode !== 'customer' ? ' (optional)' : ''}</label>
            <SignaturePad ref={padRef} />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setSignModal(false)}>Cancel</Btn>
            <Btn onClick={captureSignoff} loading={signing}>{signing ? 'Saving…' : (signMode === 'customer' ? 'Save Signature' : 'Sign off')}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
