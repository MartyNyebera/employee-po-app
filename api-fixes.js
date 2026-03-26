// ========================================
// CRITICAL API FIXES - BUSINESS LOGIC
// Add these routes to server/index.js after line 1257
// ========================================

// ========================================
// FINANCIAL API FIXES
// ========================================

// Fixed Revenue Recognition (only after delivery)
app.get('/api/financial/revenue', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await query(`
      WITH delivered_revenue AS (
        SELECT 
          COALESCE(SUM(so.amount), 0) as total_revenue,
          COUNT(DISTINCT so.id) as delivered_orders
        FROM sales_orders so
        LEFT JOIN deliveries d ON d.sales_order_id = so.id
        WHERE so.status = 'completed' 
          AND (d.status = 'delivered' OR d.status IS NULL) -- Handle cases without delivery tracking
          AND so.delivery_date >= $1 
          AND so.delivery_date <= $2
      ),
      recognized_revenue AS (
        SELECT COALESCE(SUM(amount), 0) as recognized_amount
        FROM revenue_recognition
        WHERE recognized_date >= $1 AND recognized_date <= $2
      )
      SELECT 
        dr.total_revenue,
        dr.delivered_orders,
        rr.recognized_amount,
        CASE 
          WHEN dr.total_revenue != rr.recognized_amount THEN 'MISMATCH'
          ELSE 'MATCHED'
        END as status
      FROM delivered_revenue dr, recognized_revenue rr
    `, [startDate, endDate]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Revenue calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete Net Profit Calculation
app.get('/api/financial/net-profit', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const result = await query(`
      WITH revenue AS (
        SELECT COALESCE(SUM(amount), 0) as total_revenue
        FROM sales_orders 
        WHERE status = 'completed' 
          AND delivery_date >= $1 AND delivery_date <= $2
      ),
      direct_expenses AS (
        SELECT COALESCE(SUM(amount), 0) as total_direct_expenses
        FROM (
          SELECT amount FROM transactions 
          WHERE date >= $1 AND date <= $2
          UNION ALL
          SELECT amount FROM miscellaneous 
          WHERE transaction_date >= $1 AND transaction_date <= $2 AND status = 'completed'
          UNION ALL
          SELECT total_cost as amount FROM fleet_purchase_orders 
          WHERE date >= $1 AND date <= $2
        ) all_expenses
      ),
      maintenance_expenses AS (
        SELECT COALESCE(SUM(total_cost), 0) as total_maintenance
        FROM maintenance_records 
        WHERE service_date >= $1 AND service_date <= $2
      ),
      cogs AS (
        SELECT COALESCE(SUM(ir.quantity * i.unit_cost), 0) as total_cogs
        FROM inventory_reductions ir
        INNER JOIN inventory i ON i.id = ir.inventory_id
        WHERE ir.reduction_type = 'sale'
          AND ir.created_at >= $1 AND ir.created_at <= $2
      ),
      driver_costs AS (
        -- This would include driver salaries, fuel, etc.
        SELECT COALESCE(SUM(amount), 0) as total_driver_costs
        FROM transactions 
        WHERE type = 'fuel' AND date >= $1 AND date <= $2
      )
      SELECT 
        revenue.total_revenue,
        direct_expenses.total_direct_expenses,
        maintenance_expenses.total_maintenance,
        cogs.total_cogs,
        driver_costs.total_driver_costs,
        (direct_expenses.total_direct_expenses + maintenance_expenses.total_maintenance + cogs.total_cogs + driver_costs.total_driver_costs) as total_expenses,
        (revenue.total_revenue - (direct_expenses.total_direct_expenses + maintenance_expenses.total_maintenance + cogs.total_cogs + driver_costs.total_driver_costs)) as net_profit,
        CASE 
          WHEN revenue.total_revenue > 0 
          THEN ((revenue.total_revenue - (direct_expenses.total_direct_expenses + maintenance_expenses.total_maintenance + cogs.total_cogs + driver_costs.total_driver_costs)) / revenue.total_revenue) * 100 
          ELSE 0 
        END as profit_margin_percent
      FROM revenue, direct_expenses, maintenance_expenses, cogs, driver_costs
    `, [startDate, endDate]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Net profit calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// INVENTORY API FIXES
// ========================================

// Get accurate inventory levels
app.get('/api/inventory/accurate', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        i.id,
        i.item_code,
        i.item_name,
        i.description,
        i.unit,
        i.unit_cost,
        i.reorder_level,
        i.location,
        i.supplier,
        COALESCE(
          i.quantity + COALESCE(SUM(ii.quantity), 0) - COALESCE(SUM(ir.quantity), 0), 
          i.quantity
        ) as current_quantity,
        i.quantity as base_quantity,
        COALESCE(SUM(ii.quantity), 0) as total_increases,
        COALESCE(SUM(ir.quantity), 0) as total_reductions,
        CASE 
          WHEN COALESCE(i.quantity + COALESCE(SUM(ii.quantity), 0) - COALESCE(SUM(ir.quantity), 0), i.quantity) <= 0 THEN 'OUT_OF_STOCK'
          WHEN COALESCE(i.quantity + COALESCE(SUM(ii.quantity), 0) - COALESCE(SUM(ir.quantity), 0), i.quantity) <= i.reorder_level THEN 'LOW_STOCK'
          ELSE 'IN_STOCK'
        END as stock_status
      FROM inventory i
      LEFT JOIN inventory_increases ii ON i.id = ii.inventory_id
      LEFT JOIN inventory_reductions ir ON i.id = ir.inventory_id
      GROUP BY i.id, i.item_code, i.item_name, i.description, i.unit, i.unit_cost, i.reorder_level, i.location, i.quantity, i.supplier
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
    const { items } = req.body; // Expected: [{ inventory_id, quantity, unit_price }]
    
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
    
    // Validate and reserve inventory
    for (const item of items) {
      const stockCheck = await client.query(`
        SELECT 
          COALESCE(i.quantity + COALESCE(SUM(ii.quantity), 0) - COALESCE(SUM(ir.quantity), 0), i.quantity) as available_quantity
        FROM inventory i
        LEFT JOIN inventory_increases ii ON i.id = ii.inventory_id
        LEFT JOIN inventory_reductions ir ON i.id = ir.inventory_id
        WHERE i.id = $1
        GROUP BY i.id, i.quantity
        FOR UPDATE
      `, [item.inventory_id]);
      
      if (stockCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Inventory item ${item.inventory_id} not found` });
      }
      
      const availableQuantity = parseFloat(stockCheck.rows[0].available_quantity);
      
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
        INSERT INTO inventory_reductions 
        (inventory_id, quantity, reduction_type, reference_id, reference_type, unit_cost)
        VALUES ($1, $2, 'sale', $3, 'sales_order', 
                (SELECT unit_cost FROM inventory WHERE id = $1))
      `, [item.inventory_id, item.quantity, id]);
      
      // Add to sales order items
      await client.query(`
        INSERT INTO sales_order_items 
        (sales_order_id, inventory_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [id, item.inventory_id, item.quantity, item.unit_price]);
    }
    
    // Update sales order status
    await client.query(`
      UPDATE sales_orders 
      SET status = 'completed', 
          updated_at = NOW(),
          approved_by = $2,
          approved_at = NOW()
      WHERE id = $1
    `, [id, req.user.id]);
    
    // Record financial transaction
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    await client.query(`
      INSERT INTO financial_transactions 
      (transaction_type, reference_id, reference_type, amount, description, created_by)
      VALUES ('revenue', $1, 'sales_order', $2, $3, $4)
    `, [id, totalAmount, `Sales order ${id} completion`, req.user.id]);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Sales order completed with inventory updates',
      items_processed: items.length
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
// MATERIAL REQUEST FIXES
// ========================================

// Process approved material request with inventory integration
app.put('/api/material-requests/:id/approve', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
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
          updated_at = NOW()
      WHERE id = $3
    `, [notes, req.user.id, id]);
    
    // Find or create inventory item
    let inventoryItem = await client.query(
      'SELECT id, quantity FROM inventory WHERE item_code = $1',
      [materialRequest.item_code]
    );
    
    let inventoryId;
    if (inventoryItem.rows.length === 0) {
      // Create new inventory item
      const newInventory = await client.query(`
        INSERT INTO inventory (item_code, item_name, description, quantity, unit, unit_cost)
        VALUES ($1, $2, $3, 0, $4, 0)
        RETURNING id
      `, [materialRequest.item_code, materialRequest.item_name, '', materialRequest.unit]);
      inventoryId = newInventory.rows[0].id;
    } else {
      inventoryId = inventoryItem.rows[0].id;
    }
    
    // Create pending inventory increase (to be processed when items are received)
    await client.query(`
      INSERT INTO inventory_increases 
      (inventory_id, quantity, increase_type, reference_id, reference_type)
      VALUES ($1, $2, 'purchase', $3, 'material_request')
    `, [inventoryId, materialRequest.quantity_requested, id]);
    
    // Create approval workflow
    const workflowId = await client.query(`
      INSERT INTO approval_workflows (entity_type, entity_id, status)
      VALUES ('material_request', $1, 'approved')
      RETURNING id
    `, [id]);
    
    // Record approval step
    await client.query(`
      INSERT INTO approval_steps (workflow_id, step_number, step_type, approver_id, status, approved_at, notes)
      VALUES ($1, 1, 'admin', $2, 'approved', NOW(), $3)
    `, [workflowId.rows[0].id, req.user.id, notes]);
    
    // Record financial transaction
    await client.query(`
      INSERT INTO financial_transactions 
      (transaction_type, reference_id, reference_type, amount, description, created_by)
      VALUES ('expense_commitment', $1, 'material_request', 0, $2, $3)
    `, [id, `Material request ${id} approved`, req.user.id]);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Material request approved and inventory prepared',
      inventory_id: inventoryId
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Material request approval error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Process inventory receipt (when approved items are actually received)
app.post('/api/inventory/receive', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { inventory_id, quantity, unit_cost, reference_id } = req.body;
    
    await client.query('BEGIN');
    
    // Update inventory quantity
    await client.query(`
      UPDATE inventory 
      SET quantity = quantity + $1,
          unit_cost = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [quantity, unit_cost, inventory_id]);
    
    // Update inventory increase record as processed
    await client.query(`
      UPDATE inventory_increases 
      SET unit_cost = $1
      WHERE inventory_id = $2 AND reference_id = $3 AND increase_type = 'purchase'
    `, [unit_cost, inventory_id, reference_id]);
    
    // Record financial transaction
    const totalCost = quantity * unit_cost;
    await client.query(`
      INSERT INTO financial_transactions 
      (transaction_type, reference_id, reference_type, amount, description, created_by)
      VALUES ('expense', $1, 'inventory_purchase', $2, $3, $4)
    `, [reference_id, totalCost, `Inventory purchase for ${inventory_id}`, req.user.id]);
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      message: 'Inventory received and updated',
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
// VALIDATION ENDPOINTS
// ========================================

// Validate business logic consistency
app.get('/api/validate/business-logic', async (req, res) => {
  try {
    const validations = await query(`
      WITH inventory_validation AS (
        SELECT 
          COUNT(*) as items_with_negative_stock,
          SUM(CASE WHEN current_quantity < 0 THEN 1 ELSE 0 END) as negative_stock_count
        FROM (
          SELECT 
            COALESCE(i.quantity + COALESCE(SUM(ii.quantity), 0) - COALESCE(SUM(ir.quantity), 0), i.quantity) as current_quantity
          FROM inventory i
          LEFT JOIN inventory_increases ii ON i.id = ii.inventory_id
          LEFT JOIN inventory_reductions ir ON i.id = ir.inventory_id
          GROUP BY i.id, i.quantity
        ) inventory_check
      ),
      revenue_validation AS (
        SELECT 
          COUNT(*) as unearned_revenue_count,
          COALESCE(SUM(amount), 0) as unearned_revenue_amount
        FROM sales_orders so
        WHERE so.status = 'completed' 
          AND NOT EXISTS (
            SELECT 1 FROM revenue_recognition rr 
            WHERE rr.sales_order_id = so.id
          )
      ),
      financial_validation AS (
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM sales_orders WHERE status = 'completed') as recorded_revenue,
          (SELECT COALESCE(SUM(amount), 0) FROM revenue_recognition) as recognized_revenue
      )
      SELECT 
        iv.items_with_negative_stock,
        iv.negative_stock_count,
        rv.unearned_revenue_count,
        rv.unearned_revenue_amount,
        fv.recorded_revenue,
        fv.recognized_revenue,
        CASE 
          WHEN fv.recorded_revenue != fv.recognized_revenue THEN 'REVENUE_MISMATCH'
          WHEN iv.negative_stock_count > 0 THEN 'INVENTORY_ISSUE'
          ELSE 'HEALTHY'
        END as overall_status
      FROM inventory_validation iv, revenue_validation rv, financial_validation fv
    `);
    
    res.json(validations.rows[0]);
  } catch (error) {
    console.error('Business logic validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('🔧 Business logic API fixes loaded');
