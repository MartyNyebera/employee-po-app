-- ============================================
-- CORRECTED DATABASE FIXES FOR BUSINESS LOGIC
-- ============================================
-- Purpose: Fix all critical business logic issues
-- Author: Business Logic Audit
-- Date: 2024
-- WARNING: Backup your database before applying!
-- NOTE: This version is compatible with existing schema

-- ============================================
-- 1. FIX REVENUE RECOGNITION - DELIVERY BASED
-- ============================================

-- Create sales_order_items table to track individual items
CREATE TABLE IF NOT EXISTS sales_order_items (
  id SERIAL PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  inventory_id TEXT REFERENCES inventory(id),
  product_name VARCHAR(255) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  total_price DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  cogs_per_unit DECIMAL(15, 2),
  cogs_total DECIMAL(15, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id ON sales_order_items(sales_order_id);

-- Create financial_transactions table for complete audit trail
CREATE TABLE IF NOT EXISTS financial_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(50) NOT NULL, -- 'REVENUE', 'COGS', 'FUEL', 'MAINTENANCE', 'SALARY'
  related_order_id TEXT,
  reference_type VARCHAR(50),
  amount DECIMAL(15, 2) NOT NULL,
  transaction_date TIMESTAMP NOT NULL,
  description VARCHAR(255),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'PENDING' -- 'PENDING', 'CONFIRMED', 'REVERSED'
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date);

-- Create revenue_recognition table - tracks when revenue should be recognized
CREATE TABLE IF NOT EXISTS revenue_recognition (
  id SERIAL PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  order_date DATE,
  approval_date TIMESTAMP,
  delivery_date TIMESTAMP,
  revenue_recognized_date TIMESTAMP,
  revenue_amount DECIMAL(15, 2) NOT NULL,
  is_recognized BOOLEAN DEFAULT FALSE,
  recognition_status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'DELIVERED', 'RECOGNIZED', 'CANCELLED'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_recognition_order_id ON revenue_recognition(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_revenue_recognition_status ON revenue_recognition(recognition_status);

-- ============================================
-- 2. FIX INVENTORY INTEGRATION
-- ============================================

-- Create inventory tracking table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN'
  quantity_change NUMERIC(10,2) NOT NULL,
  reference_type VARCHAR(50), -- 'SALES_ORDER', 'MATERIAL_REQUEST', 'ADJUSTMENT'
  reference_id TEXT,
  previous_quantity NUMERIC(10,2),
  new_quantity NUMERIC(10,2),
  unit_cost DECIMAL(15,2),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_inventory_id ON inventory_transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);

-- Update inventory table with COGS tracking
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cogs_per_unit DECIMAL(15, 2);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_cogs_update TIMESTAMPTZ;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ============================================
-- 3. FIX MATERIAL REQUEST WORKFLOW
-- ============================================

-- Update material_requests with inventory impact tracking
ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS inventory_id TEXT REFERENCES inventory(id);
ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS inventory_updated BOOLEAN DEFAULT FALSE;
ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS approval_chain TEXT; -- JSON array of approvals
ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS final_approved_date TIMESTAMP;

-- Create material_request_approvals table for consistent workflow
CREATE TABLE IF NOT EXISTS material_request_approvals (
  id SERIAL PRIMARY KEY,
  material_request_id INTEGER NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  approver_id INTEGER REFERENCES employee_accounts(id),
  approver_name VARCHAR(255) NOT NULL,
  approval_status VARCHAR(50) NOT NULL, -- 'PENDING', 'APPROVED', 'REJECTED'
  approval_date TIMESTAMP,
  rejection_reason VARCHAR(255),
  approval_level INTEGER, -- 1, 2, 3 for multi-level approval
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_request_approvals_material_id ON material_request_approvals(material_request_id);
CREATE INDEX IF NOT EXISTS idx_material_request_approvals_status ON material_request_approvals(approval_status);

-- ============================================
-- 4. FIX SALES ORDER WORKFLOW
-- ============================================

-- Update sales_orders with proper workflow tracking
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS approval_chain TEXT; -- JSON array
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS approved_date TIMESTAMP;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_confirmed_by TEXT REFERENCES users(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_confirmed_date TIMESTAMPTZ;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_cogs DECIMAL(15, 2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS is_inventory_deducted BOOLEAN DEFAULT FALSE;

-- Create sales_order_approvals table for standardized workflow
CREATE TABLE IF NOT EXISTS sales_order_approvals (
  id SERIAL PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  approver_id TEXT REFERENCES users(id),
  approver_name VARCHAR(255) NOT NULL,
  approval_status VARCHAR(50) NOT NULL, -- 'PENDING', 'APPROVED', 'REJECTED'
  approval_date TIMESTAMP,
  rejection_reason VARCHAR(255),
  approval_level INTEGER, -- 1, 2, 3 for multi-level approval
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_approvals_order_id ON sales_order_approvals(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_approvals_status ON sales_order_approvals(approval_status);

-- ============================================
-- 5. FIX COST TRACKING
-- ============================================

-- Create operational_costs table
CREATE TABLE IF NOT EXISTS operational_costs (
  id SERIAL PRIMARY KEY,
  cost_type VARCHAR(50) NOT NULL, -- 'FUEL', 'MAINTENANCE', 'SALARY', 'UTILITIES', 'OTHER'
  amount DECIMAL(15, 2) NOT NULL,
  description VARCHAR(255),
  cost_date DATE NOT NULL,
  related_vehicle_id TEXT REFERENCES vehicles(id),
  related_employee_id INTEGER REFERENCES employee_accounts(id),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_costs_type ON operational_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_operational_costs_date ON operational_costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_operational_costs_vehicle ON operational_costs(related_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_operational_costs_employee ON operational_costs(related_employee_id);

-- ============================================
-- 6. FIX GPS DELIVERY VERIFICATION
-- ============================================

-- Update driver_locations to track delivery confirmation
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS delivery_id TEXT;
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS is_delivery_location BOOLEAN DEFAULT FALSE;
ALTER TABLE driver_locations ADD COLUMN IF NOT EXISTS delivery_confirmed BOOLEAN DEFAULT FALSE;

-- Create delivery_confirmations table
CREATE TABLE IF NOT EXISTS delivery_confirmations (
  id SERIAL PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES driver_accounts(id),
  delivery_date TIMESTAMP NOT NULL,
  delivery_latitude DECIMAL(10, 8),
  delivery_longitude DECIMAL(11, 8),
  delivery_address VARCHAR(255),
  recipient_name VARCHAR(255),
  recipient_signature_data TEXT, -- JSON or base64 encoded signature
  gps_accuracy DECIMAL(10, 2),
  photo_evidence_url VARCHAR(255),
  status VARCHAR(50) DEFAULT 'CONFIRMED', -- 'PENDING', 'CONFIRMED', 'FAILED'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_order_id ON delivery_confirmations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_driver_id ON delivery_confirmations(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_delivery_date ON delivery_confirmations(delivery_date);

-- ============================================
-- 7. FIX STATUS MANAGEMENT CONSISTENCY
-- ============================================

-- Create status_definitions table for consistency
CREATE TABLE IF NOT EXISTS status_definitions (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL, -- 'SALES_ORDER', 'MATERIAL_REQUEST', 'DELIVERY'
  status_value VARCHAR(50) NOT NULL,
  status_label VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO status_definitions (entity_type, status_value, status_label, description, display_order) VALUES
('SALES_ORDER', 'DRAFT', 'Draft', 'Initial creation', 1),
('SALES_ORDER', 'PENDING_APPROVAL', 'Pending Approval', 'Waiting for approval', 2),
('SALES_ORDER', 'APPROVED', 'Approved', 'Order approved', 3),
('SALES_ORDER', 'IN_TRANSIT', 'In Transit', 'Order being delivered', 4),
('SALES_ORDER', 'DELIVERED', 'Delivered', 'Order delivered to customer', 5),
('SALES_ORDER', 'REVENUE_RECOGNIZED', 'Revenue Recognized', 'Revenue recorded in system', 6),
('SALES_ORDER', 'CANCELLED', 'Cancelled', 'Order cancelled', 7),
('MATERIAL_REQUEST', 'DRAFT', 'Draft', 'Initial creation', 1),
('MATERIAL_REQUEST', 'PENDING_APPROVAL', 'Pending Approval', 'Waiting for approval', 2),
('MATERIAL_REQUEST', 'APPROVED', 'Approved', 'Request approved', 3),
('MATERIAL_REQUEST', 'INVENTORY_UPDATED', 'Inventory Updated', 'Inventory levels updated', 4),
('MATERIAL_REQUEST', 'COMPLETED', 'Completed', 'Request completed', 5),
('MATERIAL_REQUEST', 'CANCELLED', 'Cancelled', 'Request cancelled', 6)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_status_definitions_entity_type ON status_definitions(entity_type);

-- ============================================
-- 8. CREATE COMPREHENSIVE AUDIT TRAIL
-- ============================================

-- Create business_logic_audit_log table
CREATE TABLE IF NOT EXISTS business_logic_audit_log (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL, -- 'SALES_ORDER', 'MATERIAL_REQUEST', 'INVENTORY', etc.
  entity_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'DELETE'
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT REFERENCES users(id),
  changed_by_name VARCHAR(255),
  change_date TIMESTAMPTZ DEFAULT NOW(),
  reason VARCHAR(255),
  ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON business_logic_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_date ON business_logic_audit_log(change_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON business_logic_audit_log(action);

-- ============================================
-- 9. CREATE FINANCIAL SUMMARY VIEWS
-- ============================================

-- View for accurate revenue calculation
CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT 
  EXTRACT(MONTH FROM rr.revenue_recognized_date) as month,
  EXTRACT(YEAR FROM rr.revenue_recognized_date) as year,
  COUNT(DISTINCT rr.sales_order_id) as total_orders,
  SUM(rr.revenue_amount) as total_revenue,
  SUM(so.total_cogs) as total_cogs,
  SUM(rr.revenue_amount) - SUM(COALESCE(so.total_cogs, 0)) as gross_profit
FROM revenue_recognition rr
LEFT JOIN sales_orders so ON rr.sales_order_id = so.id
WHERE rr.is_recognized = TRUE
GROUP BY EXTRACT(MONTH FROM rr.revenue_recognized_date), EXTRACT(YEAR FROM rr.revenue_recognized_date)
ORDER BY year DESC, month DESC;

-- View for complete profit calculation
CREATE OR REPLACE VIEW v_profit_summary AS
SELECT 
  DATE_TRUNC('month', COALESCE(rr.revenue_recognized_date, ft.transaction_date))::DATE as period,
  COALESCE(SUM(CASE WHEN ft.transaction_type = 'REVENUE' THEN ft.amount ELSE 0 END), 0) as total_revenue,
  COALESCE(SUM(CASE WHEN ft.transaction_type = 'COGS' THEN ft.amount ELSE 0 END), 0) as total_cogs,
  COALESCE(SUM(CASE WHEN ft.transaction_type = 'FUEL' THEN ft.amount ELSE 0 END), 0) as total_fuel,
  COALESCE(SUM(CASE WHEN ft.transaction_type = 'MAINTENANCE' THEN ft.amount ELSE 0 END), 0) as total_maintenance,
  COALESCE(SUM(CASE WHEN ft.transaction_type = 'SALARY' THEN ft.amount ELSE 0 END), 0) as total_salaries,
  COALESCE(SUM(CASE WHEN ft.transaction_type = 'REVENUE' THEN ft.amount ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN ft.transaction_type IN ('COGS', 'FUEL', 'MAINTENANCE', 'SALARY') THEN ft.amount ELSE 0 END), 0) as net_profit
FROM financial_transactions ft
LEFT JOIN revenue_recognition rr ON ft.related_order_id = rr.sales_order_id
WHERE ft.status = 'CONFIRMED'
GROUP BY DATE_TRUNC('month', COALESCE(rr.revenue_recognized_date, ft.transaction_date))
ORDER BY period DESC;

-- View for inventory accuracy
CREATE OR REPLACE VIEW v_inventory_accuracy AS
SELECT 
  i.id,
  i.item_name,
  i.quantity as current_stock,
  COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0) as total_sold,
  COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) as total_purchased,
  COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) as total_adjustments,
  i.quantity + COALESCE(SUM(CASE WHEN it.transaction_type = 'PURCHASE' THEN it.quantity_change ELSE 0 END), 0) + 
  COALESCE(SUM(CASE WHEN it.transaction_type = 'ADJUSTMENT' THEN it.quantity_change ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN it.transaction_type = 'SALE' THEN it.quantity_change ELSE 0 END), 0) as calculated_quantity,
  (SELECT MAX(created_at) FROM inventory_transactions WHERE inventory_id = i.id) as last_transaction_date
FROM inventory i
LEFT JOIN inventory_transactions it ON i.id = it.inventory_id
GROUP BY i.id, i.item_name, i.quantity
ORDER BY i.item_name;

-- ============================================
-- 10. CREATE VALIDATION CONSTRAINTS
-- ============================================

-- Add check constraints for data validity
ALTER TABLE sales_orders ADD CONSTRAINT IF NOT EXISTS check_order_amount_positive CHECK (amount > 0);
ALTER TABLE sales_order_items ADD CONSTRAINT IF NOT EXISTS check_item_quantity_positive CHECK (quantity > 0);
ALTER TABLE sales_order_items ADD CONSTRAINT IF NOT EXISTS check_item_price_positive CHECK (unit_price > 0);
ALTER TABLE operational_costs ADD CONSTRAINT IF NOT EXISTS check_cost_positive CHECK (amount > 0);

-- ============================================
-- 11. CREATE TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Trigger to update inventory total_cost when cogs_per_unit changes
CREATE OR REPLACE FUNCTION update_inventory_total_cost()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory 
  SET total_cost = quantity * COALESCE(cogs_per_unit, unit_cost),
      last_cogs_update = NOW()
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_total_cost
  AFTER INSERT OR UPDATE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION update_inventory_total_cost();

-- Trigger to log audit changes
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO business_logic_audit_log (entity_type, entity_id, action, changed_by, new_value)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'CREATE', NEW.created_by, row_to_json(NEW)::TEXT);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO business_logic_audit_log (entity_type, entity_id, action, changed_by, old_value, new_value)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', NEW.created_by, row_to_json(OLD)::TEXT, row_to_json(NEW)::TEXT);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO business_logic_audit_log (entity_type, entity_id, action, changed_by, old_value)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', OLD.created_by, row_to_json(OLD)::TEXT);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to key tables
CREATE TRIGGER audit_sales_orders AFTER INSERT OR UPDATE OR DELETE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_inventory AFTER INSERT OR UPDATE OR DELETE ON inventory
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_material_requests AFTER INSERT OR UPDATE OR DELETE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================
-- SUMMARY OF CHANGES
-- ============================================
-- NEW TABLES CREATED:
-- - sales_order_items: Track individual items in sales orders
-- - financial_transactions: Complete audit trail of all financial events
-- - revenue_recognition: Track revenue recognition timing
-- - inventory_transactions: Track all inventory changes
-- - material_request_approvals: Standardized approval workflow
-- - sales_order_approvals: Standardized approval workflow
-- - operational_costs: Track all operational expenses
-- - delivery_confirmations: GPS-based delivery verification
-- - status_definitions: Consistent status management
-- - business_logic_audit_log: Complete audit trail
--
-- COLUMNS ADDED:
-- - sales_orders: approval_chain, approved_date, delivery_date, delivery_confirmed_*
-- - material_requests: inventory_id, inventory_updated, approval_chain, final_approved_date
-- - inventory: cogs_per_unit, last_cogs_update, is_active
-- - driver_locations: delivery_id, is_delivery_location, delivery_confirmed
--
-- VIEWS CREATED:
-- - v_revenue_summary: Accurate revenue by month/year
-- - v_profit_summary: Complete profit calculation
-- - v_inventory_accuracy: Real-time inventory tracking
--
-- TRIGGERS CREATED:
-- - update_inventory_total_cost: Automatic cost calculations
-- - audit_trigger: Comprehensive audit logging
--
-- ============================================
-- FINAL STEP: Run these validations
-- SELECT * FROM v_revenue_summary;
-- SELECT * FROM v_profit_summary;
-- SELECT * FROM v_inventory_accuracy;
-- SELECT COUNT(*) as total_audit_entries FROM business_logic_audit_log;
-- ============================================
