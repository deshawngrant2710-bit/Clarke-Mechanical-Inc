// Lightweight, dependency-free rate limiting for auth endpoints.
//
// Two tools:
//   1) failureGuard — for LOGIN. Only failed attempts count; a correct login
//      clears the counter immediately, so legitimate users are never locked out
//      by their own success. Tracks per (ip+email) and per ip, so an attacker
//      can neither hammer one account nor spray many accounts from one IP.
//   2) requestLimiter(opts) — a plain middleware that caps how many times an IP
//      may hit an endpoint in a window (used for forgot-password, etc.).
//
// State is in-memory. Clarke's API runs as a single Render instance, so this is
// sufficient; if it is ever scaled out, swap the Map for a shared store (Redis).

function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

// Generic sliding-window counter keyed by a string.
function makeCounter() {
  const hits = new Map(); // key -> [timestamps]
  // Periodic cleanup so the map can't grow forever.
  const CLEfrequency = 10 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const kept = arr.filter(t => now - t < 60 * 60 * 1000); // keep last hour
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, CLEfrequency).unref?.();
  return {
    countWithin(key, windowMs) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
      hits.set(key, arr);
      return arr.length;
    },
    add(key) {
      const arr = hits.get(key) || [];
      arr.push(Date.now());
      hits.set(key, arr);
    },
    oldestWithin(key, windowMs) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
      return arr.length ? arr[0] : null;
    },
    clear(key) { hits.delete(key); },
  };
}

/**
 * Failure guard for login.
 * @param {object} opts
 *   windowMs      - rolling window (default 15 min)
 *   perAccountMax - failed attempts allowed per ip+email (default 8)
 *   perIpMax      - failed attempts allowed per ip across all emails (default 30)
 */
function createFailureGuard(opts = {}) {
  const windowMs = opts.windowMs || 15 * 60 * 1000;
  const perAccountMax = opts.perAccountMax || 8;
  const perIpMax = opts.perIpMax || 30;
  const c = makeCounter();
  const accKey = (ip, id) => `acc:${ip}:${id}`;
  const ipKey = (ip) => `ip:${ip}`;

  function retryAfter(key, max) {
    const oldest = c.oldestWithin(key, windowMs);
    if (oldest == null) return 0;
    return Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
  }

  return {
    // Returns { blocked, retryAfterSec } — call before checking the password.
    check(req, identifier) {
      const ip = clientIp(req);
      const id = String(identifier || '').toLowerCase();
      const a = c.countWithin(accKey(ip, id), windowMs);
      const i = c.countWithin(ipKey(ip), windowMs);
      if (a >= perAccountMax) return { blocked: true, retryAfterSec: retryAfter(accKey(ip, id), perAccountMax) };
      if (i >= perIpMax) return { blocked: true, retryAfterSec: retryAfter(ipKey(ip), perIpMax) };
      return { blocked: false, retryAfterSec: 0 };
    },
    // Record a failed attempt.
    fail(req, identifier) {
      const ip = clientIp(req);
      const id = String(identifier || '').toLowerCase();
      c.add(accKey(ip, id));
      c.add(ipKey(ip));
    },
    // Clear on success (per account only — leave the ip counter to decay).
    clear(req, identifier) {
      const ip = clientIp(req);
      const id = String(identifier || '').toLowerCase();
      c.clear(accKey(ip, id));
    },
  };
}

/**
 * Plain request limiter middleware (counts every request, success or not).
 * @param {object} opts  windowMs (default 15 min), max (default 10), message
 */
function requestLimiter(opts = {}) {
  const windowMs = opts.windowMs || 15 * 60 * 1000;
  const max = opts.max || 10;
  const message = opts.message || 'Too many requests. Please try again later.';
  const keyPrefix = opts.keyPrefix || 'req';
  const c = makeCounter();
  return (req, res, next) => {
    const key = `${keyPrefix}:${clientIp(req)}`;
    const n = c.countWithin(key, windowMs);
    if (n >= max) {
      const oldest = c.oldestWithin(key, windowMs) || Date.now();
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message, retryAfter: retryAfterSec });
    }
    c.add(key);
    next();
  };
}

module.exports = { createFailureGuard, requestLimiter, clientIp };
