// Automatic time clock — the job runs the clock, so nobody has to remember to.
//
//   • Job is STARTED (status → in-progress)   → everyone assigned to it is clocked in
//   • Job is COMPLETED (or cancelled)          → everyone on it is clocked out
//
// One shift per person at a time: starting a new job closes whatever that person
// still had open on another job (they can't be in two places). The photo taken at
// "Mark work done" becomes the proof on the time entry (stored once, on the job).
// Shifts that end up longer than 16 hours are flagged for a manager to review.
const { v4: uuid } = require('uuid');
const { getById, findWhere, create, update } = require('./db');

const REVIEW_HOURS = 16;
const round2 = (n) => Math.round(n * 100) / 100;

// When an action was done offline and uploaded later, the app sends the moment it
// really happened (X-Queued-At). Use it so hours are right — but only if it's sane:
// not in the future, and no more than 60 days old.
function happenedAt(req) {
  const h = req?.headers?.['x-queued-at'];
  if (h) {
    const t = new Date(String(h)).getTime(), now = Date.now();
    if (Number.isFinite(t) && t <= now + 120000 && t >= now - 60 * 86400000) return new Date(Math.min(t, now)).toISOString();
  }
  return new Date().toISOString();
}

function cleanLoc(loc) {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  return { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy || null };
}
const closeOpenBreaks = (breaks, at) => (breaks || []).map(b => (b.end ? b : { ...b, end: at }));
const breakMinutes = (breaks) => (breaks || []).reduce((m, b) => (b.start && b.end ? m + (new Date(b.end) - new Date(b.start)) / 60000 : m), 0);

async function openEntries(userId) {
  return (await findWhere('time_entries', 'technician_id', userId)).filter(e => !e.clock_out);
}

// The newest photo on a job (prefers the "Completed work" one) — used as clock-out proof.
async function proofPhotoFor(jobId) {
  try {
    const photos = (await findWhere('job_photos', 'job_id', jobId)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const p = photos.find(x => /completed work/i.test(x.caption || '')) || photos[0];
    return p ? { proof_photo_id: p.id, proof_type: p.proof_type || 'image' } : {};
  } catch { return {}; }
}

// Close one open entry at `at`, computing hours. `why` records what closed it.
async function closeEntry(e, at, why, extra = {}) {
  let out = at;
  if (new Date(out) <= new Date(e.clock_in)) out = new Date(new Date(e.clock_in).getTime() + 1000).toISOString();
  const breaks = closeOpenBreaks(e.breaks, out);
  const gross = (new Date(out) - new Date(e.clock_in)) / 3600000;
  const brkMin = breakMinutes(breaks);
  const patch = {
    clock_out: out, breaks, break_minutes: Math.round(brkMin),
    gross_hours: round2(gross), hours: round2(Math.max(0, gross - brkMin / 60)),
    auto_clock_out: true, clock_out_reason: why, ...extra,
  };
  if (!e.proof && !patch.proof_photo_id && e.job_id) Object.assign(patch, await proofPhotoFor(e.job_id));
  if (gross > REVIEW_HOURS) { patch.needs_review = true; patch.review_reason = `Shift ran ${Math.round(gross)} hours — please check the times`; }
  return update('time_entries', e.id, patch);
}

// Who goes on the clock when a job starts: everyone assigned to it, plus whoever
// pressed Start if they're field staff working it themselves.
async function crewFor(job, actor) {
  const ids = new Set([job.technician_id, ...(Array.isArray(job.additional_technician_ids) ? job.additional_technician_ids : [])].filter(Boolean));
  if (actor?.id && actor.role !== 'customer' && (actor.role === 'technician' || ids.size === 0)) ids.add(actor.id);
  const crew = [];
  for (const id of ids) {
    if (actor && id === actor.id) { crew.push({ id, name: actor.name || 'Staff' }); continue; }
    const u = await getById('users', id);
    if (u) crew.push({ id, name: u.name || u.email || 'Staff' });
  }
  return crew;
}

async function clockInCrew(job, actor, at, location) {
  const started = [];
  for (const person of await crewFor(job, actor)) {
    const open = await openEntries(person.id);
    if (open.some(e => e.job_id === job.id)) continue;              // already on this job's clock
    for (const e of open) await closeEntry(e, at, 'Started another job');
    const entry = await create('time_entries', uuid(), {
      technician_id: person.id, technician_name: person.name,
      job_id: job.id, job_title: job.title || null,
      clock_in: at, clock_in_location: actor && person.id === actor.id ? cleanLoc(location) : null,
      clock_out: null, clock_out_location: null, proof: null, proof_type: null, hours: null,
      breaks: [], break_minutes: 0, approved: false, auto_clock_in: true,
    });
    started.push(entry.id);
  }
  return started;
}

async function clockOutJob(job, at, why) {
  const open = (await findWhere('time_entries', 'job_id', job.id)).filter(e => !e.clock_out);
  const proof = open.length ? await proofPhotoFor(job.id) : {};
  for (const e of open) await closeEntry(e, at, why, proof);
  return open.length;
}

// Call after ANY change to a job's status. Never throws — the job update must not
// fail because of the time clock.
async function onJobStatus(job, prevStatus, { actor = null, req = null, location = null } = {}) {
  try {
    if (!job || job.status === prevStatus) return;
    const at = happenedAt(req);
    if (job.status === 'in-progress') await clockInCrew(job, actor, at, location);
    else if (job.status === 'completed') await clockOutJob(job, at, 'Job completed');
    else if (job.status === 'cancelled') await clockOutJob(job, at, 'Job cancelled');
  } catch (e) { console.error('[jobClock]', e.message); }
}

module.exports = { onJobStatus, happenedAt, closeEntry, proofPhotoFor, REVIEW_HOURS };
