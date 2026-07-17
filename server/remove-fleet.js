// One-off destructive migration: remove the Fleet / GPS / Delivery / Driver-Portal
// database objects. Run ONCE with:  node server/remove-fleet.js
//
// A full data+schema backup of these tables was taken before this was run
// (see scratchpad fleet-removal-backup-*.sql/json). This drops them permanently.
//
// KEEPS: assets (used by transactions + /api/assets), notifications, employee_accounts,
// material_requests, users, sales_orders, purchase_orders, inventory, miscellaneous,
// suppliers, customers, inquiries.
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const DROP_TABLES = [
  'deliveries', 'driver_deliveries', 'driver_messages', 'driver_locations',
  'gps_locations', 'driver_accounts', 'drivers', 'odometer_logs',
  'maintenance_records', 'fleet_purchase_orders', 'vehicles', 'operational_costs',
  'purchase_order_items',
];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function main() {
  const client = await pool.connect();
  try {
    // 1. Drop the fleet FK columns on sales_orders FIRST (they reference drivers/vehicles).
    await client.query(
      'ALTER TABLE sales_orders DROP COLUMN IF EXISTS driver_id, DROP COLUMN IF EXISTS vehicle_id, DROP COLUMN IF EXISTS delivery_id'
    );
    console.log('✅ sales_orders: dropped driver_id, vehicle_id, delivery_id');

    // 2. Drop the fleet/driver/delivery tables (CASCADE handles inter-table FKs).
    for (const t of DROP_TABLES) {
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
      console.log(`🗑️  dropped ${t}`);
    }

    // 3. Verify none of the dropped tables remain, and list what survives.
    const still = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name = ANY($1) ORDER BY table_name`,
      [DROP_TABLES]
    );
    console.log('\nDropped-list tables still present:', still.rows.map(r => r.table_name).join(', ') || 'NONE ✅');

    const remaining = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' ORDER BY table_name`
    );
    console.log('Remaining public tables:', remaining.rows.map(r => r.table_name).join(', '));
    console.log('\n✅ Fleet removal migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('DROP_FAILED:', e.message); process.exitCode = 1; });
