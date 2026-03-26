// ========================================
// CORRECTED API FIXES FOR BUSINESS LOGIC
// Compatible with existing database structure
// Add these routes to server/index.js after line 1257
// ========================================

// ========================================
// FINANCIAL API FIXES - CORRECTED
// ========================================

// Fixed Revenue Recognition (only after delivery confirmation)
app.get('/api/financial/revenue', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Use the new revenue_recognition table for accurate calculation
    const result = await query(`
      WITH delivered_revenue AS (
        SELECT 
          COALESCE(SUM(rr.revenue_amount), 0) as total_revenue,
          COUNT(DISTINCT rr.sales_order_id) as delivered_orders
        FROM revenue_recognition rr
        WHERE rr.is_recognized = true 
          AND rr.revenue_recognized_date >= $1 
          AND rr.revenue_recognized_date <= $2
      ),
      pending_revenue AS (
        SELECT 
          COALESCE(SUM(so.amount), 0) as pending_amount,
          COUNT(DISTINCT so.id) as pending_orders
        FROM sales_orders so
        WHERE so.status IN ('approved', 'in-progress')
          AND so.delivery_date >= $1 
          AND so.delivery_date <= $2
          AND NOT EXISTS (
            SELECT 1 FROM revenue_recognition rr 
            WHERE rr.sales_order_id = so.id AND rr.is_recognized = true
          )
      )
      SELECT 
        dr.total_revenue,
        dr.delivered_orders,
        pr.pending_amount,
        pr.pending_orders,
        (dr.total_revenue + pr.pending_amount) as total_potential_revenue
      FROM delivered_revenue dr, pending_revenue pr
    `, [startDate, endDate]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Revenue calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete Net Profit Calculation with all costs
app.get('/api/financial/net-profit', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await query(`
      WITH revenue AS (
        SELECT COALESCE(SUM(amount), 0) as total_revenue
        FROM financial_transactions 
        WHERE transaction_type = 'REVENUE' 
          AND status = 'CONFIRMED'
          AND transaction_date >= $1 AND transaction_date <= $2
      ),
      cogs AS (
        SELECT COALESCE(SUM(amount), 0) as total_cogs
        FROM financial_transactions 
        WHERE transaction_type = 'COGS' 
          AND status = 'CONFIRMED'
          AND transaction_date >= $1 AND transaction_date <= $2
      ),
      fuel_costs AS (
        SELECT COALESCE(SUM(amount), 0) as total_fuel
        FROM financial_transactions 
        WHERE transaction_type = 'FUEL' 
          AND status = 'CONFIRMED'
          AND transaction_date >= $1 AND transaction_date <= $2
      ),
      maintenance_costs AS (
        SELECT COALESCE(SUM(total_cost), 0) as total_maintenance
        FROM maintenance_records 
        WHERE service_date >= $1 AND service_date <= $2
      ),
      operational_costs AS (
        SELECT COALESCE(SUM(amount), 0) as total_operational
        FROM operational_costs 
        WHERE cost_date >= $1 AND cost_date <= $2
      ),
      fleet_costs AS (
        SELECT COALESCE(SUM(amount), 0) as total_fleet
        FROM transactions 
        WHERE date >= $1 AND date <= $2
      )
      SELECT 
        revenue.total_revenue,
        cogs.total_cogs,
        fuel_costs.total_fuel,
        maintenance_costs.total_maintenance,
        operational_costs.total_operational,
        fleet_costs.total_fleet,
        (cogs.total_cogs + fuel_costs.total_fuel + maintenance_costs.total_maintenance + 
         operational_costs.total_operational + fleet_costs.total_fleet) as total_expenses,
        (revenue.total_revenue - (cogs.total_cogs + fuel_costs.total_fuel + maintenance_costs.total_maintenance + 
         operational_costs.total_operational + fleet_costs.total_fleet)) as net_profit,
        CASE 
          WHEN revenue.total_revenue > 0 
          THEN ((revenue.total_revenue - (cogs.total_cogs + fuel_costs.total_fuel + maintenance_costs.total_maintenance + 
               operational_costs.total_operational + fleet_costs.total_fleet)) / revenue.total_revenue) * 100 
          ELSE 0 
        END as profit_margin_percent
      FROM revenue, cogs, fuel_costs, maintenance_costs, operational_costs, fleet_costs
    `, [startDate, endDate]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Net profit calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// INVENTORY API FIXES - CORRECTED
// ========================================

// Get accurate inventory levels with transaction tracking
app.get('/api/inventory/accurate', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        i.id,
        i.item_code,
        i.item_name,
        i.description,
        i.quantity,
        i.unit,
        i.unit_cost,
        i.cogs_per_unit,
        i.reorder_level,
        i.location,
        i.supplier,
        i.is_active,
        COALESCE(
          i.quantity + COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) + 
          COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0),
          i.quantity
        ) as calculated_quantity,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) as total_purchased,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0) as total_sold,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) as total_adjustments,
        CASE 
          WHEN COALESCE(i.quantity + COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) + 
                   COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0), i.quantity) <= 0 
          THEN 'OUT_OF_STOCK'
          WHEN COALESCE(i.quantity + COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) + 
                   COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0), i.quantity) <= i.reorder_level 
          THEN 'LOW_STOCK'
          ELSE 'IN_STOCK'
        END as stock_status,
        (SELECT MAX(created_at) FROM inventory_transactions WHERE inventory_id = i.id) as last_transaction_date
      FROM inventory i
      LEFT JOIN inventory_transactions it ON i.id = it.inventory_id
      GROUP BY i.id, i.item_code, i.item_name, i.description, i.quantity, i.unit, i.unit_cost, i.cogs_per_unit, i.reorder_level, i.location, i.supplier, i.is_active
      ORDER BY i.item_name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Inventory calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process sales order completion with inventory integration
