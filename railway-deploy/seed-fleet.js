import { query } from './db.js';
import { migrateFleet } from './migrate-fleet.js';

const initialVehicles = []; // Empty - ready for your real vehicles
const sampleMaintenance = []; // Empty - ready for your real maintenance records

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
