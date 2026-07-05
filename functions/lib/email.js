const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { db } = require('./db');
const settings = require('./settings');

/* Inline brand images (cid:) */
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'email-logo.png');
const MARK_PATH = path.join(__dirname, '..', 'assets', 'email-mark.png');
function brandAttachments() {
  const att = [];
  if (fs.existsSync(LOGO_PATH)) att.push({ filename: 'clarke-logo.png', path: LOGO_PATH, cid: 'clarkelogo' });
  if (fs.existsSync(MARK_PATH)) att.push({ filename: 'clarke-mark.png', path: MARK_PATH, cid: 'clarkemark' });
  return att;
}

let cached = { key: null, transporter: null };
function getTransporter(cfg) {
  const key = JSON.stringify(cfg.smtp) + cfg.configured;
  if (cached.key === key && cached.transporter) return cached.transporter;
  const transporter = cfg.configured
    ? nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465, auth: { user: cfg.smtp.user, pass: cfg.smtp.pass } })
    : nodemailer.createTransport({ jsonTransport: true });
  cached = { key, transporter };
  return transporter;
}
function resetTransport() { cached = { key: null, transporter: null }; }

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const p = (t) => `<p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6;">${t}</p>`;

function shell(b, { heading, body, accent = '#1d4ed8' }) {
  return `
  <div style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 12px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-bottom:none;border-radius:16px 16px 0 0;padding:26px 32px 18px;text-align:center;">
        <img src="cid:clarkelogo" alt="${b.name}" width="210" style="display:block;margin:0 auto;width:210px;max-width:72%;height:auto;" />
      </div>
      <div style="height:6px;background:linear-gradient(90deg,#1e3a8a,${accent});font-size:0;line-height:0;">&nbsp;</div>
      <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;">
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">${heading}</h1>
        ${body}
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:22px 32px;text-align:center;">
        <img src="cid:clarkemark" alt="" width="34" height="34" style="width:34px;height:34px;margin-bottom:8px;" />
        <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
          <strong style="color:#334155;">${b.name}</strong> · ${b.phone}<br/>
          Questions? Reply to this email or contact <a href="mailto:${b.email}" style="color:#2563eb;">${b.email}</a>.
        </p>
      </div>
      <p style="text-align:center;font-size:11px;color:#94a3b8;margin:16px 0 0;">© ${new Date().getFullYear()} ${b.name}. All rights reserved.</p>
    </div>
  </div>`;
}

