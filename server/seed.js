import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { hashPassword } from './auth.js';

dotenv.config();

const isRunDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const seedAssets = [
  { id: 'TRK-001', name: 'Delivery Truck Alpha', type: 'truck', status: 'active', location: 'Manila Construction Site', lat: 14.5995, lng: 120.9842, engine_hours: 2847, idle_time: 45, fuel_level: 68, battery_voltage: 12.8, speed: 42, in_geofence: true, last_update: '2 min ago', driver: 'Juan Santos', efficiency_score: 87 },
  { id: 'BCK-002', name: 'Backhoe Beta', type: 'backhoe', status: 'idle', location: 'Quezon City Warehouse', lat: 14.6760, lng: 121.0437, engine_hours: 1523, idle_time: 120, fuel_level: 34, battery_voltage: 11.9, speed: 0, in_geofence: true, last_update: '5 min ago', driver: 'Maria Cruz', efficiency_score: 62 },
  { id: 'EXC-003', name: 'Excavator Gamma', type: 'excavator', status: 'active', location: 'BGC Tower Project', lat: 14.5547, lng: 121.0244, engine_hours: 3921, idle_time: 28, fuel_level: 89, battery_voltage: 13.2, speed: 15, in_geofence: true, last_update: '1 min ago', driver: 'Pedro Reyes', efficiency_score: 94 },
  { id: 'TRK-004', name: 'Delivery Truck Delta', type: 'truck', status: 'offline', location: 'Main Depot', lat: 14.5832, lng: 120.9668, engine_hours: 4156, idle_time: 0, fuel_level: 12, battery_voltage: 10.8, speed: 0, in_geofence: false, last_update: '2 hours ago', driver: null, efficiency_score: 71 },
  { id: 'BCK-005', name: 'Backhoe Epsilon', type: 'backhoe', status: 'active', location: 'Makati Office Complex', lat: 14.5547, lng: 121.0244, engine_hours: 892, idle_time: 15, fuel_level: 91, battery_voltage: 12.6, speed: 8, in_geofence: true, last_update: '1 min ago', driver: 'Rosa Martinez', efficiency_score: 91 },
];

const seedPOs = [
  { id: 'PO-001', po_number: 'PO-2026-0234', client: 'ABC Construction Corp.', description: 'Site excavation and foundation work', amount: 850000, status: 'in-progress', created_date: '2026-02-01', delivery_date: '2026-02-28', assigned_assets: ['EXC-003', 'BCK-002'] },
  { id: 'PO-002', po_number: 'PO-2026-0235', client: 'Metro Development Inc.', description: 'Heavy equipment rental for 3 months', amount: 1250000, status: 'approved', created_date: '2026-02-05', delivery_date: '2026-05-05', assigned_assets: ['TRK-001', 'BCK-005'] },
  { id: 'PO-003', po_number: 'PO-2026-0236', client: 'BuildRight Solutions', description: 'Material delivery and excavation support', amount: 425000, status: 'pending', created_date: '2026-02-10', delivery_date: '2026-03-15', assigned_assets: ['TRK-004'] },
  { id: 'PO-004', po_number: 'PO-2026-0237', client: 'Skyline Realty Group', description: 'Tower foundation excavation', amount: 2100000, status: 'completed', created_date: '2026-01-15', delivery_date: '2026-02-10', assigned_assets: ['EXC-003', 'BCK-002', 'TRK-001'] },
];

const seedTransactions = [
  { id: 'TXN-001', po_number: 'PO-2026-0234', type: 'fuel', description: 'Diesel refill - 150L', amount: 9750, asset_id: 'EXC-003', date: '2026-02-11' },
  { id: 'TXN-002', po_number: 'PO-2026-0235', type: 'maintenance', description: 'Oil change and filter replacement', amount: 4500, asset_id: 'TRK-001', date: '2026-02-10' },
  { id: 'TXN-003', po_number: 'PO-2026-0234', type: 'parts', description: 'Hydraulic hose replacement', amount: 12800, asset_id: 'BCK-002', date: '2026-02-09' },
  { id: 'TXN-004', po_number: 'PO-2026-0237', type: 'fuel', description: 'Diesel refill - 200L', amount: 13000, asset_id: 'TRK-001', date: '2026-02-08' },
  { id: 'TXN-005', po_number: 'PO-2026-0235', type: 'maintenance', description: 'Tire replacement (set of 4)', amount: 28000, asset_id: 'BCK-005', date: '2026-02-07' },
  { id: 'TXN-006', po_number: 'PO-2026-0234', type: 'fuel', description: 'Diesel refill - 120L', amount: 7800, asset_id: 'BCK-002', date: '2026-02-12' },
];