app.put('/api/sales-orders/:id/complete', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { items, delivery_confirmed_by, delivery_date } = req.body;
    
    await client.query('BEGIN');
    
    // Check if order exists and is in correct status
    const orderCheck = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1 AND status IN ($2, $3)',
      [id, 'approved', 'in-progress']
    );
    
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales order not found or cannot be completed' });
    }
    
    const order = orderCheck.rows[0];
    
    // Process each item
    let totalCOGS = 0;
    for (const item of items) {
      // Check current stock
      const stockCheck = await client.query(`
        SELECT 
          COALESCE(i.quantity + COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) + 
                   COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0), i.quantity) as available_quantity,
          i.cogs_per_unit
        FROM inventory i
        LEFT JOIN inventory_transactions it ON i.id = it.inventory_id
        WHERE i.id = $1
        GROUP BY i.id, i.quantity, i.cogs_per_unit
        FOR UPDATE
      `, [item.inventory_id]);
      
      if (stockCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Inventory item ${item.inventory_id} not found` });
      }
      
      const availableQuantity = parseFloat(stockCheck.rows[0].available_quantity);
      const cogsPerUnit = parseFloat(stockCheck.rows[0].cogs_per_unit) || 0;
      const itemCOGS = item.quantity * cogsPerUnit;
      totalCOGS += itemCOGS;
      
      if (availableQuantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Insufficient stock',
          inventory_id: item.inventory_id,
          requested: item.quantity,
          available: availableQuantity
        });
      }
      
      // Record inventory reduction
      await client.query(`
        INSERT INTO inventory_transactions 
        (inventory_id, transaction_type, quantity_change, reference_type, reference_id, previous_quantity, new_quantity, unit_cost, created_by, notes)
        VALUES ($1, 'SALE', $2, 'SALES_ORDER', $3, $4, $5, $6, $7, $8)
      `, [item.inventory_id, -item.quantity, id, availableQuantity, availableQuantity - item.quantity, cogsPerUnit, req.user.id, `Sales order ${id}`]);
      
      // Add to sales order items
      await client.query(`
        INSERT INTO sales_order_items 
        (sales_order_id, inventory_id, product_name, quantity, unit_price, cogs_per_unit, cogs_total)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [id, item.inventory_id, item.product_name, item.quantity, item.unit_price, cogsPerUnit, itemCOGS]);
      
      // Record COGS financial transaction
      await client.query(`
        INSERT INTO financial_transactions 
        (transaction_type, related_order_id, reference_type, amount, transaction_date, description, created_by, status)
        VALUES ('COGS', $1, 'SALES_ORDER', $2, NOW(), $3, $4, 'CONFIRMED')
      `, [id, itemCOGS, `COGS for sales order ${id}`, req.user.id]);
    }
    
    // Update sales order status
    await client.query(`
      UPDATE sales_orders 
      SET status = 'completed', 
          updated_at = NOW(),
          delivery_date = $1,
          delivery_confirmed_by = $2,
          delivery_confirmed_date = NOW(),
          total_cogs = $3,
          is_inventory_deducted = true
      WHERE id = $4
    `, [delivery_date || NOW(), delivery_confirmed_by, totalCOGS, id]);
    
    // Create revenue recognition record
    await client.query(`
      INSERT INTO revenue_recognition 
      (sales_order_id, order_date, delivery_date, revenue_amount, is_recognized, recognition_status, revenue_recognized_date)
      VALUES ($1, $2, $3, $4, true, 'RECOGNIZED', NOW())
    `, [id, order.created_date, delivery_date || NOW(), order.amount]);
    
    // Record revenue financial transaction
    await client.query(`
      INSERT INTO financial_transactions 
      (transaction_type, related_order_id, reference_type, amount, transaction_date, description, created_by, status)
      VALUES ('REVENUE', $1, 'SALES_ORDER', $2, NOW(), $3, $4, 'CONFIRMED')
    `, [id, order.amount, `Revenue from sales order ${id}`, req.user.id]);
    
    // Record audit log
    await client.query(`
      INSERT INTO business_logic_audit_log 
      (entity_type, entity_id, action, changed_by, changed_by_name, new_value, reason)
      VALUES ('SALES_ORDER', $1, 'COMPLETE', $2, $3, $4, $5)
    `, [id, req.user.id, req.user.name, JSON.stringify({status: 'completed', total_cogs: totalCOGS}), 'Sales order completed with inventory deduction']);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Sales order completed with inventory updates and revenue recognition',
      items_processed: items.length,
      total_cogs: totalCOGS,
      revenue_recognized: order.amount
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sales order completion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ========================================
// MATERIAL REQUEST FIXES - CORRECTED
// ========================================

