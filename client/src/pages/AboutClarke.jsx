import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Logo from '../components/Logo';
import { ArrowLeft, Globe, Phone, Mail, Shield } from 'lucide-react';

export default function AboutClarke() {
  const navigate = useNavigate();
  const [biz, setBiz] = useState(null);
  useEffect(() => { api.get('/auth/public-info').then(r => setBiz(r.data)).catch(() => {}); }, []);

  const Row = ({ icon: Icon, label, href }) => (
    <a href={href} className="flex items-center gap-3 px-4 min-h-[52px] border-b border-slate-100 last:border-0 active:bg-slate-50">
      <Icon size={18} className="text-slate-500 shrink-0" />
      <span className="text-slate-800 font-medium">{label}</span>
    </a>
  );

  return (
    <div className="max-w-xl mx-auto pb-4">
      <button onClick={() => navigate('/more')} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Back</button>

      <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-6 text-center mb-4">
        <div className="flex justify-center mb-3"><Logo variant="full" height={48} /></div>
        <p className="font-semibold text-slate-800">{biz?.business_name || 'Clarke Mechanical Inc.'}</p>
        <p className="text-sm text-slate-500 mt-1">Mechanical Expertise You Can Trust.</p>
        <p className="text-xs text-slate-400 mt-3">HVAC · Heating · Ventilation</p>
      </div>

      <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
        <Row icon={Globe} label="Visit our website" href="https://clarkemechanicalinc.org" />
        {biz?.business_phone && <Row icon={Phone} label={`Call us · ${biz.business_phone}`} href={`tel:${biz.business_phone}`} />}
        <Row icon={Mail} label="Email support" href="mailto:service@clarkemechanicalinc.org" />
        <Row icon={Shield} label="Privacy Policy" href="/privacy" />
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">Clarke Mechanical · App v1.0</p>
    </div>
  );
}
