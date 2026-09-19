import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { ShieldCheck, Shield, Mail, MessageSquare, Smartphone, Copy, Check } from 'lucide-react';

const METHOD_LABEL = { email: 'email code', sms: 'text message', totp: 'authenticator app' };
const fieldCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500';

// Two-step verification manager. Drop-in for the account/security page.
export default function TwoFactorSettings() {
  const [status, setStatus] = useState(null);          // { enabled, method, backup_remaining, has_phone, sms_available }
  const [phase, setPhase] = useState('idle');          // idle | choose | verify | backup
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState(null);
  const [setupInfo, setSetupInfo] = useState(null);    // { secret, otpauth, sent_to }
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [disabling, setDisabling] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [copied, setCopied] = useState(false);

  function load() { api.get('/auth/2fa/status').then(r => setStatus(r.data)).catch(() => setStatus({ enabled: false })); }
  useEffect(load, []);

  async function startSetup(m) {
    setBusy(true); setMethod(m); setCode('');
    try {
      const { data } = await api.post('/auth/2fa/setup', { method: m });
      setSetupInfo(data); setPhase('verify');
    } catch (e) { toast.error(e.response?.data?.error || 'Could not start setup'); }
    finally { setBusy(false); }
  }

  async function confirm(e) {
    e.preventDefault();
    if (!code.trim()) return toast.error('Enter the code');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/2fa/confirm', { code: code.trim() });
      setBackupCodes(data.backup_codes || []); setPhase('backup');
      toast.success('Two-step verification is on');
    } catch (e) { toast.error(e.response?.data?.error || 'That code was not correct'); }
    finally { setBusy(false); }
  }

  async function disable(e) {
    e.preventDefault();
    if (!disablePw) return toast.error('Enter your password');
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePw });
      toast.success('Two-step verification turned off');
      setDisabling(false); setDisablePw(''); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not turn off'); }
    finally { setBusy(false); }
  }

  function finishBackup() { setPhase('idle'); setSetupInfo(null); setCode(''); setBackupCodes([]); load(); }
  function copyCodes() { navigator.clipboard?.writeText(backupCodes.join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }

  if (!status) return <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-sm text-slate-400">Loading…</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 text-card-title mb-1">
        {status.enabled ? <ShieldCheck size={16} className="text-emerald-600" /> : <Shield size={16} className="text-slate-500" />}
        Two-step verification
      </div>
      <p className="text-xs text-slate-500 mb-4">Adds a second step at sign-in so a stolen password isn’t enough to get in.</p>

      {/* ON */}
      {status.enabled && phase !== 'backup' && (
        <div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <ShieldCheck size={15} /> On — via {METHOD_LABEL[status.method] || status.method}
            {status.backup_remaining > 0 && <span className="ml-auto text-xs text-emerald-700">{status.backup_remaining} backup codes left</span>}
          </div>
          {!disabling ? (
            <button onClick={() => setDisabling(true)} className="mt-3 text-sm font-medium text-red-600 hover:text-red-700">Turn off</button>
          ) : (
            <form onSubmit={disable} className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">Enter your password to turn two-step verification off.</p>
              <input type="password" autoComplete="current-password" placeholder="Your password" value={disablePw} onChange={e => setDisablePw(e.target.value)} className={fieldCls} />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">Turn off</button>
                <button type="button" onClick={() => { setDisabling(false); setDisablePw(''); }} className="text-sm font-medium text-slate-500 px-3">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* OFF — idle */}
      {!status.enabled && phase === 'idle' && (
        <button onClick={() => setPhase('choose')} className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
          <ShieldCheck size={16} /> Set up two-step verification
        </button>
      )}

      {/* OFF — choose method */}
      {!status.enabled && phase === 'choose' && (
        <div className="space-y-2">
          <MethodButton icon={Mail} title="Email code" desc="Get a code by email each time you sign in" onClick={() => startSetup('email')} disabled={busy} />
          <MethodButton icon={MessageSquare} title="Text message" desc={status.has_phone ? (status.sms_available ? 'Get a code by text' : 'Texting isn’t set up right now') : 'Add a mobile number to your account first'} onClick={() => startSetup('sms')} disabled={busy || !status.has_phone || !status.sms_available} />
          <MethodButton icon={Smartphone} title="Authenticator app" desc="Use Google Authenticator, Authy, 1Password, etc. (most secure)" onClick={() => startSetup('totp')} disabled={busy} />
          <button onClick={() => setPhase('idle')} className="text-sm font-medium text-slate-500 mt-1">Cancel</button>
        </div>
      )}

      {/* OFF — verify setup */}
      {!status.enabled && phase === 'verify' && setupInfo && (
        <form onSubmit={confirm} className="space-y-3">
          {method === 'totp' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600 mb-2">In your authenticator app, choose “Add” → “Enter a setup key,” then type this key:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-sm font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-2 tracking-wider">{setupInfo.secret}</code>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(setupInfo.secret); toast.success('Key copied'); }} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100" title="Copy key"><Copy size={15} /></button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Account: Clarke Mechanical · Type: Time-based</p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">We sent a 6-digit code to <span className="font-semibold">{setupInfo.sent_to}</span>. Enter it below to turn on two-step verification.</p>
          )}
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoFocus placeholder="000000"
            className="w-full text-center tracking-[0.4em] text-xl font-bold py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">{busy ? 'Confirming…' : 'Confirm & turn on'}</button>
            <button type="button" onClick={() => { setPhase('choose'); setCode(''); }} className="text-sm font-medium text-slate-500 px-3">Back</button>
          </div>
        </form>
      )}

      {/* backup codes shown once */}
      {phase === 'backup' && (
        <div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 mb-3">
            <ShieldCheck size={15} /> Two-step verification is on.
          </div>
          <p className="text-sm text-slate-600 mb-2">Save these backup codes somewhere safe. Each one works once if you can’t get your normal code:</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl p-3">
            {backupCodes.map(c => <span key={c} className="text-slate-800">{c}</span>)}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={copyCodes} className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-medium px-3 py-2 rounded-lg">
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy codes</>}
            </button>
            <button onClick={finishBackup} className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg">I’ve saved these</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MethodButton({ icon: Icon, title, desc, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full flex items-start gap-3 text-left rounded-xl border border-slate-200 px-3.5 py-3 hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
      <Icon size={18} className="text-slate-500 mt-0.5 shrink-0" />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
    </button>
  );
}
