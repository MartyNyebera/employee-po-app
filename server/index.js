import express from 'express';
import cors from 'cors';
import { query, testConnection } from './db.js';
import { seed } from './seed.js';
import { hashPassword, comparePassword, signToken, requireAuth, requireAdmin, requireSuperAdmin } from './auth.js';
import { sendEmailToAdminsNewRequest, sendEmailToApplicant } from './email.js';
import { getDevices, getDevice, createDevice, updateDevice, deleteDevice, getPositions, getPositionHistory, getGeofences, checkConnection, getTraccarWsUrl, authHeader, TRACCAR_URL } from './traccar.js';
import { getVehicles, getVehicle, createVehicle, updateVehicle, getOdometerLogs, logOdometer, getMaintenance, createMaintenance, getVehiclePOs, createVehiclePO, getPmsReminders } from './fleet.js';
import { seedFleet } from './seed-fleet.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Test DB connection on startup
testConnection().catch(() => {
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
      return res.status(400).json({ error: 'Invalid email format', code: 'INVALID_EMAIL' });
    }
    if (!['employee', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be employee or admin' });
    }
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Account with this email already exists', code: 'ACCOUNT_ALREADY_EXISTS' });
    }

    // Admin role: require approval from super admin (developer/owner). Don't create account yet.
    if (role === 'admin') {
      const pendingReq = await query(
        'SELECT id FROM admin_approval_requests WHERE email = $1 AND status = $2',
        [email.toLowerCase(), 'pending']
      );
      if (pendingReq.rows.length > 0) {
        return res.status(400).json({
          error: 'You already have a pending admin request. A super admin will review it.',
          code: 'PENDING_ADMIN_REQUEST',
        });
      }
      const reqId = 'req-' + Date.now();
      const password_hash = await hashPassword(password);
      await query(
        'INSERT INTO admin_approval_requests (id, email, name, password_hash, status) VALUES ($1, $2, $3, $4, $5)',
        [reqId, email.toLowerCase(), name, password_hash, 'pending']
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
    const password_hash = await hashPassword(password);
    await query(
      'INSERT INTO users (id, email, password_hash, name, role, is_super_admin) VALUES ($1, $2, $3, $4, $5, false)',
      [id, email.toLowerCase(), password_hash, name, role]
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
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(401).json({ error: 'Invalid email format', code: 'INVALID_EMAIL' });
    }
    const result = await query(
      'SELECT id, email, password_hash, name, role, is_super_admin FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(401).json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }
    if (!(await comparePassword(password, row.password_hash))) {
      return res.status(401).json({ error: 'Password incorrect', code: 'PASSWORD_INCORRECT' });
    }
    const isSuperAdmin = !!row.is_super_admin;
    const token = signToken({
      userId: row.id,
      role: row.role,
      email: row.email,
      name: row.name,
      isSuperAdmin,
    });
    res.json({
      user: { id: row.id, email: row.email, name: row.name, role: row.role, isSuperAdmin },
      token,
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ----- All routes below require auth -----
app.use('/api', requireAuth);

// ----- Fleet Management Routes -----
app.get('/api/fleet/vehicles', getVehicles);
app.get('/api/fleet/vehicles/:id', getVehicle);
app.post('/api/fleet/vehicles', createVehicle);
app.put('/api/fleet/vehicles/:id', updateVehicle);
app.get('/api/fleet/vehicles/:id/odometer-logs', getOdometerLogs);
app.post('/api/fleet/vehicles/:id/odometer', logOdometer);
app.get('/api/fleet/vehicles/:id/maintenance', getMaintenance);
app.post('/api/fleet/vehicles/:id/maintenance', createMaintenance);
app.get('/api/fleet/vehicles/:id/purchase-orders', getVehiclePOs);
app.post('/api/fleet/vehicles/:id/purchase-orders', createVehiclePO);
app.get('/api/fleet/pms-reminders', getPmsReminders);
app.post('/api/fleet/seed', async (req, res) => {
  try { await seedFleet(); res.json({ message: 'Fleet seeded' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

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
    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets
       FROM purchase_orders ORDER BY created_date DESC`
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
    }));
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/purchase-orders (admin only)
app.post('/api/purchase-orders', requireAdmin, async (req, res) => {
  try {
    const { poNumber, client, description, amount, deliveryDate, assignedAssets = [] } = req.body;
    const id = `PO-${Date.now()}`;
    const createdDate = new Date().toISOString().split('T')[0];
    await query(
      `INSERT INTO purchase_orders (id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
      [id, poNumber, client, description, amount, createdDate, deliveryDate, assignedAssets]
    );
    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets
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
    });
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

// ─── Traccar GPS Tracking ──────────────────────────────────

// GET /api/traccar/status - check if Traccar server is reachable
app.get('/api/traccar/status', async (req, res) => {
  try {
    const status = await checkConnection();
    res.json(status);
  } catch (err) {
    res.json({ connected: false, error: err.message });
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
      return res.status(400).json({ error: 'name and uniqueId (IMEI) are required' });
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

// POST /api/init - create tables and seed (convenience endpoint)
app.post('/api/init', async (req, res) => {
  try {
    await seed();
    res.json({ message: 'Database initialized and seeded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
