import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fleet_manager',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('Database query error:', err.message);
    throw err;
  }
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

    // Driver accounts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_accounts (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        license_number VARCHAR(100),
        vehicle_assigned VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        approved_at TIMESTAMP,
        approved_by INTEGER
      )
    `);

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

    // Driver GPS locations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_locations (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER REFERENCES driver_accounts(id),
        driver_name VARCHAR(255),
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        accuracy DECIMAL(10, 2),
        speed DECIMAL(10, 2),
        heading DECIMAL(10, 2),
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    // Driver deliveries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_deliveries (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER REFERENCES driver_accounts(id),
        delivery_number VARCHAR(100) UNIQUE NOT NULL,
        customer_name VARCHAR(255),
        delivery_address TEXT,
        items TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        assigned_at TIMESTAMP DEFAULT NOW(),
        pickup_at TIMESTAMP,
        on_the_way_at TIMESTAMP,
        delivered_at TIMESTAMP,
        going_back_at TIMESTAMP,
        done_at TIMESTAMP,
        notes TEXT
      )
    `);

    // Driver messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_messages (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER REFERENCES driver_accounts(id),
        driver_name VARCHAR(255),
        sender_type VARCHAR(50) NOT NULL,
        message TEXT,
        image_url TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

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
      await pool.query('ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
      await pool.query('ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');
      console.log('✅ Approval columns added to existing tables');
    } catch (err) {
      console.log('ℹ️ Approval columns already exist or error adding them:', err.message);
    }

    // Create indexes for performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employee_accounts_email ON employee_accounts(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_driver_accounts_email ON driver_accounts(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_material_requests_employee_id ON material_requests(employee_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_driver_locations_timestamp ON driver_locations(timestamp)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_driver_deliveries_driver_id ON driver_deliveries(driver_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_driver_messages_driver_id ON driver_messages(driver_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id)');

    console.log('✅ New tables created successfully');
    return true;
  } catch (err) {
    console.error('❌ Error creating new tables:', err.message);
    throw err;
  }
}
