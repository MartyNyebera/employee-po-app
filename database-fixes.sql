-- ========================================
-- CRITICAL DATABASE FIXES - BUSINESS LOGIC
-- ========================================
-- Run these migrations to fix business logic issues

-- 1. Add delivery-sales_order relationship
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS sales_order_id TEXT REFERENCES sales_orders(id);

-- 2. Create revenue recognition tracking
CREATE TABLE IF NOT EXISTS revenue_recognition (
  id SERIAL PRIMARY KEY,
  sales_order_id TEXT REFERENCES sales_orders(id),
  delivery_id TEXT REFERENCES deliveries(id),
  amount NUMERIC(12,2) NOT NULL,
  recognized_date DATE NOT NULL,
  recognized_by TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create inventory reduction tracking
CREATE TABLE IF NOT EXISTS inventory_reductions (
  id SERIAL PRIMARY KEY,
  inventory_id TEXT REFERENCES inventory(id),
  quantity NUMERIC(10,2) NOT NULL,
  reduction_type TEXT NOT NULL CHECK (reduction_type IN ('sale', 'damage', 'adjustment')),
  reference_id TEXT,
  reference_type TEXT,
  unit_cost NUMERIC(12,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Create inventory increase tracking
CREATE TABLE IF NOT EXISTS inventory_increases (
  id SERIAL PRIMARY KEY,
  inventory_id TEXT REFERENCES inventory(id),
  quantity NUMERIC(10,2) NOT NULL,
  increase_type TEXT NOT NULL CHECK (increase_type IN ('purchase', 'adjustment', 'return')),
  reference_id TEXT,
  reference_type TEXT,
  unit_cost NUMERIC(12,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Add sales order items table (missing from current schema)
CREATE TABLE IF NOT EXISTS sales_order_items (
  id SERIAL PRIMARY KEY,
  sales_order_id TEXT REFERENCES sales_orders(id) ON DELETE CASCADE,
  inventory_id TEXT REFERENCES inventory(id),
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Create purchase order items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_id TEXT REFERENCES inventory(id),
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Create unified approval workflow
CREATE TABLE IF NOT EXISTS approval_workflows (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  workflow_type TEXT NOT NULL DEFAULT 'standard',
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES approval_workflows(id),
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  approver_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Create financial transaction audit trail
CREATE TABLE IF NOT EXISTS financial_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type TEXT NOT NULL,
  reference_id TEXT,
  reference_type TEXT,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  debit_account TEXT,
  credit_account TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_revenue_recognition_sales_order ON revenue_recognition(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reductions_inventory ON inventory_reductions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_increases_inventory ON inventory_increases(inventory_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sales_order ON sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_entity ON approval_workflows(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(transaction_type);

-- 10. Add missing columns to existing tables
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- 11. Create inventory triggers for automatic calculations
CREATE OR REPLACE FUNCTION update_inventory_total_cost()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory 
  SET total_cost = quantity * unit_cost,
      updated_at = NOW()
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_total_cost
  AFTER INSERT OR UPDATE ON inventory_increases
  FOR EACH ROW EXECUTE FUNCTION update_inventory_total_cost();

CREATE TRIGGER trigger_update_inventory_total_cost_reduction
  AFTER INSERT OR UPDATE ON inventory_reductions
  FOR EACH ROW EXECUTE FUNCTION update_inventory_total_cost();

-- 12. Create function to calculate current inventory level
CREATE OR REPLACE FUNCTION calculate_inventory_level(p_inventory_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
  current_level NUMERIC;
BEGIN
  SELECT 
    COALESCE(i.quantity, 0) + 
    COALESCE(SUM(ii.quantity), 0) - 
    COALESCE(SUM(ir.quantity), 0)
  INTO current_level
  FROM inventory i
  LEFT JOIN inventory_increases ii ON i.id = ii.inventory_id
  LEFT JOIN inventory_reductions ir ON i.id = ir.inventory_id
  WHERE i.id = p_inventory_id
  GROUP BY i.id, i.quantity;
  
  RETURN COALESCE(current_level, 0);
END;
$$ LANGUAGE plpgsql;
