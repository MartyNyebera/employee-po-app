import { query } from './db.js';
import { migrateFleet } from './migrate-fleet.js';

const initialVehicles = [
  { id: 'VH-DT-001', unit_name: 'Dump Truck 1', vehicle_type: 'Dump Truck', plate_number: 'ABC 1234', current_odometer: 12500 },
  { id: 'VH-DT-002', unit_name: 'Dump Truck 2', vehicle_type: 'Dump Truck', plate_number: 'ABC 1235', current_odometer: 9800 },
  { id: 'VH-MD-001', unit_name: 'Mini Dump 1', vehicle_type: 'Mini Dump', plate_number: 'DEF 2234', current_odometer: 7200 },
  { id: 'VH-MD-002', unit_name: 'Mini Dump 2', vehicle_type: 'Mini Dump', plate_number: 'DEF 2235', current_odometer: 5400 },
  { id: 'VH-BH-001', unit_name: 'Backhoe 1', vehicle_type: 'Backhoe', plate_number: null, current_odometer: 3200 },
  { id: 'VH-BH-002', unit_name: 'Backhoe 2', vehicle_type: 'Backhoe', plate_number: null, current_odometer: 4100 },
  { id: 'VH-BH-003', unit_name: 'Backhoe 3', vehicle_type: 'Backhoe', plate_number: null, current_odometer: 2800 },
  { id: 'VH-BH-004', unit_name: 'Backhoe 4', vehicle_type: 'Backhoe', plate_number: null, current_odometer: 6300 },
  { id: 'VH-BT-001', unit_name: 'Boom Truck 1', vehicle_type: 'Boom Truck', plate_number: 'GHI 3345', current_odometer: 18200 },
  { id: 'VH-L3-001', unit_name: 'L3 Loader 1', vehicle_type: 'L3 Loader', plate_number: null, current_odometer: 8900 },
];

const sampleMaintenance = [
  {
    id: 'MR-001', vehicle_id: 'VH-DT-001', service_date: '2026-01-15',
    odometer_at_service: 12000, description: 'Oil change + filter replacement',
    total_cost: 4500, next_due_date: '2026-04-15', next_due_odometer: 14500
  },
  {
    id: 'MR-002', vehicle_id: 'VH-DT-002', service_date: '2026-02-01',
    odometer_at_service: 9500, description: 'Tire rotation + brake inspection',
    total_cost: 3200, next_due_date: '2026-02-25', next_due_odometer: 10300
  },
  {
    id: 'MR-003', vehicle_id: 'VH-BH-001', service_date: '2026-01-20',
    odometer_at_service: 3000, description: 'Hydraulic fluid change',
    total_cost: 6800, next_due_date: '2026-04-20', next_due_odometer: 3700
  },
];

export async function seedFleet() {
  await migrateFleet();
  console.log('Seeding fleet data...');

  for (const v of initialVehicles) {
    await query(
      `INSERT INTO vehicles (id, unit_name, vehicle_type, plate_number, current_odometer)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         unit_name = EXCLUDED.unit_name,
         vehicle_type = EXCLUDED.vehicle_type,
         plate_number = EXCLUDED.plate_number,
         current_odometer = EXCLUDED.current_odometer,
         updated_at = NOW()`,
      [v.id, v.unit_name, v.vehicle_type, v.plate_number, v.current_odometer]
    );
  }
  console.log('  - Vehicles seeded');

  for (const m of sampleMaintenance) {
    await query(
      `INSERT INTO maintenance_records (id, vehicle_id, service_date, odometer_at_service, description, total_cost, next_due_date, next_due_odometer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [m.id, m.vehicle_id, m.service_date, m.odometer_at_service, m.description, m.total_cost, m.next_due_date, m.next_due_odometer]
    );
  }
  console.log('  - Sample maintenance records seeded');
  console.log('Fleet seed complete.');
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed-fleet.js');
if (isMain) {
  seedFleet()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
