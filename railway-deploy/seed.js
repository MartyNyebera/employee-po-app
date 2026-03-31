import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { hashPassword } from './auth.js';

dotenv.config();

const isRunDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const seedAssets = []; // Empty - ready for your real data
const seedPOs = []; // Empty - ready for your real data  
const seedTransactions = []; // Empty - ready for your real data

// Sample inventory data
const seedInventory = [
  {
    id: 'inv-001',
    item_code: 'PAP-A4-001',
    item_name: 'Office Paper A4',
    description: 'Standard A4 office paper, 80gsm',
    quantity: 150,
    unit: 'reams',
    reorder_level: 20,
    unit_cost: 25.50,
    location: 'Office Supplies',
    supplier: 'Office Depot'
  },
  {
    id: 'inv-002',
    item_code: 'ACC-LAP-002',
    item_name: 'Laptop Stand',
    description: 'Adjustable aluminum laptop stand',
    quantity: 8,
    unit: 'pcs',
    reorder_level: 5,
    unit_cost: 45.00,
    location: 'Accessories',
    supplier: 'Tech Supplies Co.'
  },
  {
    id: 'inv-003',
    item_code: 'ACC-MOU-003',
    item_name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    quantity: 0,
    unit: 'pcs',
    reorder_level: 10,
    unit_cost: 35.00,
    location: 'Accessories',
    supplier: 'Tech Supplies Co.'
  },
  {
    id: 'inv-004',
    item_code: 'OFF-PEN-004',
    item_name: 'Ballpoint Pens',
    description: 'Pack of 12 blue ballpoint pens',
    quantity: 25,
    unit: 'packs',
    reorder_level: 10,
    unit_cost: 8.50,
    location: 'Office Supplies',
    supplier: 'Office Depot'
  },
  {
    id: 'inv-005',
    item_code: 'OFF-STP-005',
    item_name: 'Stapler',
    description: 'Heavy duty stapler',
    quantity: 15,
    unit: 'pcs',
    reorder_level: 5,
    unit_cost: 12.00,
    location: 'Office Supplies',
    supplier: 'Office Depot'
  }
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

  // Seed inventory
  for (const item of seedInventory) {
    await query(
      `INSERT INTO inventory (id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (item_code) DO UPDATE SET
         id = EXCLUDED.id, item_name = EXCLUDED.item_name, description = EXCLUDED.description, quantity = EXCLUDED.quantity,
         unit = EXCLUDED.unit, reorder_level = EXCLUDED.reorder_level, unit_cost = EXCLUDED.unit_cost,
         location = EXCLUDED.location, supplier = EXCLUDED.supplier, updated_at = NOW()`,
      [item.id, item.item_code, item.item_name, item.description, item.quantity, item.unit, item.reorder_level, item.unit_cost, item.location, item.supplier]
    );
  }
  console.log('  - Inventory seeded');

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