async function seed() {
  console.log('Seeding database...');

  for (const a of seedAssets) {
    await query(
      `INSERT INTO assets (id, name, type, status, location, lat, lng, engine_hours, idle_time, fuel_level, battery_voltage, speed, in_geofence, last_update, driver, efficiency_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status, location = EXCLUDED.location,
         lat = EXCLUDED.lat, lng = EXCLUDED.lng, engine_hours = EXCLUDED.engine_hours, idle_time = EXCLUDED.idle_time,
         fuel_level = EXCLUDED.fuel_level, battery_voltage = EXCLUDED.battery_voltage, speed = EXCLUDED.speed,
         in_geofence = EXCLUDED.in_geofence, last_update = EXCLUDED.last_update, driver = EXCLUDED.driver,
         efficiency_score = EXCLUDED.efficiency_score, updated_at = NOW()`,
      [a.id, a.name, a.type, a.status, a.location, a.lat, a.lng, a.engine_hours, a.idle_time, a.fuel_level, a.battery_voltage, a.speed, a.in_geofence, a.last_update, a.driver, a.efficiency_score]
    );
  }
  console.log('  - Assets seeded');

  for (const p of seedPOs) {
    await query(
      `INSERT INTO purchase_orders (id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         po_number = EXCLUDED.po_number, client = EXCLUDED.client, description = EXCLUDED.description,
         amount = EXCLUDED.amount, status = EXCLUDED.status, created_date = EXCLUDED.created_date,
         delivery_date = EXCLUDED.delivery_date, assigned_assets = EXCLUDED.assigned_assets, updated_at = NOW()`,
      [p.id, p.po_number, p.client, p.description, p.amount, p.status, p.created_date, p.delivery_date, p.assigned_assets]
    );
  }
  console.log('  - Purchase orders seeded');

  for (const t of seedTransactions) {
    await query(
      `INSERT INTO transactions (id, po_number, type, description, amount, asset_id, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.po_number, t.type, t.description, t.amount, t.asset_id, t.date]
    );
  }
  console.log('  - Transactions seeded');

  // Super admins: Developer + Owner (only 2 main admins)
  const superAdmins = [
    {
      id: 'super-admin-developer',
      email: (process.env.SUPER_ADMIN_DEVELOPER_EMAIL || 'developer@kimoel.local').toLowerCase(),
      name: process.env.SUPER_ADMIN_DEVELOPER_NAME || 'Developer',
      password: process.env.SUPER_ADMIN_DEVELOPER_PASSWORD || 'ChangeMe123!',
    },
    {
      id: 'super-admin-owner',
      email: (process.env.SUPER_ADMIN_OWNER_EMAIL || 'owner@kimoel.local').toLowerCase(),
      name: process.env.SUPER_ADMIN_OWNER_NAME || 'Owner',
      password: process.env.SUPER_ADMIN_OWNER_PASSWORD || 'ChangeMe123!',
    },
    {
      id: 'owner-local',
      email: 'owner@kimoel.local',
      name: 'Owner',
      password: 'ChangeMe123!',
    },
    {
      id: 'lei-suarez',
      email: 'leisuarez2@gmail.com',
      name: 'Lei Suarez',
      password: 'developer123456',
    },
  ];
  for (const sa of superAdmins) {
    const password_hash = await hashPassword(sa.password);
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, is_super_admin)
       VALUES ($1, $2, $3, $4, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         is_super_admin = true`,
      [sa.id, sa.email, password_hash, sa.name]
    );
  }
  console.log('  - Super admins seeded (developer + owner). Change default passwords!');

  console.log('Seed complete.');
}

export { seed };

// Run seed when this file is executed directly (e.g. npm run seed)
if (isRunDirectly) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
