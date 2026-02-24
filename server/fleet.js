import { query } from './db.js';

// PMS status logic
export function getPmsStatus(vehicle, latestMaintenance) {
  if (!latestMaintenance || (!latestMaintenance.next_due_date && !latestMaintenance.next_due_odometer)) {
    return 'OK';
  }

  const today = new Date();
  const odo = parseFloat(vehicle.current_odometer) || 0;

  // Check OVERDUE
  if (latestMaintenance.next_due_date) {
    const dueDate = new Date(latestMaintenance.next_due_date);
    if (dueDate < today) return 'OVERDUE';
  }
  if (latestMaintenance.next_due_odometer) {
    const dueOdo = parseFloat(latestMaintenance.next_due_odometer);
    if (odo >= dueOdo) return 'OVERDUE';
  }

  // Check DUE SOON
  if (latestMaintenance.next_due_date) {
    const dueDate = new Date(latestMaintenance.next_due_date);
    const diffDays = (dueDate - today) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) return 'DUE_SOON';
  }
  if (latestMaintenance.next_due_odometer) {
    const dueOdo = parseFloat(latestMaintenance.next_due_odometer);
    if (dueOdo - odo <= 500) return 'DUE_SOON';
  }

  return 'OK';
}

// GET /api/fleet/vehicles
export async function getVehicles(req, res) {
  try {
    const result = await query(`
      SELECT v.*,
        mr.next_due_date, mr.next_due_odometer, mr.service_date as last_service_date
      FROM vehicles v
      LEFT JOIN LATERAL (
        SELECT next_due_date, next_due_odometer, service_date
        FROM maintenance_records
        WHERE vehicle_id = v.id
        ORDER BY service_date DESC
        LIMIT 1
      ) mr ON true
      ORDER BY v.vehicle_type, v.unit_name
    `);

    const vehicles = result.rows.map(v => ({
      ...v,
      pms_status: getPmsStatus(v, v.next_due_date || v.next_due_odometer ? v : null)
    }));

    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/fleet/vehicles/:id
export async function getVehicle(req, res) {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/fleet/vehicles
export async function createVehicle(req, res) {
  try {
    const { unit_name, vehicle_type, plate_number, current_odometer, tracker_id } = req.body;
    const id = 'VH-' + Date.now();
    await query(
      `INSERT INTO vehicles (id, unit_name, vehicle_type, plate_number, current_odometer, tracker_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, unit_name, vehicle_type, plate_number || null, current_odometer || 0, tracker_id || null]
    );

    // Log initial odometer
    if (current_odometer) {
      await query(
        `INSERT INTO odometer_logs (id, vehicle_id, odometer, source) VALUES ($1, $2, $3, 'manual')`,
        ['OL-' + Date.now(), id, current_odometer]
      );
    }

    const result = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/fleet/vehicles/:id
export async function updateVehicle(req, res) {
  try {
    const { id } = req.params;
    const { unit_name, vehicle_type, plate_number, current_odometer, tracker_id } = req.body;
    await query(
      `UPDATE vehicles SET unit_name=$1, vehicle_type=$2, plate_number=$3, current_odometer=$4, tracker_id=$5, updated_at=NOW()
       WHERE id=$6`,
      [unit_name, vehicle_type, plate_number || null, current_odometer, tracker_id || null, id]
    );
    const result = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/fleet/vehicles/:id/odometer-logs
export async function getOdometerLogs(req, res) {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT * FROM odometer_logs WHERE vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 50',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/fleet/vehicles/:id/odometer
export async function logOdometer(req, res) {
  try {
    const { id } = req.params;
    const { odometer, source } = req.body;
    const logId = 'OL-' + Date.now();
    await query(
      `INSERT INTO odometer_logs (id, vehicle_id, odometer, source) VALUES ($1, $2, $3, $4)`,
      [logId, id, odometer, source || 'manual']
    );
    await query(
      `UPDATE vehicles SET current_odometer=$1, updated_at=NOW() WHERE id=$2`,
      [odometer, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/fleet/vehicles/:id/maintenance
export async function getMaintenance(req, res) {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT * FROM maintenance_records WHERE vehicle_id=$1 ORDER BY service_date DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/fleet/vehicles/:id/maintenance
export async function createMaintenance(req, res) {
  try {
    const { id } = req.params;
    const { service_date, odometer_at_service, description, total_cost, next_due_date, next_due_odometer } = req.body;
    const mrId = 'MR-' + Date.now();

    // Default: next due in 6 months if not provided
    let computedNextDueDate = next_due_date || null;
    if (!computedNextDueDate && service_date) {
      const d = new Date(service_date);
      d.setMonth(d.getMonth() + 6);
      computedNextDueDate = d.toISOString().split('T')[0];
    }

    // Default: next due at +5000km if not provided
    let computedNextDueOdo = next_due_odometer || null;
    if (!computedNextDueOdo && odometer_at_service) {
      computedNextDueOdo = parseFloat(odometer_at_service) + 5000;
    }

    await query(
      `INSERT INTO maintenance_records (id, vehicle_id, service_date, odometer_at_service, description, total_cost, next_due_date, next_due_odometer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [mrId, id, service_date, odometer_at_service || null, description, total_cost || 0, computedNextDueDate, computedNextDueOdo]
    );
    // Update vehicle odometer if provided
    if (odometer_at_service) {
      await query(`UPDATE vehicles SET current_odometer=$1, updated_at=NOW() WHERE id=$2`, [odometer_at_service, id]);
    }
    const result = await query('SELECT * FROM maintenance_records WHERE id=$1', [mrId]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/fleet/vehicles/:id/purchase-orders
export async function getVehiclePOs(req, res) {
  try {
    const { id } = req.params;
    const pos = await query(
      'SELECT * FROM fleet_purchase_orders WHERE vehicle_id=$1 ORDER BY date DESC',
      [id]
    );
    const result = [];
    for (const po of pos.rows) {
      const items = await query(
        'SELECT * FROM purchase_order_items WHERE purchase_order_id=$1',
        [po.id]
      );
      result.push({ ...po, items: items.rows });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/fleet/vehicles/:id/purchase-orders
export async function createVehiclePO(req, res) {
  try {
    const { id } = req.params;
    const { po_number, supplier, date, total_cost, notes, items } = req.body;
    const poId = 'FPO-' + Date.now();
    await query(
      `INSERT INTO fleet_purchase_orders (id, vehicle_id, po_number, supplier, date, total_cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [poId, id, po_number, supplier || null, date, total_cost || 0, notes || null]
    );
    if (items && items.length > 0) {
      for (const item of items) {
        const itemId = 'POI-' + Date.now() + Math.random();
        await query(
          `INSERT INTO purchase_order_items (id, purchase_order_id, part_name, quantity, unit_cost, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, poId, item.part_name, item.quantity, item.unit_cost, item.subtotal]
        );
      }
    }
    const result = await query('SELECT * FROM fleet_purchase_orders WHERE id=$1', [poId]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/fleet/vehicles/:id
export async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;
    
    // Check if vehicle exists
    const vehicle = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (!vehicle.rows[0]) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    
    // Delete related records first (due to foreign key constraints)
    await query('DELETE FROM odometer_logs WHERE vehicle_id = $1', [id]);
    await query('DELETE FROM maintenance_records WHERE vehicle_id = $1', [id]);
    await query('DELETE FROM fleet_purchase_orders WHERE vehicle_id = $1', [id]);
    
    // Delete the vehicle
    await query('DELETE FROM vehicles WHERE id = $1', [id]);
    
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/fleet/pms-reminders
export async function getPmsReminders(req, res) {
  try {
    const result = await query(`
      SELECT v.*,
        mr.next_due_date, mr.next_due_odometer, mr.service_date as last_service_date, mr.description as last_service_desc
      FROM vehicles v
      LEFT JOIN LATERAL (
        SELECT next_due_date, next_due_odometer, service_date, description
        FROM maintenance_records
        WHERE vehicle_id = v.id
        ORDER BY service_date DESC
        LIMIT 1
      ) mr ON true
      ORDER BY v.vehicle_type, v.unit_name
    `);

    const reminders = result.rows
      .map(v => ({
        ...v,
        pms_status: getPmsStatus(v, v.next_due_date || v.next_due_odometer ? v : null)
      }))
      .filter(v => v.pms_status === 'OVERDUE' || v.pms_status === 'DUE_SOON');

    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
