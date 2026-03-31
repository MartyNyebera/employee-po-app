import { query } from './db.js';

export async function migrateFleet() {
  console.log('Running fleet management migration...');

  // 1. vehicles
  await query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      unit_name TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      plate_number TEXT,
      current_odometer NUMERIC DEFAULT 0,
      tracker_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  - vehicles table ready');

  // 2. odometer_logs
  await query(`
    CREATE TABLE IF NOT EXISTS odometer_logs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
      odometer NUMERIC NOT NULL,
      recorded_at TIMESTAMPTZ DEFAULT NOW(),
      source TEXT DEFAULT 'manual'
    )
  `);
  console.log('  - odometer_logs table ready');

  // 3. maintenance_records
  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_records (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
      service_date DATE NOT NULL,
      odometer_at_service NUMERIC,
      description TEXT,
      total_cost NUMERIC DEFAULT 0,
      next_due_date DATE,
      next_due_odometer NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  - maintenance_records table ready');

  // 4. fleet_purchase_orders
  await query(`
    CREATE TABLE IF NOT EXISTS fleet_purchase_orders (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
      po_number TEXT NOT NULL,
      supplier TEXT,
      date DATE NOT NULL,
      total_cost NUMERIC DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('  - fleet_purchase_orders table ready');

  // 5. purchase_order_items
  await query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT REFERENCES fleet_purchase_orders(id) ON DELETE CASCADE,
      part_name TEXT NOT NULL,
      quantity NUMERIC DEFAULT 1,
      unit_cost NUMERIC DEFAULT 0,
      subtotal NUMERIC DEFAULT 0
    )
  `);
  console.log('  - purchase_order_items table ready');

  console.log('Fleet migration complete.');
}

// Run directly if called as script
const isMain = process.argv[1] && process.argv[1].endsWith('migrate-fleet.js');
if (isMain) {
  migrateFleet()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