// Process approved material request with inventory integration
app.put('/api/material-requests/:id/approve', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { notes, inventory_id } = req.body;
    
    await client.query('BEGIN');
    
    // Get material request details
    const request = await client.query(
      'SELECT * FROM material_requests WHERE id = $1',
      [id]
    );
    
    if (request.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Material request not found' });
    }
    
    const materialRequest = request.rows[0];
    
    // Update request status
    await client.query(`
      UPDATE material_requests 
      SET status = 'approved', 
          admin_notes = $1, 
          reviewed_at = NOW(), 
          reviewed_by = $2,
          updated_at = NOW(),
          inventory_id = $3,
          final_approved_date = NOW()
      WHERE id = $4
    `, [notes, req.user.id, inventory_id, id]);
    
    // Create approval record
    await client.query(`
      INSERT INTO material_request_approvals 
      (material_request_id, approver_id, approver_name, approval_status, approval_date, approval_level)
      VALUES ($1, $2, $3, 'APPROVED', NOW(), 1)
    `, [id, req.user.id, req.user.name]);
    
    // Record audit log
    await client.query(`
      INSERT INTO business_logic_audit_log 
      (entity_type, entity_id, action, changed_by, changed_by_name, new_value, reason)
      VALUES ('MATERIAL_REQUEST', $1, 'APPROVE', $2, $3, $4, $5)
    `, [id, req.user.id, req.user.name, JSON.stringify({status: 'approved', inventory_id: inventory_id}), notes]);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Material request approved',
      inventory_id: inventory_id
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Material request approval error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Process inventory receipt for approved material requests
app.post('/api/inventory/receive', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { inventory_id, quantity, unit_cost, material_request_id } = req.body;
    
    await client.query('BEGIN');
    
    // Update inventory quantity and cost
    await client.query(`
      UPDATE inventory 
      SET quantity = quantity + $1,
          cogs_per_unit = $2,
          last_cogs_update = NOW(),
          updated_at = NOW()
      WHERE id = $3
    `, [quantity, unit_cost, inventory_id]);
    
    // Get current quantity for audit
    const inventoryCheck = await client.query(
      'SELECT quantity FROM inventory WHERE id = $1',
      [inventory_id]
    );
    
    const newQuantity = inventoryCheck.rows[0].quantity;
    
    // Record inventory increase
    await client.query(`
      INSERT INTO inventory_transactions 
      (inventory_id, transaction_type, quantity_change, reference_type, reference_id, previous_quantity, new_quantity, unit_cost, created_by, notes)
      VALUES ($1, 'PURCHASE', $2, 'MATERIAL_REQUEST', $3, $4, $5, $6, $7, $8)
    `, [inventory_id, quantity, material_request_id, newQuantity - quantity, newQuantity, unit_cost, req.user.id, `Material request ${material_request_id}`]);
    
    // Update material request status
    await client.query(`
      UPDATE material_requests 
      SET status = 'COMPLETED',
          inventory_updated = true,
          updated_at = NOW()
      WHERE id = $1
    `, [material_request_id]);
    
    // Record expense transaction
    const totalCost = quantity * unit_cost;
    await client.query(`
      INSERT INTO financial_transactions 
      (transaction_type, related_order_id, reference_type, amount, transaction_date, description, created_by, status)
      VALUES ('COGS', $1, 'MATERIAL_REQUEST', $2, NOW(), $3, $4, 'CONFIRMED')
    `, [material_request_id, totalCost, `Inventory purchase for material request ${material_request_id}`, req.user.id]);
    
    // Record audit log
    await client.query(`
      INSERT INTO business_logic_audit_log 
      (entity_type, entity_id, action, changed_by, changed_by_name, new_value, reason)
      VALUES ('INVENTORY', $1, 'RECEIVE', $2, $3, $4, $5)
    `, [inventory_id, req.user.id, req.user.name, JSON.stringify({quantity_added: quantity, unit_cost: unit_cost, total_cost: totalCost}), `Inventory receipt from material request ${material_request_id}`]);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Inventory received and updated',
      new_quantity: newQuantity,
      total_cost: totalCost
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Inventory receipt error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ========================================
// DELIVERY CONFIRMATION API
// ========================================

// Confirm delivery with GPS verification
app.post('/api/deliveries/confirm', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      sales_order_id, 
      driver_id, 
      delivery_latitude, 
      delivery_longitude, 
      delivery_address, 
      recipient_name, 
      recipient_signature_data,
      gps_accuracy
    } = req.body;
    
    await client.query('BEGIN');
    
    // Create delivery confirmation record
    await client.query(`
      INSERT INTO delivery_confirmations 
      (sales_order_id, driver_id, delivery_date, delivery_latitude, delivery_longitude, delivery_address, recipient_name, recipient_signature_data, gps_accuracy, status)
      VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, 'CONFIRMED')
    `, [sales_order_id, driver_id, delivery_latitude, delivery_longitude, delivery_address, recipient_name, recipient_signature_data, gps_accuracy]);
    
    // Update driver location to mark as delivery location
    await client.query(`
      UPDATE driver_locations 
      SET is_delivery_location = true, delivery_confirmed = true, delivery_id = $1
      WHERE driver_id = $2 AND timestamp >= NOW() - INTERVAL '1 hour'
    `, [sales_order_id, driver_id]);
    
    // Record audit log
    await client.query(`
      INSERT INTO business_logic_audit_log 
      (entity_type, entity_id, action, changed_by, changed_by_name, new_value, reason)
      VALUES ('DELIVERY', $1, 'CONFIRM', $2, $3, $4, $5)
    `, [sales_order_id, driver_id, `Driver ${driver_id}`, JSON.stringify({delivery_address, recipient_name}), 'Delivery confirmed with GPS verification']);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Delivery confirmed with GPS verification'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delivery confirmation error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ========================================
// VALIDATION ENDPOINTS
// ========================================

// Comprehensive business logic validation
app.get('/api/validate/business-logic', async (req, res) => {
  try {
    const validations = await query(`
      WITH inventory_validation AS (
        SELECT 
          COUNT(*) as items_with_negative_stock,
          SUM(CASE WHEN calculated_quantity < 0 THEN 1 ELSE 0 END) as negative_stock_count
        FROM v_inventory_accuracy
      ),
      revenue_validation AS (
        SELECT 
          COUNT(*) as unearned_revenue_count,
          COALESCE(SUM(amount), 0) as unearned_revenue_amount
        FROM sales_orders so
        WHERE so.status = 'completed' 
          AND NOT EXISTS (
            SELECT 1 FROM revenue_recognition rr 
            WHERE rr.sales_order_id = so.id AND rr.is_recognized = true
          )
      ),
      financial_validation AS (
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM financial_transactions WHERE transaction_type = 'REVENUE' AND status = 'CONFIRMED') as recorded_revenue,
          (SELECT COALESCE(SUM(amount), 0) FROM revenue_recognition WHERE is_recognized = true) as recognized_revenue
      ),
      audit_validation AS (
        SELECT COUNT(*) as total_audit_entries
        FROM business_logic_audit_log
        WHERE change_date >= NOW() - INTERVAL '7 days'
      )
      SELECT 
        iv.items_with_negative_stock,
        iv.negative_stock_count,
        rv.unearned_revenue_count,
        rv.unearned_revenue_amount,
        fv.recorded_revenue,
        fv.recognized_revenue,
        av.total_audit_entries,
        CASE 
          WHEN fv.recorded_revenue != fv.recognized_revenue THEN 'REVENUE_MISMATCH'
          WHEN iv.negative_stock_count > 0 THEN 'INVENTORY_ISSUE'
          WHEN rv.unearned_revenue_count > 0 THEN 'RECOGNITION_ISSUE'
          ELSE 'HEALTHY'
        END as overall_status
      FROM inventory_validation iv, revenue_validation rv, financial_validation fv, audit_validation av
    `);
    
    res.json(validations.rows[0]);
  } catch (error) {
    console.error('Business logic validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get financial summary using views
app.get('/api/financial/summary', async (req, res) => {
  try {
    const [revenueData, profitData, inventoryData] = await Promise.all([
      query('SELECT * FROM v_revenue_summary ORDER BY year DESC, month DESC LIMIT 12'),
      query('SELECT * FROM v_profit_summary ORDER BY period DESC LIMIT 12'),
      query('SELECT * FROM v_inventory_accuracy WHERE stock_status IN (\'LOW_STOCK\', \'OUT_OF_STOCK\') ORDER BY item_name')
    ]);
    
    res.json({
      revenue_summary: revenueData.rows,
      profit_summary: profitData.rows,
      inventory_issues: inventoryData.rows
    });
  } catch (error) {
    console.error('Financial summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('🔧 Corrected business logic API fixes loaded');
