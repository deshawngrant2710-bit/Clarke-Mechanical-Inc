// Clarke Mechanical Bot — admin API.
// Run a health sweep on demand, and read the latest report + history.
const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getById } = require('../lib/db');
const { runAndStore, latestReport, history } = require('../lib/diagnostics');

const router = express.Router();
router.use(authMiddleware, requireRole('admin'));

// POST /api/diagnostics/run — run a full sweep now and return the report.
router.post('/run', async (req, res) => {
  try {
    const report = await runAndStore({ trigger: 'manual' });
    res.json(report);
  } catch (e) {
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

module.exports = router;
