const nodemailer = require('nodemailer');
const { v4: uuid } = require('uuid');
const { db } = require('./db');
const settings = require('./settings');

// Publicly-hosted brand logo (works in Brevo HTTP API and all mail clients).
const LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://clarke-mechanical-inc.web.app/email-logo.png';

// ---- Brand palette ----
const NAVY = '#0b2545';
const BLUE = '#2563eb';
const RED = '#dc2626';
const GREEN = '#16a34a';
const ORANGE = '#c2410c';

let cached = { key: null, transporter: null };
function getTransporter(cfg) {
  const key = JSON.stringify(cfg.smtp) + cfg.configured;
  if (cached.key === key && cached.transporter) return cached.transporter;
  const transporter = cfg.smtp.host
    ? nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465, auth: { user: cfg.smtp.user, pass: cfg.smtp.pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })
    : nodemailer.createTransport({ jsonTransport: true });
  cached = { key, transporter };
  return transporter;
}
function resetTransport() { cached = { key: null, transporter: null }; }

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const p = (t) => `<p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.65;">${t}</p>`;
const portal = (b) => `${b.appUrl || 'https://clarke-mechanical-inc.web.app'}/portal`;

// A "bulletproof" colored button.
function btn({ label, url, color = BLUE }) {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="display:inline-block;margin:5px 5px;"><tr>
    <td bgcolor="${color}" style="border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
    </td></tr></table>`;
}
const buttonRow = (buttons) => `<div style="text-align:center;margin:22px 0 6px;">${buttons.map(btn).join('')}</div>`;

// A rounded "details" card with an optional heading and a 2-column icon grid.
function detailBox(heading, items, tint = '#f8fafc') {
  const cell = (it) => `<td width="50%" valign="top" style="padding:10px 10px;">
      <div style="font-size:11px;color:${BLUE};font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">${it.icon ? it.icon + ' ' : ''}${it.label}</div>
      <div style="font-size:15px;color:#0f172a;font-weight:600;line-height:1.4;">${it.value}</div></td>`;
  let rows = '';
  for (let i = 0; i < items.length; i += 2) {
    rows += `<tr>${cell(items[i])}${items[i + 1] ? cell(items[i + 1]) : '<td width="50%"></td>'}</tr>`;
  }
  return `<div style="background:${tint};border:1px solid #e2e8f0;border-radius:14px;padding:14px 14px;margin:18px 0;">
    ${heading ? `<div style="font-size:13px;font-weight:800;color:${NAVY};text-transform:uppercase;letter-spacing:.04em;margin:2px 0 8px 10px;">${heading}</div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table></div>`;
}

function itemsTable(items = []) {
  if (!items.length) return '';
  const rows = items.map(i => `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #eef2f7;color:#334155;font-size:14px;">${i.description}</td>
    <td style="padding:9px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:14px;text-align:right;">${i.quantity}</td>
    <td style="padding:9px 0;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;text-align:right;font-weight:600;">${money(i.total)}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr>
    <th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;padding-bottom:6px;">Description</th>
    <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;padding-bottom:6px;">Qty</th>
    <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;padding-bottom:6px;">Amount</th></tr>${rows}</table>`;
}

// The shared email frame: white header (logo + contact), title, body, navy footer.
function shell(b, { heading, accent = BLUE, body }) {
  const contact = `📞 ${b.phone}<br/>✉️ <a href="mailto:${b.email}" style="color:#475569;text-decoration:none;">${b.email}</a>${b.website ? `<br/>🌐 ${b.website}` : ''}`;
  return `<div style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:22px 12px 32px;">
      <div style="height:8px;background:${NAVY};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</div>
      <!-- Header -->
      <div style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:22px 30px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle"><img src="${LOGO_URL}" alt="${b.name}" width="190" style="display:block;width:190px;max-width:62%;height:auto;" />${b.tagline ? `<div style="font-size:11px;color:${BLUE};font-weight:600;margin-top:6px;letter-spacing:.01em;">${b.tagline}</div>` : ''}</td>
          <td align="right" valign="middle" style="font-size:12px;color:#475569;line-height:1.7;">${contact}</td>
        </tr></table>
      </div>
      <div style="height:3px;background:${accent};font-size:0;line-height:0;">&nbsp;</div>
      <!-- Body -->
      <div style="background:#fff;padding:30px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <h1 style="margin:0;font-size:29px;line-height:1.12;color:${NAVY};font-weight:800;letter-spacing:-.02em;">${heading}</h1>
        <div style="width:54px;height:4px;background:${accent};border-radius:2px;margin:10px 0 18px;"></div>
        ${body}
      </div>
      <!-- Footer -->
      <div style="background:${NAVY};border-radius:0 0 14px 14px;padding:22px 28px;text-align:center;">
        <div style="font-size:15px;font-weight:700;color:#ffffff;">${b.name}</div>
        ${b.tagline ? `<div style="font-size:12px;color:#93c5fd;font-style:italic;margin-top:3px;">${b.tagline}</div>` : ''}
        <div style="font-size:12px;color:#cbd5e1;margin-top:12px;line-height:1.9;">📞 ${b.phone} &nbsp;·&nbsp; ✉️ ${b.email}${b.website ? ` &nbsp;·&nbsp; 🌐 ${b.website}` : ''}${b.hours ? `<br/>🕐 ${b.hours}` : ''}</div>
        <div style="font-size:11px;color:#64748b;margin-top:12px;">© ${new Date().getFullYear()} ${b.name}. All rights reserved.</div>
      </div>
    </div>
  </div>`;
}

const totalsBlock = (label, value, color = NAVY) => `<table style="width:100%;margin-top:6px;"><tr><td></td><td style="text-align:right;">
  <p style="margin:8px 0 0;color:${color};font-size:19px;font-weight:800;">${label}: ${money(value)}</p></td></tr></table>`;

const templates = {
  invoice(inv, b) {
    const balance = inv.total - (inv.amountPaid || 0);
    return { subject: `Invoice ${inv.invoice_number} from ${b.name} — ${money(balance)}`,
      html: shell(b, { heading: `Invoice ${inv.invoice_number}`,
        body: p(`Hi ${inv.customer_name || 'there'},`) + p(`Thank you for choosing ${b.name}. Your invoice is below${inv.due_date ? `, due <strong>${inv.due_date}</strong>` : ''}.`) +
          itemsTable(inv.items) +
          `<table style="width:100%;margin-top:4px;"><tr><td></td><td style="text-align:right;">
            <p style="margin:2px 0;color:#64748b;font-size:14px;">Subtotal: ${money(inv.subtotal)}</p>
            <p style="margin:2px 0;color:#64748b;font-size:14px;">Tax: ${money(inv.tax_amount)}</p>
            <p style="margin:6px 0 0;color:#0f172a;font-size:19px;font-weight:800;">Total Due: ${money(balance)}</p></td></tr></table>` +
          buttonRow([{ label: '🔒 Pay Now', url: portal(b), color: BLUE }]) +
          p(`You can pay securely online using the button above, or reply to this email with any questions.`) }) };
  },
  invoice_reminder(inv, b) {
    const balance = inv.total - (inv.amountPaid || 0);
    return { subject: `Payment reminder — Invoice ${inv.invoice_number}`,
      html: shell(b, { accent: ORANGE, heading: 'Friendly payment reminder',
        body: p(`Hi ${inv.customer_name || 'there'},`) + p(`This is a friendly reminder that invoice <strong>${inv.invoice_number}</strong> became due on <strong>${inv.due_date}</strong> and is currently unpaid.`) +
          detailBox('Invoice summary', [
            { icon: '📄', label: 'Invoice', value: inv.invoice_number },
            { icon: '📅', label: 'Due date', value: inv.due_date || '—' },
            { icon: '💵', label: 'Balance due', value: `<span style="color:${RED};">${money(balance)}</span>` },
          ]) +
          p(`If you've already sent payment, thank you — please disregard this notice.`) +
          buttonRow([{ label: '🔒 Pay Now', url: portal(b), color: BLUE }]) }) };
  },
  receipt(inv, b) {
    return { subject: `Payment received — Invoice ${inv.invoice_number}`,
      html: shell(b, { accent: GREEN, heading: 'Payment received — thank you!',
        body: p(`Hi ${inv.customer_name || 'there'},`) + p(`We've received your payment for invoice <strong>${inv.invoice_number}</strong>. Your account is now up to date.`) +
          detailBox('Payment summary', [
            { icon: '📄', label: 'Invoice', value: inv.invoice_number },
            { icon: '📅', label: 'Date', value: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
            { icon: '👤', label: 'Billed to', value: inv.customer_name || '—' },
            { icon: '✅', label: 'Amount paid', value: `<span style="color:${GREEN};">${money(inv.lastPayment || inv.total)}</span>` },
          ], '#f0fdf4') +
          p('We appreciate your business and look forward to serving you again.') }) };
  },
  quote(q, b) {
    return { subject: `Your estimate ${q.quote_number} from ${b.name}`,
      html: shell(b, { heading: `Estimate ${q.quote_number}`,
        body: p(`Hi ${q.customer_name || 'there'},`) + p(`Thank you for the opportunity to earn your business. Here is your estimate${q.expiry_date ? `, valid until <strong>${q.expiry_date}</strong>` : ''}.`) +
          itemsTable(q.items) + totalsBlock('Total Estimate', q.total, BLUE) +
          detailBox('Next steps', [
            { icon: '👀', label: 'Step 1', value: 'Review the estimate' },
            { icon: '💬', label: 'Step 2', value: 'Reply with any questions' },
            { icon: '✍️', label: 'Step 3', value: 'Approve to get started' },
          ]) +
          buttonRow([{ label: 'View in your account', url: portal(b), color: BLUE }]) +
          p('Reply to this email to approve the estimate or ask any questions.') }) };
  },
  job_confirmation(job, b) {
    return { subject: `Your appointment with ${b.name} is confirmed`,
      html: shell(b, { accent: GREEN, heading: 'Appointment confirmed',
        body: p(`Hi ${job.customer_name || 'there'},`) + p('Great news — your appointment is scheduled. Here are the details:') +
          detailBox('Appointment details', [
            { icon: '📅', label: 'Date', value: job.scheduled_date || 'To be scheduled' },
            { icon: '🕐', label: 'Time', value: job.scheduled_time || job.booking_window || 'To be confirmed' },
            { icon: '🔧', label: 'Service', value: job.title || '—' },
            ...(job.technician_name ? [{ icon: '👤', label: 'Technician', value: job.technician_name }] : []),
            ...(job.address ? [{ icon: '📍', label: 'Location', value: job.address }] : []),
          ], '#f0fdf4') +
          buttonRow([{ label: 'Reschedule', url: portal(b), color: BLUE }, { label: 'Cancel', url: portal(b), color: RED }]) +
          p('Need to make a change? Use the buttons above or just reply to this email.') }) };
  },
  job_reminder(job, b) {
    return { subject: `Reminder: your appointment with ${b.name}`,
      html: shell(b, { heading: 'Appointment reminder',
        body: p(`Hi ${job.customer_name || 'there'},`) + p('This is a friendly reminder about your upcoming service appointment:') +
          detailBox('Appointment details', [
            { icon: '📅', label: 'Date', value: job.scheduled_date || '' },
            { icon: '🕐', label: 'Time', value: job.scheduled_time || job.booking_window || '' },
            { icon: '🔧', label: 'Service', value: job.title || '—' },
            ...(job.technician_name ? [{ icon: '👤', label: 'Technician', value: job.technician_name }] : []),
          ], '#eff6ff') +
          p('Please ensure someone is available to provide access. If you need to reschedule, use the button below.') +
          buttonRow([{ label: 'Reschedule', url: portal(b), color: BLUE }, { label: 'Cancel', url: portal(b), color: RED }]) }) };
  },
  job_completed(job, b) {
    return { subject: 'Your service is complete — thank you!',
      html: shell(b, { accent: GREEN, heading: 'Service complete',
        body: p(`Hi ${job.customer_name || 'there'},`) + p(`We've completed <strong>${job.title}</strong>${job.completed_date ? ` on ${job.completed_date}` : ''}. Thank you for choosing ${b.name}!`) +
          detailBox('Service summary', [
            ...(job.completed_date ? [{ icon: '📅', label: 'Completed', value: job.completed_date }] : []),
            { icon: '🔧', label: 'Service', value: job.title || '—' },
            ...(job.technician_name ? [{ icon: '👤', label: 'Technician', value: job.technician_name }] : []),
          ], '#f0fdf4') +
          p("We'd love your feedback — it helps us serve you better.") +
          buttonRow([{ label: '⭐ Leave a Review', url: portal(b), color: GREEN }]) }) };
  },
  service_confirmation(job, b) {
    return { subject: `We received your request — ${b.name}`,
      html: shell(b, { heading: 'Request received',
        body: p(`Hi ${job.customer_name || 'there'},`) + p(`Thanks — we've received your request for <strong>${job.title}</strong>${job.scheduled_date ? ` (requested date: ${job.scheduled_date})` : ''}${job.booking_window ? `, ${job.booking_window}` : ''}. Your slot is held while our team confirms the exact time.`) +
          detailBox("What happens next", [
            { icon: '📋', label: 'Step 1', value: 'We review your request' },
            { icon: '📞', label: 'Step 2', value: 'We confirm your time' },
            { icon: '🔧', label: 'Step 3', value: 'We complete your service' },
          ], '#eff6ff') +
          buttonRow([{ label: 'View in your account', url: portal(b), color: BLUE }]) +
          p('You can track its status anytime by logging into your account.') }) };
  },
  suggest_time(job, b) {
    return { subject: `A new time for your appointment — ${job.scheduled_date}`,
      html: shell(b, { heading: 'Suggested new time',
        body: p(`Hi ${job.customer_name || 'there'},`) + p(`Your originally requested time wasn't available, so we'd like to propose a new time for <strong>${job.title}</strong>:`) +
          detailBox('Suggested appointment', [
            { icon: '📅', label: 'Date', value: job.scheduled_date || '' },
            { icon: '🕐', label: 'Arrival window', value: job.booking_window || '' },
            { icon: '🔧', label: 'Service', value: job.title || '—' },
          ], '#eff6ff') +
          p("If this works, no action is needed — we'll confirm it. If not, pick another open time in your account or reply to this email.") +
          buttonRow([{ label: 'View my appointment', url: portal(b), color: BLUE }]) }) };
  },
  decline(job, b) {
    return { subject: 'About your appointment request',
      html: shell(b, { accent: RED, heading: 'About your request',
        body: p(`Hi ${job.customer_name || 'there'},`) + p(`Unfortunately we're unable to accommodate your requested appointment for <strong>${job.title}</strong>${job.scheduled_date ? ` on ${job.scheduled_date}` : ''}. We're sorry for any inconvenience.`) +
          p("We'd be glad to find another time that works for you — book an open slot in your account, or reply to this email and we'll help.") +
          buttonRow([{ label: 'Choose another time', url: portal(b), color: BLUE }]) }) };
  },
  password_reset(e, b) {
    return { subject: `Reset your ${b.name} password`,
      html: shell(b, { heading: 'Password reset requested',
        body: p(`Hi ${e.name || 'there'},`) + p(`We received a request to reset the password for your ${b.name} account. Click the button below to choose a new one.`) +
          buttonRow([{ label: '🔒 Reset my password', url: e.link, color: BLUE }]) +
          p(`<span style="color:#64748b;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</span>`) }) };
  },
  verify_code(e, b) {
    return { subject: `Your verification code: ${e.code}`,
      html: shell(b, { heading: 'Verify your email',
        body: p(`Hi ${e.name || 'there'},`) + p(`Your ${b.name} verification code is:`) +
          `<div style="text-align:center;margin:14px 0 18px;"><span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 26px;font-size:30px;font-weight:800;letter-spacing:8px;color:${NAVY};">${e.code}</span></div>` +
          p(`<span style="color:#64748b;font-size:13px;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</span>`) }) };
  },
  test(_e, b) {
    return { subject: `${b.name} — test email`,
      html: shell(b, { heading: 'Your email is working!',
        body: p('This is a test message from your settings.') + p('If you can read this, your business email is configured correctly and sending through your domain.') }) };
  },
};

// Render a template with the current business identity.
async function render(type, entity) {
  const cfg = await settings.emailConfig();
  return templates[type](entity, cfg.business);
}

// Send via Brevo's transactional HTTP API (works on hosts that block SMTP).
async function sendViaBrevo(cfg, { to, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: cfg.business.name, email: cfg.business.email },
      to: [{ email: to, name: toName || to }],
      replyTo: { email: cfg.replyTo || cfg.business.email, name: cfg.business.name },
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Send + log to Firestore email_log.
async function sendMail({ type, to, toName, subject, html, relatedId, customerId, sentBy }) {
  const id = uuid();
  const cfg = await settings.emailConfig();
  let status = 'sent';
  let error = null;
  try {
    if (!to) throw new Error('Recipient has no email address on file');
    if (cfg.provider === 'brevo') {
      await sendViaBrevo(cfg, { to, toName, subject, html });
      status = 'sent';
    } else if (cfg.provider === 'smtp') {
      await getTransporter(cfg).sendMail({ from: cfg.from, to, subject, html, replyTo: cfg.replyTo || undefined });
      status = 'sent';
    } else {
      status = 'simulated';
    }
  } catch (e) {
    status = 'failed';
    error = e.message;
  }
  await db.collection('email_log').doc(id).set({
    type, to_email: to || '', to_name: toName || null, subject, related_id: relatedId || null,
    customer_id: customerId || null, status, error, sent_by: sentBy || null, sent_at: new Date().toISOString(),
  });
  return { id, status, error };
}

module.exports = { sendMail, render, templates, resetTransport, isTemplate: (t) => !!templates[t] };
