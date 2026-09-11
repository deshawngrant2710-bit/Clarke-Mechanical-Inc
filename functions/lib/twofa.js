// Two-factor helpers — implemented with Node's built-in crypto only (no new deps).
//
// Supports three delivery methods:
//   • 'email' / 'sms' — a random 6-digit code we generate, hash, and send.
//   • 'totp'          — RFC 6238 time-based codes from an authenticator app
//                       (Google Authenticator, Authy, 1Password, etc.).
//
// Nothing here touches the database; routes/auth.js stores state.

const crypto = require('crypto');

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// A fresh base32 TOTP secret (default 20 random bytes → 32 base32 chars).
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

// HMAC-based one-time password for a given counter.
function hotp(secretBuf, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  // Write the counter as a 64-bit big-endian integer.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// Current TOTP for a base32 secret.
function totp(secret, { step = 30, digits = 6, t = Date.now() } = {}) {
  return hotp(base32Decode(secret), Math.floor(t / 1000 / step), digits);
}

// Verify a token, allowing ±`window` steps for clock drift.
function verifyTOTP(secret, token, { step = 30, digits = 6, window = 1, t = Date.now() } = {}) {
  const clean = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const buf = base32Decode(secret);
  const counter = Math.floor(t / 1000 / step);
  for (let i = -window; i <= window; i++) {
    // Constant-time compare against each candidate.
    const cand = hotp(buf, counter + i, digits);
    if (cand.length === clean.length && crypto.timingSafeEqual(Buffer.from(cand), Buffer.from(clean))) return true;
  }
  return false;
}

// otpauth:// URL an authenticator app scans (or you enter the secret manually).
function otpauthURL({ secret, label, issuer }) {
  const l = encodeURIComponent(label || 'account');
  const iss = encodeURIComponent(issuer || 'Clarke Mechanical');
  return `otpauth://totp/${iss}:${l}?secret=${secret}&issuer=${iss}&digits=6&period=30`;
}

// A random numeric code for email / SMS delivery.
function generateCode(digits = 6) {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, '0');
}

// SHA-256 hash (hex) — used to store codes / backup codes without keeping plaintext.
function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// One-time recovery codes shown once at setup; stored hashed.
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // e.g. "3f9a-1c2e" — easy to read/type, from random bytes.
    const hex = crypto.randomBytes(4).toString('hex');
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
  }
  return codes;
}

module.exports = {
  generateSecret, totp, verifyTOTP, otpauthURL,
  generateCode, hashCode, generateBackupCodes,
  base32Encode, base32Decode,
};
