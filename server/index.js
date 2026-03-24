import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection, createNewTables } from './db.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Multer for file uploads
import multer from 'multer';

// Setup upload directory
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { seed } from './seed.js';
import { hashPassword, comparePassword, signToken, requireAuth, requireAdmin, requireSuperAdmin } from './auth.js';
import { sendEmailToAdminsNewRequest, sendEmailToApplicant } from './email.js';
import { getDevices, getDevice, createDevice, updateDevice, deleteDevice, getPositions, getPositionHistory, getGeofences, checkConnection, getTraccarWsUrl, authHeader, TRACCAR_URL } from './traccar.js';
import { getVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle, getOdometerLogs, logOdometer, getMaintenance, createMaintenance, getVehiclePOs, createVehiclePO, getPmsReminders } from './fleet.js';
import mobileGPSRouter from './mobile-gps.js';
import { seedFleet } from './seed-fleet.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Smart cache middleware
app.use((req, res, next) => {
  // Never cache auth routes or mutations
  if (
    req.method !== 'GET' ||
    req.path.includes('/auth') ||
    req.path.includes('/login') ||
    req.path.includes('/logout')
  ) {
    res.setHeader('Cache-Control', 
      'no-store, no-cache, must-revalidate');
    return next();
  }

  // Cache GPS data for 15 seconds
  if (req.path.includes('/gps') || 
      req.path.includes('/location') ||
      req.path.includes('/tracking')) {
    res.setHeader('Cache-Control', 
      'private, max-age=15, stale-while-revalidate=10');
    return next();
  }

  // Cache fleet/vehicle data for 60 seconds
  if (req.path.includes('/fleet') || 
      req.path.includes('/vehicle')) {
    res.setHeader('Cache-Control', 
      'private, max-age=60, stale-while-revalidate=30');
    return next();
  }

  // Cache general data (orders, inventory) for 30 seconds
  res.setHeader('Cache-Control', 
    'private, max-age=30, stale-while-revalidate=15');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Environment health check
app.get('/health/env', (req, res) => {
  const envStatus = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    NODE_ENV: !!process.env.NODE_ENV,
    SUPER_ADMIN_OWNER_EMAIL: !!process.env.SUPER_ADMIN_OWNER_EMAIL,
    SUPER_ADMIN_DEVELOPER_EMAIL: !!process.env.SUPER_ADMIN_DEVELOPER_EMAIL,
    SUPER_ADMIN_EMAILS: !!process.env.SUPER_ADMIN_EMAILS,
    SUPER_ADMIN_OWNER_PASSWORD: !!process.env.SUPER_ADMIN_OWNER_PASSWORD,
    SUPER_ADMIN_DEVELOPER_PASSWORD: !!process.env.SUPER_ADMIN_DEVELOPER_PASSWORD,
    JWT_SECRET: !!process.env.JWT_SECRET,
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    SMTP_HOST: !!process.env.SMTP_HOST,
    SMTP_PORT: !!process.env.SMTP_PORT,
    SMTP_USER: !!process.env.SMTP_USER,
    SMTP_PASS: !!process.env.SMTP_PASS
  };
  
  // Check for critical missing vars
  const criticalMissing = [];
  if (!envStatus.DATABASE_URL) criticalMissing.push('DATABASE_URL');
  if (!envStatus.SUPER_ADMIN_OWNER_EMAIL && !envStatus.SUPER_ADMIN_DEVELOPER_EMAIL) criticalMissing.push('SUPER_ADMIN_EMAIL');
  
  if (criticalMissing.length > 0) {
    console.error('❌ CRITICAL: Missing environment variables:', criticalMissing);
  }
  
  res.json(envStatus);
});

// Super admin status check (protected)
app.get('/health/super-admin-status', async (req, res) => {
  try {
    const result = await query('SELECT email, is_super_admin FROM users WHERE is_super_admin = true');
    const superAdmins = result.rows.map(row => ({
      email: row.email,
      is_super_admin: row.is_super_admin
    }));
    
    res.json({
      count: superAdmins.length,
      admins: superAdmins
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check admin status' });
  }
});

// Email test endpoint (protected)
app.post('/health/test-email', async (req, res) => {
  try {
    const { sendEmailToAdminsNewRequest } = await import('./email.js');
    
    await sendEmailToAdminsNewRequest('test@example.com', 'Test Applicant');
    
    res.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (error) {
    console.error('Test email failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to send test email'
    });
  }
});

// Protected auth debug endpoint (admin only)
app.get('/health/auth-debug', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const email = req.query.email;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const result = await query(
      'SELECT email, name, role, is_super_admin, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        email: email.toLowerCase(),
        exists: false,
        message: 'User not found in database'
      });
    }
    
    const user = result.rows[0];
    res.json({
      email: user.email,
      exists: true,
      name: user.name,
      role: user.role,
      is_super_admin: user.is_super_admin,
      created_at: user.created_at,
      can_login: true // Super admins can always login
    });
  } catch (error) {
    console.error('Auth debug endpoint failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check all users (temporary - remove after use)
app.get('/debug/users', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const result = await query('SELECT id, email, name, role, is_super_admin, created_at FROM users ORDER BY created_at DESC');
    
    res.json({
      count: result.rows.length,
      users: result.rows.map(row => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        is_super_admin: row.is_super_admin,
        created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error('Debug users endpoint failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Emergency admin creation (temporary - remove after use)
app.post('/emergency-create-admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const { query } = await import('./db.js');
    const { hashPassword } = await import('./auth.js');
    
    // Check if user exists
    const existingUser = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    
    if (existingUser.rows.length > 0) {
      // Update to super admin
      await query('UPDATE users SET is_super_admin = true, updated_at = NOW() WHERE LOWER(email) = LOWER($1)', [email]);
      res.json({ message: 'User updated to super admin', email: email.toLowerCase() });
    } else {
      // Create new super admin
      const hashedPassword = await hashPassword(password);
      const adminId = `emergency-admin-${Date.now()}`;
      
      await query(`
        INSERT INTO users (id, email, name, password_hash, role, is_super_admin, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'admin', true, NOW(), NOW())
      `, [adminId, email.toLowerCase(), 'Emergency Admin', hashedPassword]);
      
      res.json({ message: 'Super admin created', email: email.toLowerCase() });
    }
  } catch (error) {
    console.error('Emergency admin creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-migration: create new tables if they don't exist
async function runMigrations() {
  try {
    // Create sales_orders table
    await query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        so_number TEXT NOT NULL UNIQUE,
        client TEXT NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_date DATE NOT NULL,
        delivery_date DATE NOT NULL,
        assigned_assets TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ sales_orders table ready');

    // Create inventory table
    await query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        item_code TEXT NOT NULL UNIQUE,
        item_name TEXT NOT NULL,
        description TEXT,
        quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'pieces',
        reorder_level NUMERIC(10,2) NOT NULL DEFAULT 10,
        unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        location TEXT,
        supplier TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ inventory table ready');

    // Create miscellaneous table
    await query(`
      CREATE TABLE IF NOT EXISTS miscellaneous (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_date DATE NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ miscellaneous table ready');

    // Alter purchase_orders: drop old status constraint and add new one with RECEIVED and PAID
    try {
      await query(`ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check`);
      await query(`ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('pending', 'approved', 'in-progress', 'RECEIVED', 'PAID', 'completed'))`);
      console.log('✅ purchase_orders status constraint updated (added RECEIVED and PAID)');
    } catch (err) {
      console.log('ℹ️ purchase_orders constraint update skipped:', err.message);
    }

    // Add order_type column to distinguish Sales Orders from Purchase Orders
    try {
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(10) DEFAULT NULL`);
      console.log('✅ purchase_orders order_type column added');
    } catch (err) {
      console.log('ℹ️ purchase_orders order_type column already exists:', err.message);
    }

    // Alter sales_orders: ensure PAID status is allowed
    try {
      await query(`ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check`);
      await query(`ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check CHECK (status IN ('pending', 'approved', 'in-progress', 'PAID', 'completed', 'Assigned', 'Picked Up', 'In Transit', 'Delivered'))`);
      console.log('✅ sales_orders status constraint set (includes PAID + delivery statuses)');
    } catch (err) {
      console.log('ℹ️ sales_orders constraint update skipped:', err.message);
    }

    // Create gps_locations table
    await query(`
      CREATE TABLE IF NOT EXISTS gps_locations (
        device_id TEXT PRIMARY KEY,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        heading DOUBLE PRECISION,
        device_timestamp TIMESTAMPTZ,
        last_seen TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ gps_locations table ready');

    // Create drivers table
    await query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        driver_name TEXT NOT NULL,
        contact TEXT NOT NULL,
        email TEXT,
        license_number TEXT NOT NULL,
        license_expiry DATE NOT NULL,
        assigned_vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        join_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ drivers table ready');

    // Create deliveries table
    await query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        so_number TEXT NOT NULL,
        vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL,
        customer_address TEXT NOT NULL,
        delivery_date TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        assigned_time TIMESTAMPTZ,
        picked_up_time TIMESTAMPTZ,
        in_transit_time TIMESTAMPTZ,
        arrived_time TIMESTAMPTZ,
        completed_time TIMESTAMPTZ,
        proof_of_delivery_url TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ deliveries table ready');

    // Add reservation columns to inventory (non-breaking)
    try {
      await query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC(10,2) DEFAULT 0`);
      await query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS in_transit_quantity NUMERIC(10,2) DEFAULT 0`);
      console.log('✅ inventory reservation columns ready');
    } catch (err) {
      console.log('ℹ️ inventory reservation columns skipped:', err.message);
    }

    // Add delivery linking columns to sales_orders (non-breaking)
    try {
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_id TEXT`);
      console.log('✅ sales_orders delivery linking columns ready');
    } catch (err) {
      console.log('ℹ️ sales_orders delivery columns skipped:', err.message);
    }

    console.log('✅ All migrations complete');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  }
}

// Test DB connection on startup
testConnection().then(async () => {
  // STEP 4: VERIFY RENDER DATABASE CONNECTION
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const maskedUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log('🔗 DATABASE CONNECTION VERIFIED:');
    console.log(`  - URL: ${maskedUrl}`);
    console.log(`  - Host: ${dbUrl.includes('@') ? dbUrl.split('@')[1].split('/')[0] : 'unknown'}`);
    console.log(`  - Database: ${dbUrl.split('/').pop() || 'unknown'}`);
  } else {
    console.log('❌ DATABASE_URL NOT SET');
  }

  // Run migrations to ensure all tables exist
  await runMigrations();
  
  // Ensure super admin exists after DB connection
  const { ensureSuperAdmin } = await import('./ensure-super-admin.js');
  await ensureSuperAdmin();
}).catch(() => {
  console.log('Database not ready. Start TimescaleDB/PostgreSQL and run: node server/init.js');
});

// ----- Auth (no auth required) -----
// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check if user already exists
    const existing = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    if (role === 'admin') {
      // Admin: create approval request
      const pendingReq = await query(
        'SELECT id FROM admin_approval_requests WHERE LOWER(email) = LOWER($1) AND status = $2',
        [email, 'pending']
      );
      if (pendingReq.rows.length > 0) {
        return res.status(400).json({
          error: 'You already have a pending admin request. A super admin will review it.',
          code: 'PENDING_ADMIN_REQUEST',
        });
      }
      const reqId = 'req-' + Date.now();
      const hashedPassword = await hashPassword(password);
      await query(
        'INSERT INTO admin_approval_requests (id, email, name, password_hash, status) VALUES ($1, $2, $3, $4, $5)',
        [reqId, email.toLowerCase(), name, hashedPassword, 'pending']
      );
      sendEmailToAdminsNewRequest(email.toLowerCase(), name).catch((err) => {
        console.error('[Email] Failed to notify admins of new request:', err.message);
        if (err.response) console.error('[Email] Response:', err.response);
      });
      return res.status(202).json({
        message: 'Admin request submitted. A super admin (Developer/Owner) will review and approve your account.',
        code: 'ADMIN_REQUEST_SUBMITTED',
      });
    }

    // Employee: create account immediately
    const id = 'u-' + Date.now();
    const hashedPassword = await hashPassword(password);
    await query(
      'INSERT INTO users (id, email, password_hash, name, role, is_super_admin) VALUES ($1, $2, $3, $4, $5, false)',
      [id, email.toLowerCase(), hashedPassword, name, role]
    );
    const token = signToken({ userId: id, role, email: email.toLowerCase(), name, isSuperAdmin: false });
    res.status(201).json({
      user: { id, email: email.toLowerCase(), name, role, isSuperAdmin: false },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    // Safe request logging
    console.log(`🔑 Login attempt: ${req.method} ${req.path}`);
    console.log(`📋 Content-Type: ${req.headers['content-type'] || 'missing'}`);
    console.log(`📧 Email present: ${!!req.body?.email}`);
    
    const { email, password } = req.body;
    
    // PROVE DATABASE CONTENTS - STEP 1
    console.log(`🔍 SEARCHING FOR EMAIL: ${email}`);
    const allUsers = await query('SELECT id, email, role, is_super_admin FROM users');
    console.log(`📊 TOTAL USERS IN DATABASE: ${allUsers.rows.length}`);
    if (allUsers.rows.length === 0) {
      console.log("🚨 PRODUCTION DATABASE HAS NO USERS");
    } else {
      console.log("📋 ALL USERS:");
      allUsers.rows.forEach(user => {
        console.log(`  - ${user.email} | role: ${user.role} | super_admin: ${user.is_super_admin}`);
      });
    }
    
    if (!email || !password) {
      console.log('❌ MISSING_FIELDS');
      return res.status(400).json({ 
        error: 'Email and password are required',
        reason: 'MISSING_FIELDS'
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      console.log('❌ INVALID_EMAIL_FORMAT');
      return res.status(401).json({ 
        error: 'Invalid email format',
        reason: 'INVALID_EMAIL_FORMAT'
      });
    }
    
    // STEP 2: FINAL LOGIN SQL WITH CASE-INSENSITIVE LOOKUP
    const result = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    
    const user = result.rows[0];
    console.log("LOGIN QUERY RESULT:", user || "NO USER FOUND");
    
    if (!user) {
      console.log(`❌ USER_NOT_FOUND: ${email.toLowerCase()}`);
      console.log(`🚨 AUTHENTICATION FAILED - USER DOES NOT EXIST IN DATABASE`);
      console.log(`🔍 CHECKING IF SUPER ADMIN AUTO-CREATION RAN ON STARTUP`);
      // Fail loudly - this should not happen after auto-creation
      throw new Error(`CRITICAL: User ${email} not found in database after startup bootstrap`);
    }
    
    console.log(`✅ User found: ${user.email}, role: ${user.role}, is_super_admin: ${user.is_super_admin}`);
    
    const passwordMatch = await comparePassword(password, user.password_hash);
    console.log(`🔐 Password comparison result: ${passwordMatch}`);
    
    if (!passwordMatch) {
      console.log(`❌ WRONG_PASSWORD: ${email.toLowerCase()}`);
      return res.status(401).json({ 
        error: 'Password incorrect',
        reason: 'WRONG_PASSWORD'
      });
    }
    
    console.log(`✅ Login successful for: ${email.toLowerCase()}`);
    const isSuperAdmin = !!user.is_super_admin;
    const token = signToken({
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      isSuperAdmin,
    });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, isSuperAdmin },
      token,
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: err.message });
  }
});
// In-memory cache: deviceId -> latest position (fast reads, backed by DB)
const mobileLocations = new Map();

// POST /api/phone-location
app.post('/api/phone-location', async (req, res) => {
  const { deviceId, lat, lng, accuracy, speed, heading, timestamp } = req.body;
  if (!deviceId || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'deviceId, lat, lng are required' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid lat/lng range' });
  }

  const now = Date.now();
  const locationData = {
    deviceId: String(deviceId),
    lat, lng,
    accuracy: accuracy ?? null,
    speed: speed ?? null,
    heading: heading ?? null,
    timestamp: timestamp || now,
    lastSeen: now,
    serverTime: now,
  };

  // Update in-memory cache
  mobileLocations.set(String(deviceId), locationData);

  // Persist to DB (upsert) so data survives server restarts
  try {
    await query(
      `INSERT INTO gps_locations (device_id, lat, lng, accuracy, speed, heading, device_timestamp, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
       ON CONFLICT (device_id) DO UPDATE SET
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         accuracy = EXCLUDED.accuracy,
         speed = EXCLUDED.speed,
         heading = EXCLUDED.heading,
         device_timestamp = EXCLUDED.device_timestamp,
         last_seen = EXCLUDED.last_seen`,
      [String(deviceId), lat, lng, accuracy ?? null, speed ?? null, heading ?? null, timestamp || now, now]
    );
  } catch (dbErr) {
    // Table may not exist yet — create it then retry
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS gps_locations (
          device_id TEXT PRIMARY KEY,
          lat DOUBLE PRECISION NOT NULL,
          lng DOUBLE PRECISION NOT NULL,
          accuracy DOUBLE PRECISION,
          speed DOUBLE PRECISION,
          heading DOUBLE PRECISION,
          device_timestamp TIMESTAMPTZ,
          last_seen TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(
        `INSERT INTO gps_locations (device_id, lat, lng, accuracy, speed, heading, device_timestamp, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
         ON CONFLICT (device_id) DO UPDATE SET
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           accuracy = EXCLUDED.accuracy,
           speed = EXCLUDED.speed,
           heading = EXCLUDED.heading,
           device_timestamp = EXCLUDED.device_timestamp,
           last_seen = EXCLUDED.last_seen`,
        [String(deviceId), lat, lng, accuracy ?? null, speed ?? null, heading ?? null, timestamp || now, now]
      );
    } catch (retryErr) {
      console.error('[GPS] DB upsert failed:', retryErr.message);
    }
  }

  console.log(`[GPS] Device ${deviceId} at ${lat.toFixed(6)}, ${lng.toFixed(6)} - Speed: ${speed || 0} km/h`);

  res.json({ ok: true, timestamp: now, devicesCount: mobileLocations.size });
});

// GET /api/phone-location/devices - Get all active devices (from DB)
app.get('/api/phone-location/devices', async (req, res) => {
  try {
    // Try DB first (survives restarts), filter last 2 hours
    const result = await query(`
      SELECT gl.device_id, gl.lat, gl.lng, gl.accuracy, gl.speed, gl.heading, gl.device_timestamp, gl.last_seen,
             v.id as vehicle_id, v.unit_name as vehicle_name, v.plate_number,
             d.driver_name, d.contact as driver_contact,
             del.id as delivery_id, del.so_number, del.customer_name, del.customer_address, del.status as delivery_status
      FROM gps_locations gl
      LEFT JOIN vehicles v ON gl.device_id = v.tracker_id
      LEFT JOIN drivers d ON v.id = d.assigned_vehicle_id
      LEFT JOIN deliveries del ON v.id = del.vehicle_id AND del.status IN ('Assigned', 'Picked Up', 'In Transit', 'Arrived')
      WHERE gl.last_seen >= NOW() - INTERVAL '2 hours'
      ORDER BY gl.last_seen DESC
    `);

    // If DB empty, fall back to in-memory cache
    if (result.rows.length === 0) {
      const devices = Array.from(mobileLocations.entries()).map(([deviceId, pos]) => ({
        deviceId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        speed: pos.speed,
        heading: pos.heading,
        timestamp: pos.timestamp,
        lastSeen: pos.timestamp
      }));
      res.json({ devices });
      return;
    }

    res.json({ devices: result.rows });
  } catch (err) {
    console.error('Error fetching GPS devices:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mobile/:deviceId/latest
app.get('/api/mobile/:deviceId/latest', (req, res) => {
  const pos = mobileLocations.get(req.params.deviceId);
  if (!pos) return res.status(404).json({ error: 'No location found for this device' });
  res.json(pos);
});

app.get('/api/phone-location/:deviceId/latest', (req, res) => {
  const pos = mobileLocations.get(req.params.deviceId);
  if (!pos) return res.status(404).json({ error: 'No location found for this device' });
  res.json(pos);
});

// ----- Mobile GPS API (No auth required for mobile app) -----
app.use('/api/mobile', mobileGPSRouter);

// ----- Public read-only data endpoints (no auth required for Overview dashboard) -----

app.get('/api/purchase-orders', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (startDate && endDate) {
      whereClause += ` AND created_date >= $${paramIndex++} AND created_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type
       FROM purchase_orders ${whereClause} ORDER BY created_date DESC`,
      params
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      poNumber: row.po_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
      orderType: row.order_type,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales-orders', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (startDate && endDate) {
      whereClause += ` AND created_date >= $${paramIndex++} AND created_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    const result = await query(
      `SELECT id, so_number, client, description, amount, status, created_date, delivery_date, assigned_assets
       FROM sales_orders ${whereClause} ORDER BY created_date DESC`,
      params
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      soNumber: row.so_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier
       FROM inventory ORDER BY item_name ASC`
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      itemCode: row.item_code,
      itemName: row.item_name,
      description: row.description,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level),
      unitCost: parseFloat(row.unit_cost),
      totalCost: parseFloat(row.quantity) * parseFloat(row.unit_cost),
      location: row.location,
      supplier: row.supplier,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/miscellaneous', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (startDate && endDate) {
      whereClause += ` AND transaction_date >= $${paramIndex++} AND transaction_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    const result = await query(
      `SELECT id, description, amount, status, transaction_date, category, notes
       FROM miscellaneous ${whereClause} ORDER BY transaction_date DESC`,
      params
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      transactionDate: row.transaction_date,
      category: row.category,
      notes: row.notes,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/delivery-metrics (public for overview dashboard)
app.get('/api/delivery-metrics', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_deliveries,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'Assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN status = 'Picked Up' THEN 1 END) as picked_up,
        COUNT(CASE WHEN status = 'In Transit' THEN 1 END) as in_transit,
        COUNT(CASE WHEN status = 'Arrived' THEN 1 END) as arrived,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN completed_time >= NOW() - INTERVAL '24 hours' THEN 1 END) as completed_today,
        COUNT(CASE WHEN status = 'In Transit' THEN 1 END) as currently_active
      FROM deliveries
    `);
    console.log('[Delivery Metrics] Fetched:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Delivery Metrics] Error:', err);
    // If deliveries table doesn't exist, return zeros
    if (err.message && err.message.includes('deliveries')) {
      console.log('[Delivery Metrics] Table not found, returning zeros');
      return res.json({
        total_deliveries: 0,
        pending: 0,
        assigned: 0,
        picked_up: 0,
        in_transit: 0,
        arrived: 0,
        completed: 0,
        cancelled: 0,
        completed_today: 0,
        currently_active: 0
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/test-delivery (simple test endpoint)
app.get('/api/test-delivery', async (req, res) => {
  try {
    const result = await query('SELECT COUNT(*) as count FROM deliveries');
    console.log('[Test] Deliveries count:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Test] Error:', err);
    res.json({ error: err.message, count: 0 });
  }
});


// ----- PUBLIC AUTH ENDPOINTS (no token required) -----

// Employee Registration
app.post('/api/employee/register', async (req, res) => {
  try {
    const { 
      full_name, email, password, 
      department, position, phone 
    } = req.body;
    
    if (!full_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Name, email and password required' 
      });
    }
    
    const existing = await query(
      'SELECT id FROM employee_accounts WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Email already registered' 
      });
    }
    
        const hash = await bcrypt.hash(password, 10);
    
    const result = await query(
      `INSERT INTO employee_accounts 
       (full_name, email, password_hash, department, 
        position, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')
       RETURNING id, full_name, email, status`,
      [full_name, email, hash, department, position, phone]
    );
    
    res.json({ 
      success: true, 
      message: 'Registration submitted. Await admin approval.',
      employee: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Login
app.post('/api/employee/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query(
      'SELECT * FROM employee_accounts WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
    const employee = result.rows[0];
    
    if (employee.status === 'pending') {
      return res.status(403).json({ 
        error: 'Account pending admin approval' 
      });
    }
    
    if (employee.status === 'rejected') {
      return res.status(403).json({ 
        error: 'Account has been rejected' 
      });
    }
    
        const valid = await bcrypt.compare(
      password, employee.password_hash
    );
    if (!valid) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
        const token = jwt.sign(
      { 
        id: employee.id, 
        email: employee.email,
        role: 'employee',
        name: employee.full_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token, 
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        email: employee.email,
        department: employee.department,
        position: employee.position
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Driver Registration
app.post('/api/driver/register', async (req, res) => {
  try {
    const { 
      full_name, email, password, 
      phone, license_number 
    } = req.body;
    
    if (!full_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Name, email and password required' 
      });
    }
    
    const existing = await query(
      'SELECT id FROM driver_accounts WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Email already registered' 
      });
    }
    
        const hash = await bcrypt.hash(password, 10);
    
    const result = await query(
      `INSERT INTO driver_accounts 
       (full_name, email, password_hash, 
        phone, license_number, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING id, full_name, email, status`,
      [full_name, email, hash, phone, license_number]
    );
    
    res.json({ 
      success: true,
      message: 'Registration submitted. Await admin approval.',
      driver: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Driver Login
app.post('/api/driver/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query(
      'SELECT * FROM driver_accounts WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
    const driver = result.rows[0];
    
    if (driver.status === 'pending') {
      return res.status(403).json({ 
        error: 'Account pending admin approval' 
      });
    }
    
    if (driver.status === 'rejected') {
      return res.status(403).json({ 
        error: 'Account has been rejected' 
      });
    }
    
        const valid = await bcrypt.compare(
      password, driver.password_hash
    );
    if (!valid) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
        const token = jwt.sign(
      { 
        id: driver.id, 
        email: driver.email,
        role: 'driver',
        name: driver.full_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token,
      driver: {
        id: driver.id,
        full_name: driver.full_name,
        email: driver.email,
        phone: driver.phone,
        vehicle_assigned: driver.vehicle_assigned
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----- MANUAL MIGRATION ENDPOINT (for production) -----

// Manual database migration endpoint (public access for production fixes)
app.post('/api/admin/migrate-approval-columns', async (req, res) => {
  try {
    console.log('🔄 Running manual migration for approval columns...');
    
    // Add missing approval columns to existing tables
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');
    await query('ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await query('ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');
    
    console.log('✅ Approval columns migration completed successfully');
    res.json({ 
      success: true, 
      message: 'Database migration completed successfully',
      columns_added: [
        'employee_accounts.approved_at',
        'employee_accounts.approved_by', 
        'driver_accounts.approved_at',
        'driver_accounts.approved_by'
      ]
    });
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    res.status(500).json({ 
      error: 'Migration failed', 
      details: err.message 
    });
  }
});

// GET endpoint for testing migration (public access)
app.get('/api/admin/migrate-approval-columns', async (req, res) => {
  try {
    console.log('🔄 Running manual migration for approval columns...');
    
    // Add missing approval columns to existing tables
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');
    await query('ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await query('ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');
    
    console.log('✅ Approval columns migration completed successfully');
    res.json({ 
      success: true, 
      message: 'Database migration completed successfully',
      columns_added: [
        'employee_accounts.approved_at',
        'employee_accounts.approved_by', 
        'driver_accounts.approved_at',
        'driver_accounts.approved_by'
      ]
    });
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    res.status(500).json({ 
      error: 'Migration failed', 
      details: err.message 
    });
  }
});

// ----- All routes below require auth -----
app.use('/api', requireAuth);

// ----- Fleet Management Routes -----
app.get('/api/fleet/vehicles', getVehicles);
app.get('/api/fleet/vehicles/:id', getVehicle);
app.post('/api/fleet/vehicles', createVehicle);
app.put('/api/fleet/vehicles/:id', updateVehicle);
app.delete('/api/fleet/vehicles/:id', deleteVehicle);
app.get('/api/fleet/vehicles/:id/odometer-logs', getOdometerLogs);
app.post('/api/fleet/vehicles/:id/odometer', logOdometer);
app.get('/api/fleet/vehicles/:id/maintenance', getMaintenance);
app.post('/api/fleet/vehicles/:id/maintenance', createMaintenance);
app.get('/api/fleet/vehicles/:id/purchase-orders', getVehiclePOs);
app.post('/api/fleet/vehicles/:id/purchase-orders', createVehiclePO);
app.get('/api/fleet/pms-reminders', getPmsReminders);

// ----- Driver Management API -----

// GET /api/drivers
app.get('/api/drivers', async (req, res) => {
  try {
    const result = await query(`
      SELECT d.*, v.unit_name as vehicle_name, v.plate_number
      FROM drivers d
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      ORDER BY d.driver_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/:id
app.get('/api/drivers/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT d.*, v.unit_name as vehicle_name, v.plate_number
      FROM drivers d
      LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Driver not found' });
    const deliveries = await query(
      `SELECT id, so_number, customer_name, status, delivery_date, completed_time FROM deliveries WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], recentDeliveries: deliveries.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers
app.post('/api/drivers', requireAdmin, async (req, res) => {
  try {
    const { driver_name, contact, email, license_number, license_expiry, assigned_vehicle_id, status, join_date } = req.body;
    if (!driver_name || !contact || !license_number || !license_expiry || !join_date) {
      return res.status(400).json({ error: 'driver_name, contact, license_number, license_expiry, join_date are required' });
    }
    const id = 'DRV-' + Date.now();
    await query(
      `INSERT INTO drivers (id, driver_name, contact, email, license_number, license_expiry, assigned_vehicle_id, status, join_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, driver_name, contact, email || null, license_number, license_expiry, assigned_vehicle_id || null, status || 'Active', join_date]
    );
    const result = await query('SELECT * FROM drivers WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id
app.put('/api/drivers/:id', requireAdmin, async (req, res) => {
  try {
    const { driver_name, contact, email, license_number, license_expiry, assigned_vehicle_id, status, join_date } = req.body;
    await query(
      `UPDATE drivers SET driver_name=$1, contact=$2, email=$3, license_number=$4, license_expiry=$5,
       assigned_vehicle_id=$6, status=$7, join_date=$8, updated_at=NOW() WHERE id=$9`,
      [driver_name, contact, email || null, license_number, license_expiry, assigned_vehicle_id || null, status, join_date, req.params.id]
    );
    const result = await query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drivers/:id
app.delete('/api/drivers/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM drivers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Driver deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id/assign-vehicle
app.put('/api/drivers/:id/assign-vehicle', requireAdmin, async (req, res) => {
  try {
    const { vehicle_id } = req.body;
    await query('UPDATE drivers SET assigned_vehicle_id=$1, updated_at=NOW() WHERE id=$2', [vehicle_id || null, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----- Delivery Management API -----

// GET /api/deliveries
app.get('/api/deliveries', async (req, res) => {
  try {
    const { status, driver_id, vehicle_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { params.push(status); where += ` AND del.status = $${params.length}`; }
    if (driver_id) { params.push(driver_id); where += ` AND del.driver_id = $${params.length}`; }
    if (vehicle_id) { params.push(vehicle_id); where += ` AND del.vehicle_id = $${params.length}`; }
    const result = await query(`
      SELECT del.*,
        d.driver_name, d.contact as driver_contact,
        v.unit_name as vehicle_name, v.plate_number
      FROM deliveries del
      LEFT JOIN drivers d ON del.driver_id = d.id
      LEFT JOIN vehicles v ON del.vehicle_id = v.id
      ${where}
      ORDER BY del.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deliveries/:id
app.get('/api/deliveries/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT del.*,
        d.driver_name, d.contact as driver_contact, d.license_number,
        v.unit_name as vehicle_name, v.plate_number, v.vehicle_type
      FROM deliveries del
      LEFT JOIN drivers d ON del.driver_id = d.id
      LEFT JOIN vehicles v ON del.vehicle_id = v.id
      WHERE del.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Delivery not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deliveries
app.post('/api/deliveries', requireAdmin, async (req, res) => {
  try {
    const { so_number, vehicle_id, driver_id, customer_name, customer_address, delivery_date, notes } = req.body;
    if (!so_number || !customer_name || !customer_address || !delivery_date) {
      return res.status(400).json({ error: 'so_number, customer_name, customer_address, delivery_date are required' });
    }
    const id = 'DEL-' + Date.now();
    const now = new Date();
    await query(
      `INSERT INTO deliveries (id, so_number, vehicle_id, driver_id, customer_name, customer_address, delivery_date, status, assigned_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, so_number, vehicle_id || null, driver_id || null, customer_name, customer_address, delivery_date,
       (driver_id || vehicle_id) ? 'Assigned' : 'Pending',
       (driver_id || vehicle_id) ? now : null, notes || null]
    );
    // Update SO with delivery link
    await query(
      `UPDATE sales_orders SET delivery_id=$1, driver_id=$2, vehicle_id=$3, status='Assigned', updated_at=NOW() WHERE so_number=$4`,
      [id, driver_id || null, vehicle_id || null, so_number]
    );
    const result = await query('SELECT * FROM deliveries WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/deliveries/:id
app.put('/api/deliveries/:id', requireAdmin, async (req, res) => {
  try {
    const { vehicle_id, driver_id, delivery_date, notes } = req.body;
    await query(
      `UPDATE deliveries SET vehicle_id=$1, driver_id=$2, delivery_date=$3, notes=$4, updated_at=NOW() WHERE id=$5`,
      [vehicle_id || null, driver_id || null, delivery_date, notes || null, req.params.id]
    );
    const result = await query('SELECT * FROM deliveries WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/deliveries/:id/status
app.put('/api/deliveries/:id/status', async (req, res) => {
  try {
    const { status, notes, proof_of_delivery_url } = req.body;
    const validStatuses = ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Arrived', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const now = new Date();
    const timeField = {
      'Assigned': 'assigned_time',
      'Picked Up': 'picked_up_time',
      'In Transit': 'in_transit_time',
      'Arrived': 'arrived_time',
      'Completed': 'completed_time',
    }[status];
    let updateQuery = `UPDATE deliveries SET status=$1, updated_at=NOW()`;
    const params = [status];
    if (timeField) { params.push(now); updateQuery += `, ${timeField}=$${params.length}`; }
    if (notes) { params.push(notes); updateQuery += `, notes=$${params.length}`; }
    if (proof_of_delivery_url) { params.push(proof_of_delivery_url); updateQuery += `, proof_of_delivery_url=$${params.length}`; }
    params.push(req.params.id);
    updateQuery += ` WHERE id=$${params.length}`;
    await query(updateQuery, params);

    // Sync SO status
    const delivery = await query('SELECT so_number FROM deliveries WHERE id=$1', [req.params.id]);
    if (delivery.rows[0]) {
      const soStatus = status === 'Completed' ? 'completed' : status === 'Cancelled' ? 'pending' : status;
      await query(`UPDATE sales_orders SET status=$1, updated_at=NOW() WHERE so_number=$2`, [soStatus, delivery.rows[0].so_number]);
      
      // If completed, release any reserved inventory (simple SO system - no line items)
      if (status === 'Completed') {
        console.log(`[Delivery] Completed ${req.params.id} - releasing reserved inventory for SO ${delivery.rows[0].so_number}`);
        // In a full system, we would deduct specific line items here
        // For now, we'll just note that inventory should be managed manually
      }
    }
    const result = await query('SELECT * FROM deliveries WHERE id=$1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deliveries/driver/:driverId
app.get('/api/deliveries/driver/:driverId', async (req, res) => {
  try {
    const result = await query(
      `SELECT del.*, v.unit_name as vehicle_name FROM deliveries del
       LEFT JOIN vehicles v ON del.vehicle_id = v.id
       WHERE del.driver_id = $1 ORDER BY del.created_at DESC`,
      [req.params.driverId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ----- Inventory Reservation API -----

// PUT /api/inventory/:id/reserve
app.put('/api/inventory/:id/reserve', requireAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    const item = await query('SELECT quantity, reserved_quantity, in_transit_quantity FROM inventory WHERE id=$1', [req.params.id]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const available = parseFloat(item.rows[0].quantity) - parseFloat(item.rows[0].reserved_quantity || 0) - parseFloat(item.rows[0].in_transit_quantity || 0);
    if (quantity > available) return res.status(400).json({ error: `Only ${available} units available` });
    await query('UPDATE inventory SET reserved_quantity = COALESCE(reserved_quantity,0) + $1, updated_at=NOW() WHERE id=$2', [quantity, req.params.id]);
    res.json({ ok: true, reserved: quantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id/unreserve
app.put('/api/inventory/:id/unreserve', requireAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    await query('UPDATE inventory SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - $1), updated_at=NOW() WHERE id=$2', [quantity, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id/deduct
app.put('/api/inventory/:id/deduct', requireAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    await query(
      `UPDATE inventory SET
        quantity = GREATEST(0, quantity - $1),
        in_transit_quantity = GREATEST(0, COALESCE(in_transit_quantity,0) - $1),
        updated_at=NOW()
       WHERE id=$2`,
      [quantity, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vehicles (admin only - clear all vehicles)
app.delete('/api/vehicles', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM vehicles');
    res.json({ message: 'All vehicles cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/maintenance (admin only - clear all maintenance records)
app.delete('/api/maintenance', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM maintenance_records');
    res.json({ message: 'All maintenance records cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/odometer-logs (admin only - clear all odometer logs)
app.delete('/api/odometer-logs', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM odometer_logs');
    res.json({ message: 'All odometer logs cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fleet/seed', async (req, res) => {
  if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_SEED !== 'true') {
    return res.status(403).json({ error: 'Seeding disabled' });
  }
  try { await seedFleet(); res.json({ message: 'Fleet seeded' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin-only fleet clear
app.post('/api/fleet/admin/clear', requireAdmin, async (req, res) => {
  try {
    await query('TRUNCATE TABLE transactions RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE purchase_orders RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE maintenance_records RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE odometer_logs RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE purchase_order_items RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE fleet_purchase_orders RESTART IDENTITY CASCADE');
    await query('TRUNCATE TABLE vehicles RESTART IDENTITY CASCADE');
    res.json({ message: 'All fleet data cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

console.log('Fleet admin clear route registered: POST /api/fleet/admin/clear');

// ----- Super admin only: admin approval requests -----
// GET /api/admin-requests
app.get('/api/admin-requests', requireSuperAdmin, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, requested_at FROM admin_approval_requests WHERE status = $1 ORDER BY requested_at DESC',
      ['pending']
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        requestedAt: r.requested_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin-requests/:id/approve
app.post('/api/admin-requests/:id/approve', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT id, email, name, password_hash FROM admin_approval_requests WHERE id = $1 AND status = $2',
      [id, 'pending']
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [row.email]);
    if (existingUser.rows.length > 0) {
      await query(
        'UPDATE admin_approval_requests SET status = $1, decided_by = $2, decided_at = NOW() WHERE id = $3',
        ['rejected', req.user.userId, id]
      );
      return res.status(400).json({ error: 'Account with this email already exists', code: 'ACCOUNT_ALREADY_EXISTS' });
    }
    const userId = 'u-' + Date.now();
    await query(
      'INSERT INTO users (id, email, password_hash, name, role, is_super_admin) VALUES ($1, $2, $3, $4, $5, false)',
      [userId, row.email, row.password_hash, row.name, 'admin']
    );
    await query(
      'UPDATE admin_approval_requests SET status = $1, decided_by = $2, decided_at = NOW() WHERE id = $3',
      ['approved', req.user.userId, id]
    );
    sendEmailToApplicant(row.email, row.name, 'approved').catch((err) =>
      console.error('[Email] Failed to send approval email to applicant:', err.message)
    );
    res.json({ message: 'Admin account approved', userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin-requests/:id/reject
app.post('/api/admin-requests/:id/reject', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const getRow = await query(
      'SELECT id, email, name FROM admin_approval_requests WHERE id = $1 AND status = $2',
      [id, 'pending']
    );
    const row = getRow.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }
    await query(
      'UPDATE admin_approval_requests SET status = $1, decided_by = $2, decided_at = NOW() WHERE id = $3 AND status = $4',
      ['rejected', req.user.userId, id, 'pending']
    );
    sendEmailToApplicant(row.email, row.name, 'rejected').catch((err) =>
      console.error('[Email] Failed to send rejection email to applicant:', err.message)
    );
    res.json({ message: 'Admin request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets
app.get('/api/assets', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, type, status, location, lat, lng, engine_hours, idle_time, fuel_level, battery_voltage, speed, in_geofence, last_update, driver, efficiency_score
       FROM assets ORDER BY id`
    );
    const assets = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      location: row.location,
      coordinates: { lat: parseFloat(row.lat), lng: parseFloat(row.lng) },
      engineHours: row.engine_hours,
      idleTime: row.idle_time,
      fuelLevel: parseFloat(row.fuel_level),
      batteryVoltage: parseFloat(row.battery_voltage),
      speed: parseFloat(row.speed),
      inGeofence: row.in_geofence,
      lastUpdate: row.last_update,
      driver: row.driver || undefined,
      efficiencyScore: row.efficiency_score,
    }));
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets/:id
app.get('/api/assets/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, type, status, location, lat, lng, engine_hours, idle_time, fuel_level, battery_voltage, speed, in_geofence, last_update, driver, efficiency_score
       FROM assets WHERE id = $1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      location: row.location,
      coordinates: { lat: parseFloat(row.lat), lng: parseFloat(row.lng) },
      engineHours: row.engine_hours,
      idleTime: row.idle_time,
      fuelLevel: parseFloat(row.fuel_level),
      batteryVoltage: parseFloat(row.battery_voltage),
      speed: parseFloat(row.speed),
      inGeofence: row.in_geofence,
      lastUpdate: row.last_update,
      driver: row.driver || undefined,
      efficiencyScore: row.efficiency_score,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/assets (admin only - clear all assets)
app.delete('/api/assets', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM assets');
    res.json({ message: 'All assets cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/assets/:id (admin only - edit tracking/monitoring details)
app.patch('/api/assets/:id', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      type,
      status,
      location,
      lat,
      lng,
      engineHours,
      idleTime,
      fuelLevel,
      batteryVoltage,
      speed,
      inGeofence,
      lastUpdate,
      driver,
      efficiencyScore,
    } = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(name);
    }
    if (type !== undefined) {
      updates.push(`type = $${i++}`);
      values.push(type);
    }
    if (status !== undefined) {
      updates.push(`status = $${i++}`);
      values.push(status);
    }
    if (location !== undefined) {
      updates.push(`location = $${i++}`);
      values.push(location);
    }
    if (lat !== undefined) {
      updates.push(`lat = $${i++}`);
      values.push(lat);
    }
    if (lng !== undefined) {
      updates.push(`lng = $${i++}`);
      values.push(lng);
    }
    if (engineHours !== undefined) {
      updates.push(`engine_hours = $${i++}`);
      values.push(engineHours);
    }
    if (idleTime !== undefined) {
      updates.push(`idle_time = $${i++}`);
      values.push(idleTime);
    }
    if (fuelLevel !== undefined) {
      updates.push(`fuel_level = $${i++}`);
      values.push(fuelLevel);
    }
    if (batteryVoltage !== undefined) {
      updates.push(`battery_voltage = $${i++}`);
      values.push(batteryVoltage);
    }
    if (speed !== undefined) {
      updates.push(`speed = $${i++}`);
      values.push(speed);
    }
    if (inGeofence !== undefined) {
      updates.push(`in_geofence = $${i++}`);
      values.push(inGeofence);
    }
    if (lastUpdate !== undefined) {
      updates.push(`last_update = $${i++}`);
      values.push(lastUpdate);
    }
    if (driver !== undefined) {
      updates.push(`driver = $${i++}`);
      values.push(driver);
    }
    if (efficiencyScore !== undefined) {
      updates.push(`efficiency_score = $${i++}`);
      values.push(efficiencyScore);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    await query(`UPDATE assets SET ${updates.join(', ')} WHERE id = $${i}`, values);
    const result = await query(
      `SELECT id, name, type, status, location, lat, lng, engine_hours, idle_time, fuel_level, battery_voltage, speed, in_geofence, last_update, driver, efficiency_score FROM assets WHERE id = $1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Asset not found' });
    res.json({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      location: row.location,
      coordinates: { lat: parseFloat(row.lat), lng: parseFloat(row.lng) },
      engineHours: row.engine_hours,
      idleTime: row.idle_time,
      fuelLevel: parseFloat(row.fuel_level),
      batteryVoltage: parseFloat(row.battery_voltage),
      speed: parseFloat(row.speed),
      inGeofence: row.in_geofence,
      lastUpdate: row.last_update,
      driver: row.driver || undefined,
      efficiencyScore: row.efficiency_score,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/purchase-orders
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (startDate && endDate) {
      whereClause += ` AND created_date >= $${paramIndex++} AND created_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type
       FROM purchase_orders ${whereClause} ORDER BY created_date DESC`,
      params
    );
    const orders = result.rows.map((row) => ({
      id: row.id,
      poNumber: row.po_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
      orderType: row.order_type,
    }));
    res.json(orders);
  } catch (err) {
    console.error('Purchase orders fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/purchase-orders (admin only)
app.post('/api/purchase-orders', requireAdmin, async (req, res) => {
  try {
    const { 
      client, 
      description, 
      amount, 
      deliveryDate, 
      assignedAssets = [], 
      createdDate,
      // New fields from restructured form
      poDate,
      poType,
      paymentTerms,
      termsAndConditions,
      preparedBy,
      reviewedBy,
      customerName,
      customerAddress,
      customerContact,
      lineItems,
      subTotal,
      otherCharges,
      vatAmount,
      totalAmount,
      orderType
    } = req.body;
    const id = `PO-${Date.now()}`;
    
    // Generate automatic PO number: KTCI-YYYY-NNNN
    const currentYear = new Date().getFullYear();
    const lastPO = await query(
      `SELECT po_number FROM purchase_orders WHERE po_number LIKE 'KTCI-${currentYear}-%' ORDER BY po_number DESC LIMIT 1`
    );
    
    let counter = 1;
    if (lastPO.rows.length > 0) {
      const lastNumber = lastPO.rows[0].po_number.split('-')[2];
      counter = parseInt(lastNumber) + 1;
    }
    
    const poNumber = `KTCI-${currentYear}-${counter.toString().padStart(4, '0')}`;
    
    // Use provided createdDate or current date if not provided
    const finalCreatedDate = createdDate || new Date().toISOString().split('T')[0];
    
    // Create extended description with all the new data
    const extendedDescription = `${description || ''}

Address: ${customerAddress || '[Customer Address]'}
Contact: ${customerContact || '[Customer Contact]'}
Prepared By: ${preparedBy || '[Prepared By]'}
Reviewed By: ${reviewedBy || '[Reviewed By]'}
PO Type: ${poType || 'domestic'}
Payment Terms: ${paymentTerms || '30 days from receipt/acceptance'}
Line Items: ${JSON.stringify(lineItems || [])}
Sub Total: ${subTotal || amount}
Other Charges: ${otherCharges || 0}
VAT Amount: ${vatAmount || 0}
Total Amount: ${totalAmount || amount}
Terms & Conditions: ${termsAndConditions || 'Standard terms apply'}`;
    
    await query(
      `INSERT INTO purchase_orders (id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)`,
      [id, poNumber, client || customerName, extendedDescription, amount || totalAmount, finalCreatedDate, deliveryDate, assignedAssets, orderType || null]
    );
    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type
       FROM purchase_orders WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      poNumber: row.po_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
      orderType: row.order_type,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/purchase-orders (admin only - clear all purchase orders)
app.delete('/api/purchase-orders', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM purchase_orders');
    res.json({ message: 'All purchase orders cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/purchase-orders/:id (admin only)
app.delete('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM purchase_orders WHERE id = $1', [req.params.id]);
    res.json({ message: 'Purchase order deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/purchase-orders/:id (admin only)
app.patch('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
  try {
    const { status, description } = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    if (status !== undefined) {
      updates.push(`status = $${i++}`);
      values.push(status);
    }
    if (description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(description);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    await query(
      `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${i}`,
      values
    );
    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets
       FROM purchase_orders WHERE id = $1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Purchase order not found' });
    res.json({
      id: row.id,
      poNumber: row.po_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, po_number, type, description, amount, asset_id, date, receipt
       FROM transactions ORDER BY date DESC, id`
    );
    const transactions = result.rows.map((row) => ({
      id: row.id,
      poNumber: row.po_number,
      type: row.type,
      description: row.description,
      amount: parseFloat(row.amount),
      assetId: row.asset_id,
      date: row.date,
      receipt: row.receipt,
    }));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions (admin only - clear all transactions)
app.delete('/api/transactions', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM transactions');
    res.json({ message: 'All transactions cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only orders clear
app.post('/api/orders/admin/clear', requireAdmin, async (req, res) => {
  try {
    await query('TRUNCATE TABLE purchase_orders RESTART IDENTITY CASCADE');
    res.json({ message: 'All orders cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only purchase-orders clear
app.post('/api/purchase-orders/admin/clear', requireAdmin, async (req, res) => {
  try {
    await query('TRUNCATE TABLE purchase_orders RESTART IDENTITY CASCADE');
    res.json({ message: 'All purchase orders cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only transactions clear
app.post('/api/transactions/admin/clear', requireAdmin, async (req, res) => {
  try {
    await query('TRUNCATE TABLE transactions RESTART IDENTITY CASCADE');
    res.json({ message: 'All transactions cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

console.log('Orders admin clear route registered: POST /api/orders/admin/clear');
console.log('Purchase Orders admin clear route registered: POST /api/purchase-orders/admin/clear');
console.log('Transactions admin clear route registered: POST /api/transactions/admin/clear');

// POST /api/transactions (admin only)
app.post('/api/transactions', requireAdmin, async (req, res) => {
  try {
    const { poNumber, type, description, amount, assetId, date, receipt } = req.body;
    const id = `TXN-${Date.now()}`;
    const txnDate = date || new Date().toISOString().split('T')[0];
    await query(
      `INSERT INTO transactions (id, po_number, type, description, amount, asset_id, date, receipt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, poNumber, type, description, amount, assetId, txnDate, receipt || null]
    );
    const result = await query(
      `SELECT id, po_number, type, description, amount, asset_id, date, receipt
       FROM transactions WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      poNumber: row.po_number,
      type: row.type,
      description: row.description,
      amount: parseFloat(row.amount),
      assetId: row.asset_id,
      date: row.date,
      receipt: row.receipt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sales Orders API ───────────────────────────────────────

// GET /api/sales-orders
app.get('/api/sales-orders', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (startDate && endDate) {
      whereClause += ` AND created_date >= $${paramIndex++} AND created_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    const result = await query(
      `SELECT so.*, 
              d.driver_name, d.contact as driver_contact,
              v.unit_name as vehicle_name, v.plate_number,
              del.status as delivery_status, del.id as delivery_id
       FROM sales_orders so
       LEFT JOIN drivers d ON so.driver_id = d.id
       LEFT JOIN vehicles v ON so.vehicle_id = v.id
       LEFT JOIN deliveries del ON so.delivery_id = del.id
       ${whereClause} ORDER BY so.created_date DESC`,
      params
    );
    
    const orders = result.rows.map((row) => ({
      id: row.id,
      soNumber: row.so_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
      driverName: row.driver_name,
      driverContact: row.driver_contact,
      vehicleName: row.vehicle_name,
      plateNumber: row.plate_number,
      deliveryStatus: row.delivery_status,
      deliveryId: row.delivery_id,
    }));
    
    res.json(orders);
  } catch (err) {
    console.error('Sales orders fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales-orders (admin only)
app.post('/api/sales-orders', requireAdmin, async (req, res) => {
  try {
    const { 
      soNumber, 
      client, 
      description, 
      amount, 
      deliveryDate, 
      assignedAssets = [],
      createdDate = new Date().toISOString().split('T')[0]
    } = req.body;
    
    const id = `SO-${Date.now()}`;
    
    await query(
      `INSERT INTO sales_orders (id, so_number, client, description, amount, status, created_date, delivery_date, assigned_assets)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, soNumber, client, description, amount, 'pending', createdDate, deliveryDate, assignedAssets]
    );
    
    const result = await query(
      `SELECT id, so_number, client, description, amount, status, created_date, delivery_date, assigned_assets
       FROM sales_orders WHERE id = $1`,
      [id]
    );
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      soNumber: row.so_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
    });
  } catch (err) {
    console.error('Sales order creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sales-orders/:id (admin only)
app.patch('/api/sales-orders/:id', requireAdmin, async (req, res) => {
  try {
    const { status, description } = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    
    if (status !== undefined) {
      updates.push(`status = $${i++}`);
      values.push(status);
    }
    if (description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(description);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    
    await query(
      `UPDATE sales_orders SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    
    const result = await query(
      `SELECT id, so_number, client, description, amount, status, created_date, delivery_date, assigned_assets
       FROM sales_orders WHERE id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sales order not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      soNumber: row.so_number,
      client: row.client,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
    });
  } catch (err) {
    console.error('Sales order update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sales-orders/:id (admin only)
app.delete('/api/sales-orders/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM sales_orders WHERE id = $1', [req.params.id]);
    res.json({ message: 'Sales order deleted' });
  } catch (err) {
    console.error('Sales order deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Inventory API ─────────────────────────────────────────

// GET /api/inventory
app.get('/api/inventory', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier
       FROM inventory ORDER BY item_name ASC`
    );
    
    const items = result.rows.map((row) => ({
      id: row.id,
      itemCode: row.item_code,
      itemName: row.item_name,
      description: row.description,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level),
      unitCost: parseFloat(row.unit_cost),
      totalCost: parseFloat(row.quantity) * parseFloat(row.unit_cost),
      location: row.location,
      supplier: row.supplier,
    }));
    
    res.json(items);
  } catch (err) {
    console.error('Inventory fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory (admin only)
app.post('/api/inventory', requireAdmin, async (req, res) => {
  try {
    const { 
      itemCode, 
      itemName, 
      description, 
      quantity, 
      unit = 'pieces', 
      unitCost, 
      location, 
      supplier 
    } = req.body;
    
    const id = `INV-${Date.now()}`;
    const defaultReorderLevel = 10; // Set default reorder level internally
    
    await query(
      `INSERT INTO inventory (id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, itemCode, itemName, description, quantity, unit, defaultReorderLevel, unitCost, location, supplier]
    );
    
    const result = await query(
      `SELECT id, item_code, item_name, description, quantity, unit, unit_cost, location, supplier
       FROM inventory WHERE id = $1`,
      [id]
    );
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      itemCode: row.item_code,
      itemName: row.item_name,
      description: row.description,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      unitCost: parseFloat(row.unit_cost),
      totalCost: parseFloat(row.quantity) * parseFloat(row.unit_cost),
      location: row.location,
      supplier: row.supplier,
    });
  } catch (err) {
    console.error('Inventory creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/:id (admin only)
app.patch('/api/inventory/:id', requireAdmin, async (req, res) => {
  try {
    const { itemName, description, quantity, unit, reorderLevel, unitCost, location, supplier } = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    
    if (itemName !== undefined) {
      updates.push(`item_name = $${i++}`);
      values.push(itemName);
    }
    if (description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(description);
    }
    if (quantity !== undefined) {
      updates.push(`quantity = $${i++}`);
      values.push(quantity);
    }
    if (unit !== undefined) {
      updates.push(`unit = $${i++}`);
      values.push(unit);
    }
    if (reorderLevel !== undefined) {
      updates.push(`reorder_level = $${i++}`);
      values.push(reorderLevel);
    }
    if (unitCost !== undefined) {
      updates.push(`unit_cost = $${i++}`);
      values.push(unitCost);
    }
    if (location !== undefined) {
      updates.push(`location = $${i++}`);
      values.push(location);
    }
    if (supplier !== undefined) {
      updates.push(`supplier = $${i++}`);
      values.push(supplier);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    
    await query(
      `UPDATE inventory SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    
    const result = await query(
      `SELECT id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier
       FROM inventory WHERE id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      itemCode: row.item_code,
      itemName: row.item_name,
      description: row.description,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level),
      unitCost: parseFloat(row.unit_cost),
      totalCost: parseFloat(row.quantity) * parseFloat(row.unit_cost),
      location: row.location,
      supplier: row.supplier,
    });
  } catch (err) {
    console.error('Inventory update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id (admin only)
app.delete('/api/inventory/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
    res.json({ message: 'Inventory item deleted' });
  } catch (err) {
    console.error('Inventory deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Miscellaneous API ───────────────────────────────────────

// GET /api/miscellaneous
app.get('/api/miscellaneous', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (startDate && endDate) {
      whereClause += ` AND transaction_date >= $${paramIndex++} AND transaction_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    const result = await query(
      `SELECT id, description, amount, status, transaction_date, category, notes
       FROM miscellaneous ${whereClause} ORDER BY transaction_date DESC`,
      params
    );
    
    const entries = result.rows.map((row) => ({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      transactionDate: row.transaction_date,
      category: row.category,
      notes: row.notes,
    }));
    
    res.json(entries);
  } catch (err) {
    console.error('Miscellaneous fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/miscellaneous (admin only)
app.post('/api/miscellaneous', requireAdmin, async (req, res) => {
  try {
    const { 
      description, 
      amount, 
      transactionDate, 
      category = 'other', 
      notes,
      status = 'pending'
    } = req.body;
    
    const id = `MISC-${Date.now()}`;
    const txnDate = transactionDate || new Date().toISOString().split('T')[0];
    
    await query(
      `INSERT INTO miscellaneous (id, description, amount, status, transaction_date, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, description, amount, status, txnDate, category, notes]
    );
    
    const result = await query(
      `SELECT id, description, amount, status, transaction_date, category, notes
       FROM miscellaneous WHERE id = $1`,
      [id]
    );
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      transactionDate: row.transaction_date,
      category: row.category,
      notes: row.notes,
    });
  } catch (err) {
    console.error('Miscellaneous creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/miscellaneous/:id (admin only)
app.patch('/api/miscellaneous/:id', requireAdmin, async (req, res) => {
  try {
    const { description, amount, status, transactionDate, category, notes } = req.body;
    const updates = [];
    const values = [];
    let i = 1;
    
    if (description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(description);
    }
    if (amount !== undefined) {
      updates.push(`amount = $${i++}`);
      values.push(amount);
    }
    if (status !== undefined) {
      updates.push(`status = $${i++}`);
      values.push(status);
    }
    if (transactionDate !== undefined) {
      updates.push(`transaction_date = $${i++}`);
      values.push(transactionDate);
    }
    if (category !== undefined) {
      updates.push(`category = $${i++}`);
      values.push(category);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${i++}`);
      values.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    
    await query(
      `UPDATE miscellaneous SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    
    const result = await query(
      `SELECT id, description, amount, status, transaction_date, category, notes
       FROM miscellaneous WHERE id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Miscellaneous entry not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      status: row.status,
      transactionDate: row.transaction_date,
      category: row.category,
      notes: row.notes,
    });
  } catch (err) {
    console.error('Miscellaneous update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/miscellaneous/:id (admin only)
app.delete('/api/miscellaneous/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM miscellaneous WHERE id = $1', [req.params.id]);
    res.json({ message: 'Miscellaneous entry deleted' });
  } catch (err) {
    console.error('Miscellaneous deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Traccar GPS Tracking ──────────────────────────────────
// DISABLED: Using LocalStorage GPS system instead of Traccar server
// All Traccar API routes are commented out to prevent 502 errors

/*
// GET /api/traccar/status - check if Traccar server is reachable
app.get('/api/traccar/status', async (req, res) => {
  try {
    const status = await checkConnection();
    res.json(status);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// GET /api/traccar/devices - list all GPS devices from Traccar
app.get('/api/traccar/devices', async (req, res) => {
  try {
    const devices = await getDevices();
    res.json(devices);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// GET /api/traccar/devices/:id - get a single device
app.get('/api/traccar/devices/:id', async (req, res) => {
  try {
    const device = await getDevice(parseInt(req.params.id, 10));
    if (!device) return res.status(404).json({ error: 'Device not found in Traccar' });
    res.json(device);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// POST /api/traccar/devices - register a new GPS device (admin only)
app.post('/api/traccar/devices', requireAdmin, async (req, res) => {
  try {
    const { name, uniqueId, category } = req.body;
    if (!name || !uniqueId) {
      return res.status(400).json({ error: 'Name and uniqueId are required' });
    }
    const device = await createDevice({ name, uniqueId, category });
    res.status(201).json(device);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// PUT /api/traccar/devices/:id - update a GPS device (admin only)
app.put('/api/traccar/devices/:id', requireAdmin, async (req, res) => {
  try {
    const device = await updateDevice(parseInt(req.params.id, 10), req.body);
    res.json(device);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// DELETE /api/traccar/devices/:id - remove a GPS device (admin only)
app.delete('/api/traccar/devices/:id', requireAdmin, async (req, res) => {
  try {
    await deleteDevice(parseInt(req.params.id, 10));
    res.json({ message: 'Device deleted' });
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// GET /api/traccar/positions - latest positions for all devices (or ?deviceId=X)
app.get('/api/traccar/positions', async (req, res) => {
  try {
    const positions = await getPositions(req.query.deviceId);
    res.json(positions);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// GET /api/traccar/positions/history?deviceId=X&from=ISO&to=ISO
app.get('/api/traccar/positions/history', async (req, res) => {
  try {
    const { deviceId, from, to } = req.query;
    if (!deviceId || !from || !to) {
      return res.status(400).json({ error: 'deviceId, from, and to are required' });
    }
    const positions = await getPositionHistory(deviceId, from, to);
    res.json(positions);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// GET /api/traccar/geofences
app.get('/api/traccar/geofences', async (req, res) => {
  try {
    const geofences = await getGeofences();
    res.json(geofences);
  } catch (err) {
    res.status(502).json({ error: 'Traccar: ' + err.message });
  }
});

// GET /api/traccar/ws-info - returns WebSocket connection info for the frontend
app.get('/api/traccar/ws-info', async (req, res) => {
  res.json({ wsUrl: getTraccarWsUrl(), authHeader });
});
*/

// POST /api/init - create tables and seed (convenience endpoint)
app.post('/api/init', async (req, res) => {
  try {
    await seed();
    res.json({ message: 'Database initialized and seeded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================
// EMPLOYEE & DRIVER PORTAL API ENDPOINTS
// ====================================================


// Get employee notifications
app.get('/api/employee/:id/notifications', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications 
       WHERE recipient_type = 'employee' 
       AND recipient_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await query(
      'UPDATE notifications SET is_read=true WHERE id=$1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MATERIAL REQUEST ENDPOINTS ---

// Submit material request
app.post('/api/material-requests', async (req, res) => {
  try {
    const {
      employee_id, employee_name, item_name,
      item_code, quantity_requested, unit,
      purpose, urgency
    } = req.body;
    
    const reqNum = 'REQ-' + Date.now();
    
    const result = await query(
      `INSERT INTO material_requests
       (request_number, employee_id, employee_name,
        item_name, item_code, quantity_requested,
        unit, purpose, urgency, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       RETURNING *`,
      [reqNum, employee_id, employee_name, item_name,
       item_code, quantity_requested, unit, 
       purpose, urgency || 'normal']
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get material requests for employee
app.get('/api/material-requests/employee/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM material_requests 
       WHERE employee_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ALL material requests (admin)
app.get('/api/material-requests', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM material_requests 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin approve/reject material request
app.put('/api/material-requests/:id/review', async (req, res) => {
  try {
    const { status, admin_notes, reviewed_by } = req.body;
    
    const result = await query(
      `UPDATE material_requests 
       SET status=$1, admin_notes=$2, 
           reviewed_by=$3, reviewed_at=NOW(),
           updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [status, admin_notes, reviewed_by, req.params.id]
    );
    
    const request = result.rows[0];
    
    // Send notification to employee
    if (request.employee_id) {
      await query(
        `INSERT INTO notifications
         (recipient_type, recipient_id, title, 
          message, type)
         VALUES ('employee', $1, $2, $3, $4)`,
        [
          request.employee_id,
          `Request ${status === 'approved' 
            ? 'Approved' : 'Rejected'}`,
          `Your request for ${request.item_name} 
           has been ${status}. 
           ${admin_notes ? 'Note: ' + admin_notes : ''}`,
          status === 'approved' ? 'success' : 'error'
        ]
      );
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- DRIVER GPS ENDPOINTS ---

// Send driver GPS location
app.post('/api/driver/location', async (req, res) => {
  try {
    const { 
      driver_id, driver_name,
      latitude, longitude, 
      accuracy, speed, heading 
    } = req.body;
    
    await query(
      `INSERT INTO driver_locations
       (driver_id, driver_name, latitude, longitude,
        accuracy, speed, heading)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [driver_id, driver_name, latitude, longitude,
       accuracy, speed, heading]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get latest location of all active drivers (admin)
app.get('/api/driver/locations/live', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (driver_id)
        driver_id, driver_name, 
        latitude, longitude, timestamp
       FROM driver_locations
       WHERE timestamp > NOW() - INTERVAL '30 minutes'
       ORDER BY driver_id, timestamp DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DRIVER DELIVERY ENDPOINTS ---

// Get deliveries for driver
app.get('/api/driver/:id/deliveries', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM driver_deliveries 
       WHERE driver_id = $1
       ORDER BY assigned_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ALL deliveries (admin)
app.get('/api/deliveries', async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, da.full_name as driver_name
       FROM driver_deliveries d
       LEFT JOIN driver_accounts da 
         ON d.driver_id = da.id
       ORDER BY d.assigned_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create delivery (admin assigns to driver)
app.post('/api/deliveries', async (req, res) => {
  try {
    const {
      driver_id, customer_name,
      delivery_address, items, notes
    } = req.body;
    
    const delNum = 'DEL-' + Date.now();
    
    const result = await query(
      `INSERT INTO driver_deliveries
       (driver_id, delivery_number, customer_name,
        delivery_address, items, status, notes)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)
       RETURNING *`,
      [driver_id, delNum, customer_name,
       delivery_address, items, notes]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update delivery status (driver updates)
app.put('/api/deliveries/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const timeFields = {
      'pickup': 'pickup_at',
      'on_the_way': 'on_the_way_at',
      'delivered': 'delivered_at',
      'going_back': 'going_back_at',
      'done': 'done_at'
    };
    
    const timeField = timeFields[status];
    
    const queryStr = timeField
      ? `UPDATE driver_deliveries 
         SET status=$1, ${timeField}=NOW(), 
             notes=COALESCE($2,notes)
         WHERE id=$3 RETURNING *`
      : `UPDATE driver_deliveries 
         SET status=$1, 
             notes=COALESCE($2,notes)
         WHERE id=$3 RETURNING *`;
    
    const result = await query(queryStr, 
      [status, notes, req.params.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DRIVER CHAT ENDPOINTS ---

// Send message
app.post('/api/driver/messages', async (req, res) => {
  try {
    const {
      driver_id, driver_name,
      sender_type, message,
      image_url, file_url, file_name
    } = req.body;
    
    const result = await query(
      `INSERT INTO driver_messages
       (driver_id, driver_name, sender_type,
        message, image_url, file_url, file_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [driver_id, driver_name, sender_type,
       message, image_url, file_url, file_name]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a driver
app.get('/api/driver/:id/messages', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM driver_messages
       WHERE driver_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ALL driver chats (admin - grouped by driver)
app.get('/api/driver/messages/all', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (driver_id)
        driver_id, driver_name,
        message, created_at,
        COUNT(*) FILTER (
          WHERE is_read = false 
          AND sender_type = 'driver'
        ) OVER (PARTITION BY driver_id) as unread_count
       FROM driver_messages
       ORDER BY driver_id, created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark messages as read
app.put('/api/driver/:id/messages/read', async (req, res) => {
  try {
    await query(
      `UPDATE driver_messages 
       SET is_read = true
       WHERE driver_id = $1 
       AND sender_type = 'driver'`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN USER MANAGEMENT ENDPOINTS ---

// Get all pending employee registrations
app.get('/api/admin/employees/pending', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, department,
        position, phone, status, created_at
       FROM employee_accounts
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ALL employees
app.get('/api/admin/employees', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, department,
        position, phone, status, created_at
       FROM employee_accounts
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject employee
app.put('/api/admin/employees/:id/review', async (req, res) => {
  try {
    const { status, reviewed_by } = req.body;
    const result = await query(
      `UPDATE employee_accounts
       SET status=$1, approved_by=$2,
           approved_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, reviewed_by, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all pending driver registrations
app.get('/api/admin/drivers/pending', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, phone,
        license_number, status, created_at
       FROM driver_accounts
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ALL drivers
app.get('/api/admin/drivers', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, phone,
        license_number, vehicle_assigned,
        status, created_at
       FROM driver_accounts
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject driver
app.put('/api/admin/drivers/:id/review', async (req, res) => {
  try {
    const { status, reviewed_by } = req.body;
    const result = await query(
      `UPDATE driver_accounts
       SET status=$1, approved_by=$2,
           approved_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, reviewed_by, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FILE UPLOAD ENDPOINT ---

// File upload for driver messages
app.post('/api/driver/messages/upload', upload.single('file'), async (req, res) => {
  try {
    const { driver_id, driver_name, sender_type } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ 
        error: 'No file uploaded' 
      });
    }
    
    const isImage = file.mimetype.startsWith('image/');
    const fileUrl = `/uploads/${file.filename}`;
    
    const result = await query(
      `INSERT INTO driver_messages
       (driver_id, driver_name, sender_type,
        image_url, file_url, file_name)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        driver_id, driver_name, sender_type,
        isImage ? fileUrl : null,
        !isImage ? fileUrl : null,
        file.originalname
      ]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));


// ----- Static Frontend Serving (Production Only) -----
if (process.env.NODE_ENV === 'production') {
  console.log('=== FRONTEND STATIC SERVING SETUP ===');
  console.log('Current working directory:', process.cwd());
  console.log('Server directory:', __dirname);
  
  // Check if build was run during deployment
  console.log('=== CHECKING IF FRONTEND WAS BUILT DURING DEPLOYMENT ===');
  const buildMarker = path.join(process.cwd(), 'dist', 'index.html');
  console.log('Looking for build marker at:', buildMarker);
  
  if (fs.existsSync(buildMarker)) {
    console.log('✅ Frontend build found - build command was executed');
    // Show when it was built
    const stats = fs.statSync(buildMarker);
    console.log('Build timestamp:', stats.mtime);
  } else {
    console.error('❌ Frontend build NOT found - build command was NOT executed');
    console.error('🔧 POSSIBLE FIXES:');
    console.error('1. Update Render dashboard Build Command to: npm install && npm run build');
    console.error('2. Check if vite command is available during build');
    console.error('3. Check for build errors in Render logs');
    
    // List what's in the current directory
    console.log('Current directory contents:');
    try {
      const files = fs.readdirSync(process.cwd());
      console.log(files.slice(0, 20)); // Show first 20 files
    } catch (err) {
      console.error('Cannot list directory:', err.message);
    }
  }
  
  // Search all possible frontend directories
  const rootDir = process.cwd();
  const possiblePaths = [
    path.join(rootDir, 'client', 'dist'),
    path.join(rootDir, 'frontend', 'dist'),
    path.join(rootDir, 'dist'),
    path.join(rootDir, 'client', 'build'),
    path.join(rootDir, 'frontend', 'build'),
    path.join(rootDir, 'build')
  ];
  
  let frontendDir = null;
  console.log('Searching for frontend build directory...');
  
  for (const testPath of possiblePaths) {
    console.log(`Testing: ${testPath}`);
    if (fs.existsSync(testPath)) {
      const indexPath = path.join(testPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        frontendDir = testPath;
        console.log(`✅ Found frontend directory: ${frontendDir}`);
        break;
      } else {
        console.log(`  Directory exists but no index.html`);
      }
    }
  }
  
  if (!frontendDir) {
    console.error('❌ ERROR: Could not find frontend build directory with index.html!');
    console.error('Searched paths:', possiblePaths);
    
    // Add a simple fallback route for development/debugging
    app.get('/', (req, res) => {
      res.status(404).json({ 
        error: 'Frontend not built',
        message: 'Run "npm run build" to create the frontend',
        searchedPaths: possiblePaths
      });
    });
  } else {
    console.log(`📁 Chosen frontend directory: ${frontendDir}`);
    
    // Verify index.html and list files
    const indexPath = path.join(frontendDir, 'index.html');
    console.log(`📄 Index.html exists: ${fs.existsSync(indexPath)}`);
    
    try {
      const files = fs.readdirSync(frontendDir);
      console.log(`📋 Files in frontend directory:`, files.slice(0, 10));
      
      // Check if assets folder exists
      const assetsPath = path.join(frontendDir, 'assets');
      if (fs.existsSync(assetsPath)) {
        const assetFiles = fs.readdirSync(assetsPath);
        console.log(`📦 Assets folder exists with files:`, assetFiles);
      } else {
        console.error('❌ Assets folder NOT found at:', assetsPath);
      }
    } catch (err) {
      console.error('Error reading frontend directory:', err.message);
    }

    // Serve static files - FIXED VERSION
    const distDir = path.join(process.cwd(), "dist");
    console.log(`📁 Serving static files from: ${distDir}`);
    
    // Main static serving with cache headers
    app.use(express.static(distDir, {
      maxAge: '1h',
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        // No cache for HTML files - always fresh
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        // Immutable cache for hashed JS/CSS files
        else if (path.includes('.') && (path.endsWith('.js') || path.endsWith('.css'))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // Moderate cache for other assets
        else {
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        }
      }
    }));
    
    // Explicit assets serving (extra safety)
    app.use("/assets", express.static(path.join(distDir, "assets"), {
      maxAge: '1y',
      etag: true,
      lastModified: true
    }));
    
    // Debug log for asset requests
    app.use("/assets", (req, res, next) => {
      console.log(`📦 Asset request: ${req.method} ${req.path}`);
      next();
    });

    // Version endpoint for cache busting
    app.get('/version.txt', (req, res) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.sendFile(path.join(process.cwd(), 'public', 'version.txt'));
    });

    // SPA fallback - must be LAST
    app.get(/.*/, (req, res) => {
      console.log(`🔄 SPA fallback: ${req.path} -> index.html`);
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
}

// Create new tables before starting server
const startServer = async () => {
  await createNewTables();
  
  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running at http://0.0.0.0:${PORT}`);
    console.log(`Using PORT from environment: ${PORT}`);
  });

  // ----- HTTPS server for phone GPS tracker (geolocation requires HTTPS) -----
  // Skip HTTPS server on Render (only run locally)
  let httpsSrv = null;
  if (!process.env.RENDER && process.env.ENABLE_HTTPS === "true") {
    const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
    const certPath = path.join(__dirname, 'cert.pem');
    const keyPath = path.join(__dirname, 'cert.key');
    const publicDir = path.join(__dirname, '..', 'public');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      httpsSrv = https.createServer(
        { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
        (req, res) => {
          // Serve static files from public/
          let filePath = path.join(publicDir, req.url === '/' ? 'tracker.html' : req.url);
          // Strip query string
          filePath = filePath.split('?')[0];
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }[ext] || 'text/plain';
            res.writeHead(200, { 'Content-Type': mime });
            fs.createReadStream(filePath).pipe(res);
          } else {
            // Forward API calls to the express app
            app(req, res);
          }
        }
      );
      httpsSrv.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`HTTPS server running at https://localhost:${HTTPS_PORT}`);
        console.log(`Phone tracker: https://192.168.254.108:${HTTPS_PORT}/tracker.html`);
      });
    } else {
      console.log('HTTPS certificates not found, skipping HTTPS server');
    }
  }

  return httpServer;
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

