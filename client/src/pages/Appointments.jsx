import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Empty, Spinner, Btn } from '../components/UI';
import CustomerJobs from '../components/CustomerJobs';
import ServiceRequestModal from '../components/ServiceRequestModal';
import { CalendarDays, Plus, UserCircle } from 'lucide-react';
import { cacheGet, cacheSet } from '../lib/queryCache';

export default function Appointments() {
  const [me, setMe] = useState(() => cacheGet('portal_me') || null);
  const [jobs, setJobs] = useState(() => cacheGet('portal_jobs') || []);
  const [loading, setLoading] = useState(!cacheGet('portal_jobs'));
  const [reqModal, setReqModal] = useState(false);

  function load() {
    return Promise.all([api.get('/portal/me'), api.get('/portal/jobs')])
      .then(([m, j]) => {
        setMe(m.data); setJobs(j.data);
        cacheSet('portal_me', m.data); cacheSet('portal_jobs', j.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const requestService = () => setReqModal(true);

  if (loading) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Appointments"
        subtitle="Your upcoming visits and service history"
        icon={<CalendarDays size={20} />}>
        {me?.linked && <Btn onClick={requestService}><Plus size={16} /> Request Service</Btn>}
      </PageHeader>

      {!me?.linked ? (
        <Card>
          <Empty
            icon={<UserCircle size={28} />}
            title="Your account isn't linked yet"
            message={`Once Clarke Mechanical adds you as a customer with ${me?.email || 'your email'}, your appointments will appear here automatically.`}
          />
        </Card>
      ) : (
        <CustomerJobs jobs={jobs} me={me} onReload={load} onRequestService={requestService} grouped />
      )}

      <ServiceRequestModal open={reqModal} onClose={() => setReqModal(false)} onDone={load} />
    </div>
  );
}