function itemsTable(items = []) {
  if (!items.length) return '';
  const rows = items.map(i => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:14px;">${i.description}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;text-align:right;">${i.quantity}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;text-align:right;font-weight:600;">${money(i.total)}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr>
    <th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;padding-bottom:6px;">Description</th>
    <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;padding-bottom:6px;">Qty</th>
    <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;padding-bottom:6px;">Amount</th></tr>${rows}</table>`;
}

const templates = {
  invoice(inv, b) {
    const balance = inv.total - (inv.amountPaid || 0);
    return { subject: `Invoice ${inv.invoice_number} from Clarke Mechanical — ${money(inv.total)}`,
      html: shell(b, { heading: `Invoice ${inv.invoice_number}`,
        body: p(`Hi ${inv.customer_name || 'there'},`) + p(`Thank you for choosing Clarke Mechanical. Please find your invoice below${inv.due_date ? `, due <strong>${inv.due_date}</strong>` : ''}.`) + itemsTable(inv.items) +
          `<table style="width:100%;margin-top:8px;"><tr><td></td><td style="text-align:right;">
            <p style="margin:2px 0;color:#64748b;font-size:14px;">Subtotal: ${money(inv.subtotal)}</p>
            <p style="margin:2px 0;color:#64748b;font-size:14px;">Tax: ${money(inv.tax_amount)}</p>
            <p style="margin:6px 0 0;color:#0f172a;font-size:18px;font-weight:800;">Total Due: ${money(balance)}</p></td></tr></table>` }) };
  },
  invoice_reminder(inv, b) {
    const balance = inv.total - (inv.amountPaid || 0);
    return { subject: `Payment reminder — Invoice ${inv.invoice_number} is past due`,
      html: shell(b, { accent: '#c2410c', heading: 'Friendly payment reminder',
        body: p(`Hi ${inv.customer_name || 'there'},`) + p(`Our records show invoice <strong>${inv.invoice_number}</strong> with a balance of <strong>${money(balance)}</strong> became due on <strong>${inv.due_date}</strong> and is now past due.`) + p(`If you've already sent payment, thank you — please disregard this notice.`) + `<p style="margin:8px 0 0;text-align:right;color:#0f172a;font-size:18px;font-weight:800;">Balance Due: ${money(balance)}</p>` }) };
  },
  receipt(inv, b) {
    return { subject: `Payment received — Invoice ${inv.invoice_number}`,
      html: shell(b, { accent: '#047857', heading: 'Payment received — thank you!',
        body: p(`Hi ${inv.customer_name || 'there'},`) + p(`We've received your payment of <strong>${money(inv.lastPayment || inv.total)}</strong> for invoice <strong>${inv.invoice_number}</strong>. Your account is now up to date.`) + p('We appreciate your business and look forward to serving you again.') }) };
  },
  quote(q, b) {
    return { subject: `Your estimate ${q.quote_number} from Clarke Mechanical`,
      html: shell(b, { heading: `Estimate ${q.quote_number}`,
        body: p(`Hi ${q.customer_name || 'there'},`) + p(`Thank you for the opportunity to earn your business. Here is your estimate${q.expiry_date ? `, valid until <strong>${q.expiry_date}</strong>` : ''}.`) + itemsTable(q.items) + `<p style="margin:8px 0 0;text-align:right;color:#0f172a;font-size:18px;font-weight:800;">Total: ${money(q.total)}</p>` + p('Reply to this email to approve the estimate or ask any questions.') }) };
  },
  job_confirmation(job, b) {
    return { subject: 'Your HVAC service appointment is confirmed',
      html: shell(b, { heading: 'Your appointment is confirmed',
        body: p(`Hi ${job.customer_name || 'there'},`) + p('This confirms your upcoming service:') +
          `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:8px 0 16px;">
            <p style="margin:0 0 6px;font-size:15px;color:#0f172a;font-weight:600;">${job.title}</p>
            <p style="margin:0;font-size:14px;color:#475569;">📅 ${job.scheduled_date || 'To be scheduled'}${job.scheduled_time ? ` at ${job.scheduled_time}` : ''}</p>
            ${job.technician_name ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;">🔧 Technician: ${job.technician_name}</p>` : ''}
            ${job.address ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;">📍 ${job.address}</p>` : ''}</div>` + p('If you need to reschedule, just reply to this email.') }) };
  },
  job_reminder(job, b) {
    return { subject: 'Reminder: your HVAC service appointment',
      html: shell(b, { heading: 'Appointment reminder',
        body: p(`Hi ${job.customer_name || 'there'},`) + p('This is a friendly reminder about your upcoming service appointment:') +
          `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 18px;margin:8px 0 16px;">
            <p style="margin:0 0 6px;font-size:15px;color:#0f172a;font-weight:600;">${job.title}</p>
            <p style="margin:0;font-size:14px;color:#1e40af;font-weight:600;">📅 ${job.scheduled_date || ''}${job.scheduled_time ? ` at ${job.scheduled_time}` : ''}</p>
            ${job.technician_name ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;">🔧 Technician: ${job.technician_name}</p>` : ''}</div>` + p('Please ensure someone is available to provide access. Thank you!') }) };
  },
  test(_e, b) {
    return { subject: 'Clarke Mechanical — test email',
      html: shell(b, { heading: 'Your email is working! 🎉', body: p('This is a test message from your Clarke Mechanical settings. If you can read this, your business email is configured correctly.') }) };
  },
};

// Render a template with the current business identity.
async function render(type, entity) {
  const cfg = await settings.emailConfig();
  return templates[type](entity, cfg.business);
}

// Send + log to Firestore email_log.
async function sendMail({ type, to, toName, subject, html, relatedId, customerId, sentBy }) {
  const id = uuid();
  const cfg = await settings.emailConfig();
  let status = 'sent';
  let error = null;
  try {
    if (!to) throw new Error('Recipient has no email address on file');
    await getTransporter(cfg).sendMail({ from: cfg.from, to, subject, html, attachments: brandAttachments() });
    status = cfg.configured ? 'sent' : 'simulated';
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
