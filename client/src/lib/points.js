// Mirror of functions/lib/points.js — point types, values and labels used by the
// Points page. Keep in sync with the server.
export const POINT_TYPES = {
  completed_call:        { points: 1,  label: 'Completed Call',        desc: 'Spoke with a resident or business representative.' },
  qualified_lead:        { points: 5,  label: 'Qualified Lead',        desc: 'Interested — agreed to more info, an estimate, or a follow-up.' },
  scheduled_appointment: { points: 10, label: 'Scheduled Appointment', desc: 'Booked an estimate, consultation, or site visit.' },
  new_customer:          { points: 20, label: 'New Customer Secured',  desc: 'Customer agreed to use our services.' },
  job_closed:            { points: 30, label: 'Job Successfully Closed', desc: "Customer's job was completed." },
  large_contract:        { points: 50, label: 'Large Project / Commercial Contract', desc: 'Secured a major install or commercial contract.' },
};

// Types an agent can log by hand. New-customer and job-closed are auto-awarded
// by the system (on conversion / job completion), so they're not self-logged.
export const MANUAL_TYPES = ['completed_call', 'qualified_lead', 'scheduled_appointment', 'large_contract'];

export const labelFor = (t) => POINT_TYPES[t]?.label || t;
export const pointsFor = (t) => POINT_TYPES[t]?.points || 0;
