-- Database Performance Optimization Script
-- Add indexes to improve query performance

-- Purchase Orders indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_id ON purchase_orders(id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_date ON purchase_orders(created_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);

-- Sales Orders indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_id ON sales_orders(id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_date ON sales_orders(created_date);
CREATE INDEX IF NOT EXISTS idx_sales_orders_so_number ON sales_orders(so_number);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_id ON transactions(id);
CREATE INDEX IF NOT EXISTS idx_transactions_po_number ON transactions(po_number);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Inventory indexes
CREATE INDEX IF NOT EXISTS idx_inventory_id ON inventory(id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_code ON inventory(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_item_name ON inventory(item_name);

-- Assets indexes
CREATE INDEX IF NOT EXISTS idx_assets_id ON assets(id);
CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);

-- Vehicles indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_id ON vehicles(id);
CREATE INDEX IF NOT EXISTS idx_vehicles_unit_name ON vehicles(unit_name);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_number ON vehicles(plate_number);

-- Drivers indexes
CREATE INDEX IF NOT EXISTS idx_drivers_id ON drivers(id);
CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers(email);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_super_admin ON users(is_super_admin);

-- Employee accounts indexes
CREATE INDEX IF NOT EXISTS idx_employee_accounts_id ON employee_accounts(id);
CREATE INDEX IF NOT EXISTS idx_employee_accounts_email ON employee_accounts(email);
CREATE INDEX IF NOT EXISTS idx_employee_accounts_status ON employee_accounts(status);

-- Driver accounts indexes
CREATE INDEX IF NOT EXISTS idx_driver_accounts_id ON driver_accounts(id);
CREATE INDEX IF NOT EXISTS idx_driver_accounts_email ON driver_accounts(email);
CREATE INDEX IF NOT EXISTS idx_driver_accounts_status ON driver_accounts(status);

-- Material requests indexes
CREATE INDEX IF NOT EXISTS idx_material_requests_id ON material_requests(id);
CREATE INDEX IF NOT EXISTS idx_material_requests_employee_id ON material_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_requests_created_date ON material_requests(created_date);

-- Driver locations indexes
CREATE INDEX IF NOT EXISTS idx_driver_locations_id ON driver_locations(id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_timestamp ON driver_locations(timestamp);

-- Driver deliveries indexes
CREATE INDEX IF NOT EXISTS idx_driver_deliveries_id ON driver_deliveries(id);
CREATE INDEX IF NOT EXISTS idx_driver_deliveries_driver_id ON driver_deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_deliveries_status ON driver_deliveries(status);

-- Driver messages indexes
CREATE INDEX IF NOT EXISTS idx_driver_messages_id ON driver_messages(id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_driver_id ON driver_messages(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_created_at ON driver_messages(created_at);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_id ON notifications(id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- Analyze tables to update statistics
ANALYZE purchase_orders;
ANALYZE sales_orders;
ANALYZE transactions;
ANALYZE inventory;
ANALYZE assets;
ANALYZE vehicles;
ANALYZE drivers;
ANALYZE users;
ANALYZE employee_accounts;
ANALYZE driver_accounts;
ANALYZE material_requests;
ANALYZE driver_locations;
ANALYZE driver_deliveries;
ANALYZE driver_messages;
ANALYZE notifications;
