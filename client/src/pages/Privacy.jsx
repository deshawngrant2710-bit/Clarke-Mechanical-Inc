import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Privacy() {
  const updated = 'August 2026';
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-center mb-6"><Logo variant="full" height={44} /></div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 sm:p-9 text-slate-700 leading-relaxed">
          <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-slate-400 mt-1 mb-6">Last updated: {updated}</p>

          <p className="mb-4">This Privacy Policy explains how Clarke Mechanical Inc. ("we," "us") collects, uses, and protects your information when you use our website and mobile app (the "Service").</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Information we collect</h2>
          <p className="mb-4">We collect information you provide when you create an account, request or receive service, or contact us — such as your name, business name, email address, phone number, service address, appointment details, service history, photos related to your equipment or job, and notes. When you make a payment, card details are entered directly with our payment processor; we do not store full card numbers.</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">How we use your information</h2>
          <p className="mb-4">We use your information to schedule and perform service, send appointment confirmations and reminders, prepare estimates and invoices, process payments, respond to your requests, and operate and improve the Service. We do not sell your personal information.</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">How we share information</h2>
          <p className="mb-4">We share information only with service providers who help us operate — for example, our payment processor (Stripe) to process payments, and our email provider to deliver confirmations and receipts. We may disclose information if required by law.</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Your choices &amp; account deletion</h2>
          <p className="mb-4">You can update your contact details and notification preferences at any time in the app. You may delete your account from <strong>My Portal → My Info → Delete my account</strong>, which removes your login and portal access. We may retain certain service and billing records where required for accounting, tax, or legal purposes. You can also contact us to request access to or deletion of your information.</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Data security</h2>
          <p className="mb-4">We use reasonable administrative and technical safeguards to protect your information. No method of transmission or storage is completely secure, but we work to keep your data protected.</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Children</h2>
          <p className="mb-4">The Service is intended for adults and is not directed to children under 13.</p>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Contact us</h2>
          <p className="mb-4">Questions about this policy? Contact us at <a href="mailto:service@clarkemechanicalinc.org" className="text-blue-600">service@clarkemechanicalinc.org</a>.</p>

          <div className="border-t border-slate-100 mt-6 pt-4">
            <Link to="/login" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
