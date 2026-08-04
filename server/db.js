import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory using absolute path
const envPath = path.resolve(__dirname, '..', '.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fleet_manager';

// Enable SSL for any remote database (Supabase/Render/etc.) — not just when
// NODE_ENV=production. A local Postgres on localhost/127.0.0.1 needs no SSL, but
// hosted providers reject non-SSL connections, so key SSL off the host rather than
// NODE_ENV (which is 'development' when running Supabase locally).
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
const useSsl = process.env.NODE_ENV === 'production' || !isLocalDb;

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

// Handle errors on IDLE pooled clients (a hosted DB like Supabase drops idle connections after a
// network blip or reboot). Without this listener the pg Pool re-emits 'error' with no handler,
// which Node turns into an uncaught exception — previously only survived because of the global
// uncaughtException catch-all. Handling it here lets the pool quietly discard the dead client; the
// next query() opens a fresh connection.
pool.on('error', (err) => {
  console.error('idle pool client error:', err.message);
});

// A transient connectivity error (dropped/reset idle connection, connect timeout) that is safe to
// retry once: the statement almost certainly never ran, and query() only issues single, auto-
// committed statements (multi-statement transactions use getClient() and manage their own retries).
function isTransientConnError(err) {
  const msg = (err && err.message) || '';
  const code = err && err.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' ||
    /Connection terminated|ECONNRESET|connection timeout|timeout exceeded when trying to connect/i.test(msg);
}

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    // One automatic retry on a transient connection drop, so a brief blip is a transparent success
    // instead of a 500. A fresh connection is taken from the pool on the retry.
    if (isTransientConnError(err)) {
      console.warn('Database transient error — retrying once:', err.message);
      await new Promise((r) => setTimeout(r, 250));
      try {
        return await pool.query(text, params);
      } catch (err2) {
        console.error('Database query error (after retry):', err2.message);
        throw err2;
      }
    }
    console.error('Database query error:', err.message);
    throw err;
  }
}

// Startup DB-readiness gate: probe SELECT 1 with retries so a boot-before-network start (e.g. the
// Pi's Wi-Fi not up yet after a power cycle) waits for connectivity instead of coming up DB-less.
// Returns true once reachable; after exhausting retries it returns false and the caller starts
// anyway (query() retries + the idle-error handler recover once the network returns).
export async function waitForDbReady({ retries = 12, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log(`✅ Database reachable (attempt ${attempt}/${retries}).`);
      return true;
    } catch (err) {
      console.warn(`⏳ Database not ready (attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error(`❌ Database still unreachable after ${retries} attempts — starting anyway; queries will retry as connectivity returns.`);
  return false;
}

// Checkout a dedicated pooled client for a multi-statement transaction.
// Caller MUST release() it (use try/finally) and drive BEGIN/COMMIT/ROLLBACK.
export async function getClient() {
  return pool.connect();
}

export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected at:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

// Create new tables for employee & driver portals
export async function createNewTables() {
  try {
    console.log('Creating new tables for employee & driver portals...');
    
    // Employee accounts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_accounts (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        position VARCHAR(255),
        phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        approved_at TIMESTAMP,
        approved_by INTEGER
      )
    `);

    // [removed] driver_accounts table — Driver Portal feature removed.

    // Material requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS material_requests (
        id SERIAL PRIMARY KEY,
        request_number VARCHAR(100) UNIQUE NOT NULL,
        employee_id INTEGER REFERENCES employee_accounts(id),
        employee_name VARCHAR(255),
        item_name VARCHAR(255) NOT NULL,
        item_code VARCHAR(100),
        quantity_requested INTEGER NOT NULL,
        unit VARCHAR(50),
        purpose TEXT,
        urgency VARCHAR(50) DEFAULT 'normal',
        status VARCHAR(50) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER
      )
    `);

    // [removed] driver_locations / driver_deliveries / driver_messages tables — Driver Portal feature removed.

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient_type VARCHAR(50) NOT NULL,
        recipient_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add missing approval columns to existing tables
    try {
      await pool.query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
      await pool.query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');
      console.log('✅ Approval columns added to existing tables');
    } catch (err) {
      console.log('ℹ️ Approval columns already exist or error adding them:', err.message);
    }

    // Create indexes for performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employee_accounts_email ON employee_accounts(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_material_requests_employee_id ON material_requests(employee_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id)');

    // Core business-table indexes backing the list/report endpoints (the columns
    // they filter and sort on). Guarded on its own so a missing column on an older
    // schema logs and continues instead of aborting boot.
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_date ON purchase_orders(created_date)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_orders_created_date ON sales_orders(created_date)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_item_name ON inventory(item_name)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
      console.log('✅ Business-table performance indexes ensured');
    } catch (err) {
      console.log('ℹ️ Some business-table indexes were skipped:', err.message);
    }

    console.log('✅ New tables created successfully');
    return true;
  } catch (err) {
    console.error('❌ Error creating new tables:', err.message);
    throw err;
  }
}
