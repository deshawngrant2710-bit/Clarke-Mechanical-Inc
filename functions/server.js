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

  // Clarke Mechanical Bot — automatic health sweep. The call self-gates to once
  // every ~2 days, so checking every 6 hours just means it fires on schedule
  // even if the process restarts in between. Alerts admins on any failure.
  const { runScheduledSweep } = require('./lib/diagnostics');
  const sweepTick = () => runScheduledSweep().then(s => console.log('[health-sweep]', s)).catch(e => console.error('[health-sweep]', e.message));
  setTimeout(sweepTick, 90_000);
  setInterval(sweepTick, 6 * 60 * 60 * 1000);
});
