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
  { id: 'ac', label: 'Air Conditioner' },
  { id: 'heat_pump', label: 'Heat Pump' },
  { id: 'furnace', label: 'Furnace' },
  { id: 'boiler', label: 'Boiler' },
  { id: 'mini_split', label: 'Mini-Split' },
  { id: 'pm', label: 'Preventive Maintenance' },
  { id: 'install_startup', label: 'Installation Startup' },
  { id: 'refrigeration', label: 'Refrigeration' },
  { id: 'water_heater', label: 'Water Heater' },
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

// Work-order fields (stored inside `info`) — filled in as the tech does the job.
export const WORKORDER_FIELDS = [
  { key: 'wo_complaint', label: 'Problem reported / complaint', placeholder: 'What the customer reported', rows: 2 },
  { key: 'wo_work', label: 'Work performed', placeholder: 'What you did on site', rows: 3 },
  { key: 'wo_readings', label: 'Readings / measurements', placeholder: 'AC: suction/head pressure, supply/return temps · Boiler: pressure, stack temp, CO / CO₂', rows: 2 },
  { key: 'wo_labor', label: 'Labor / time on site', placeholder: 'e.g. 2.5 hrs', rows: 1 },
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
    id: 'heat_pump',
    title: 'Heat Pump',
    scope: { equipment: ['heat_pump'] },
    items: [
      { key: 'hp_reversing', label: 'Reversing valve shifts (heat ↔ cool)' },
      { key: 'hp_defrost', label: 'Defrost cycle initiates and terminates correctly' },
      { key: 'hp_auxheat', label: 'Auxiliary / emergency heat energizes' },
      { key: 'hp_bothmodes', label: 'Adequate output in both heating and cooling' },
      { key: 'hp_coils', label: 'Indoor & outdoor coils clean' },
      { key: 'hp_refrigerant', label: 'Refrigerant charge within spec' },
      { key: 'hp_defrostboard', label: 'Defrost board / sensors functional' },
      { key: 'hp_drain', label: 'Condensate drain clear' },
    ],
  },
  {
    id: 'furnace',
    title: 'Furnace',
    scope: { equipment: ['furnace'] },
    items: [
      { key: 'fur_ignition', label: 'Ignitor / pilot lights and flame is stable' },
      { key: 'fur_heatex', label: 'Heat exchanger inspected — no cracks' },
      { key: 'fur_gas', label: 'Gas / manifold pressure within spec' },
      { key: 'fur_flue', label: 'Flue / venting clear and sealed' },
      { key: 'fur_blower', label: 'Blower motor and wheel clean, runs quiet' },
      { key: 'fur_filter', label: 'Air filter clean / replaced' },
      { key: 'fur_limit', label: 'Limit & rollout switches functional' },
      { key: 'fur_temprise', label: 'Temperature rise within nameplate range' },
      { key: 'fur_co', label: 'CO test passed — no leakage' },
    ],
  },
  {
    id: 'mini_split',
    title: 'Mini-Split',
    scope: { equipment: ['mini_split'] },
    items: [
      { key: 'ms_indoor', label: 'Indoor head(s) clean, blower runs quiet' },
      { key: 'ms_outdoor', label: 'Outdoor unit clean and secure' },
      { key: 'ms_lineset', label: 'Line set insulated, no kinks or leaks' },
      { key: 'ms_condensate', label: 'Condensate pump / line drains properly' },
      { key: 'ms_filters', label: 'Filters cleaned / washed' },
      { key: 'ms_remote', label: 'Remote / controls operate all modes' },
      { key: 'ms_refrigerant', label: 'Refrigerant charge within spec' },
    ],
  },
  {
    id: 'refrigeration',
    title: 'Refrigeration',
    scope: { equipment: ['refrigeration'] },
    items: [
      { key: 'ref_boxtemp', label: 'Box / case holding target temperature' },
      { key: 'ref_compressor', label: 'Compressor runs normally, no short-cycling' },
      { key: 'ref_condenser', label: 'Condenser coil clean, fans operate' },
      { key: 'ref_evaporator', label: 'Evaporator coil clean, no ice build-up' },
      { key: 'ref_defrost', label: 'Defrost cycle / heaters function' },
      { key: 'ref_doorseals', label: 'Door gaskets / seals intact' },
      { key: 'ref_refrigerant', label: 'Refrigerant charge within spec' },
      { key: 'ref_controls', label: 'Temperature controls / alarms set correctly' },
    ],
  },
  {
    id: 'water_heater',
    title: 'Water Heater',
    scope: { equipment: ['water_heater'] },
    items: [
      { key: 'wh_tpr', label: 'T&P relief valve tested and operational' },
      { key: 'wh_temp', label: 'Temperature setting safe (≈120°F)' },
      { key: 'wh_anode', label: 'Anode rod checked' },
      { key: 'wh_element', label: 'Burner / heating elements operate' },
      { key: 'wh_flue', label: 'Flue / venting clear (gas units)' },
      { key: 'wh_leaks', label: 'No leaks at tank, valves, or connections' },
      { key: 'wh_expansion', label: 'Expansion tank charged (if present)' },
      { key: 'wh_flush', label: 'Tank flushed / sediment drained' },
    ],
  },
  {
    id: 'pm',
    title: 'Preventive Maintenance',
    scope: { equipment: ['pm'] },
    items: [
      { key: 'pm_filter', label: 'Filter inspected / replaced' },
      { key: 'pm_coils', label: 'Coils cleaned as needed' },
      { key: 'pm_drain', label: 'Condensate drain cleared and treated' },
      { key: 'pm_electrical', label: 'Electrical connections tight; amps within spec' },
      { key: 'pm_refrigerant', label: 'Refrigerant charge verified' },
      { key: 'pm_belts', label: 'Belts / bearings inspected, lubricated' },
      { key: 'pm_thermostat', label: 'Thermostat calibrated and cycling correctly' },
      { key: 'pm_overall', label: 'Overall operation verified in all modes' },
    ],
  },
  {
    id: 'install_startup',
    title: 'Installation Startup',
    scope: { equipment: ['install_startup'] },
    items: [
      { key: 'is_mounting', label: 'Unit level, secure, proper clearances' },
      { key: 'is_electrical', label: 'Electrical / breaker sized and correct' },
      { key: 'is_lineset', label: 'Line set / piping brazed, pressure-tested' },
      { key: 'is_vacuum', label: 'System evacuated to spec (micron level)' },
      { key: 'is_charge', label: 'Refrigerant / water charge to manufacturer spec' },
      { key: 'is_condensate', label: 'Condensate / drainage routed correctly' },
      { key: 'is_startup', label: 'Startup readings within manufacturer range' },
      { key: 'is_controls', label: 'Thermostat / controls configured' },
      { key: 'is_orientation', label: 'Customer shown operation & warranty registered' },
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

// Numeric readings/measurements — stored in `info` under each key. Values are
// free entry so a tech can note ranges; the unit is shown next to the field.
export const READINGS_SECTIONS = [
  {
    id: 'cooling',
    title: 'Readings — Cooling',
    scope: { equipment: ['ac', 'heat_pump', 'mini_split', 'refrigeration', 'pm', 'install_startup'] },
    items: [
      { key: 'rd_suction', label: 'Suction pressure', unit: 'psi' },
      { key: 'rd_head', label: 'Head / discharge pressure', unit: 'psi' },
      { key: 'rd_superheat', label: 'Superheat', unit: '°F' },
      { key: 'rd_subcool', label: 'Subcooling', unit: '°F' },
      { key: 'rd_supply', label: 'Supply air temp', unit: '°F' },
      { key: 'rd_return', label: 'Return air temp', unit: '°F' },
      { key: 'rd_deltat', label: 'Temperature split (ΔT)', unit: '°F' },
      { key: 'rd_amps', label: 'Compressor amps', unit: 'A' },
    ],
  },
  {
    id: 'combustion',
    title: 'Readings — Combustion / Heating',
    scope: { equipment: ['furnace', 'boiler', 'water_heater', 'pm', 'install_startup'] },
    items: [
      { key: 'rd_gas', label: 'Manifold / gas pressure', unit: 'in WC' },
      { key: 'rd_stack', label: 'Stack / flue temp', unit: '°F' },
      { key: 'rd_co', label: 'CO', unit: 'ppm' },
      { key: 'rd_co2', label: 'CO₂', unit: '%' },
      { key: 'rd_rise', label: 'Temperature rise', unit: '°F' },
    ],
  },
];

// Reading sections that apply for a given equipment selection.
export function readingsFor(property, equipment) {
  return READINGS_SECTIONS.filter(s => !s.scope?.equipment || s.scope.equipment.includes(equipment));
}

export const ANSWERS = [
  { id: 'pass', label: 'Pass' },
  { id: 'fail', label: 'Fail' },
  { id: 'na', label: 'N/A' },
];

export const propertyLabel = (id) => PROPERTY_TYPES.find(p => p.id === id)?.label || id;
export const equipmentLabel = (id) => EQUIPMENT_TYPES.find(e => e.id === id)?.label || id;
