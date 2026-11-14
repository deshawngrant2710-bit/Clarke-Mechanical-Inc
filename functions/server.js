// Standalone server entry for Render (persistent Node process).
// Firestore is accessed via the Admin SDK using FIREBASE_SERVICE_ACCOUNT.
const app = require('./app');

const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log(`Clarke Mechanical API (Render) listening on ${PORT}`);

  // First boot on an empty database: create the admin login + demo data.
  try {
    const { seedIfEmpty } = require('./lib/seed');
    const r = await seedIfEmpty();
    if (r.seeded) console.log('[seed] Firestore seeded (admin + demo data)');
  } catch (e) { console.error('[seed]', e.message); }

  // Automated reminders: run shortly after boot, then hourly. Dedup keeps each item to one send/day.
  const { runReminders } = require('./lib/scheduler');
  const tick = () => runReminders().then(s => console.log('[reminders]', s)).catch(e => console.error('[reminders]', e.message));
  setTimeout(tick, 15_000);
  setInterval(tick, 60 * 60 * 1000);

  // Clarke Mechanical Bot — health sweep every 2 hours. GitHub Actions is the main
  // trigger (it also wakes this free-tier server); this timer is a backup while the
  // server is awake. The call self-gates, so checking every 15 minutes never doubles up.
  const { runScheduledSweep } = require('./lib/diagnostics');
  const sweepTick = () => runScheduledSweep().then(s => console.log('[health-sweep]', s)).catch(e => console.error('[health-sweep]', e.message));
  setTimeout(sweepTick, 5 * 60_000);
  setInterval(sweepTick, 15 * 60_000);
});
