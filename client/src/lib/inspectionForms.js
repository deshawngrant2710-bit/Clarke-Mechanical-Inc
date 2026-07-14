// Inspection form templates — data-driven so they're easy to edit here.
// Two property types (Residential / Commercial). The technician also picks the
// equipment (Boiler or AC), and the checklist sections shown adapt to both.
//
// To customize: edit the labels/items below. `scope` limits a section to certain
// property types and/or equipment; omit a scope key to always show it.

export const PROPERTY_TYPES = [
  { id: 'residential', label: 'Residential' },
  { id: 'commercial', label: 'Commercial' },
];

export const EQUIPMENT_TYPES = [
  { id: 'boiler', label: 'Boiler / Heating' },
  { id: 'ac', label: 'AC / Cooling' },
];

// Free-text info captured at the top of every inspection.
export const INFO_FIELDS = [
  { key: 'site_address', label: 'Site address', placeholder: 'Street, city' },
  { key: 'make', label: 'Equipment make', placeholder: 'e.g. Carrier, Weil-McLain' },
  { key: 'model', label: 'Model #', placeholder: 'Model number' },
  { key: 'serial', label: 'Serial #', placeholder: 'Serial number' },
  { key: 'year', label: 'Age / year installed', placeholder: 'e.g. 2015' },
  { key: 'location', label: 'Equipment location', placeholder: 'e.g. basement, rooftop, closet' },
];

// Each checklist item is answered Pass / Fail / N/A, with an optional note.
export const CHECKLIST_SECTIONS = [
  {
    id: 'general',
    title: 'General & Safety',
    items: [
      { key: 'gen_access', label: 'Unit accessible with adequate clearances' },
      { key: 'gen_thermostat', label: 'Thermostat / controls operate correctly' },
      { key: 'gen_electrical', label: 'Electrical connections secure, no exposed wiring' },
      { key: 'gen_leaks', label: 'No visible water, gas, or refrigerant leaks' },
      { key: 'gen_labeling', label: 'Disconnect / shutoff present and labeled' },
    ],
  },
  {
    id: 'boiler',
    title: 'Boiler / Heating',
    scope: { equipment: ['boiler'] },
    items: [
      { key: 'boil_ignition', label: 'Pilot / ignition lights and holds' },
      { key: 'boil_flue', label: 'Flue / venting clear and in good condition' },
      { key: 'boil_gas', label: 'Gas pressure and connections within spec' },
      { key: 'boil_prv', label: 'Pressure-relief valve operational' },
      { key: 'boil_expansion', label: 'Expansion tank and pressure gauge normal' },
      { key: 'boil_circulator', label: 'Circulator pump(s) operate quietly' },
      { key: 'boil_lwco', label: 'Low-water cutoff functions' },
      { key: 'boil_corrosion', label: 'No significant corrosion, scale, or soot' },
    ],
  },
  {
    id: 'ac',
    title: 'AC / Cooling',
    scope: { equipment: ['ac'] },
    items: [
      { key: 'ac_condenser', label: 'Condenser coil clean and unobstructed' },
      { key: 'ac_evaporator', label: 'Evaporator coil clean' },
      { key: 'ac_refrigerant', label: 'Refrigerant pressures within range' },
      { key: 'ac_compressor', label: 'Compressor starts and runs normally' },
      { key: 'ac_filter', label: 'Air filter clean / replaced' },
      { key: 'ac_drain', label: 'Condensate drain clear, no standing water' },
      { key: 'ac_blower', label: 'Blower / fan operates correctly' },
      { key: 'ac_split', label: 'Supply/return temperature split within range' },
      { key: 'ac_electrical', label: 'Contactor and capacitor within spec' },
    ],
  },
  {
    id: 'commercial_heating',
    title: 'Commercial Heating',
    scope: { property: ['commercial'], equipment: ['boiler'] },
    items: [
      { key: 'ch_gauges', label: 'All gauges read correctly — no leakage' },
      { key: 'ch_oil_pump_motor', label: 'Oil pump motor runs — no unusual noise/heat' },
      { key: 'ch_oil_tank_level', label: 'Oil meter / tank level adequate — oil in the tank' },
      { key: 'ch_oil_pressure', label: 'Oil pump pressure within spec' },
      { key: 'ch_oil_filter', label: 'Oil filter / strainer clean' },
      { key: 'ch_oil_lines', label: 'Oil lines, valves & fittings leak-free' },
      { key: 'ch_burner', label: 'Burner ignites & holds; nozzle and electrodes good' },
      { key: 'ch_combustion', label: 'Combustion / draft checked (stack temp, CO / CO₂)' },
      { key: 'ch_lwco', label: 'Low-water cutoff tested / blown down' },
      { key: 'ch_water_level', label: 'Water level & gauge glass correct (steam)' },
      { key: 'ch_safety_valve', label: 'Pressure-relief / pop safety valve tested' },
      { key: 'ch_op_pressure', label: 'Operating pressure within range (steam / hot water)' },
      { key: 'ch_controls', label: 'Aquastat / operating & limit controls set correctly' },
      { key: 'ch_feed_water', label: 'Make-up feed water / feed pump operates' },
      { key: 'ch_circ_traps', label: 'Circulators / steam traps functioning' },
      { key: 'ch_boiler_leaks', label: 'No leaks at tubes, seams, or manways' },
      { key: 'ch_boiler_room', label: 'Boiler room clear; adequate combustion air & CO detector' },
      { key: 'ch_shutoff', label: 'Emergency shutoff switch present & operational' },
    ],
  },
  {
    id: 'commercial',
    title: 'Commercial Specifics',
    scope: { property: ['commercial'] },
    items: [
      { key: 'com_rtu', label: 'Rooftop unit(s) accessible and secured' },
      { key: 'com_belts', label: 'Belts / bearings in good condition' },
      { key: 'com_economizer', label: 'Economizer / dampers operate correctly' },
      { key: 'com_controls', label: 'Building controls / BMS communicating' },
      { key: 'com_zones', label: 'All zones / units heating & cooling' },
    ],
  },
  {
    id: 'residential',
    title: 'Residential Specifics',
    scope: { property: ['residential'] },
    items: [
      { key: 'res_co', label: 'CO detector present and functional' },
      { key: 'res_ductwork', label: 'Accessible ductwork sealed / insulated' },
      { key: 'res_walkthrough', label: 'Reviewed findings with homeowner' },
    ],
  },
];

// Sections that apply for a given property + equipment selection.
export function sectionsFor(property, equipment) {
  return CHECKLIST_SECTIONS.filter(s => {
    if (s.scope?.property && !s.scope.property.includes(property)) return false;
    if (s.scope?.equipment && !s.scope.equipment.includes(equipment)) return false;
    return true;
  });
}

export const ANSWERS = [
  { id: 'pass', label: 'Pass' },
  { id: 'fail', label: 'Fail' },
  { id: 'na', label: 'N/A' },
];

export const propertyLabel = (id) => PROPERTY_TYPES.find(p => p.id === id)?.label || id;
export const equipmentLabel = (id) => EQUIPMENT_TYPES.find(e => e.id === id)?.label || id;
