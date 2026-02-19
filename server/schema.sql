-- Employee Purchase Order App / Fleet Manager
-- Schema for TimescaleDB (PostgreSQL)
-- Run: psql -U postgres -d fleet_manager -f server/schema.sql
-- Or create DB first: CREATE DATABASE fleet_manager;

-- Users (for login / accounts)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'admin')),
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin approval requests (when non-super-admins request admin role)
CREATE TABLE IF NOT EXISTS admin_approval_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  decided_by TEXT REFERENCES users(id),
  decided_at TIMESTAMPTZ
);

-- Assets table (fleet vehicles)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('truck', 'backhoe', 'excavator')),
  status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'offline')),
  location TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  engine_hours INTEGER NOT NULL DEFAULT 0,
  idle_time INTEGER NOT NULL DEFAULT 0,
  fuel_level NUMERIC(5,2) NOT NULL DEFAULT 0,
  battery_voltage NUMERIC(4,2) NOT NULL DEFAULT 0,
  speed NUMERIC(6,2) NOT NULL DEFAULT 0,
  in_geofence BOOLEAN NOT NULL DEFAULT true,
  last_update TEXT,
  driver TEXT,
  efficiency_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'in-progress', 'completed')),
  created_date DATE NOT NULL,
  delivery_date DATE NOT NULL,
  assigned_assets TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fuel', 'maintenance', 'parts', 'rental')),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  receipt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GPS telemetry table (for TimescaleDB - when GPS devices are connected)
-- If TimescaleDB extension is enabled, convert to hypertable with: SELECT create_hypertable('asset_telemetry', 'time', if_not_exists => TRUE);
CREATE TABLE IF NOT EXISTS asset_telemetry (
  time TIMESTAMPTZ NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed NUMERIC(6,2) DEFAULT 0,
  heading NUMERIC(5,2),
  accuracy NUMERIC(6,2)
);

-- Enable TimescaleDB and convert asset_telemetry to hypertable (requires superuser)
-- Run separately if you have TimescaleDB installed:
-- CREATE EXTENSION IF NOT EXISTS timescaledb;
-- SELECT create_hypertable('asset_telemetry', 'time', if_not_exists => TRUE);
-- CREATE INDEX IF NOT EXISTS idx_asset_telemetry_asset_id ON asset_telemetry (asset_id, time DESC);
