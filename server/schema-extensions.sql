-- ====================================================
-- EXTENDED SCHEMA FOR EMPLOYEE & DRIVER PORTALS
-- ====================================================
-- Add these tables to existing database without modifying current tables

-- Employee accounts
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
);

-- Driver accounts
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
);

-- Material requests from employees
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
);

-- Driver GPS locations
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
);

-- Driver deliveries
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
);

-- Driver-Admin chat messages
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
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_type VARCHAR(50) NOT NULL,
  recipient_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_accounts_email ON employee_accounts(email);
CREATE INDEX IF NOT EXISTS idx_driver_accounts_email ON driver_accounts(email);
CREATE INDEX IF NOT EXISTS idx_material_requests_employee_id ON material_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_timestamp ON driver_locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_driver_deliveries_driver_id ON driver_deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_driver_id ON driver_messages(driver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id);
