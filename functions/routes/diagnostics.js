// Clarke Mechanical Bot — admin API.
// Run a health sweep on demand, and read the latest report + history.
const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getById } = require('../lib/db');
const { runAndStore, latestReport, history, buildLog, logFilename } = require('../lib/diagnostics');

const router = express.Router();

// ---------------------------------------------------------------------------
// Browser-check endpoints (used by the GitHub Actions job every 2 hours).
// Guarded by a shared secret in the x-bot-key header — NOT a user login. Invisible
// (404) until BOT_KEY (or CRON_KEY) is set on the server.
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const { create, list, remove } = require('../lib/db');
function botKeyGuard(req, res, next) {
  const key = process.env.BOT_KEY || process.env.CRON_KEY;
  if (!key) return res.status(404).json({ error: 'Not found' });
  const a = Buffer.from(String(req.headers['x-bot-key'] || ''));
  const b = Buffer.from(key);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
const W = () => require('../lib/botWorld');
const UI_MAX_REPORTS = 168;   // 2 weeks, matching the sweep logs
const clip = (v, n) => String(v ?? '').slice(0, n);

// POST /api/diagnostics/ui/begin — build the bot's test world and hand out short-lived
// bot logins (one per role) for the browser to use. They can only see bot data and
// stop working at /ui/end (or when the next cleanup runs).
router.post('/ui/begin', botKeyGuard, async (req, res) => {
  try {
    const w = W();
    if (w.worldBusy()) return res.status(409).json({ error: 'The test world is in use — try again shortly', code: 'BUSY' });
    w.holdWorld(20 * 60 * 1000);
    await w.setupWorld({ seedDocs: true });
    const sessions = {};
    for (const role of w.ROLES) {
      sessions[role] = {
        token: w.tokenFor(role, '30m'),
        user: { id: w.BOT[role], role, name: `Clarke Bot (${role})`, email: null, ...(role === 'customer' ? { customer_id: w.BOT_CUSTOMER } : {}) },
      };
    }
    res.json({
      ok: true, sessions,
      ids: { customer: w.BOT_CUSTOMER, invoiceSent: w.ID('inv-sent'), invoicePaid: w.ID('inv-paid'), invoiceDraft: w.ID('inv-draft'), quote: w.ID('quote'), jobToday: w.ID('job-today'), jobDone: w.ID('job-done') },
      site: (process.env.APP_URL || 'https://clarkemechanicalinc.org').replace(/\/+$/, ''),
    });
  } catch (e) {
    try { await W().teardownWorld(); } catch { /* ignore */ }
    W().releaseWorld();
    console.error('[diagnostics] ui/begin failed:', e.message);
    res.status(500).json({ error: 'Could not set up the test world', detail: e.message });
  }
});

// POST /api/diagnostics/ui/report — store the browser results; the next sweep folds them in.
router.post('/ui/report', botKeyGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 500).map(i => ({
      status: ['pass', 'warn', 'fail'].includes(i.status) ? i.status : 'warn',
      portal: clip(i.portal, 40), viewport: clip(i.viewport, 20), page: clip(i.page, 80),
      check: clip(i.check, 120), detail: clip(i.detail, 400),
    }));
    const s = b.summary || {};
    const summary = {
      pages: Number(s.pages) || 0, viewports: Number(s.viewports) || 0, buttons: Number(s.buttons) || 0,
      failures: items.filter(i => i.status === 'fail').length, warnings: items.filter(i => i.status === 'warn').length,
      durationMs: Number(s.durationMs) || 0,
    };
    const id = crypto.randomUUID();
    await create('diagnostic_ui_reports', id, { at: new Date().toISOString(), summary, items, run_url: clip(b.run_url, 300) });
    const all = (await list('diagnostic_ui_reports')).sort((a, c) => (c.at || '').localeCompare(a.at || ''));
    for (const r of all.slice(UI_MAX_REPORTS)) { try { await remove('diagnostic_ui_reports', r.id); } catch { /* ignore */ } }
    res.json({ ok: true, id, summary });
  } catch (e) {
    console.error('[diagnostics] ui/report failed:', e.message);
    res.status(500).json({ error: 'Could not save the browser report' });
  }
});

// POST /api/diagnostics/ui/end — delete the bot's test world (its logins die with it).
router.post('/ui/end', botKeyGuard, async (req, res) => {
  try {
    const w = W();
    const removed = await w.teardownWorld();
    const left = await w.leftoversCount();
    w.releaseWorld();
    res.json({ ok: left === 0, removed, left });
  } catch (e) {
    W().releaseWorld();
    res.status(500).json({ error: 'Cleanup failed', detail: e.message });
  }
});

// Everything below is the admin's System Check page.
router.use(authMiddleware, requireRole('admin'));

// POST /api/diagnostics/run — run a full sweep now and return the report.
router.post('/run', async (req, res) => {
  try {
    const report = await runAndStore({ trigger: 'manual' });
    res.json(report);
  } catch (e) {
    if (e.code === 'BUSY') return res.status(409).json({ error: e.message, code: 'BUSY' });
    console.error('[diagnostics] run failed:', e.message);
    res.status(500).json({ error: 'The sweep could not finish', detail: e.message });
  }
});

// GET /api/diagnostics/latest — the most recent report (full detail).
router.get('/latest', async (req, res) => {
  try { res.json(await latestReport()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/diagnostics/history — lightweight list of recent runs.
router.get('/history', async (req, res) => {
  try { res.json(await history(Number(req.query.limit) || 20)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/diagnostics/report/:id — one full report by id.
router.get('/report/:id', async (req, res) => {
  try {
    const r = await getById('diagnostic_reports', req.params.id);
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/diagnostics/report/:id/log — download one sweep as a text log file.
router.get('/report/:id/log', async (req, res) => {
  try {
    const r = await getById('diagnostic_reports', req.params.id);
    if (!r) return res.status(404).json({ error: 'Report not found' });
    const text = await buildLog(r);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${logFilename(r)}"`);
    res.send(text);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/diagnostics/logs?days=14&status=fail|warn|pass — every stored sweep in one file.
router.get('/logs', async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 31);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const want = ['fail', 'warn', 'pass'].includes(req.query.status) ? req.query.status : null;
    const all = (await list('diagnostic_reports'))
      .filter(r => (r.at || '') >= since && (!want || r.status === want))
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    const head = [
      'CLARKE MECHANICAL BOT — ALL HEALTH CHECK LOGS',
      `${all.length} run(s) from the last ${days} day(s)${want ? ` (${want === 'fail' ? 'failed only' : want === 'warn' ? 'warnings only' : 'all-good only'})` : ''}, newest first`,
      `Failed: ${all.filter(r => r.status === 'fail').length} · Warnings: ${all.filter(r => r.status === 'warn').length} · All good: ${all.filter(r => r.status === 'pass').length}`,
      '',
      ...all.map(r => `  ${r.status === 'fail' ? 'FAIL' : r.status === 'warn' ? 'WARN' : 'PASS'}  ${new Date(r.at).toLocaleString('en-US', { timeZone: 'America/New_York' })}  ${r.summary?.passed || 0}/${r.summary?.total || 0} passed${r.summary?.failed ? `, ${r.summary.failed} failed` : ''}`),
      '', '',
    ].join('\n');
    const bodies = [];
    for (const r of all) bodies.push(await buildLog(r));
    const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD, New York
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="clarke-health-logs-${stamp}${want ? `-${want}` : ''}.txt"`);
    res.send(head + bodies.join('\n\n' + '#'.repeat(70) + '\n\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
