// Auto-generated from Clarke_Mechanical_NYC_Commercial_HVAC_Service_Price_Book.xlsx.
// 134 flat-rate service items (code, category, name + cost inputs). Prices are
// computed at runtime by lib/servicePricing.js from the editable settings.
// Q-xxx items are quote_required (no flat price).
const DEFAULT_PRICING_SETTINGS = {
  "labor_rate": 195,
  "diagnostic_fee": 250,
  "after_hours_mult": 1.5,
  "emergency_mult": 2,
  "contract_discount": 0.1,
  "markup_under_250": 1.8,
  "markup_250_1000": 1.6,
  "markup_over_1000": 1.45,
  "target_margin": 0.55,
  "helper_rate": 125,
  "travel_fee": 65
};

const SERVICE_SEED = [
  {
    "code": "C-001",
    "category": "Dispatch & Diagnostics",
    "name": "Commercial diagnostic - first unit",
    "material": 0.0,
    "hours": 1.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "C-002",
    "category": "Dispatch & Diagnostics",
    "name": "Additional unit diagnostic - same visit",
    "material": 0.0,
    "hours": 0.6,
    "parts": 25.0,
    "quote_required": false
  },
  {
    "code": "C-003",
    "category": "Dispatch & Diagnostics",
    "name": "After-hours diagnostic",
    "material": 0.0,
    "hours": 1.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "C-004",
    "category": "Dispatch & Diagnostics",
    "name": "Emergency priority dispatch",
    "material": 0.0,
    "hours": 1.5,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "C-005",
    "category": "Dispatch & Diagnostics",
    "name": "Written equipment condition report",
    "material": 0.0,
    "hours": 1.5,
    "parts": 25.0,
    "quote_required": false
  },
  {
    "code": "C-006",
    "category": "Dispatch & Diagnostics",
    "name": "Return trip / access delay allowance",
    "material": 0.0,
    "hours": 1.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-001",
    "category": "RTU / Packaged Equipment",
    "name": "RTU preventive maintenance - up to 5 ton",
    "material": 45.0,
    "hours": 1.25,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-002",
    "category": "RTU / Packaged Equipment",
    "name": "RTU preventive maintenance - 6 to 10 ton",
    "material": 65.0,
    "hours": 1.75,
    "parts": 60.0,
    "quote_required": false
  },
  {
    "code": "R-003",
    "category": "RTU / Packaged Equipment",
    "name": "RTU preventive maintenance - 11 to 20 ton",
    "material": 95.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-004",
    "category": "RTU / Packaged Equipment",
    "name": "RTU belt replacement - single belt",
    "material": 35.0,
    "hours": 1.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-005",
    "category": "RTU / Packaged Equipment",
    "name": "RTU belt set replacement - multi belt",
    "material": 85.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-006",
    "category": "RTU / Packaged Equipment",
    "name": "Contactor replacement",
    "material": 90.0,
    "hours": 1.25,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-007",
    "category": "RTU / Packaged Equipment",
    "name": "Run capacitor replacement",
    "material": 65.0,
    "hours": 1.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-008",
    "category": "RTU / Packaged Equipment",
    "name": "Dual capacitor replacement",
    "material": 85.0,
    "hours": 1.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-009",
    "category": "RTU / Packaged Equipment",
    "name": "Condenser fan motor replacement - small RTU",
    "material": 425.0,
    "hours": 2.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-010",
    "category": "RTU / Packaged Equipment",
    "name": "Condenser fan motor replacement - large RTU",
    "material": 725.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-011",
    "category": "RTU / Packaged Equipment",
    "name": "Blower motor replacement - PSC",
    "material": 550.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-012",
    "category": "RTU / Packaged Equipment",
    "name": "ECM/VFD blower motor replacement",
    "material": 1100.0,
    "hours": 4.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "R-013",
    "category": "RTU / Packaged Equipment",
    "name": "Blower bearing replacement",
    "material": 325.0,
    "hours": 3.5,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "R-014",
    "category": "RTU / Packaged Equipment",
    "name": "Blower wheel replacement",
    "material": 475.0,
    "hours": 3.5,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "R-015",
    "category": "RTU / Packaged Equipment",
    "name": "Economizer actuator replacement",
    "material": 375.0,
    "hours": 2.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-016",
    "category": "RTU / Packaged Equipment",
    "name": "Economizer control/module replacement",
    "material": 650.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-017",
    "category": "RTU / Packaged Equipment",
    "name": "Outdoor-air damper repair",
    "material": 225.0,
    "hours": 2.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-018",
    "category": "RTU / Packaged Equipment",
    "name": "Low/high pressure switch replacement",
    "material": 165.0,
    "hours": 2.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-019",
    "category": "RTU / Packaged Equipment",
    "name": "Freeze-stat replacement",
    "material": 145.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-020",
    "category": "RTU / Packaged Equipment",
    "name": "RTU thermostat replacement - standard",
    "material": 175.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-021",
    "category": "RTU / Packaged Equipment",
    "name": "RTU smoke detector troubleshooting",
    "material": 75.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-022",
    "category": "RTU / Packaged Equipment",
    "name": "RTU drain pan / condensate clearing",
    "material": 45.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "R-023",
    "category": "RTU / Packaged Equipment",
    "name": "RTU condenser coil chemical cleaning",
    "material": 125.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-024",
    "category": "RTU / Packaged Equipment",
    "name": "RTU evaporator coil cleaning",
    "material": 125.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "R-025",
    "category": "RTU / Packaged Equipment",
    "name": "RTU compressor replacement - up to 5 ton",
    "material": 1650.0,
    "hours": 7.0,
    "parts": 150.0,
    "quote_required": false
  },
  {
    "code": "R-026",
    "category": "RTU / Packaged Equipment",
    "name": "RTU compressor replacement - 6 to 10 ton",
    "material": 2800.0,
    "hours": 10.0,
    "parts": 200.0,
    "quote_required": false
  },
  {
    "code": "S-001",
    "category": "Split / Ductless / VRF",
    "name": "Commercial split PM - per system",
    "material": 35.0,
    "hours": 1.25,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "S-002",
    "category": "Split / Ductless / VRF",
    "name": "Mini-split PM - first indoor head",
    "material": 30.0,
    "hours": 1.0,
    "parts": 35.0,
    "quote_required": false
  },
  {
    "code": "S-003",
    "category": "Split / Ductless / VRF",
    "name": "Additional mini-split indoor head PM",
    "material": 20.0,
    "hours": 0.5,
    "parts": 20.0,
    "quote_required": false
  },
  {
    "code": "S-004",
    "category": "Split / Ductless / VRF",
    "name": "Indoor blower wheel deep clean",
    "material": 35.0,
    "hours": 2.0,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "S-005",
    "category": "Split / Ductless / VRF",
    "name": "Condensate pump replacement",
    "material": 175.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "S-006",
    "category": "Split / Ductless / VRF",
    "name": "Indoor fan motor replacement",
    "material": 425.0,
    "hours": 2.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "S-007",
    "category": "Split / Ductless / VRF",
    "name": "Outdoor fan motor replacement",
    "material": 525.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "S-008",
    "category": "Split / Ductless / VRF",
    "name": "Control board replacement",
    "material": 650.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "S-009",
    "category": "Split / Ductless / VRF",
    "name": "Communication fault diagnostic",
    "material": 0.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "S-010",
    "category": "Split / Ductless / VRF",
    "name": "VRF branch controller diagnostic",
    "material": 0.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "S-011",
    "category": "Split / Ductless / VRF",
    "name": "VRF electronic expansion valve replacement",
    "material": 475.0,
    "hours": 4.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "S-012",
    "category": "Split / Ductless / VRF",
    "name": "VRF thermistor/sensor replacement",
    "material": 125.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "S-013",
    "category": "Split / Ductless / VRF",
    "name": "VRF refrigerant circuit diagnostic",
    "material": 0.0,
    "hours": 4.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "F-001",
    "category": "Refrigeration Circuit",
    "name": "Electronic leak search - first circuit",
    "material": 65.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "F-002",
    "category": "Refrigeration Circuit",
    "name": "Nitrogen pressure test - small circuit",
    "material": 85.0,
    "hours": 2.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "F-003",
    "category": "Refrigeration Circuit",
    "name": "Nitrogen pressure test - large circuit",
    "material": 150.0,
    "hours": 4.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "F-004",
    "category": "Refrigeration Circuit",
    "name": "Evacuate/dehydrate circuit - up to 5 ton",
    "material": 75.0,
    "hours": 3.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "F-005",
    "category": "Refrigeration Circuit",
    "name": "Evacuate/dehydrate circuit - 6 to 15 ton",
    "material": 125.0,
    "hours": 4.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "F-006",
    "category": "Refrigeration Circuit",
    "name": "Filter drier replacement - liquid line",
    "material": 125.0,
    "hours": 2.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "F-007",
    "category": "Refrigeration Circuit",
    "name": "TXV replacement - up to 5 ton",
    "material": 325.0,
    "hours": 4.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "F-008",
    "category": "Refrigeration Circuit",
    "name": "TXV replacement - 6 to 15 ton",
    "material": 575.0,
    "hours": 5.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "F-009",
    "category": "Refrigeration Circuit",
    "name": "Solenoid valve replacement",
    "material": 325.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "F-010",
    "category": "Refrigeration Circuit",
    "name": "Refrigerant recovery setup",
    "material": 75.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "F-011",
    "category": "Refrigeration Circuit",
    "name": "Refrigerant charging labor - first hour",
    "material": 0.0,
    "hours": 1.0,
    "parts": 25.0,
    "quote_required": false
  },
  {
    "code": "F-012",
    "category": "Refrigeration Circuit",
    "name": "Refrigerant - per lb",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": false
  },
  {
    "code": "E-001",
    "category": "Electrical & Controls",
    "name": "24V transformer replacement",
    "material": 125.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-002",
    "category": "Electrical & Controls",
    "name": "Control relay replacement",
    "material": 95.0,
    "hours": 1.25,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-003",
    "category": "Electrical & Controls",
    "name": "Time-delay relay replacement",
    "material": 125.0,
    "hours": 1.25,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-004",
    "category": "Electrical & Controls",
    "name": "Phase monitor replacement",
    "material": 225.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-005",
    "category": "Electrical & Controls",
    "name": "Disconnect replacement - small equipment",
    "material": 250.0,
    "hours": 2.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "E-006",
    "category": "Electrical & Controls",
    "name": "Motor starter replacement",
    "material": 425.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "E-007",
    "category": "Electrical & Controls",
    "name": "VFD diagnostic",
    "material": 0.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-008",
    "category": "Electrical & Controls",
    "name": "VFD replacement - up to 5 HP",
    "material": 850.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "E-009",
    "category": "Electrical & Controls",
    "name": "VFD replacement - 7.5 to 15 HP",
    "material": 1450.0,
    "hours": 4.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "E-010",
    "category": "Electrical & Controls",
    "name": "BAS/BMS point-to-point diagnostic",
    "material": 0.0,
    "hours": 2.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-011",
    "category": "Electrical & Controls",
    "name": "Temperature sensor replacement",
    "material": 145.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "E-012",
    "category": "Electrical & Controls",
    "name": "Duct static pressure sensor replacement",
    "material": 225.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-001",
    "category": "Air Distribution / Ventilation",
    "name": "VAV box diagnostic",
    "material": 0.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-002",
    "category": "Air Distribution / Ventilation",
    "name": "VAV actuator replacement",
    "material": 325.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-003",
    "category": "Air Distribution / Ventilation",
    "name": "VAV controller replacement",
    "material": 550.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "A-004",
    "category": "Air Distribution / Ventilation",
    "name": "Exhaust fan diagnostic",
    "material": 0.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-005",
    "category": "Air Distribution / Ventilation",
    "name": "Exhaust fan belt replacement",
    "material": 45.0,
    "hours": 1.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-006",
    "category": "Air Distribution / Ventilation",
    "name": "Exhaust fan motor replacement - small",
    "material": 425.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "A-007",
    "category": "Air Distribution / Ventilation",
    "name": "Exhaust fan motor replacement - large",
    "material": 850.0,
    "hours": 4.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "A-008",
    "category": "Air Distribution / Ventilation",
    "name": "Make-up air unit diagnostic",
    "material": 0.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-009",
    "category": "Air Distribution / Ventilation",
    "name": "Make-up air unit PM",
    "material": 65.0,
    "hours": 2.0,
    "parts": 60.0,
    "quote_required": false
  },
  {
    "code": "A-010",
    "category": "Air Distribution / Ventilation",
    "name": "Damper actuator replacement",
    "material": 325.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-011",
    "category": "Air Distribution / Ventilation",
    "name": "Duct smoke detector service/test",
    "material": 75.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "A-012",
    "category": "Air Distribution / Ventilation",
    "name": "Air balance / airflow diagnostic - per zone",
    "material": 0.0,
    "hours": 1.5,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "B-001",
    "category": "Commercial Boiler / Hydronic",
    "name": "Commercial boiler diagnostic",
    "material": 0.0,
    "hours": 1.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-002",
    "category": "Commercial Boiler / Hydronic",
    "name": "Boiler annual PM - small commercial",
    "material": 125.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-003",
    "category": "Commercial Boiler / Hydronic",
    "name": "Boiler annual PM - medium commercial",
    "material": 225.0,
    "hours": 5.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "B-004",
    "category": "Commercial Boiler / Hydronic",
    "name": "Burner combustion analysis",
    "material": 25.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-005",
    "category": "Commercial Boiler / Hydronic",
    "name": "Flame sensor / ignition electrode service",
    "material": 85.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-006",
    "category": "Commercial Boiler / Hydronic",
    "name": "Ignition transformer replacement",
    "material": 275.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-007",
    "category": "Commercial Boiler / Hydronic",
    "name": "Gas valve replacement - small commercial",
    "material": 475.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-008",
    "category": "Commercial Boiler / Hydronic",
    "name": "Gas valve replacement - large commercial",
    "material": 950.0,
    "hours": 4.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "B-009",
    "category": "Commercial Boiler / Hydronic",
    "name": "Low-water cutoff service/test",
    "material": 75.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-010",
    "category": "Commercial Boiler / Hydronic",
    "name": "Low-water cutoff replacement",
    "material": 325.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-011",
    "category": "Commercial Boiler / Hydronic",
    "name": "Operating control replacement",
    "material": 225.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-012",
    "category": "Commercial Boiler / Hydronic",
    "name": "High-limit control replacement",
    "material": 225.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-013",
    "category": "Commercial Boiler / Hydronic",
    "name": "Circulator pump replacement - fractional HP",
    "material": 475.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-014",
    "category": "Commercial Boiler / Hydronic",
    "name": "Circulator pump replacement - 1 to 3 HP",
    "material": 950.0,
    "hours": 5.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "B-015",
    "category": "Commercial Boiler / Hydronic",
    "name": "Pump seal replacement",
    "material": 325.0,
    "hours": 4.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-016",
    "category": "Commercial Boiler / Hydronic",
    "name": "Expansion tank replacement - small",
    "material": 425.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-017",
    "category": "Commercial Boiler / Hydronic",
    "name": "Hydronic air separator service",
    "material": 75.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-018",
    "category": "Commercial Boiler / Hydronic",
    "name": "Boiler feed valve replacement",
    "material": 225.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-019",
    "category": "Commercial Boiler / Hydronic",
    "name": "Steam trap diagnostic - per trap",
    "material": 0.0,
    "hours": 0.75,
    "parts": 20.0,
    "quote_required": false
  },
  {
    "code": "B-020",
    "category": "Commercial Boiler / Hydronic",
    "name": "Steam trap replacement - typical",
    "material": 175.0,
    "hours": 1.5,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "B-021",
    "category": "Commercial Boiler / Hydronic",
    "name": "Burner motor replacement",
    "material": 650.0,
    "hours": 3.0,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "B-022",
    "category": "Commercial Boiler / Hydronic",
    "name": "Oil burner primary control replacement",
    "material": 325.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-023",
    "category": "Commercial Boiler / Hydronic",
    "name": "Oil burner pump replacement",
    "material": 425.0,
    "hours": 2.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "B-024",
    "category": "Commercial Boiler / Hydronic",
    "name": "Nozzle/filter/strainer burner service",
    "material": 85.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "P-001",
    "category": "Pumps / Mechanical Room",
    "name": "Pump diagnostic - up to 5 HP",
    "material": 0.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "P-002",
    "category": "Pumps / Mechanical Room",
    "name": "Pump coupling replacement",
    "material": 175.0,
    "hours": 2.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "P-003",
    "category": "Pumps / Mechanical Room",
    "name": "Pump motor replacement - 1 to 3 HP",
    "material": 850.0,
    "hours": 4.0,
    "parts": 100.0,
    "quote_required": false
  },
  {
    "code": "P-004",
    "category": "Pumps / Mechanical Room",
    "name": "Pump motor replacement - 5 to 10 HP",
    "material": 1650.0,
    "hours": 6.0,
    "parts": 125.0,
    "quote_required": false
  },
  {
    "code": "P-005",
    "category": "Pumps / Mechanical Room",
    "name": "Strainer cleaning - small",
    "material": 25.0,
    "hours": 1.0,
    "parts": 25.0,
    "quote_required": false
  },
  {
    "code": "P-006",
    "category": "Pumps / Mechanical Room",
    "name": "Strainer cleaning - large",
    "material": 45.0,
    "hours": 1.5,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "P-007",
    "category": "Pumps / Mechanical Room",
    "name": "Mechanical room controls diagnostic",
    "material": 0.0,
    "hours": 2.0,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "M-001",
    "category": "PM / Seasonal Service",
    "name": "Quarterly PM - small RTU/split per unit",
    "material": 45.0,
    "hours": 1.25,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "M-002",
    "category": "PM / Seasonal Service",
    "name": "Quarterly PM - 6 to 10 ton RTU per unit",
    "material": 65.0,
    "hours": 1.75,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "M-003",
    "category": "PM / Seasonal Service",
    "name": "Quarterly PM - 11 to 20 ton RTU per unit",
    "material": 95.0,
    "hours": 2.5,
    "parts": 75.0,
    "quote_required": false
  },
  {
    "code": "M-004",
    "category": "PM / Seasonal Service",
    "name": "Filter change labor - first unit",
    "material": 0.0,
    "hours": 0.5,
    "parts": 25.0,
    "quote_required": false
  },
  {
    "code": "M-005",
    "category": "PM / Seasonal Service",
    "name": "Filter change labor - additional unit",
    "material": 0.0,
    "hours": 0.25,
    "parts": 10.0,
    "quote_required": false
  },
  {
    "code": "M-006",
    "category": "PM / Seasonal Service",
    "name": "Spring startup - per RTU up to 10 ton",
    "material": 45.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "M-007",
    "category": "PM / Seasonal Service",
    "name": "Fall heating startup - per RTU up to 10 ton",
    "material": 45.0,
    "hours": 1.5,
    "parts": 50.0,
    "quote_required": false
  },
  {
    "code": "M-008",
    "category": "PM / Seasonal Service",
    "name": "Coil cleaning add-on - per RTU",
    "material": 85.0,
    "hours": 1.25,
    "parts": 40.0,
    "quote_required": false
  },
  {
    "code": "M-009",
    "category": "PM / Seasonal Service",
    "name": "Belt replacement add-on during PM",
    "material": 35.0,
    "hours": 0.5,
    "parts": 20.0,
    "quote_required": false
  },
  {
    "code": "M-010",
    "category": "PM / Seasonal Service",
    "name": "Combustion analysis add-on during PM",
    "material": 25.0,
    "hours": 0.75,
    "parts": 25.0,
    "quote_required": false
  },
  {
    "code": "Q-001",
    "category": "Quote Required / Project Work",
    "name": "RTU replacement / crane / rigging",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-002",
    "category": "Quote Required / Project Work",
    "name": "VRF/VRV major component or compressor",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-003",
    "category": "Quote Required / Project Work",
    "name": "Chiller service / major repair",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-004",
    "category": "Quote Required / Project Work",
    "name": "Cooling tower repair / replacement",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-005",
    "category": "Quote Required / Project Work",
    "name": "Commercial boiler replacement",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-006",
    "category": "Quote Required / Project Work",
    "name": "Heat exchanger replacement - commercial RTU",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-007",
    "category": "Quote Required / Project Work",
    "name": "BMS programming / integration",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-008",
    "category": "Quote Required / Project Work",
    "name": "Ductwork modification / fabrication",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-009",
    "category": "Quote Required / Project Work",
    "name": "Crane, rigging, lift or scaffold",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-010",
    "category": "Quote Required / Project Work",
    "name": "DOB permits / engineering / filing",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-011",
    "category": "Quote Required / Project Work",
    "name": "Asbestos / hazardous material coordination",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  },
  {
    "code": "Q-012",
    "category": "Quote Required / Project Work",
    "name": "Large refrigerant charge / retrofit",
    "material": 0.0,
    "hours": 0.0,
    "parts": 0.0,
    "quote_required": true
  }
];

module.exports = { SERVICE_SEED, DEFAULT_PRICING_SETTINGS };
