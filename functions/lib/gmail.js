// Gmail integration — read-only access to the office inbox so the system can
// auto-capture vendor invoices. Uses Google OAuth 2.0 (refresh token encrypted
// at rest) and the Gmail REST API (no SDK).
//
// Env (Render):
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI  — e.g. https://<api-host>/api/gmail/callback
//   GMAIL_TOKEN_KEY            — 32+ random chars; encrypts the stored refresh token
const crypto = require('crypto');
const { getById, create, update, remove } = require('./db');

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const DOC = 'default';

const clientId = () => process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const redirectUri = () => process.env.GOOGLE_OAUTH_REDIRECT_URI || '';
const configured = () => !!(clientId() && clientSecret() && redirectUri());

// --- token encryption (AES-256-GCM) ---
function keyBuf() {
  const raw = process.env.GMAIL_TOKEN_KEY || '';
  if (!raw) throw new Error('GMAIL_TOKEN_KEY is not set');
  return crypto.createHash('sha256').update(raw).digest();
}
function enc(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const out = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${out.toString('base64')}`;
}
function dec(blob) {
  const [i, t, d] = String(blob || '').split(':');
  const dc = crypto.createDecipheriv('aes-256-gcm', keyBuf(), Buffer.from(i, 'base64'));
  dc.setAuthTag(Buffer.from(t, 'base64'));
  return Buffer.concat([dc.update(Buffer.from(d, 'base64')), dc.final()]).toString('utf8');
}

// --- OAuth ---
function authUrl(state) {
  const p = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', state: state || '',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed');
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function accessTokenFromRefresh(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId(), client_secret: clientSecret(), grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed');
  return data.access_token;
}

// Fetch the connected user's email address with a fresh access token.
async function fetchProfileEmail(accessToken) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  return data.emailAddress || null;
}

// --- connection storage ---
const getConn = () => getById('gmail_connection', DOC).catch(() => null);

async function saveConnection({ refresh_token, email, connected_by }) {
  const payload = { refresh_token_enc: enc(refresh_token), email: email || null, connected_by: connected_by || null, connected_at: new Date().toISOString(), last_check: null };
  const existing = await getConn();
  if (existing) await update('gmail_connection', DOC, payload); else await create('gmail_connection', DOC, payload);
  return payload;
}
async function disconnect() { await remove('gmail_connection', DOC).catch(() => {}); }

async function getAccessToken() {
  const conn = await getConn();
  if (!conn) throw new Error('Gmail is not connected');
  return accessTokenFromRefresh(dec(conn.refresh_token_enc));
}

// --- Gmail API ---
async function listMessages(accessToken, q, max = 25) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gmail list failed');
  return data.messages || [];
}
async function getMessage(accessToken, id) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gmail get failed');
  return data;
}
async function getAttachment(accessToken, msgId, attId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gmail attachment failed');
  // Gmail returns base64url — normalize to standard base64.
  return (data.data || '').replace(/-/g, '+').replace(/_/g, '/');
}

// Pull sender + subject from message headers; find PDF attachment parts.
function parseHeadersAndParts(msg) {
  const headers = Object.fromEntries((msg.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
  const fromRaw = headers.from || '';
  const m = fromRaw.match(/<([^>]+)>/);
  const fromEmail = (m ? m[1] : fromRaw).trim().toLowerCase();
  const pdfs = [];
  const walk = (part) => {
    if (!part) return;
    const fn = part.filename || '';
    const mt = part.mimeType || '';
    if (part.body?.attachmentId && (mt === 'application/pdf' || /\.pdf$/i.test(fn))) {
      pdfs.push({ attachmentId: part.body.attachmentId, filename: fn || 'invoice.pdf' });
    }
    (part.parts || []).forEach(walk);
  };
  walk(msg.payload);
  return { fromEmail, subject: headers.subject || '', date: headers.date || null, pdfs };
}

module.exports = {
  configured, authUrl, exchangeCode, fetchProfileEmail, getAccessToken,
  saveConnection, getConn, disconnect,
  listMessages, getMessage, getAttachment, parseHeadersAndParts,
};
