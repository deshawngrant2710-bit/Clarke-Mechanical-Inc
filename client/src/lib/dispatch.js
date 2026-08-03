// ---------------------------------------------------------------------------
//  Dispatch scheduling + travel-time logic (no UI, no live GPS).
//
//  Travel time is ESTIMATED from job coordinates. The estimateTravelMinutes()
//  function is the single swap point: to add Apple MapKit / Google Distance
//  Matrix / live-GPS ETA later, replace only that function — callers and the UI
//  stay the same.
// ---------------------------------------------------------------------------

export const DISPATCH_DEFAULTS = {
  jobDurationMin: 90,        // assumed length of a job when none is set
  workStartMin: 8 * 60,      // 8:00 AM
  workEndMin: 17 * 60,       // 5:00 PM
  lunch: { start: 12 * 60, end: 12 * 60 + 30 }, // 12:00–12:30
  timeOff: [],               // future: [{ techId, startMin, endMin }]
  avgMph: 28,                // average drive speed for the estimate
  minTravelMin: 3,           // never estimate less than this between two stops
};

// --- time helpers ---
export function hmToMin(hhmm) {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]);
}

export function minToLabel(min) {
  if (min == null) return '';
  const t = ((min % 1440) + 1440) % 1440;
  let h = Math.floor(t / 60);
  const mm = t % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
}

// --- distance / travel estimate (SWAP POINT for real routing later) ---
export function haversineMiles(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.8, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateTravelMinutes(from, to, opts = DISPATCH_DEFAULTS) {
  const miles = haversineMiles(from, to);
  if (miles == null) return null; // unknown (missing coordinates)
  return Math.max(opts.minTravelMin, Math.round((miles / opts.avgMph) * 60));
}

const loc = j => (j && j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null);

// Build one technician's day: order their jobs by time, walk the timeline adding
// job duration + travel + lunch, and flag conflicts (overlaps / not enough travel).
export function computeTechDay(techId, dayJobs, opts = DISPATCH_DEFAULTS) {
  const jobs = dayJobs
    .filter(j => j.technician_id === techId && j.status !== 'cancelled')
    .slice()
    .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99'));

  const stops = [];
  const conflicts = [];
  let cursor = null;     // end-of-previous-job (minutes)
  let prevLoc = null;

  for (const j of jobs) {
    const dur = j.est_duration_min || opts.jobDurationMin;
    const here = loc(j);
    const travel = estimateTravelMinutes(prevLoc, here, opts); // null if unknown
    const sched = hmToMin(j.scheduled_time);

    let start;
    if (cursor == null) {
      start = sched != null ? sched : opts.workStartMin;
    } else {
      const earliest = cursor + (travel || 0);
      start = sched != null ? Math.max(sched, earliest) : earliest;
      if (sched != null && sched + 1 < earliest) {
        conflicts.push({ jobId: j.id, reason: 'Not enough travel time from the previous job' });
      }
    }

    // Nudge past lunch if the job would start inside the lunch window.
    let end = start + dur;
    if (start >= opts.lunch.start && start < opts.lunch.end) {
      start = opts.lunch.end;
      end = start + dur;
    }

    stops.push({ job: j, startMin: start, endMin: end, travelFromPrev: travel });
    cursor = end;
    prevLoc = here;
  }

  // explicit double-booking (scheduled times overlap)
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].startMin < stops[i - 1].endMin - 1) {
      conflicts.push({ jobId: stops[i].job.id, reason: 'Overlaps another job' });
    }
  }

  const lastEnd = stops.length ? stops[stops.length - 1].endMin : null;
  return { techId, stops, conflicts, nextAvailableMin: lastEnd, hasJobs: stops.length > 0 };
}

// 🟢 / 🟡 / 🔴 status for a technician's computed day.
export function techStatus(techDay, nowMin) {
  if (!techDay) return { code: 'available', label: 'Available', dot: '🟢' };
  if (techDay.conflicts.length) return { code: 'conflict', label: 'Schedule conflict', dot: '🔴' };
  if (techDay.hasJobs && techDay.nextAvailableMin != null && nowMin < techDay.nextAvailableMin) {
    return { code: 'busy', label: `Busy until ${minToLabel(techDay.nextAvailableMin)}`, dot: '🟡' };
  }
  return { code: 'available', label: 'Available', dot: '🟢' };
}

// Would assigning `job` to `techId` create a conflict? Insert into their day and re-check.
export function assignmentConflict(techId, dayJobs, job, opts = DISPATCH_DEFAULTS) {
  const merged = [...dayJobs.filter(j => j.id !== job.id), { ...job, technician_id: techId }];
  const day = computeTechDay(techId, merged, opts);
  const involved = day.conflicts.find(c => c.jobId === job.id);
  return involved ? { conflict: true, reason: involved.reason } : { conflict: false, reason: '' };
}

// Convenience: travel-from-previous-stop for every job, keyed by job id.
export function travelByJob(dayJobs, techIds, opts = DISPATCH_DEFAULTS) {
  const map = {};
  for (const techId of techIds) {
    const day = computeTechDay(techId, dayJobs, opts);
    for (const s of day.stops) if (s.travelFromPrev != null) map[s.job.id] = s.travelFromPrev;
  }
  return map;
}
