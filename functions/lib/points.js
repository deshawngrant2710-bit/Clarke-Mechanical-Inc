// Leads-caller points: motivate outbound calling + lead generation. Each activity
// is worth a fixed number of points; points can later be converted to pay at an
// admin-set rate (settings key `points_dollar_value`). ── keep POINT_TYPES in
// sync with client/src/lib/points.js ──
const { v4: uuid } = require('uuid');
const { db, create, findWhere } = require('./db');

const POINT_TYPES = {
  completed_call:        { points: 1,  label: 'Completed Call',        desc: 'Spoke with a resident or business representative.' },
  qualified_lead:        { points: 5,  label: 'Qualified Lead',        desc: 'Customer is interested and agrees to more info, an estimate, or a follow-up.' },
  scheduled_appointment: { points: 10, label: 'Scheduled Appointment', desc: 'Booked an estimate, consultation, or site visit.' },
  new_customer:          { points: 20, label: 'New Customer Secured',  desc: 'Customer agrees to use our services.' },
  job_closed:            { points: 30, label: 'Job Successfully Closed', desc: "Customer's job was completed." },
  large_contract:        { points: 50, label: 'Large Project / Commercial Contract', desc: 'Secured a major residential install or commercial contract.' },
};

const pointsFor = (type) => (POINT_TYPES[type] ? POINT_TYPES[type].points : 0);

/**
 * Record a points event. Returns the created event, or null if a deduped
 * auto-event already exists for the same (agent, type, relatedId).
 */
async function awardPoints({ agentId, agentName = null, type, customerId = null, customerName = null, note = null, source = 'manual', relatedId = null, createdBy = null, pointsOverride = null }) {
  if (!POINT_TYPES[type]) throw new Error(`Unknown point type: ${type}`);
  if (!agentId) return null; // nobody to credit

  // Dedupe automatic awards so the same conversion/job can't double-count.
  if (source === 'auto' && relatedId) {
    const existing = await findWhere('point_events', 'related_id', relatedId);
    if (existing.some(e => e.type === type && e.agent_id === agentId)) return null;
  }

  const points = pointsOverride != null ? Number(pointsOverride) : pointsFor(type);
  return create('point_events', uuid(), {
    agent_id: agentId,
    agent_name: agentName,
    type,
    points,
    customer_id: customerId,
    customer_name: customerName,
    note: note ? String(note).slice(0, 500) : null,
    source,                       // 'manual' | 'auto'
    related_id: relatedId,        // lead/job id for dedupe + traceability
    created_by: createdBy,
    created_at: new Date().toISOString(),
  });
}

module.exports = { POINT_TYPES, pointsFor, awardPoints };
