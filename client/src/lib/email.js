import api from '../api/client';
import toast from 'react-hot-toast';

// Sends a customer email via the business email service and shows a toast.
// In dev (no SMTP configured) the server returns status 'simulated' so we say so.
export async function sendEmail(type, id, label = 'Email', cc = []) {
  const tId = toast.loading('Sending…');
  try {
    const { data } = await api.post('/email/send', { type, id, cc });
    const extra = (data.cc && data.cc.length) ? ` (+${data.cc.length} more)` : '';
    toast.success(
      data.status === 'simulated'
        ? `${label} logged (demo mode) → ${data.to}${extra}`
        : `${label} sent to ${data.to}${extra}`,
      { id: tId, duration: 4000 }
    );
    return data;
  } catch (e) {
    toast.error(e.response?.data?.error || 'Could not send email', { id: tId });
    throw e;
  }
}
