import express from 'express';
import cors from 'cors';
import compression from 'compression';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getClient, testConnection, createNewTables } from './db.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Promise Rejection:', reason);
  // do NOT call process.exit() — let Render keep the process alive
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err.message);
  // do NOT call process.exit()
});

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  // Message attachments are photos/PDFs only. Rejecting html/svg/scripts prevents
  // an uploaded file from being served same-origin and executing as stored XSS.
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Only images and PDFs are allowed.'));
  }
});
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { seed } from './seed.js';
import { hashPassword, comparePassword, signToken, requireAuth, requireAdmin, requireSuperAdmin, requireRole, effectiveRole } from './auth.js';
import { createSalesOrder, createPurchaseOrder } from './order-service.js';
import { sendEmailToAdminsNewRequest, sendEmailToApplicant } from './email.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression()); // gzip/brotli text responses (JS/CSS/JSON) — ~3-4x smaller over the wire
// 5mb, not the 100kb default: scanned certificates of registration are stored as base64
// data URLs and a legible A4 scan exceeds 100kb easily. Note this also makes the per-route
// size guards (e.g. the signature routes' 2M-character check) reachable — under the default
// limit express rejected those payloads with a 413 before any handler ran.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Add CSP headers to allow frontend connections
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; " +
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org; " +
    "connect-src 'self' ws: wss: http://localhost:3000 https://localhost:3000; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "object-src 'none'; " +
    "media-src 'self'; " +
    "frame-src 'self' https://www.openstreetmap.org;"
  );
  next();
});

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

  // Fleet/vehicle data: never cache — user-edited CRUD must reflect changes
  // immediately (was max-age=60, which showed stale data after add/edit/delete).
  if (req.path.includes('/fleet') ||
      req.path.includes('/vehicle')) {
    res.setHeader('Cache-Control',
      'no-store, no-cache, must-revalidate');
    return next();
  }

  // General business data (orders, sales orders, inventory, transactions): never
  // cache. These are CRUD lists; HTTP caching made adds/deletes not show up on
  // reload for ~30s (was max-age=30, stale-while-revalidate=15).
  res.setHeader('Cache-Control',
    'no-store, no-cache, must-revalidate');
  next();
});

// Performance timing middleware — dev only. In production this logged every request
// (incl. the 1 Hz GPS pings) synchronously to stdout on the hot path.
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`🚀 ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      if (duration > 1000) {
        console.warn(`⚠️  SLOW RESPONSE: ${req.method} ${req.path} took ${duration}ms`);
      }
    });
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Test endpoint for frontend connectivity
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!', 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
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

// [removed] GET /health/super-admin-status — publicly leaked super-admin emails (security fix)

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

// [removed] GET /health/auth-debug — allowed account enumeration by email (security fix)

// [removed] GET /debug/users — publicly dumped every user account (security fix)

// [removed] POST /emergency-create-admin — let anyone create/upgrade a super-admin with no auth (security fix)

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

    // Alter purchase_orders: drop old status constraint and add new one with RECEIVED, PAID
    // and 'cancelled'. Logistics owns the tail of this lifecycle once an admin approves:
    //   approved --> in-progress --> RECEIVED    (terminal; RECEIVED is what counts as an expense)
    //           \-------------------> cancelled  (terminal)
    // 'in-progress' predates this and meant nothing — it now means "ongoing delivery".
    // A PO now clears two gates before it is 'approved' (Section C — #12): Purchasing raises it
    // ('pending', awaiting Accounting), Accounting reviews it ('accounting-approved', awaiting
    // Admin), Admin approves it ('approved', → Warehouse for delivery). A refusal at either gate
    // sends it back to Purchasing as 'rejected', who revise and resubmit (→ 'pending').
    //   pending --> accounting-approved --> approved --> in-progress --> RECEIVED  (terminal)
    //      \-------------\--------------------> rejected --> (resubmit) --> pending
    //                                        \--> cancelled (terminal)
    try {
      await query(`ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check`);
      await query(`ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('pending', 'accounting-approved', 'rejected', 'approved', 'in-progress', 'RECEIVED', 'PAID', 'completed', 'cancelled'))`);
      console.log('✅ purchase_orders status constraint updated (added accounting-approved, rejected)');
    } catch (err) {
      console.log('ℹ️ purchase_orders constraint update skipped:', err.message);
    }

    // The accounting review of a PO (Section C — #12). Distinct from the free-text reviewed_by,
    // which is create-form text the printout falls back on: these three are stamped ONLY by the
    // accounting-review route and name the real reviewer (→ accounting_accounts for a signature).
    try {
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_reviewed_by TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_reviewed_by_id INTEGER`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_reviewed_at TIMESTAMPTZ`);
      console.log('✅ purchase_orders accounting-review columns ready');
    } catch (err) {
      console.log('ℹ️ purchase_orders accounting-review columns skipped:', err.message);
    }

    // Who confirmed each step of the delivery, and when. Mirrors the approved_by/approved_at
    // naming already on this table. Without these, marking an order received would record the
    // fact but not the accountability.
    try {
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS in_transit_by TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT`);
      // What the receipt actually put onto the shelf, recorded AT the moment of receipt. This
      // was previously computed, returned once in the PUT response and thrown away — so the
      // delivery receipt could only ever be printed from that one response, and the resulting
      // stock figure was unreconstructable afterwards (production withdraws move it).
      //
      // NULL and '[]' mean different things and the document says so: NULL is "received before
      // this was recorded" (the two live orders), '[]' is "recorded, and nothing was an
      // inventory item" (a hand-raised order). Printing "nothing was added" for a NULL would
      // be a lie — both live orders did add stock.
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_lines JSONB`);
      console.log('✅ purchase_orders logistics/delivery columns ready');
    } catch (err) {
      console.log('ℹ️ purchase_orders delivery columns skipped:', err.message);
    }

    // The printed order names four people; approved_by/prepared_by hold display NAMES, which
    // cannot be joined back to an account for a signature. These ids close that gap.
    // processed_* is the purchasing employee who turned the request into an order — previously
    // squeezed into prepared_by, which the document now uses for the requesting employee.
    try {
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by_id TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS processed_by TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS processed_by_id INTEGER`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
      // One-time backfill for orders approved before the id existed. Idempotent via IS NULL;
      // matches on name, the only link those rows have.
      const bf = await query(
        `UPDATE purchase_orders po SET approved_by_id = u.id
           FROM users u
          WHERE po.approved_by_id IS NULL AND po.approved_by IS NOT NULL AND u.name = po.approved_by`
      );
      if (bf.rowCount) console.log(`✅ purchase_orders approved_by_id backfilled (${bf.rowCount} row(s))`);
      console.log('✅ purchase_orders signatory columns ready');
    } catch (err) {
      console.log('ℹ️ purchase_orders signatory columns skipped:', err.message);
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

    // [removed] Fleet/GPS/Delivery tables (gps_locations, vehicles, drivers, deliveries)
    // — feature removed; these tables were dropped and are no longer created.

    // Add reservation columns to inventory (non-breaking)
    try {
      await query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC(10,2) DEFAULT 0`);
      await query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS in_transit_quantity NUMERIC(10,2) DEFAULT 0`);
      console.log('✅ inventory reservation columns ready');
    } catch (err) {
      console.log('ℹ️ inventory reservation columns skipped:', err.message);
    }

    // Supplier statutory details. The certificate is a scan held as a data-URL in TEXT
    // (same approach as purchase_requests.checked_signature). It is deliberately NOT
    // returned by the suppliers list query — see GET /api/suppliers.
    try {
      await query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tin TEXT`);
      await query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS certificate_of_registration TEXT`);
      await query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS certificate_filename TEXT`);
      console.log('✅ suppliers TIN/certificate columns ready');
    } catch (err) {
      console.log('ℹ️ suppliers TIN/certificate columns skipped:', err.message);
    }

    // [removed] sales_orders delivery-linking columns (driver_id, vehicle_id, delivery_id)
    // and driver_accounts/deliveries fleet migrations — feature removed.

    // Add migration for approved_by column type change (integer to text)
    try {
      // Change approved_by from INTEGER to VARCHAR(255) to store names
      await query(`ALTER TABLE employee_accounts ALTER COLUMN approved_by TYPE VARCHAR(255) USING approved_by::VARCHAR(255)`);
      console.log('✅ employee_accounts approved_by column migrated to VARCHAR(255)');
    } catch (err) {
      console.log('ℹ️ employee_accounts approved_by column migration skipped:', err.message);
    }

    // ============================================================
    // CRM + Sales Pipeline + Role-based views — additive only.
    // (Suppliers, Customers, Inquiries/Quotations,
    //  Work Schedule, plus links onto existing tables.)
    // ============================================================

    // Suppliers directory
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT CHECK (type IN ('Electrical parts','Mechanical parts','Both','Fabrication (subcon)','Raw materials')),
          products_supplied TEXT,
          contact_person TEXT,
          phone TEXT,
          email TEXT,
          location TEXT,
          payment_terms TEXT,
          price_level TEXT CHECK (price_level IN ('Cheap','Average','Expensive')),
          reliability TEXT CHECK (reliability IN ('Excellent','Good','OK','Poor')),
          last_ordered DATE,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ suppliers table ready');
    } catch (err) { console.log('ℹ️ suppliers table skipped:', err.message); }

    // Customers directory (light CRM)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT CHECK (type IN ('Contractor','Builder','Factory','Distributor','Maintenance','Other')),
          contact_person TEXT,
          phone TEXT,
          email TEXT,
          location TEXT,
          what_they_buy TEXT,
          source TEXT CHECK (source IN ('Referral','Facebook','Marketplace','Ad','Walk-in','Website','Existing contact')),
          status TEXT CHECK (status IN ('Lead','Active','Repeat','Inactive')),
          last_contact DATE,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ customers table ready');
    } catch (err) { console.log('ℹ️ customers table skipped:', err.message); }

    // Inquiries / Quotations (sales pipeline; captures both supplier + client quotes)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS inquiries (
          id TEXT PRIMARY KEY,
          inquiry_date DATE NOT NULL,
          customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
          customer_name TEXT,
          contact TEXT,
          what_they_want TEXT,
          line TEXT,
          source TEXT CHECK (source IN ('Referral','Facebook','Marketplace','Ad','Walk-in','Website','Existing contact')),
          status TEXT CHECK (status IN ('New','Quoted','Won','Lost','Follow-up')) DEFAULT 'New',
          quote_amount NUMERIC(12,2),
          supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
          supplier_name TEXT,
          supplier_quote_amount NUMERIC(12,2),
          follow_up_date DATE,
          sales_order_id TEXT,
          purchase_order_id TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ inquiries table ready');
    } catch (err) { console.log('ℹ️ inquiries table skipped:', err.message); }

    // Product Lines module removed — drop its table if present (FK was product_lines -> suppliers,
    // so this does NOT affect the suppliers table or any supplier data).
    try {
      await query('DROP TABLE IF EXISTS product_lines');
      console.log('🗑️  product_lines table dropped (module removed)');
    } catch (err) {
      console.log('ℹ️ product_lines drop skipped:', err.message);
    }

    // [removed] operational_costs table — fleet operational-cost tracking removed.

    // Nullable links from existing tables to the new directories (non-breaking)
    try {
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS inquiry_id TEXT`);
      await query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS line TEXT`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS source TEXT`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS inquiry_id TEXT`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(12,2)`);
      console.log('✅ CRM link columns ready (purchase_orders / inventory / sales_orders)');
    } catch (err) {
      console.log('ℹ️ CRM link columns skipped:', err.message);
    }

    // Editable PDF header fields on orders (non-breaking; printed templates read these first)
    try {
      for (const t of ['sales_orders', 'purchase_orders']) {
        await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS doc_date DATE`);
        await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS prepared_by TEXT`);
        await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
        await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS payment_terms TEXT`);
        await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`);
      }
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_address TEXT`);
      await query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_contact TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_address TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_contact TEXT`);
      // #7 — domestic vs foreign purchase order, selectable in the create modal. Previously it
      // survived only inside the description blob ("PO Type:"); a real column makes it queryable,
      // editable and printable.
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_type TEXT`);
      // Backfill existing orders so old/pre-change records show proper header values too.
      // [removed] the prepared_by = 'Kim Karen D. Tagle' backfill — it stamped one real person's
      // name onto every order that had no preparer, which is the same untruth the print layer
      // used to add as a default. Dropping the default there only fixed half of it: this wrote
      // the name into the column, so a hand-raised order would still print it. A blank Prepared
      // By line is honest. (No live row was ever stamped, so there is nothing to undo.)
      for (const t of ['sales_orders', 'purchase_orders']) {
        await query(`UPDATE ${t} SET doc_date = created_date WHERE doc_date IS NULL`);
        await query(`UPDATE ${t} SET payment_terms = '30 days from receipt/acceptance' WHERE payment_terms IS NULL OR btrim(payment_terms) = ''`);
      }
      console.log('✅ PDF header columns ready + backfilled (sales_orders / purchase_orders)');
    } catch (err) {
      console.log('ℹ️ PDF header columns skipped:', err.message);
    }

    // Extend allowed user roles for role-based dashboards (additive; existing rows unaffected)
    try {
      await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
      await query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('employee','admin','bookkeeper','purchasing','office_admin'))`);
      console.log('✅ users role constraint extended (bookkeeper, purchasing, office_admin)');
    } catch (err) {
      console.log('ℹ️ users role constraint update skipped:', err.message);
    }

    // Soft-disable flag for staff accounts (additive)
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
      console.log('✅ users is_active column ready');
    } catch (err) {
      console.log('ℹ️ users is_active column skipped:', err.message);
    }

    // The admin's own signature — mountSignatureRoutes('admin', 'users', 'admin') reads and
    // writes it, and it resolves the Approved By / Supervised By blocks on the printed order.
    // Every other account table declares this column in its CREATE; `users` is the one table
    // created by schema.sql instead of here, so it was missed. Without it all four /signatures
    // routes 500 — and printPurchaseOrder swallows that into a silently unsigned document,
    // indistinguishable from "nobody has signed yet". The live DB already has the column; this
    // is a no-op there and closes the trap for any fresh bootstrap.
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT`);
      console.log('✅ users signature column ready');
    } catch (err) {
      console.log('ℹ️ users signature column skipped:', err.message);
    }

    // Projects (admin-created; purchase requests can be charged to a project)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT CHECK (status IN ('Active','On Hold','Completed')) DEFAULT 'Active',
          client TEXT,
          location TEXT,
          start_date DATE,
          end_date DATE,
          budget_allocation NUMERIC(14,2) DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ projects table ready');
    } catch (err) { console.log('ℹ️ projects table skipped:', err.message); }

    // Purchase requests (employee-filed via /production portal; line items stored as JSONB)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS purchase_requests (
          id TEXT PRIMARY KEY,
          pr_number TEXT UNIQUE NOT NULL,
          employee_id INTEGER REFERENCES employee_accounts(id) ON DELETE SET NULL,
          employee_name TEXT,
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          needed_by DATE,
          supplier TEXT,
          notes TEXT,
          items JSONB NOT NULL DEFAULT '[]',
          total NUMERIC(14,2) DEFAULT 0,
          status TEXT CHECK (status IN ('pending','approved','disapproved')) DEFAULT 'pending',
          withdrawn BOOLEAN DEFAULT false,
          reviewed_by TEXT,
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ purchase_requests table ready');
    } catch (err) { console.log('ℹ️ purchase_requests table skipped:', err.message); }

    // Review stage columns + status machine. Flow:
    //   pending → (accounting) reviewed → (admin) verified → (purchasing raises a PO) ordered
    //   → (admin approves that PO) approved; disapproved is reachable from the accounting,
    //   verification or PO-approval gate.
    // Naming note, three distinct actors on one row:
    //   checked_*  = Accounting's review (this was Purchasing before the flow change)
    //   verified_* = the ADMIN's verification of the request itself
    //   reviewed_* = the ADMIN's approval of the purchase order, which approves the request
    // CREATE TABLE IF NOT EXISTS won't alter an existing table, so migrate explicitly.
    try {
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS checked_by TEXT`);
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ`);
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS verified_by TEXT`);
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
      // Expand the status CHECK for the intermediate 'reviewed', 'verified' and 'ordered' states.
      await query(`ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check`);
      await query(`ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK (status IN ('pending','reviewed','verified','ordered','approved','disapproved'))`);
      // Snapshot of the reviewer's e-signature taken at check time (data-URL).
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS checked_signature TEXT`);
      // verified_by holds a NAME, which cannot be joined back to an account for a signature.
      // Deliberately no FK: this is only ever used to LEFT JOIN a signature, and a FK here
      // would block deleting an admin who once verified something.
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS verified_by_id TEXT`);
      // The employee's `total` is an ESTIMATE. Purchasing sets the real price when they assign
      // a supplier; final_total is the sum of the priced lines (ex-VAT), so it compares
      // like-for-like against `total`. Per-line finals live in the items JSONB alongside the
      // estimate (finalUnitCost / finalAmount), so nothing is overwritten.
      await query(`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS final_total NUMERIC(12,2)`);
      // One-time backfill for requests verified before the column existed. Idempotent via the
      // IS NULL guard; matches on name, which is the only link those rows have.
      const bf = await query(
        `UPDATE purchase_requests pr SET verified_by_id = u.id
           FROM users u
          WHERE pr.verified_by_id IS NULL AND pr.verified_by IS NOT NULL AND u.name = pr.verified_by`
      );
      if (bf.rowCount) console.log(`✅ purchase_requests verified_by_id backfilled (${bf.rowCount} row(s))`);
      console.log('✅ purchase_requests review columns/status ready');
    } catch (err) { console.log('ℹ️ purchase_requests review migration skipped:', err.message); }

    // Purchasing Management accounts — dedicated identities (admin-created) for the /purchasing
    // portal, independent of the admin-dashboard staff (users) table. Each stores its own
    // saved e-signature. Mirrors the employee_accounts pattern.
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS purchasing_accounts (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          status VARCHAR(50) DEFAULT 'approved',
          signature TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ purchasing_accounts table ready');
    } catch (err) { console.log('ℹ️ purchasing_accounts table skipped:', err.message); }

    // Warehouse accounts — dedicated identities (admin-created) for the /warehouse portal,
    // independent of the admin-dashboard staff (users) table. Warehouse staff input and
    // update inventory items. Mirrors the purchasing_accounts pattern.
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS warehouse_accounts (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          status VARCHAR(50) DEFAULT 'approved',
          signature TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // The table predates the signature column, and CREATE TABLE IF NOT EXISTS won't
      // retrofit an existing one — so ALTER explicitly.
      await query(`ALTER TABLE warehouse_accounts ADD COLUMN IF NOT EXISTS signature TEXT`);
      console.log('✅ warehouse_accounts table ready');
    } catch (err) { console.log('ℹ️ warehouse_accounts table skipped:', err.message); }

    // Sales accounts — dedicated identities for the /sales portal. Sales staff raise and
    // print sales orders. Mirrors purchasing_accounts (signature included: they sign SOs).
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS sales_accounts (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          status VARCHAR(50) DEFAULT 'approved',
          signature TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ sales_accounts table ready');
    } catch (err) { console.log('ℹ️ sales_accounts table skipped:', err.message); }

    // Logistics accounts — dedicated identities for the /logistics portal. They dispatch and
    // complete deliveries against approved sales orders.
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS logistics_accounts (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          status VARCHAR(50) DEFAULT 'approved',
          signature TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ logistics_accounts table ready');
    } catch (err) { console.log('ℹ️ logistics_accounts table skipped:', err.message); }

    // Deliveries — one row per dispatched sales order, created by the /logistics portal.
    // Deliberately narrow: no drivers, no vehicles, no GPS. The previous fleet feature was
    // removed wholesale (see server/remove-fleet.js); this is a fresh, minimal record of
    // "this order went out, and this is who received it".
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS deliveries (
          id TEXT PRIMARY KEY,
          delivery_number TEXT NOT NULL UNIQUE,
          sales_order_id TEXT REFERENCES sales_orders(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','delivered','cancelled')),
          dispatched_by TEXT,
          dispatched_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ,
          received_by TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_deliveries_sales_order ON deliveries(sales_order_id)`);
      // Section D — #5/#15: a delivery can now originate from a logistics stock WITHDRAWAL rather
      // than a sales order. Such a row has no sales_order_id (already nullable) and instead carries
      // the withdrawal it came from, a free-typed destination, and a snapshot of the withdrawn line.
      await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS withdrawal_id TEXT`);
      await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS destination TEXT`);
      await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS items JSONB`);
      await query(`CREATE INDEX IF NOT EXISTS idx_deliveries_withdrawal ON deliveries(withdrawal_id)`);
      console.log('✅ deliveries table ready');
    } catch (err) { console.log('ℹ️ deliveries table skipped:', err.message); }

    // Accounting accounts — dedicated identities (admin-created) for the /accounting portal.
    // Accounting is the FIRST gate on a purchase request: they review it (stamping their saved
    // e-signature onto the PR) before Purchasing raises a PO. Mirrors purchasing_accounts.
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS accounting_accounts (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          status VARCHAR(50) DEFAULT 'approved',
          signature TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ accounting_accounts table ready');
    } catch (err) { console.log('ℹ️ accounting_accounts table skipped:', err.message); }

    // Link a purchase order back to the purchase request it fulfils, plus a real approval
    // record. purchase_orders is created by schema.sql (not here), so ALTER only. NOTE the
    // table is shared with Sales Orders — discriminated by order_type — so any PR-linked
    // query must filter order_type='purchase'.
    try {
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_request_id TEXT REFERENCES purchase_requests(id) ON DELETE SET NULL`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by TEXT`);
      await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
      console.log('✅ purchase_orders PR-link/approval columns ready');
    } catch (err) { console.log('ℹ️ purchase_orders PR-link migration skipped:', err.message); }

    // Employee saved e-signature (data-URL), used on their purchase-request printouts
    // in the "Prepared By" block. Mirrors purchasing_accounts.signature.
    try {
      await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS signature TEXT');
      console.log('✅ employee_accounts signature column ready');
    } catch (err) { console.log('ℹ️ employee_accounts signature column skipped:', err.message); }

    // Inventory withdrawal requests (employee ad-hoc withdrawals need admin approval
    // before any stock is deducted; approval performs the deduction in a transaction).
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS inventory_withdrawal_requests (
          id TEXT PRIMARY KEY,
          inventory_id TEXT REFERENCES inventory(id) ON DELETE CASCADE,
          item_name TEXT,
          quantity NUMERIC(10,2) NOT NULL,
          reason TEXT,
          requested_by_id INTEGER,
          requested_by_name TEXT,
          status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
          reviewed_by TEXT,
          reviewed_at TIMESTAMPTZ,
          deducted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      // CREATE TABLE IF NOT EXISTS won't retrofit an existing table, so migrate explicitly.
      // withdrawal_number gives the receipt something to cite; purchase_request_id groups the
      // lines of one PR withdrawal so `withdrawn` can flip only once every line is approved;
      // reviewed_by_id resolves the approving admin's signature (reviewed_by is a display name).
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS withdrawal_number TEXT`);
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS purchase_request_id TEXT`);
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_by_id TEXT`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_number ON inventory_withdrawal_requests(withdrawal_number)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_withdrawal_pr ON inventory_withdrawal_requests(purchase_request_id)`);

      // Two-stage approval: the warehouse confirms the stock is physically on the shelf, then
      // the admin authorises — and only that second step moves stock, so a rejection never has
      // to put anything back. warehouse_by_id is TEXT because an admin (users.id TEXT) may act
      // at this stage too, not only a warehouse account (SERIAL).
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS warehouse_by TEXT`);
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS warehouse_by_id TEXT`);
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS warehouse_at TIMESTAMPTZ`);
      // Section D — #5/#15: a logistics-origin withdrawal carries a delivery DESTINATION. Its
      // presence is what marks the withdrawal as one that should become a delivery on approval;
      // a production withdrawal (employee stock use) leaves it NULL and creates no delivery.
      await query(`ALTER TABLE inventory_withdrawal_requests ADD COLUMN IF NOT EXISTS destination TEXT`);
      await query(`ALTER TABLE inventory_withdrawal_requests DROP CONSTRAINT IF EXISTS inventory_withdrawal_requests_status_check`);
      await query(`ALTER TABLE inventory_withdrawal_requests ADD CONSTRAINT inventory_withdrawal_requests_status_check
                     CHECK (status IN ('pending','warehouse-approved','approved','rejected'))`);
      // reviewed_by_id was written as NULL for every admin review (the token carried no `id`),
      // so the receipt's approver signature could never resolve. Recover it by name, the same
      // idempotent one-shot used for verified_by_id/approved_by_id. Now that requireAuth
      // normalises the id, new rows record it directly and this stops matching anything.
      const wbf = await query(
        `UPDATE inventory_withdrawal_requests w SET reviewed_by_id = u.id
           FROM users u
          WHERE w.reviewed_by_id IS NULL AND w.reviewed_by IS NOT NULL AND u.name = w.reviewed_by`
      );
      if (wbf.rowCount) console.log(`✅ inventory_withdrawal_requests reviewed_by_id backfilled (${wbf.rowCount} row(s))`);
      console.log('✅ inventory_withdrawal_requests table ready');
    } catch (err) { console.log('ℹ️ inventory_withdrawal_requests table skipped:', err.message); }

    // New-item requests. The purchase-request item picker is a strict closed list over
    // inventory, so production simply cannot request something the warehouse has never
    // stocked. This is the queue that closes that loop: production asks, the warehouse
    // creates the item (approval and creation happen in ONE transaction — see the review
    // route), and the item then becomes selectable like any other.
    //
    // Deliberately NOT built on `material_requests`, which looks adjacent but is the wrong
    // axis (employee→admin, links an EXISTING inventory_id rather than creating one) and has
    // no guard on 5 of its 6 routes. The shape here copies inventory_withdrawal_requests.
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS inventory_item_requests (
          id TEXT PRIMARY KEY,
          request_number TEXT,
          item_name TEXT NOT NULL,
          description TEXT,
          unit TEXT DEFAULT 'pcs',
          reason TEXT,
          requested_by_id INTEGER,
          requested_by_name TEXT,
          status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
          reviewed_by TEXT,
          reviewed_by_id INTEGER,
          reviewed_at TIMESTAMPTZ,
          -- The item the warehouse created on approval. SET NULL rather than CASCADE: if the
          -- item is later deleted, the record that it was once requested and approved stands.
          inventory_id TEXT REFERENCES inventory(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_item_request_number ON inventory_item_requests(request_number)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_item_request_status ON inventory_item_requests(status)`);
      // reviewed_by_id was declared INTEGER on the assumption the reviewer is always a
      // warehouse account (SERIAL). But this route also admits admins, whose users.id is TEXT
      // ('super-admin-owner'). That never blew up only because the admin's id was arriving as
      // undefined → NULL; the moment the token carries a real id, an admin acceptance would
      // 500 on invalid integer input. TEXT holds both, as the withdrawal table already does.
      await query(`ALTER TABLE inventory_item_requests ALTER COLUMN reviewed_by_id TYPE TEXT USING reviewed_by_id::TEXT`);
      console.log('✅ inventory_item_requests table ready');
    } catch (err) { console.log('ℹ️ inventory_item_requests table skipped:', err.message); }

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
    // Self-service signup may only request a non-privileged 'employee' account or an
    // 'admin' account (which goes through the super-admin approval queue below).
    // Reject any other role so a caller can't self-provision purchasing/office_admin/owner.
    const SELF_SIGNUP_ROLES = ['employee', 'admin'];
    if (!SELF_SIGNUP_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
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
    const token = signToken({ id, userId: id, role, email: email.toLowerCase(), name, isSuperAdmin: false });
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

    // Generic response for both unknown-email and wrong-password to prevent
    // account enumeration. Unknown email must be a 401, not a thrown 500.
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password', reason: 'INVALID_CREDENTIALS' });
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password', reason: 'INVALID_CREDENTIALS' });
    }

    // Block deactivated staff accounts (is_active added by CRM migration; null/undefined = active)
    if (user.is_active === false) {
      console.log(`❌ ACCOUNT_DEACTIVATED: ${email.toLowerCase()}`);
      return res.status(403).json({ error: 'This account has been deactivated', reason: 'ACCOUNT_DEACTIVATED' });
    }

    console.log(`✅ Login successful for: ${email.toLowerCase()}`);
    const isSuperAdmin = !!user.is_super_admin;
    // `id` alongside `userId`: every portal login signs `id` and all shared code reads it, so
    // omitting it here is what made `req.user.id` undefined for admins. requireAuth normalises
    // either shape (so existing sessions still work) — this makes new tokens honest.
    // `userId` stays: four routes still read it.
    const token = signToken({
      id: user.id,
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
// [removed] Phone/Mobile GPS endpoints (/api/phone-location*, /api/mobile*) — GPS feature removed.

// ----- Public read-only data endpoints (no auth required for Overview dashboard) -----

// Counts for the admin sidebar's attention badges — only what the admin must action NEXT:
//   purchase_requests reviewed (awaiting the admin's verify),
//   purchase_orders   pending  (awaiting the admin's approval),
//   withdrawals       warehouse-approved (warehouse released, awaiting the admin).
// Live COUNTs, not notification rows: these are STATES of records, so the count is always
// correct no matter where a record was actioned — no event plumbing to drift out of sync.
// One round-trip; the sidebar polls it.
// requireAuth is explicit because this route is registered BEFORE the global
// app.use('/api', requireAuth) further down — without it, req.user would be undefined and
// requireRole would 403 every caller (including a valid admin).
app.get('/api/admin/queue-counts', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const r = await query(
      `SELECT
         (SELECT COUNT(*) FROM purchase_requests WHERE status = 'reviewed')::int AS purchase_requests,
         -- Section C — #12: the admin's PO queue is now the SECOND gate, so it counts orders
         -- Accounting has passed ('accounting-approved'), not raw 'pending' ones.
         (SELECT COUNT(*) FROM purchase_orders WHERE status = 'accounting-approved')::int AS purchase_orders,
         (SELECT COUNT(*) FROM inventory_withdrawal_requests WHERE status = 'warehouse-approved')::int AS withdrawals`
    );
    const row = r.rows[0];
    res.json({
      purchaseRequests: row.purchase_requests,
      purchaseOrders: row.purchase_orders,
      withdrawals: row.withdrawals,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/purchase-orders', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    // Columns are table-qualified: this now joins purchase_requests, so bare `status` /
    // `created_date` would be ambiguous.
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (startDate && endDate) {
      whereClause += ` AND po.created_date >= $${paramIndex++} AND po.created_date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }
    if (status) {
      whereClause += ` AND po.status = $${paramIndex++}`;
      params.push(status);
    }
    // Section D — #10: inbound receiving moved from Logistics to the WAREHOUSE. An order only
    // reaches the warehouse once an admin has approved it, so a pending/in-review one is not
    // theirs to see. Enforced here rather than in the portal: filtering client-side would still
    // ship the data. (Logistics no longer reads purchase_orders at all — its inbound tab is gone;
    // its withdrawal-origin deliveries live on the deliveries table instead.)
    if (effectiveRole(req.user) === 'warehouse') {
      whereClause += ` AND po.status IN ('approved','in-progress','RECEIVED','cancelled')`;
    }
    const result = await query(
      `SELECT po.id, po.po_number, po.client, po.description, po.amount, po.status, po.created_date, po.delivery_date,
              po.assigned_assets, po.order_type, po.doc_date, po.prepared_by, po.reviewed_by, po.supplier_address,
              po.supplier_contact, po.payment_terms, po.terms_and_conditions, po.supplier_id, po.po_type,
              po.purchase_request_id, po.approved_by, po.approved_at, pr.pr_number, pr.status AS pr_status,
              po.in_transit_at, po.in_transit_by, po.received_at, po.received_by,
              po.cancelled_at, po.cancelled_by, po.delivery_notes, po.received_lines,
              po.processed_by, po.processed_at,
              po.po_reviewed_by, po.po_reviewed_at,
              -- The printed order names the people who actually acted on the REQUEST: the
              -- employee who filed it, the accounting staffer who reviewed it, and the admin
              -- who approved it. All live on purchase_requests, which this query already joins.
              pr.employee_name AS pr_employee_name, pr.created_at AS pr_created_at,
              pr.checked_by AS pr_checked_by, pr.checked_at AS pr_checked_at,
              pr.verified_by AS pr_verified_by, pr.verified_at AS pr_verified_at,
              s.tin AS supplier_tin
       FROM purchase_orders po
       LEFT JOIN purchase_requests pr ON pr.id = po.purchase_request_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       -- created_at (the real insert TIMESTAMPTZ), not created_date: created_date is a DATE, so
       -- every order raised on the same day tied and Postgres returned them in arbitrary order —
       -- the newest was NOT reliably on top. po_number is the deterministic final tiebreaker.
       -- created_date stays the user-facing "PO Date" (it can be back-dated via doc_date).
       ${whereClause} ORDER BY po.created_at DESC, po.po_number DESC`,
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
      docDate: row.doc_date,
      preparedBy: row.prepared_by,
      reviewedBy: row.reviewed_by,
      supplierAddress: row.supplier_address,
      supplierContact: row.supplier_contact,
      paymentTerms: row.payment_terms,
      poType: row.po_type ?? null,
      termsAndConditions: row.terms_and_conditions,
      supplierId: row.supplier_id ?? null,
      // From the linked supplier record. Null on orders raised before supplier_id was
      // populated — the printout omits the TIN line rather than showing a blank.
      supplierTin: row.supplier_tin ?? null,
      purchaseRequestId: row.purchase_request_id,
      prNumber: row.pr_number ?? null,
      // A rejected PO stays 'pending' (its CHECK has no 'disapproved') — the rejection lives on
      // the request. Without prStatus a consumer cannot tell "awaiting admin" from "rejected".
      prStatus: row.pr_status ?? null,
      // Section C — #12: the printed order now has THREE signees, in the order they act:
      //   Prepared By — purchasing (processedBy/processedAt)
      //   Reviewed By — accounting (poReviewedBy/poReviewedAt)
      //   Approved By — admin      (approvedBy/approvedAt), stamped only on approval
      approvedBy: row.approved_by ?? null,
      approvedAt: row.approved_at ?? null,
      processedBy: row.processed_by ?? null,
      processedAt: row.processed_at ?? null,
      poReviewedBy: row.po_reviewed_by ?? null,
      poReviewedAt: row.po_reviewed_at ?? null,
      // Still surfaced for the request-side history (PR review report, next-dept hints), but no
      // longer signatories on the ORDER document:
      requestedBy: row.pr_employee_name ?? null,
      requestedAt: row.pr_created_at ?? null,
      checkedBy: row.pr_checked_by ?? null,
      checkedAt: row.pr_checked_at ?? null,
      verifiedBy: row.pr_verified_by ?? null,
      verifiedAt: row.pr_verified_at ?? null,
      // Logistics' confirmation trail (PUT /api/purchase-orders/:id/delivery).
      inTransitAt: row.in_transit_at ?? null,
      inTransitBy: row.in_transit_by ?? null,
      receivedAt: row.received_at ?? null,
      receivedBy: row.received_by ?? null,
      cancelledAt: row.cancelled_at ?? null,
      cancelledBy: row.cancelled_by ?? null,
      deliveryNotes: row.delivery_notes ?? null,
      // What went onto the shelf when this was received, so the delivery receipt can be
      // reprinted from the list rather than only from the one PUT response. NULL means the
      // receipt predates this record — NOT that nothing was added; the document distinguishes
      // the two, because these orders did add stock.
      receivedLines: row.received_lines ?? null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales-orders', requireAuth, async (req, res) => {
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
      `SELECT id, so_number, client, customer_id, description, amount, cost_amount, line, source, inquiry_id, status, created_date, delivery_date, assigned_assets,
              doc_date, prepared_by, reviewed_by, customer_address, customer_contact, payment_terms, terms_and_conditions
       FROM sales_orders ${whereClause} ORDER BY created_date DESC`,
      params
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      soNumber: row.so_number,
      client: row.client,
      customerId: row.customer_id,
      docDate: row.doc_date,
      preparedBy: row.prepared_by,
      reviewedBy: row.reviewed_by,
      customerAddress: row.customer_address,
      customerContact: row.customer_contact,
      paymentTerms: row.payment_terms,
      termsAndConditions: row.terms_and_conditions,
      description: row.description,
      amount: parseFloat(row.amount),
      costAmount: row.cost_amount === null ? null : parseFloat(row.cost_amount),
      line: row.line,
      source: row.source,
      inquiryId: row.inquiry_id,
      status: row.status,
      createdDate: row.created_date,
      deliveryDate: row.delivery_date,
      assignedAssets: row.assigned_assets || [],
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier, supplier_id
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
      supplierId: row.supplier_id,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/miscellaneous', requireAuth, async (req, res) => {
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

// [removed] /api/delivery-metrics and /api/test-delivery — Delivery feature removed.

// ----- PUBLIC AUTH ENDPOINTS (no token required) -----

// Employee self-registration is disabled — admins now create employee accounts
// (see POST /api/admin/employees). Kept as a 403 so old clients get a clear message.
app.post('/api/employee/register', (req, res) => {
  res.status(403).json({ error: 'Self-registration is disabled — ask your admin to create your account.' });
});

// Employee Login
app.post('/api/employee/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query(
      'SELECT * FROM employee_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1',
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

    if (employee.status === 'deactivated') {
      return res.status(403).json({ error: 'This account has been deactivated' });
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

// Purchasing Management portal login — its OWN independent auth (separate from the admin
// dashboard's staff auth). Accounts live in purchasing_accounts, created by an admin.
// Issues a JWT with role 'purchasing' so it passes the purchasing-only route guards.
app.post('/api/purchasing/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM purchasing_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const acct = result.rows[0];
    if (acct.status === 'deactivated') return res.status(403).json({ error: 'This account has been deactivated' });
    const valid = await bcrypt.compare(password, acct.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: acct.id, email: acct.email, role: 'purchasing', name: acct.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, purchasing: { id: acct.id, full_name: acct.full_name, email: acct.email, phone: acct.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Warehouse portal login — its OWN independent auth (separate from the admin dashboard's
// staff auth). Accounts live in warehouse_accounts, created by an admin. Issues a JWT with
// role 'warehouse' so it passes the warehouse-scoped route guards (inventory create/update).
app.post('/api/warehouse/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM warehouse_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const acct = result.rows[0];
    if (acct.status === 'deactivated') return res.status(403).json({ error: 'This account has been deactivated' });
    const valid = await bcrypt.compare(password, acct.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: acct.id, email: acct.email, role: 'warehouse', name: acct.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, warehouse: { id: acct.id, full_name: acct.full_name, email: acct.email, phone: acct.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accounting portal login — its OWN independent auth (separate from the admin dashboard's
// staff auth). Accounts live in accounting_accounts, created by an admin. Issues a JWT with
// role 'accounting' so it passes the accounting-scoped guards (PR review, projects).
app.post('/api/accounting/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM accounting_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const acct = result.rows[0];
    if (acct.status === 'deactivated') return res.status(403).json({ error: 'This account has been deactivated' });
    const valid = await bcrypt.compare(password, acct.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: acct.id, email: acct.email, role: 'accounting', name: acct.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, accounting: { id: acct.id, full_name: acct.full_name, email: acct.email, phone: acct.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales portal login — its OWN independent auth. Accounts live in sales_accounts, created by
// an admin. Issues a JWT with role 'sales' so it passes the sales-order write guards.
app.post('/api/sales/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM sales_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const acct = result.rows[0];
    if (acct.status === 'deactivated') return res.status(403).json({ error: 'This account has been deactivated' });
    const valid = await bcrypt.compare(password, acct.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: acct.id, email: acct.email, role: 'sales', name: acct.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, sales: { id: acct.id, full_name: acct.full_name, email: acct.email, phone: acct.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logistics portal login — its OWN independent auth. Accounts live in logistics_accounts,
// created by an admin. Issues a JWT with role 'logistics' for the delivery routes.
app.post('/api/logistics/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM logistics_accounts WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const acct = result.rows[0];
    if (acct.status === 'deactivated') return res.status(403).json({ error: 'This account has been deactivated' });
    const valid = await bcrypt.compare(password, acct.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: acct.id, email: acct.email, role: 'logistics', name: acct.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, logistics: { id: acct.id, full_name: acct.full_name, email: acct.email, phone: acct.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [removed] Driver registration + login (/api/driver/register, /api/driver/login)
// — Driver Portal feature removed.

// ----- MANUAL MIGRATION ENDPOINT (for production) -----

// Manual database migration endpoint (public access for production fixes)
app.post('/api/admin/migrate-approval-columns', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Running manual migration for approval columns...');
    
    // Add missing approval columns to existing tables
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');

    console.log('✅ Approval columns migration completed successfully');
    res.json({
      success: true,
      message: 'Database migration completed successfully',
      columns_added: [
        'employee_accounts.approved_at',
        'employee_accounts.approved_by'
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
app.get('/api/admin/migrate-approval-columns', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Running manual migration for approval columns...');
    
    // Add missing approval columns to existing tables
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP');
    await query('ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS approved_by INTEGER');

    console.log('✅ Approval columns migration completed successfully');
    res.json({
      success: true,
      message: 'Database migration completed successfully',
      columns_added: [
        'employee_accounts.approved_at',
        'employee_accounts.approved_by'
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

// [removed] Driver GPS location + vehicle-assignment endpoints (/api/driver/location,
// /api/driver/locations/live, /api/admin/drivers/:id/assign-vehicle, /api/driver/:id/vehicle,
// /api/admin/drivers/accounts) — Driver Portal / GPS feature removed.

// ----- All routes below require auth -----
app.use('/api', requireAuth);

// ========================================
// INTEGRATED BUSINESS LOGIC API FIXES
// ========================================

/**
 * FIX #1: Approve Sales Order with proper workflow
 */
app.post('/api/sales-orders/:id/approve', requireRole(['admin']), async (req, res) => {
  const { approver_id, approver_name, notes } = req.body;
  const sales_order_id = req.params.id;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock the order row so two approvals can't both pass the status check and
    // double-book revenue.
    const order = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
      [sales_order_id]
    );

    if (!order.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales order not found' });
    }

    if (order.rows[0].status !== 'pending' && order.rows[0].status !== 'in-progress') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot approve order in ${order.rows[0].status} status`
      });
    }

    await client.query(
      `INSERT INTO sales_order_approvals
       (sales_order_id, approver_id, approver_name, approval_status, approval_date, approval_level)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [sales_order_id, approver_id, approver_name, 'APPROVED', 1]
    );

    await client.query(
      `UPDATE sales_orders
       SET status = $1, approved_date = NOW()
       WHERE id = $2`,
      ['PAID', sales_order_id]
    );

    const orderData = order.rows[0];

    // Create revenue recognition record
    await client.query(
      `INSERT INTO revenue_recognition
       (sales_order_id, order_date, approval_date, revenue_amount, recognition_status)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [sales_order_id, orderData.created_date, orderData.amount, 'RECOGNIZED']
    );

    // Create financial transaction for revenue
    await client.query(
      `INSERT INTO financial_transactions
       (transaction_type, related_order_id, amount, transaction_date, description, status)
       VALUES ($1, $2, $3, NOW(), $4, $5)`,
      ['REVENUE', sales_order_id, orderData.amount, `Revenue from sales order #${orderData.so_number}`, 'CONFIRMED']
    );

    await client.query(
      `INSERT INTO business_logic_audit_log
       (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_name, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['SALES_ORDER', sales_order_id, 'APPROVE', 'status', 'pending', 'approved', approver_id, approver_name, notes]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Sales order approved successfully',
      data: {
        sales_order_id,
        status: 'approved',
        approval_date: new Date(),
        next_step: 'Order ready for fulfillment. Revenue will be recognized upon delivery.'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error approving sales order:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * FIX #2: Confirm Delivery and Trigger Revenue Recognition
 */
app.post('/api/sales-orders/:id/confirm-delivery', requireRole(['admin']), async (req, res) => {
  const { driver_id, latitude, longitude, recipient_name, gps_accuracy } = req.body;
  const sales_order_id = req.params.id;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const order = await client.query(
      'SELECT * FROM sales_orders WHERE id = $1 AND status = $2 FOR UPDATE',
      [sales_order_id, 'approved']
    );

    if (!order.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Sales order not found or not in approved status'
      });
    }

    const deliveryResult = await client.query(
      `INSERT INTO delivery_confirmations
       (sales_order_id, driver_id, delivery_date, delivery_latitude, delivery_longitude,
        recipient_name, gps_accuracy, status)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7)
       RETURNING id`,
      [sales_order_id, driver_id, latitude, longitude, recipient_name, gps_accuracy, 'CONFIRMED']
    );

    const delivery_id = deliveryResult.rows[0].id;

    await client.query(
      `UPDATE sales_orders
       SET status = $1, delivery_date = NOW(), delivery_confirmed_by = $2, delivery_confirmed_date = NOW()
       WHERE id = $3`,
      ['completed', driver_id, sales_order_id]
    );

    const revenueResult = await client.query(
      `UPDATE revenue_recognition
       SET is_recognized = TRUE,
           recognition_status = $1,
           revenue_recognized_date = NOW(),
           delivery_date = NOW()
       WHERE sales_order_id = $2
       RETURNING revenue_amount`,
      ['RECOGNIZED', sales_order_id]
    );

    const revenue_amount = revenueResult.rows[0]?.revenue_amount || order.rows[0].amount;

    await client.query(
      `INSERT INTO financial_transactions
       (transaction_type, related_order_id, amount, transaction_date, description, status)
       VALUES ($1, $2, $3, NOW(), $4, $5)`,
      ['REVENUE', sales_order_id, revenue_amount, `Revenue from sales order #${sales_order_id}`, 'CONFIRMED']
    );

    await client.query(
      `INSERT INTO business_logic_audit_log
       (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_name, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['SALES_ORDER', sales_order_id, 'DELIVERY_CONFIRMED', 'status', 'approved', 'completed', driver_id, 'Driver', `Delivery confirmed at ${latitude}, ${longitude}`]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Delivery confirmed and revenue recognized',
      data: {
        sales_order_id,
        delivery_id,
        status: 'completed',
        revenue_recognized: true,
        revenue_amount,
        delivery_confirmation: {
          latitude,
          longitude,
          recipient_name,
          gps_accuracy
        }
      }
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error confirming delivery:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * FIX #3: Deduct Inventory on Sales Order Approval
 */
app.post('/api/sales-orders/:id/deduct-inventory', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
  const sales_order_id = req.params.id;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock the order row. Idempotency guard: if it was already deducted, do nothing
    // so a repeated call can't double-deduct stock or double-book COGS.
    const soRes = await client.query(
      'SELECT is_inventory_deducted FROM sales_orders WHERE id = $1 FOR UPDATE',
      [sales_order_id]
    );
    if (!soRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales order not found' });
    }
    if (soRes.rows[0].is_inventory_deducted) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'Inventory already deducted', data: { sales_order_id, alreadyDeducted: true } });
    }

    const items = await client.query(
      'SELECT * FROM sales_order_items WHERE sales_order_id = $1',
      [sales_order_id]
    );

    let total_cogs = 0;

    for (const item of items.rows) {
      // FOR UPDATE serializes concurrent deductions so two callers can't both pass
      // the stock check and oversell.
      const inventory = await client.query(
        'SELECT * FROM inventory WHERE id = $1 FOR UPDATE',
        [item.inventory_id]
      );

      if (!inventory.rows[0]) {
        throw { httpStatus: 400, message: `Product ${item.inventory_id} not found in inventory` };
      }

      const current_stock = parseFloat(inventory.rows[0].quantity);
      const cogs_per_unit = parseFloat(inventory.rows[0].cogs_per_unit || inventory.rows[0].unit_cost || item.unit_price);
      const item_cogs = cogs_per_unit * parseFloat(item.quantity);

      if (current_stock < parseFloat(item.quantity)) {
        // Throw (not return) so the whole transaction rolls back — no partial deduct.
        throw { httpStatus: 400, message: `Insufficient inventory for ${item.product_name}. Available: ${current_stock}, Required: ${item.quantity}` };
      }

      await client.query(
        'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
        [item.quantity, item.inventory_id]
      );

      await client.query(
        `INSERT INTO inventory_transactions
         (inventory_id, transaction_type, quantity_change, reference_type, reference_id,
          previous_quantity, new_quantity, created_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.inventory_id,
          'SALE',
          -parseFloat(item.quantity),
          'SALES_ORDER',
          sales_order_id,
          current_stock,
          current_stock - parseFloat(item.quantity),
          'system',
          `Sales order ${sales_order_id}`
        ]
      );

      await client.query(
        'UPDATE sales_order_items SET cogs_per_unit = $1, cogs_total = $2 WHERE id = $3',
        [cogs_per_unit, item_cogs, item.id]
      );

      total_cogs += item_cogs;

      await client.query(
        `INSERT INTO financial_transactions
         (transaction_type, related_order_id, amount, transaction_date, description, status)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        ['COGS', sales_order_id, item_cogs, `COGS for ${item.product_name}`, 'CONFIRMED']
      );
    }

    await client.query(
      'UPDATE sales_orders SET total_cogs = $1, is_inventory_deducted = TRUE WHERE id = $2',
      [total_cogs, sales_order_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Inventory deducted successfully',
      data: {
        sales_order_id,
        items_processed: items.rows.length,
        total_cogs
      }
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const status = error.httpStatus || 500;
    if (status === 500) console.error('Error deducting inventory:', error);
    res.status(status).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * FIX #4: Approve Material Request with Inventory Update
 */
app.post('/api/material-requests/:id/approve', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
  const { approver_id, approver_name, cogs_per_unit, inventory_id } = req.body;
  const material_request_id = req.params.id;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock the request row and guard against re-approval: if inventory was already
    // updated for this request, re-running would add the stock a second time.
    const request = await client.query(
      'SELECT * FROM material_requests WHERE id = $1 FOR UPDATE',
      [material_request_id]
    );

    if (!request.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Material request not found' });
    }

    if (request.rows[0].inventory_updated === true) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: 'Material request already approved',
        data: { material_request_id, status: 'approved', alreadyApproved: true }
      });
    }

    await client.query(
      `INSERT INTO material_request_approvals
       (material_request_id, approver_id, approver_name, approval_status, approval_date, approval_level)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [material_request_id, approver_id, approver_name, 'APPROVED', 1]
    );

    if (inventory_id) {
      const quantity = parseFloat(request.rows[0].quantity_requested);

      const inv = await client.query(
        'SELECT quantity FROM inventory WHERE id = $1 FOR UPDATE',
        [inventory_id]
      );

      if (inv.rows[0]) {
        const current_stock = parseFloat(inv.rows[0].quantity);

        await client.query(
          'UPDATE inventory SET quantity = quantity + $1, cogs_per_unit = $2, last_cogs_update = NOW() WHERE id = $3',
          [quantity, cogs_per_unit || 0, inventory_id]
        );

        await client.query(
          `INSERT INTO inventory_transactions
           (inventory_id, transaction_type, quantity_change, reference_type, reference_id,
            previous_quantity, new_quantity, created_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [inventory_id, 'PURCHASE', quantity, 'MATERIAL_REQUEST', material_request_id, current_stock, current_stock + quantity, approver_id, `Material request ${material_request_id}`]
        );
      }
    }

    await client.query(
      `UPDATE material_requests
       SET status = $1, inventory_updated = TRUE, final_approved_date = NOW(), inventory_id = $2
       WHERE id = $3`,
      ['approved', inventory_id, material_request_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Material request approved and inventory updated',
      data: {
        material_request_id,
        status: 'approved',
        inventory_updated: true
      }
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error approving material request:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * FIX #5: Get Accurate Dashboard Metrics
 */
app.get('/api/dashboard/financial-summary', async (req, res) => {
  try {
    // Revenue is recognized directly from sales orders past 'pending' (approved / PAID /
    // completed). The financial_transactions REVENUE rows are only written by the unused
    // /approve + /confirm-delivery endpoints, so reading them here always yielded ₱0.
    const revenue = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM sales_orders
      WHERE status IN ('approved', 'PAID', 'completed')
      AND DATE_TRUNC('month', created_date) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    const cogs = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM financial_transactions
      WHERE transaction_type = 'COGS' AND status = 'CONFIRMED'
      AND DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    // Fleet operating-cost lines (fuel / maintenance / salaries) were sourced from
    // operational_costs + maintenance_records, which were removed with the Fleet feature.
    const totalRevenue = parseFloat(revenue.rows[0].total);
    const totalCogs = parseFloat(cogs.rows[0].total);
    const totalFuel = 0;
    const totalMaintenance = 0;
    const totalSalaries = 0;

    const grossProfit = totalRevenue - totalCogs;
    const totalOperatingCosts = totalFuel + totalMaintenance + totalSalaries;
    const netProfit = grossProfit - totalOperatingCosts;

    res.json({
      success: true,
      data: {
        period: new Date().toISOString().split('T')[0],
        revenue: { total: totalRevenue },
        costs: {
          cogs: totalCogs,
          fuel: totalFuel,
          maintenance: totalMaintenance,
          salaries: totalSalaries,
          total: totalCogs + totalOperatingCosts
        },
        profitability: {
          gross_profit: grossProfit,
          gross_margin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%',
          operating_costs: totalOperatingCosts,
          net_profit: netProfit,
          net_margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%'
        }
      }
    });

  } catch (error) {
    console.error('Error getting financial summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// [removed] POST /api/operational-costs — fleet operational-cost tracking removed.

/**
 * FIX #7: Comprehensive Business Logic Validation
 */
app.get('/api/validate/business-logic', async (req, res) => {
  try {
    const validations = [];

    const undeliveredRevenue = await query(`
      SELECT COUNT(*) as count
      FROM revenue_recognition
      WHERE is_recognized = TRUE AND delivery_date IS NULL
    `);

    if (parseInt(undeliveredRevenue.rows[0].count) > 0) {
      validations.push({
        severity: 'HIGH',
        issue: 'Revenue recognized without delivery',
        count: parseInt(undeliveredRevenue.rows[0].count),
        action: 'Review and correct revenue recognition dates'
      });
    }

    const inventoryIssues = await query(`
      SELECT id, item_name, quantity
      FROM inventory
      WHERE quantity < 0
    `);

    if (inventoryIssues.rows.length > 0) {
      validations.push({
        severity: 'HIGH',
        issue: 'Negative inventory levels detected',
        count: inventoryIssues.rows.length,
        affected_items: inventoryIssues.rows,
        action: 'Adjust inventory to non-negative values'
      });
    }

    res.json({
      success: true,
      system_health: validations.length === 0 ? 'HEALTHY' : 'ISSUES_DETECTED',
      validations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error validating business logic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

console.log('🔧 Business logic API fixes loaded successfully');

// [removed] Fleet Management, Driver Management, and Delivery Management routes
// — Fleet/GPS/Delivery feature removed.

// ----- Inventory Reservation API -----

// PUT /api/inventory/:id/reserve
app.put('/api/inventory/:id/reserve', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
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
app.put('/api/inventory/:id/unreserve', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
  try {
    const { quantity } = req.body;
    await query('UPDATE inventory SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - $1), updated_at=NOW() WHERE id=$2', [quantity, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id/deduct
app.put('/api/inventory/:id/deduct', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
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

// [removed] Fleet bulk-clear routes (vehicles/maintenance/odometer-logs), /api/fleet/seed,
// and /api/fleet/admin/clear — Fleet feature removed.

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

// (Removed a dead duplicate GET /api/purchase-orders — Express serves the earlier
// registration (~line 968), so this second one was unreachable.)

// POST /api/purchase-orders (admin only)
app.post('/api/purchase-orders', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
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
      orderType,
      purchaseRequestId,
      supplierId
    } = req.body;
    const id = `PO-${Date.now()}`;

    // A PO raised against a purchase request may only follow Accounting's review, and a
    // request may only have one PO. Enforced here so the flow can't be skipped or doubled.
    let prItems = null;
    if (purchaseRequestId) {
      const pr = await query('SELECT status, items FROM purchase_requests WHERE id = $1', [purchaseRequestId]);
      if (!pr.rows[0]) return res.status(404).json({ error: 'Purchase request not found' });
      if (pr.rows[0].status !== 'verified') {
        return res.status(400).json({ error: 'This request must be reviewed by Accounting and verified by an admin before a purchase order can be raised' });
      }
      const dupe = await query(
        `SELECT id FROM purchase_orders WHERE purchase_request_id = $1 AND COALESCE(order_type,'purchase') <> 'sales' LIMIT 1`,
        [purchaseRequestId]
      );
      if (dupe.rows[0]) return res.status(400).json({ error: 'A purchase order already exists for this request' });

      // Purchasing prices the request as they raise the order, so the order's lines ARE the
      // final pricing. They are mirrored back onto the request (beside the estimate) rather
      // than replacing it. Position-matched, so a mismatched count is rejected outright — a
      // silent skip would leave the request looking unpriced with no explanation.
      prItems = Array.isArray(pr.rows[0].items) ? pr.rows[0].items : [];
      const lines = Array.isArray(lineItems) ? lineItems : [];
      if (lines.length !== prItems.length) {
        return res.status(400).json({ error: `Priced lines (${lines.length}) do not match the request's items (${prItems.length})` });
      }
      prItems = prItems.map((it, i) => ({
        ...it,
        finalUnitCost: Number(lines[i]?.unitCost) || 0,
        finalAmount: Number(lines[i]?.amount) || 0,
      }));
    }

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
    
    // A PR-linked order is always a purchase (the table is shared with Sales Orders).
    const finalOrderType = purchaseRequestId ? 'purchase' : (orderType || null);

    // The order insert and the request's advance to 'ordered' must succeed or fail together.
    // Previously two loose queries: if the second failed, the order existed while the request
    // stayed 'verified' — and the duplicate guard above then blocked ever retrying it.
    const client_ = await getClient();
    try {
      await client_.query('BEGIN');
      // processed_* is whoever raised this order — taken from the TOKEN, never the body. On a
      // PR-linked order the printed document uses it for "Processed By" and takes "Prepared By"
      // from the request's employee instead; prepared_by stays for hand-raised orders, which
      // have no request behind them.
      const processedById = effectiveRole(req.user) === 'purchasing' ? (req.user?.id ?? null) : null;
      await client_.query(
        `INSERT INTO purchase_orders (id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type,
          doc_date, prepared_by, reviewed_by, supplier_address, supplier_contact, payment_terms, terms_and_conditions, purchase_request_id, supplier_id,
          processed_by, processed_by_id, po_type, processed_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())`,
        // reviewed_by is left NULL at creation (Section C — #12): "Reviewed By" now names the
        // accounting reviewer and is stamped only by the accounting-review route, never the form.
        [id, poNumber, client || customerName, extendedDescription, amount || totalAmount, finalCreatedDate, deliveryDate, assignedAssets, finalOrderType,
         poDate || finalCreatedDate, preparedBy || null, null, customerAddress || null, customerContact || null,
         paymentTerms || '30 days from receipt/acceptance', termsAndConditions || null, purchaseRequestId || null, supplierId || null,
         req.user?.name || null, processedById, poType || 'domestic']
      );

      // Advance the request to 'ordered' so Purchasing can see it's handled and the employee
      // sees real progress. The PR reaches 'approved' only when an admin approves this PO.
      // final_total is the priced subtotal (ex-VAT) so it compares like-for-like with `total`.
      if (purchaseRequestId) {
        await client_.query(
          `UPDATE purchase_requests SET status='ordered', items=$1::jsonb, final_total=$2, updated_at=NOW() WHERE id=$3`,
          [JSON.stringify(prItems), Number(subTotal) || 0, purchaseRequestId]
        );
      }
      await client_.query('COMMIT');
    } catch (e) {
      await client_.query('ROLLBACK');
      throw e;
    } finally {
      client_.release();
    }

    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type,
              doc_date, prepared_by, reviewed_by, supplier_address, supplier_contact, payment_terms, terms_and_conditions, po_type, purchase_request_id
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
      docDate: row.doc_date,
      preparedBy: row.prepared_by,
      reviewedBy: row.reviewed_by,
      supplierAddress: row.supplier_address,
      supplierContact: row.supplier_contact,
      paymentTerms: row.payment_terms,
      poType: row.po_type ?? null,
      termsAndConditions: row.terms_and_conditions,
      purchaseRequestId: row.purchase_request_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin approval of a purchase order — the FINAL gate of the request flow. Approving the PO
// is what flips its linked purchase request to 'approved' (which is what unlocks the
// employee's stock withdrawal), so both writes happen in ONE transaction: a PO marked
// approved while its PR stayed behind would silently strand the request.
app.put('/api/purchase-orders/:id/approve', requireRole(['admin']), async (req, res) => {
  const client = await getClient();
  try {
    const { status } = req.body;
    if (!['approved', 'disapproved'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'disapproved'" });
    }
    await client.query('BEGIN');
    const cur = await client.query('SELECT purchase_request_id, status FROM purchase_orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Purchase order not found' }); }

    // Section C — #12: the admin gate is the SECOND gate. The order must have cleared Accounting
    // first, so it can only be approved from 'accounting-approved'. This stops an admin
    // approving a raw 'pending' order that Accounting has not yet reviewed.
    if (cur.rows[0].status !== 'accounting-approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `This order is '${cur.rows[0].status}', not awaiting admin approval (it must be reviewed by Accounting first)` });
    }

    let po;
    const prId = cur.rows[0].purchase_request_id;
    if (status === 'approved') {
      // approved_by_id is what resolves this admin's signature on the printed order —
      // approved_by alone is a display name and cannot be joined on.
      po = await client.query(
        `UPDATE purchase_orders SET status='approved', approved_by=$1, approved_by_id=$2, approved_at=NOW(), updated_at=NOW() WHERE id=$3 RETURNING *`,
        [req.user?.name || 'Admin', req.user?.id ?? null, req.params.id]
      );
      // Approving the ORDER is what flips the linked request to 'approved' (which unlocks the
      // employee's stock withdrawal) — one transaction, so the PR can never lag behind the PO.
      if (prId) {
        await client.query(
          `UPDATE purchase_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW(), updated_at=NOW() WHERE id=$2`,
          [req.user?.name || 'Admin', prId]
        );
      }
    } else {
      // Rejection at the admin gate sends the order BACK to Purchasing to revise & resubmit
      // (decision: rejection returns it, not terminal). No approver is stamped — the order was
      // NOT approved — and the linked request is left intact: the request was fine, the order
      // needs fixing.
      po = await client.query(
        `UPDATE purchase_orders SET status='rejected', updated_at=NOW() WHERE id=$1 RETURNING *`,
        [req.params.id]
      );
    }
    await client.query('COMMIT');
    const row = po.rows[0];
    res.json({
      id: row.id,
      poNumber: row.po_number,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      purchaseRequestId: row.purchase_request_id,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Section C — #12: the Accounting gate, the FIRST gate a raised order clears. An accounting
// account reviews a 'pending' order and either passes it to the admin ('accounting-approved',
// stamping po_reviewed_*) or sends it back to Purchasing ('rejected'). Plain admins may act
// here too (emergency override); 'owner' is admitted by requireRole.
app.put('/api/purchase-orders/:id/accounting-review', requireRole(['accounting', 'admin']), async (req, res) => {
  const client = await getClient();
  try {
    const { status } = req.body; // 'approved' (passes to admin) | 'rejected' (back to purchasing)
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }
    await client.query('BEGIN');
    const cur = await client.query('SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Purchase order not found' }); }
    if (cur.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `This order is '${cur.rows[0].status}', not awaiting accounting review` });
    }
    let po;
    if (status === 'approved') {
      // po_reviewed_by_id resolves the accounting reviewer's signature on the printed order
      // (Reviewed By). Distinct from the free-text reviewed_by the create form once carried.
      po = await client.query(
        `UPDATE purchase_orders SET status='accounting-approved', po_reviewed_by=$1, po_reviewed_by_id=$2, po_reviewed_at=NOW(), updated_at=NOW() WHERE id=$3 RETURNING *`,
        [req.user?.name || 'Accounting', req.user?.id ?? null, req.params.id]
      );
    } else {
      po = await client.query(
        `UPDATE purchase_orders SET status='rejected', updated_at=NOW() WHERE id=$1 RETURNING *`,
        [req.params.id]
      );
    }
    await client.query('COMMIT');
    const row = po.rows[0];
    res.json({ id: row.id, poNumber: row.po_number, status: row.status, poReviewedBy: row.po_reviewed_by, poReviewedAt: row.po_reviewed_at });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Section C — #12: after a rejection at either gate, Purchasing revises the order and resubmits
// it. This clears the prior accounting review so the order goes through both gates afresh.
app.put('/api/purchase-orders/:id/resubmit', requireRole(['purchasing', 'admin']), async (req, res) => {
  try {
    const cur = await query('SELECT status FROM purchase_orders WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Purchase order not found' });
    if (cur.rows[0].status !== 'rejected') {
      return res.status(409).json({ error: `Only a rejected order can be resubmitted (this one is '${cur.rows[0].status}')` });
    }
    const po = await query(
      `UPDATE purchase_orders SET status='pending', po_reviewed_by=NULL, po_reviewed_by_id=NULL, po_reviewed_at=NULL, approved_by=NULL, approved_by_id=NULL, approved_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    const row = po.rows[0];
    res.json({ id: row.id, poNumber: row.po_number, status: row.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// A purchase order's line items live as a one-line JSON blob inside its `description`
// ("Line Items: [...]"), not in a table. Parsed line-wise rather than by regex so a bracket
// inside an item description can't truncate the match. Mirrors parseLineItems in
// src/app/lib/orderPrint.ts — the print template reads the same blob.
function parsePOLineItems(description) {
  const hit = String(description || '').split('\n').find((l) => l.trimStart().startsWith('Line Items:'));
  if (!hit) return [];
  try {
    const parsed = JSON.parse(hit.trimStart().slice('Line Items:'.length).trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Receive an order's lines into stock, inside the caller's transaction (Section E — #14).
//
// The warehouse enters, per line, how many actually ARRIVED and how many are DEFECTIVE; only the
// USABLE quantity (received − defective) is added to inventory. `clientLines` carries that,
// matched to the ordered lines BY INDEX (the receiving grid is built from the same parsed order,
// in order). With no clientLines — a legacy/blind receipt — a line defaults to fully received,
// none defective, preserving the old behaviour.
//
// Resolution is by inventoryId — carried from the employee's picker through the request onto the
// order — falling back to a case-insensitive name match for older lines. An unresolvable line
// throws: the goods physically arrived, but we cannot say what they are, and silently skipping
// would understate stock with no trace.
//
// Returns { receivedLines, applied }: receivedLines records EVERY line (ordered/received/
// defective/added/newQuantity) for the receipt and the "short N" label — even a fully-defective
// one that added nothing; `applied` is the subset that actually moved stock, for the toast.
//
// Cost is a weighted average: (onHandQty*onHandCost + usable*recvCost) / totalQty. Overwriting
// with the latest price would revalue stock we already owned at a price we never paid for it.
async function receiveLinesIntoInventory(client, lines, clientLines) {
  const receivedLines = [];
  const applied = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const name = String(line?.description || '').trim();
    const ordered = Number(line?.quantity) || 0;
    const cost = Number(line?.unitCost ?? line?.unitPrice) || 0;
    if (!name) continue;

    const cl = Array.isArray(clientLines) ? clientLines[i] : null;
    const received = cl && cl.received != null ? Math.max(0, Number(cl.received) || 0) : ordered;
    const defective = cl && cl.defective != null ? Math.max(0, Number(cl.defective) || 0) : 0;
    const usable = Math.max(0, received - defective);

    // FOR UPDATE: two receipts touching the same item must not interleave their read-modify-write.
    let row;
    if (line?.inventoryId) {
      row = (await client.query('SELECT id, item_name, quantity, unit_cost FROM inventory WHERE id = $1 FOR UPDATE', [line.inventoryId])).rows[0];
    }
    if (!row) {
      row = (await client.query('SELECT id, item_name, quantity, unit_cost FROM inventory WHERE LOWER(item_name) = LOWER($1) FOR UPDATE', [name])).rows[0];
    }
    if (!row) {
      const e = new Error(`"${name}" is no longer in inventory — it may have been renamed. Nothing was added; fix the item and try again.`);
      e.statusCode = 400;
      throw e;
    }

    let newQty = parseFloat(row.quantity) || 0;
    // Only add the good units. A line where nothing usable arrived still gets recorded (added 0)
    // so the receipt shows the shortfall — there is deliberately NO automatic re-order.
    if (usable > 0) {
      const onHandQty = parseFloat(row.quantity) || 0;
      const onHandCost = parseFloat(row.unit_cost) || 0;
      newQty = onHandQty + usable;
      const newCost = newQty > 0 ? (onHandQty * onHandCost + usable * cost) / newQty : cost;
      await client.query('UPDATE inventory SET quantity = $1, unit_cost = $2, updated_at = NOW() WHERE id = $3', [newQty, newCost, row.id]);
    }
    const entry = { inventoryId: row.id, itemName: row.item_name, ordered, received, defective, added: usable, newQuantity: newQty };
    receivedLines.push(entry);
    if (usable > 0) applied.push(entry);
  }
  return { receivedLines, applied };
}

// Logistics' confirmation of an inbound delivery — the tail of the purchase-order lifecycle,
// which previously stopped dead at 'approved'.
//
//   approved --> in-progress --> RECEIVED    (terminal)
//           \-------------------> cancelled  (terminal)
//
// RECEIVED is not cosmetic: /purchase-orders?status=RECEIVED is what the Business Overview
// counts as an expense (src/app/api/overview.ts). Before this route the only way to reach it
// was an admin hand-picking it in the edit modal, so expenses depended on manual data entry.
//
// Deliberately does NOT touch the linked purchase request, unlike the approve route above:
// cancelling records that THIS order fell through, not that the request was wrong — the
// employee's withdrawal unlock survives.
app.put('/api/purchase-orders/:id/delivery', requireRole(['admin', 'warehouse']), async (req, res) => {
  const client = await getClient();
  try {
    const { status, receivedBy, notes } = req.body;
    if (!['in-progress', 'RECEIVED', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "status must be 'in-progress', 'RECEIVED' or 'cancelled'" });
    }
    // Receiving moves stock, so the status change and the inventory writes must be one unit:
    // a receipt recorded without its stock (or vice versa) is unrecoverable — RECEIVED is
    // terminal, so there is no retry. FOR UPDATE also serialises two concurrent receipts.
    await client.query('BEGIN');
    const cur = await client.query('SELECT status, description, purchase_request_id FROM purchase_orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Purchase order not found' }); }
    const from = cur.rows[0].status;

    const reject = async (msg) => { await client.query('ROLLBACK'); return res.status(400).json({ error: msg }); };
    if (from === 'RECEIVED' || from === 'cancelled') {
      return reject(`This order is already ${from === 'RECEIVED' ? 'received' : 'cancelled'}`);
    }
    // Only an approved order reaches Logistics at all — a pending one hasn't been authorised.
    if (status === 'in-progress' && from !== 'approved') {
      return reject('Only an approved purchase order can be marked as an ongoing delivery');
    }
    // Goods sometimes just turn up without anyone flagging them in transit first, so RECEIVED
    // is reachable straight from 'approved' as well as from 'in-progress'.
    if ((status === 'RECEIVED' || status === 'cancelled') && !['approved', 'in-progress'].includes(from)) {
      return reject('Only an approved or in-transit purchase order can be updated');
    }
    if (status === 'RECEIVED' && !String(receivedBy || '').trim()) {
      // Who signed for it is the whole point of the record — mirrors PUT /api/deliveries/:id.
      return reject('Who received the delivery is required');
    }

    const actor = req.user?.name || 'Warehouse';
    let applied = [];
    let receivedLines = [];
    let r;
    if (status === 'in-progress') {
      r = await client.query(
        `UPDATE purchase_orders SET status='in-progress', in_transit_by=$1, in_transit_at=NOW(),
           delivery_notes=COALESCE($2, delivery_notes), updated_at=NOW() WHERE id=$3 RETURNING *`,
        [actor, orNull(notes), req.params.id]
      );
    } else if (status === 'RECEIVED') {
      // Stock only moves for an order raised against a purchase request: those lines came from
      // the employee's inventory picker, so each one IS an inventory item. An order created by
      // hand (Purchase Orders ▸ New) has free-text lines — services, one-offs, "1 Lot" — which
      // are not inventory and must not be invented as items, nor block the receipt.
      //
      // Section E — #14: the warehouse may pass `lines` = per-line { received, defective } so
      // only the usable quantity is shelved; received_lines records the full ordered/received/
      // defective/added breakdown for the receipt and the "short N" label.
      if (cur.rows[0].purchase_request_id) {
        const result = await receiveLinesIntoInventory(client, parsePOLineItems(cur.rows[0].description), req.body.lines);
        receivedLines = result.receivedLines;
        applied = result.applied;
      }
      // Stored, not just returned: the delivery receipt has to be printable again later, and
      // `new_quantity` is a snapshot of stock at receipt that cannot be recomputed once
      // production starts withdrawing. Written in the same transaction as the stock it
      // describes, so the record and the movement cannot disagree. '[]' for a hand-raised
      // order is a real answer — nothing was an inventory item — and distinct from NULL.
      r = await client.query(
        `UPDATE purchase_orders SET status='RECEIVED', received_by=$1, received_at=NOW(),
           delivery_notes=COALESCE($2, delivery_notes), received_lines=$3::jsonb, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [String(receivedBy).trim(), orNull(notes), JSON.stringify(receivedLines), req.params.id]
      );
    } else {
      r = await client.query(
        `UPDATE purchase_orders SET status='cancelled', cancelled_by=$1, cancelled_at=NOW(),
           delivery_notes=COALESCE($2, delivery_notes), updated_at=NOW() WHERE id=$3 RETURNING *`,
        [actor, orNull(notes), req.params.id]
      );
    }
    await client.query('COMMIT');
    const row = r.rows[0];
    res.json({
      id: row.id,
      poNumber: row.po_number,
      status: row.status,
      inTransitAt: row.in_transit_at ?? null,
      inTransitBy: row.in_transit_by ?? null,
      receivedAt: row.received_at ?? null,
      receivedBy: row.received_by ?? null,
      cancelledAt: row.cancelled_at ?? null,
      cancelledBy: row.cancelled_by ?? null,
      deliveryNotes: row.delivery_notes ?? null,
      // What this receipt did to stock, so the portal can say so rather than leave the user
      // wondering whether inventory moved. `receivedLines` is the FULL per-line breakdown
      // (including short/defective lines that added nothing) for the printed receipt.
      inventoryApplied: applied,
      receivedLines,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // An unresolvable line is the caller's problem to fix, not a server fault.
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('purchase-order delivery error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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
app.delete('/api/purchase-orders/:id', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
  const start = Date.now();
  try {
    console.log(`🗑️  Deleting purchase order ${req.params.id}`);
    
    const result = await query('DELETE FROM purchase_orders WHERE id = $1', [req.params.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    const duration = Date.now() - start;
    console.log(`✅ Purchase order deleted in ${duration}ms`);
    
    res.json({ 
      message: 'Purchase order deleted',
      id: req.params.id,
      duration: `${duration}ms`
    });
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`❌ Failed to delete purchase order after ${duration}ms:`, err.message);
    res.status(500).json({ 
      error: err.message,
      duration: `${duration}ms`
    });
  }
});

// PATCH /api/purchase-orders/:id — general edit for admin/purchasing/office_admin.
// Approval is NOT done here: `status` is admin-only, because this route is open to
// purchasing and they must not be able to approve their own purchase orders. Everyone
// (including admins) should use PUT /:id/approve, which records the approver and flips
// the linked purchase request in the same transaction.
app.patch('/api/purchase-orders/:id', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
  try {
    const isAdmin = effectiveRole(req.user) === 'admin' || effectiveRole(req.user) === 'owner';
    if (req.body.status !== undefined && !isAdmin) {
      return res.status(403).json({ error: 'Only an admin can change a purchase order status' });
    }
    const cols = {
      status: req.body.status,
      description: req.body.description,
      client: req.body.client,
      amount: req.body.amount,
      delivery_date: req.body.deliveryDate,
      // editable PDF header fields
      doc_date: req.body.docDate,
      prepared_by: req.body.preparedBy,
      reviewed_by: req.body.reviewedBy,
      supplier_address: req.body.supplierAddress,
      supplier_contact: req.body.supplierContact,
      payment_terms: req.body.paymentTerms,
      po_type: req.body.poType,
      terms_and_conditions: req.body.termsAndConditions,
    };
    const updates = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(cols)) {
      if (v !== undefined) {
        updates.push(`${k} = $${i++}`);
        values.push(v === '' ? null : v);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    await query(
      `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    const result = await query(
      `SELECT id, po_number, client, description, amount, status, created_date, delivery_date, assigned_assets, order_type,
              doc_date, prepared_by, reviewed_by, supplier_address, supplier_contact, payment_terms, terms_and_conditions, po_type
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
      orderType: row.order_type,
      docDate: row.doc_date,
      preparedBy: row.prepared_by,
      reviewedBy: row.reviewed_by,
      supplierAddress: row.supplier_address,
      supplierContact: row.supplier_contact,
      paymentTerms: row.payment_terms,
      poType: row.po_type ?? null,
      termsAndConditions: row.terms_and_conditions,
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

// (Removed a dead duplicate GET /api/sales-orders — Express serves the earlier
// registration (~line 1012), so this second one (with driver/vehicle/delivery
// joins) was unreachable. If those enriched fields are needed later, merge the
// join into the live handler rather than re-adding a shadow route.)
// requireRole, not requireAdmin: the /sales portal raises these. Note requireAdmin also
// excludes the owner (it tests role === 'admin' literally), so this widens access to the
// super-admin too.
app.post('/api/sales-orders', requireRole(['admin', 'sales']), async (req, res) => {
  try {
    const {
      soNumber,
      client,
      description,
      amount,
      deliveryDate,
      assignedAssets = [],
      createdDate = new Date().toISOString().split('T')[0],
      // CRM / trading additions (all optional, nullable)
      customerId,
      line,
      source,
      costAmount,
      inquiryId,
      // editable PDF header fields
      docDate,
      preparedBy,
      reviewedBy,
      customerAddress,
      customerContact,
      paymentTerms,
      termsAndConditions,
    } = req.body;

    const row = await createSalesOrder({
      soNumber, client, customerId: customerId || null, description,
      amount, deliveryDate, createdDate, assignedAssets,
      line: line || null, source: source || null,
      inquiryId: inquiryId || null, costAmount: (costAmount === undefined || costAmount === '') ? null : costAmount,
      docDate: docDate || null, preparedBy: preparedBy || undefined, reviewedBy: reviewedBy || null,
      customerAddress: customerAddress || null, customerContact: customerContact || null,
      paymentTerms: paymentTerms || undefined, termsAndConditions: termsAndConditions || null,
      status: 'pending',
    });

    res.status(201).json({
      id: row.id,
      soNumber: row.so_number,
      client: row.client,
      customerId: row.customer_id,
      description: row.description,
      amount: parseFloat(row.amount),
      costAmount: row.cost_amount === null ? null : parseFloat(row.cost_amount),
      line: row.line,
      source: row.source,
      inquiryId: row.inquiry_id,
      docDate: row.doc_date,
      preparedBy: row.prepared_by,
      reviewedBy: row.reviewed_by,
      customerAddress: row.customer_address,
      customerContact: row.customer_contact,
      paymentTerms: row.payment_terms,
      termsAndConditions: row.terms_and_conditions,
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

// GET /api/miscellaneous-expenses (admin only)
app.get('/api/miscellaneous-expenses', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let whereClause = '';
    const params = [];
    
    if (startDate || endDate) {
      whereClause = 'WHERE 1=1';
      if (startDate) {
        whereClause += ` AND expense_date >= $${params.length + 1}`;
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ` AND expense_date <= $${params.length + 1}`;
        params.push(endDate);
      }
    }
    
    const result = await query(
      `SELECT id, description, amount, category, expense_date, created_by, created_at, updated_at
       FROM miscellaneous_expenses 
       ${whereClause}
       ORDER BY created_at DESC`,
      params
    );
    
    // Ensure expense_date is properly formatted and returned
    const expenses = result.rows.map(row => ({
      ...row,
      expenseDate: row.expense_date || new Date().toISOString().split('T')[0] // Fallback to today if missing
    }));
    
    res.json(expenses);
  } catch (err) {
    console.error('Error fetching miscellaneous expenses:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/miscellaneous-expenses (admin only)
app.post('/api/miscellaneous-expenses', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
  try {
    const { description, amount, category, expense_date, created_by } = req.body;
    
    const id = `MISC-${Date.now()}`;
    
    await query(
      `INSERT INTO miscellaneous_expenses (id, description, amount, category, expense_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, description, amount, category, expense_date, created_by]
    );
    
    const result = await query(
      `SELECT id, description, amount, category, expense_date, created_by, created_at, updated_at
       FROM miscellaneous_expenses WHERE id = $1`,
      [id]
    );
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      category: row.category,
      expenseDate: row.expense_date,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Error creating miscellaneous expense:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/miscellaneous-expenses/:id (admin only)
app.patch('/api/miscellaneous-expenses/:id', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
  try {
    const { description, amount, category, expense_date } = req.body;
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
    if (category !== undefined) {
      updates.push(`category = $${i++}`);
      values.push(category);
    }
    if (expense_date !== undefined) {
      updates.push(`expense_date = $${i++}`);
      values.push(expense_date);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    
    await query(
      `UPDATE miscellaneous_expenses SET ${updates.join(', ')} WHERE id = $${i}`,
      values
    );
    
    const result = await query(
      `SELECT id, description, amount, category, expense_date, created_by, created_at, updated_at
       FROM miscellaneous_expenses WHERE id = $1`,
      [req.params.id]
    );
    
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Miscellaneous expense not found' });
    
    res.json({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      category: row.category,
      expenseDate: row.expense_date,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Error updating miscellaneous expense:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/miscellaneous-expenses/:id (admin only)
app.delete('/api/miscellaneous-expenses/:id', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
  try {
    await query('DELETE FROM miscellaneous_expenses WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting miscellaneous expense:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sales-orders/:id (admin only)
app.patch('/api/sales-orders/:id', requireRole(['admin', 'sales']), async (req, res) => {
  try {
    const { status, description } = req.body;
    // Editable pricing/CRM fields (Phase 7e): owner sets the client price on the SO itself.
    const cols = {
      status, description,
      amount: req.body.amount,
      cost_amount: req.body.costAmount,
      customer_id: req.body.customerId,
      line: req.body.line,
      source: req.body.source,
      delivery_date: req.body.deliveryDate,
      // editable PDF header fields
      doc_date: req.body.docDate,
      prepared_by: req.body.preparedBy,
      reviewed_by: req.body.reviewedBy,
      customer_address: req.body.customerAddress,
      customer_contact: req.body.customerContact,
      payment_terms: req.body.paymentTerms,
      terms_and_conditions: req.body.termsAndConditions,
    };
    const updates = [];
    const values = [];
    let i = 1;

    for (const [k, v] of Object.entries(cols)) {
      if (v !== undefined) {
        updates.push(`${k} = $${i++}`);
        values.push(v === '' ? null : v);
      }
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
      `SELECT id, so_number, client, customer_id, description, amount, cost_amount, line, source, status, created_date, delivery_date, assigned_assets,
              doc_date, prepared_by, reviewed_by, customer_address, customer_contact, payment_terms, terms_and_conditions
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
      customerId: row.customer_id,
      description: row.description,
      amount: parseFloat(row.amount),
      costAmount: row.cost_amount === null ? null : parseFloat(row.cost_amount),
      line: row.line,
      source: row.source,
      docDate: row.doc_date,
      preparedBy: row.prepared_by,
      reviewedBy: row.reviewed_by,
      customerAddress: row.customer_address,
      customerContact: row.customer_contact,
      paymentTerms: row.payment_terms,
      termsAndConditions: row.terms_and_conditions,
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
app.delete('/api/sales-orders/:id', requireRole(['admin', 'sales']), async (req, res) => {
  const start = Date.now();
  try {
    console.log(`🗑️  Deleting sales order ${req.params.id}`);
    
    const result = await query('DELETE FROM sales_orders WHERE id = $1', [req.params.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Sales order not found' });
    }
    
    const duration = Date.now() - start;
    console.log(`✅ Sales order deleted in ${duration}ms`);
    
    res.json({ 
      message: 'Sales order deleted',
      id: req.params.id,
      duration: `${duration}ms`
    });
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`❌ Failed to delete sales order after ${duration}ms:`, err.message);
    res.status(500).json({
      error: err.message,
      duration: `${duration}ms`
    });
  }
});

// ─── Deliveries API (the /logistics portal) ────────────────────────────────
// One delivery row per dispatched sales order. Deliberately narrow — no drivers, vehicles
// or GPS; that fleet feature was removed wholesale (server/remove-fleet.js) and is not
// being rebuilt here. An approved sales order with no row is implicitly "pending".
function mapDelivery(r) {
  return r && {
    id: r.id,
    deliveryNumber: r.delivery_number,
    salesOrderId: r.sales_order_id,
    status: r.status,
    dispatchedBy: r.dispatched_by ?? null,
    dispatchedAt: r.dispatched_at ?? null,
    deliveredAt: r.delivered_at ?? null,
    receivedBy: r.received_by ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    // Joined from sales_orders so the portal can render a job without a second fetch.
    soNumber: r.so_number ?? null,
    client: r.client ?? null,
    customerAddress: r.customer_address ?? null,
    customerContact: r.customer_contact ?? null,
    amount: r.amount === null || r.amount === undefined ? null : parseFloat(r.amount),
    soStatus: r.so_status ?? null,
    deliveryDate: r.delivery_date ?? null,
    // Section D — #5/#15: withdrawal-origin deliveries carry no sales order; these describe them.
    withdrawalId: r.withdrawal_id ?? null,
    destination: r.destination ?? null,
    items: r.items ?? null,
  };
}

app.get('/api/deliveries', requireRole(['admin', 'logistics']), async (req, res) => {
  try {
    const r = await query(
      `SELECT d.*, so.so_number, so.client, so.customer_address, so.customer_contact,
              so.amount, so.status AS so_status, so.delivery_date
       FROM deliveries d
       LEFT JOIN sales_orders so ON so.id = d.sales_order_id
       ORDER BY d.created_at DESC`
    );
    res.json(r.rows.map(mapDelivery));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dispatch — creates the delivery record for a sales order.
app.post('/api/deliveries', requireRole(['admin', 'logistics']), async (req, res) => {
  try {
    const { salesOrderId, notes } = req.body;
    if (!salesOrderId) return res.status(400).json({ error: 'A sales order is required' });

    const so = await query('SELECT id, status FROM sales_orders WHERE id = $1', [salesOrderId]);
    if (!so.rows[0]) return res.status(404).json({ error: 'Sales order not found' });
    if (so.rows[0].status !== 'approved') {
      return res.status(400).json({ error: 'Only an approved sales order can be dispatched' });
    }
    const dupe = await query(`SELECT id FROM deliveries WHERE sales_order_id = $1 AND status <> 'cancelled' LIMIT 1`, [salesOrderId]);
    if (dupe.rows[0]) return res.status(400).json({ error: 'This sales order already has a delivery' });

    // DR-YYYY-NNNN, same recipe as pr_number.
    const year = new Date().getFullYear();
    const last = await query(`SELECT delivery_number FROM deliveries WHERE delivery_number LIKE $1 ORDER BY delivery_number DESC LIMIT 1`, [`DR-${year}-%`]);
    let counter = 1;
    if (last.rows[0]) { const n = parseInt(last.rows[0].delivery_number.split('-')[2], 10); if (!isNaN(n)) counter = n + 1; }
    const deliveryNumber = `DR-${year}-${String(counter).padStart(4, '0')}`;
    const id = `DEL-${Date.now()}`;

    try {
      await query(
        `INSERT INTO deliveries (id, delivery_number, sales_order_id, status, dispatched_by, dispatched_at, notes)
         VALUES ($1, $2, $3, 'dispatched', $4, NOW(), $5)`,
        [id, deliveryNumber, salesOrderId, req.user?.name || 'Logistics', orNull(notes)]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'That delivery number was just taken — try again' });
      throw e;
    }
    const r = await query('SELECT * FROM deliveries WHERE id = $1', [id]);
    res.status(201).json(mapDelivery(r.rows[0]));
  } catch (err) { console.error('delivery create error:', err); res.status(500).json({ error: err.message }); }
});

// Dispatch, complete or cancel a delivery.
app.put('/api/deliveries/:id', requireRole(['admin', 'logistics']), async (req, res) => {
  try {
    const { status, receivedBy, notes } = req.body;
    // Section D — #15: 'dispatched' handles the withdrawal-origin delivery, which is auto-created
    // 'pending' (a sales-order dispatch skips straight to 'dispatched' via POST /deliveries).
    if (!['dispatched', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "status must be 'dispatched', 'delivered' or 'cancelled'" });
    }
    const cur = await query('SELECT status FROM deliveries WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Delivery not found' });
    if (cur.rows[0].status === 'delivered') return res.status(400).json({ error: 'This delivery is already completed' });

    if (status === 'dispatched') {
      if (cur.rows[0].status !== 'pending') return res.status(400).json({ error: 'Only a pending delivery can be dispatched' });
      const r = await query(
        `UPDATE deliveries SET status='dispatched', dispatched_by=$1, dispatched_at=NOW(), notes=COALESCE($2, notes), updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [req.user?.name || 'Logistics', orNull(notes), req.params.id]
      );
      return res.json(mapDelivery(r.rows[0]));
    }

    if (status === 'delivered') {
      if (!String(receivedBy || '').trim()) return res.status(400).json({ error: 'Who received the delivery is required' });
      const r = await query(
        `UPDATE deliveries SET status='delivered', received_by=$1, delivered_at=NOW(), notes=COALESCE($2, notes), updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [String(receivedBy).trim(), orNull(notes), req.params.id]
      );
      return res.json(mapDelivery(r.rows[0]));
    }
    const r = await query(
      `UPDATE deliveries SET status='cancelled', notes=COALESCE($1, notes), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [orNull(notes), req.params.id]
    );
    res.json(mapDelivery(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Inventory API ─────────────────────────────────────────

// (Removed a dead duplicate GET /api/inventory — Express serves the earlier
// registration (~line 1060), so this second one was unreachable.)

// ITM-###### — six digits, no year (Section H — #11). Shared by POST /api/inventory and the
// item-request review route, which also creates inventory rows — one generator so the two
// cannot drift apart.
//
// Only new-format codes are considered for the max, via the regex `^ITM-[0-9]{6}$`. Existing
// ITM-YYYY-NNNN codes are left untouched and cannot collide — a different pattern and length.
//
// Takes a `db` (the pool's `query`, or a transaction client) so the review route can read the
// last code inside its own transaction. Reads-then-inserts without a lock, so two concurrent
// adds can still collide: both callers catch 23505 and report a conflict rather than a 500.
async function nextItemCode(db) {
  const last = await db(
    `SELECT item_code FROM inventory WHERE item_code ~ '^ITM-[0-9]{6}$' ORDER BY item_code DESC LIMIT 1`
  );
  let counter = 1;
  if (last.rows[0]) { const n = parseInt(last.rows[0].item_code.split('-')[1], 10); if (!isNaN(n)) counter = n + 1; }
  return `ITM-${String(counter).padStart(6, '0')}`;
}

// POST /api/inventory (admin/purchasing/office_admin/warehouse)
app.post('/api/inventory', requireRole(['admin','purchasing','office_admin','warehouse']), async (req, res) => {
  try {
    const {
      itemCode,
      itemName,
      description,
      quantity = 0,
      unit = 'pieces',
      unitCost = 0,
      location,
      supplier
    } = req.body;
    
    if (!String(itemName || '').trim()) return res.status(400).json({ error: 'Item name is required' });

    // The warehouse portal no longer asks staff to invent a code, so generate ITM-YYYY-NNNN
    // when none is supplied. Only when absent: the admin's own item modal sends its own code.
    // item_code is NOT NULL UNIQUE, so a blank one used to surface as a raw 500.
    let finalItemCode = String(itemCode || '').trim();
    if (!finalItemCode) finalItemCode = await nextItemCode(query);

    const id = `INV-${Date.now()}`;
    const defaultReorderLevel = 10; // Set default reorder level internally

    try {
      await query(
        `INSERT INTO inventory (id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost, location, supplier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, finalItemCode, itemName, description, quantity, unit, defaultReorderLevel, unitCost, location, supplier]
      );
    } catch (e) {
      // 23505 = unique_violation. The generator reads-then-inserts without a lock, so two
      // concurrent adds can land on the same number; report it as a conflict, not a 500.
      if (e.code === '23505') return res.status(409).json({ error: `Item code ${finalItemCode} is already taken — try again` });
      throw e;
    }
    
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

// PATCH /api/inventory/:id (admin/purchasing/office_admin/warehouse)
app.patch('/api/inventory/:id', requireRole(['admin','purchasing','office_admin','warehouse']), async (req, res) => {
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
app.delete('/api/inventory/:id', requireRole(['admin','purchasing','office_admin']), async (req, res) => {
  try {
    console.log('Deleting inventory item:', req.params.id);
    await query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
    console.log('Inventory item deleted successfully');
    res.json({ message: 'Inventory item deleted' });
  } catch (err) {
    console.error('Inventory deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Miscellaneous API ───────────────────────────────────────

// (Removed a dead duplicate GET /api/miscellaneous — Express serves the earlier
// registration (~line 1085), so this second one was unreachable.)

// POST /api/miscellaneous (admin only)
app.post('/api/miscellaneous', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
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
app.patch('/api/miscellaneous/:id', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
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
app.delete('/api/miscellaneous/:id', requireRole(['admin','bookkeeper','office_admin']), async (req, res) => {
  try {
    await query('DELETE FROM miscellaneous WHERE id = $1', [req.params.id]);
    res.json({ message: 'Miscellaneous entry deleted' });
  } catch (err) {
    console.error('Miscellaneous deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// [removed] Traccar GPS Tracking routes — GPS/fleet feature removed.

// POST /api/init - create tables and seed (convenience endpoint)
app.post('/api/init', requireRole(['admin']), async (req, res) => {
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
    if (!request) return res.status(404).json({ error: 'Material request not found' });

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

// Delete material request (admin-only — this route was previously unguarded, #2)
app.delete('/api/material-requests/:id', requireRole(['admin']), async (req, res) => {
  try {
    const material_request_id = req.params.id;
    
    // Check if request exists
    const existingRequest = await query(
      'SELECT * FROM material_requests WHERE id = $1',
      [material_request_id]
    );
    
    if (existingRequest.rows.length === 0) {
      return res.status(404).json({ error: 'Material request not found' });
    }
    
    // Delete the request
    await query('DELETE FROM material_requests WHERE id = $1', [material_request_id]);
    
    res.json({ message: 'Material request deleted successfully' });
  } catch (err) {
    console.error('Error deleting material request:', err);
    res.status(500).json({ error: err.message });
  }
});

// [removed] Driver delivery + driver chat endpoints — Driver Portal feature removed.

// --- ADMIN USER MANAGEMENT ENDPOINTS ---

// Get all pending employee registrations
app.get('/api/admin/employees/pending', requireAdmin, async (req, res) => {
  try {
    // Mock response if database not available
    if (!process.env.DATABASE_URL) {
      console.log('🧪 Using mock pending employees (no database)');
      
      const mockEmployees = [
        {
          id: '1',
          full_name: 'John Doe',
          email: 'john.doe@company.com',
          department: 'Engineering',
          position: 'Software Developer',
          phone: '123-456-7890',
          status: 'pending',
          created_at: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        },
        {
          id: '2',
          full_name: 'Jane Smith',
          email: 'jane.smith@company.com',
          department: 'Human Resources',
          position: 'HR Specialist',
          phone: '098-765-4321',
          status: 'pending',
          created_at: new Date(Date.now() - 172800000).toISOString() // 2 days ago
        }
      ];
      
      return res.json(mockEmployees);
    }
    
    const result = await query(
      `SELECT id, full_name, email, department,
        position, phone, status, created_at
       FROM employee_accounts
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Pending employees error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get ALL employees
app.get('/api/admin/employees', requireAdmin, async (req, res) => {
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

// Admin CREATES an employee account (replaces employee self-registration).
// Created accounts are 'approved' immediately so they can log into /production.
app.post('/api/admin/employees', requireAdmin, async (req, res) => {
  try {
    const { full_name, email, password, department, position, phone } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await query('SELECT id FROM employee_accounts WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO employee_accounts (full_name, email, password_hash, department, position, phone, status, approved_at, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,'approved',NOW(),$7)
       RETURNING id, full_name, email, department, position, phone, status, created_at`,
      [full_name, email, hash, department || null, position || null, phone || null, req.user?.name || 'Admin']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('employee create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin updates an employee account: profile fields, activate/deactivate, optional password reset.
app.patch('/api/admin/employees/:id', requireAdmin, async (req, res) => {
  try {
    const b = req.body;
    const cols = { full_name: b.full_name, email: b.email, department: b.department, position: b.position, phone: b.phone, status: b.status };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(cols)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(v === '' ? null : v); } }
    if (b.password) { sets.push(`password_hash = $${i++}`); params.push(await bcrypt.hash(b.password, 10)); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const r = await query(
      `UPDATE employee_accounts SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, full_name, email, department, position, phone, status, created_at`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('employee update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject employee
app.put('/api/admin/employees/:id/review', requireAdmin, async (req, res) => {
  try {
    const { status, reviewed_by } = req.body;
console.log(`🔍 Employee review request: ID=${req.params.id}, status=${status}, reviewed_by=${reviewed_by}`);
    
    // Mock response if database not available
    if (!process.env.DATABASE_URL) {
      console.log('🧪 Using mock employee review (no database)');
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockEmployee = {
        id: req.params.id,
        full_name: 'Mock Employee',
        email: 'employee@test.com',
        department: 'IT',
        position: 'Developer',
        phone: '123-456-7890',
        status: status,
        approved_at: new Date().toISOString(),
        approved_by: reviewed_by,
        created_at: new Date().toISOString()
      };
      
      console.log(`✅ Mock employee review completed: ${mockEmployee.full_name} -> ${status}`);
      return res.json(mockEmployee);
    }
    
    // First, try to update the approved_by column as text (if it was migrated)
    try {
      const result = await query(
        `UPDATE employee_accounts
         SET status=$1, approved_by=$2,
             approved_at=NOW()
         WHERE id=$3 RETURNING *`,
        [status, reviewed_by, req.params.id]
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ Employee review completed: ${result.rows[0].full_name} -> ${status} by ${reviewed_by}`);
        return res.json(result.rows[0]);
      }
      // UPDATE matched no row → the id doesn't exist. Without this the handler
      // falls through and never responds (request hangs until proxy timeout).
      return res.status(404).json({ error: 'Employee not found' });
    } catch (textErr) {
      // If text update fails, try with integer (old schema)
      console.log('⚠️ Text update failed, trying integer approach...');
      
      // Check if employee exists first
      const checkResult = await query('SELECT * FROM employee_accounts WHERE id = $1', [req.params.id]);
      if (checkResult.rows.length === 0) {
        console.log(`❌ Employee not found: ${req.params.id}`);
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      console.log(`✅ Found employee: ${checkResult.rows[0].full_name}`);
      
      // For integer schema, use the current user's ID or a default value
      const reviewerId = req.user?.userId || 1;
      
      const result = await query(
        `UPDATE employee_accounts
         SET status=$1, approved_by=$2,
             approved_at=NOW()
         WHERE id=$3 RETURNING *`,
        [status, reviewerId, req.params.id]
      );
      
      console.log(`✅ Employee review completed: ${result.rows[0].full_name} -> ${status} by ID ${reviewerId}`);
      res.json(result.rows[0]);
    }
  } catch (err) {
    console.error('❌ Employee review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Permanently delete an employee account. purchase_requests.employee_id is
// ON DELETE SET NULL (history survives via employee_name), but material_requests
// has a RESTRICT FK, so null those out first inside a transaction.
app.delete('/api/admin/employees/:id', requireAdmin, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE material_requests SET employee_id = NULL WHERE employee_id = $1', [req.params.id]);
    const r = await client.query('DELETE FROM employee_accounts WHERE id = $1', [req.params.id]);
    if (!r.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found' });
    }
    await client.query('COMMIT');
    res.json({ message: 'Employee deleted', id: req.params.id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('employee delete error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ===== Admin management of the portal account tables =====
// purchasing / warehouse / accounting / sales / logistics all have the identical shape
// (full_name, email, password_hash, phone, status, signature), so they share one mount
// instead of five copies. /api/admin/employees stays hand-written — it carries extra
// department/position fields.
// Table names are hardcoded literals per call, never user input.
function mountAccountAdminRoutes(path, table, label) {
  app.get(`/api/admin/${path}`, requireAdmin, async (req, res) => {
    try {
      const result = await query(
        `SELECT id, full_name, email, phone, status, (signature IS NOT NULL) AS has_signature, created_at
         FROM ${table} ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(`/api/admin/${path}`, requireAdmin, async (req, res) => {
    try {
      const { full_name, email, password, phone } = req.body;
      if (!full_name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
      if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const existing = await query(`SELECT id FROM ${table} WHERE LOWER(email) = LOWER($1)`, [email]);
      if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });
      const hash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO ${table} (full_name, email, password_hash, phone, status)
         VALUES ($1,$2,$3,$4,'approved')
         RETURNING id, full_name, email, phone, status, created_at`,
        [full_name, email, hash, phone || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { console.error(`${path} create error:`, err); res.status(500).json({ error: err.message }); }
  });

  app.patch(`/api/admin/${path}/:id`, requireAdmin, async (req, res) => {
    try {
      const b = req.body;
      const cols = { full_name: b.full_name, email: b.email, phone: b.phone, status: b.status };
      const sets = []; const params = []; let i = 1;
      for (const [k, v] of Object.entries(cols)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(v === '' ? null : v); } }
      if (b.password) {
        if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        sets.push(`password_hash = $${i++}`); params.push(await bcrypt.hash(b.password, 10));
      }
      if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
      params.push(req.params.id);
      const r = await query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length}
         RETURNING id, full_name, email, phone, status, created_at`,
        params
      );
      if (!r.rows[0]) return res.status(404).json({ error: `${label} account not found` });
      res.json(r.rows[0]);
    } catch (err) { console.error(`${path} update error:`, err); res.status(500).json({ error: err.message }); }
  });

  app.delete(`/api/admin/${path}/:id`, requireAdmin, async (req, res) => {
    try {
      const r = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: `${label} account not found` });
      res.json({ message: `${label} account deleted`, id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
mountAccountAdminRoutes('purchasing', 'purchasing_accounts', 'Purchasing');
mountAccountAdminRoutes('warehouse', 'warehouse_accounts', 'Warehouse');
mountAccountAdminRoutes('accounting', 'accounting_accounts', 'Accounting');
mountAccountAdminRoutes('sales', 'sales_accounts', 'Sales');
mountAccountAdminRoutes('logistics', 'logistics_accounts', 'Logistics');

// [removed] Driver-account admin routes (/api/admin/drivers*) and driver message
// file upload — Driver Portal feature removed.

// Serve uploaded files (retained for any legacy attachments)
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
    
    // (Removed a redundant second express.static('/assets') block and a no-op
    // pass-through logger — the main express.static(distDir) above already serves
    // /assets with the correct immutable cache headers.)

    // Version endpoint for cache busting
    app.get('/version.txt', (req, res) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.sendFile(path.join(process.cwd(), 'public', 'version.txt'));
    });

    // NOTE: the SPA fallback (app.get(/.*/)) is intentionally registered at the VERY
    // END of this file — AFTER every /api route — because Express matches routes in
    // registration order. Registered here it would shadow the CRM / work-schedule /
    // staff routes defined below this block, making them return index.html in
    // production (the "failed to load" bug). See the bottom of this file.
  }
}

// ================================================================
// CRM + Sales Pipeline + Role-based modules
// (Suppliers, Customers, Inquiries/Quotations,
//  Work Schedule, Staff Accounts). All under the global requireAuth
//  registered earlier; writes gated per the permissions matrix.
// ================================================================

// ---------- helpers ----------
const newId = (prefix) => `${prefix}-${Date.now()}-${Math.floor((Date.now() % 1000))}`;
const orNull = (v) => (v === undefined || v === '' ? null : v);

// camelCase <-> snake_case row mappers
function mapSupplier(r) {
  if (!r) return r;
  const out = {
    id: r.id, name: r.name, type: r.type, productsSupplied: r.products_supplied,
    contactPerson: r.contact_person, phone: r.phone, email: r.email, location: r.location,
    paymentTerms: r.payment_terms, priceLevel: r.price_level, reliability: r.reliability,
    lastOrdered: r.last_ordered, notes: r.notes, tin: r.tin,
    certificateFilename: r.certificate_filename ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
  // The list query selects a has_certificate flag instead of the scan itself; single-row
  // reads (SELECT *) carry the column. Only surface what the row actually contains, so a
  // list response never drags a base64 document along.
  if (r.has_certificate !== undefined) out.hasCertificate = r.has_certificate;
  else if (r.certificate_of_registration !== undefined) out.hasCertificate = !!r.certificate_of_registration;
  return out;
}
function mapCustomer(r) {
  return r && {
    id: r.id, name: r.name, type: r.type, contactPerson: r.contact_person, phone: r.phone,
    email: r.email, location: r.location, whatTheyBuy: r.what_they_buy, source: r.source,
    status: r.status, lastContact: r.last_contact, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapProject(r) {
  return r && {
    id: r.id, name: r.name, description: r.description, status: r.status,
    client: r.client, location: r.location, startDate: r.start_date, endDate: r.end_date,
    budgetAllocation: r.budget_allocation === null ? 0 : parseFloat(r.budget_allocation),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapPurchaseRequest(r) {
  if (!r) return r;
  return {
    id: r.id, prNumber: r.pr_number, employeeId: r.employee_id, employeeName: r.employee_name,
    projectId: r.project_id, projectName: r.project_name ?? null,
    neededBy: r.needed_by, supplier: r.supplier, notes: r.notes,
    items: Array.isArray(r.items) ? r.items : (r.items || []),
    total: r.total === null ? 0 : parseFloat(r.total),
    // The employee's estimate is `total`; `finalTotal` is what Purchasing actually priced it
    // at (null until they raise the order). Both are kept so the gap stays visible.
    finalTotal: r.final_total === null || r.final_total === undefined ? null : parseFloat(r.final_total),
    status: r.status, withdrawn: r.withdrawn,
    reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
    checkedBy: r.checked_by ?? null, checkedAt: r.checked_at ?? null,
    checkedSignature: r.checked_signature ?? null,
    verifiedBy: r.verified_by ?? null, verifiedAt: r.verified_at ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapWithdrawalRequest(r) {
  if (!r) return r;
  return {
    id: r.id, withdrawalNumber: r.withdrawal_number ?? null,
    inventoryId: r.inventory_id, itemName: r.item_name,
    quantity: r.quantity === null ? 0 : parseFloat(r.quantity), reason: r.reason,
    requestedById: r.requested_by_id, requestedByName: r.requested_by_name,
    // Set when this withdrawal is one line of a purchase-request fulfilment; null for ad-hoc.
    purchaseRequestId: r.purchase_request_id ?? null,
    prNumber: r.pr_number ?? null,
    status: r.status, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
    // The warehouse's release — the first of the two approvals. reviewedBy/reviewedAt above
    // are the admin's, the second one, which is what actually moves stock.
    warehouseBy: r.warehouse_by ?? null, warehouseAt: r.warehouse_at ?? null,
    deductedAt: r.deducted_at, createdAt: r.created_at, updatedAt: r.updated_at,
    unit: r.unit ?? null,
    // Section D — #5/#15: present on a logistics-origin withdrawal; drives the auto-created delivery.
    destination: r.destination ?? null,
  };
}
function mapInquiry(r) {
  if (!r) return r;
  const quote = r.quote_amount === null ? null : parseFloat(r.quote_amount);
  const supQuote = r.supplier_quote_amount === null ? null : parseFloat(r.supplier_quote_amount);
  return {
    id: r.id, inquiryDate: r.inquiry_date, customerId: r.customer_id, customerName: r.customer_name,
    contact: r.contact, whatTheyWant: r.what_they_want, line: r.line, source: r.source, status: r.status,
    quoteAmount: quote, supplierId: r.supplier_id, supplierName: r.supplier_name,
    supplierQuoteAmount: supQuote,
    margin: (quote !== null && supQuote !== null) ? quote - supQuote : null,
    followUpDate: r.follow_up_date, salesOrderId: r.sales_order_id, purchaseOrderId: r.purchase_order_id,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// =========================== SUPPLIERS ===========================
// Read: any authenticated user that can see the module (UI gates visibility). Writes: owner/admin/purchasing.
app.get('/api/suppliers', async (req, res) => {
  try {
    const { search, type } = req.query;
    const where = ['1=1']; const params = []; let i = 1;
    if (search) { where.push(`(LOWER(name) LIKE $${i} OR LOWER(COALESCE(contact_person,'')) LIKE $${i} OR LOWER(COALESCE(products_supplied,'')) LIKE $${i})`); params.push(`%${String(search).toLowerCase()}%`); i++; }
    if (type) { where.push(`type = $${i++}`); params.push(type); }
    // Explicit columns, NOT `SELECT *`: certificate_of_registration holds a base64 scan and
    // would otherwise be dragged into every row of every list response. Callers get a flag
    // and fetch the document itself from /suppliers/:id/certificate when they need it.
    const r = await query(
      `SELECT id, name, type, products_supplied, contact_person, phone, email, location,
              payment_terms, price_level, reliability, last_ordered, notes, tin,
              certificate_filename, (certificate_of_registration IS NOT NULL) AS has_certificate,
              created_at, updated_at
       FROM suppliers WHERE ${where.join(' AND ')} ORDER BY name ASC`,
      params
    );
    res.json(r.rows.map(mapSupplier));
  } catch (err) { console.error('suppliers list error:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/suppliers/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
    res.json(mapSupplier(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Certificate of registration (scan held as a data-URL) ----
// Kept off POST/PATCH deliberately: the admin supplier form PATCHes its whole state, so a
// document living in that payload would re-upload on every unrelated edit.
app.get('/api/suppliers/:id/certificate', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const r = await query('SELECT certificate_of_registration, certificate_filename FROM suppliers WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ certificate: r.rows[0].certificate_of_registration || null, filename: r.rows[0].certificate_filename || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/suppliers/:id/certificate', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const cert = req.body?.certificate;
    if (typeof cert !== 'string' || !/^data:(image\/(png|jpeg)|application\/pdf);base64,/.test(cert)) {
      return res.status(400).json({ error: 'A PNG, JPEG or PDF certificate is required' });
    }
    if (cert.length > 5_000_000) return res.status(400).json({ error: 'Certificate file is too large' });
    const r = await query(
      'UPDATE suppliers SET certificate_of_registration = $1, certificate_filename = $2, updated_at = NOW() WHERE id = $3 RETURNING id',
      [cert, orNull(req.body?.filename), req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ message: 'Certificate saved', filename: req.body?.filename || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/suppliers/:id/certificate', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const r = await query(
      'UPDATE suppliers SET certificate_of_registration = NULL, certificate_filename = NULL, updated_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ message: 'Certificate removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/suppliers', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const b = req.body; const id = newId('SUP');
    const r = await query(
      `INSERT INTO suppliers (id,name,type,products_supplied,contact_person,phone,email,location,payment_terms,price_level,reliability,last_ordered,notes,tin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [id, b.name, orNull(b.type), orNull(b.productsSupplied), orNull(b.contactPerson), orNull(b.phone), orNull(b.email), orNull(b.location), orNull(b.paymentTerms), orNull(b.priceLevel), orNull(b.reliability), orNull(b.lastOrdered), orNull(b.notes), orNull(b.tin)]
    );
    res.status(201).json(mapSupplier(r.rows[0]));
  } catch (err) { console.error('supplier create error:', err); res.status(500).json({ error: err.message }); }
});
app.patch('/api/suppliers/:id', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const b = req.body;
    // certificate_of_registration is intentionally absent — it has its own route.
    const cols = { name:b.name, type:b.type, products_supplied:b.productsSupplied, contact_person:b.contactPerson, phone:b.phone, email:b.email, location:b.location, payment_terms:b.paymentTerms, price_level:b.priceLevel, reliability:b.reliability, last_ordered:b.lastOrdered, notes:b.notes, tin:b.tin };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(cols)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(orNull(v)); } }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()'); params.push(req.params.id);
    const r = await query(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
    res.json(mapSupplier(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/suppliers/:id', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const r = await query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ message: 'Supplier deleted', id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================== CUSTOMERS ===========================
// Writes: owner/admin (bookkeeper view-only, purchasing hidden).
app.get('/api/customers', async (req, res) => {
  try {
    const { search, status, type } = req.query;
    const where = ['1=1']; const params = []; let i = 1;
    if (search) { where.push(`(LOWER(name) LIKE $${i} OR LOWER(COALESCE(contact_person,'')) LIKE $${i})`); params.push(`%${String(search).toLowerCase()}%`); i++; }
    if (status) { where.push(`status = $${i++}`); params.push(status); }
    if (type) { where.push(`type = $${i++}`); params.push(type); }
    const r = await query(`SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY name ASC`, params);
    res.json(r.rows.map(mapCustomer));
  } catch (err) { console.error('customers list error:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/customers/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json(mapCustomer(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/customers', requireRole(['owner','admin','sales']), async (req, res) => {
  try {
    const b = req.body; const id = newId('CUS');
    const r = await query(
      `INSERT INTO customers (id,name,type,contact_person,phone,email,location,what_they_buy,source,status,last_contact,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, b.name, orNull(b.type), orNull(b.contactPerson), orNull(b.phone), orNull(b.email), orNull(b.location), orNull(b.whatTheyBuy), orNull(b.source), orNull(b.status), orNull(b.lastContact), orNull(b.notes)]
    );
    res.status(201).json(mapCustomer(r.rows[0]));
  } catch (err) { console.error('customer create error:', err); res.status(500).json({ error: err.message }); }
});
app.patch('/api/customers/:id', requireRole(['owner','admin']), async (req, res) => {
  try {
    const b = req.body;
    const cols = { name:b.name, type:b.type, contact_person:b.contactPerson, phone:b.phone, email:b.email, location:b.location, what_they_buy:b.whatTheyBuy, source:b.source, status:b.status, last_contact:b.lastContact, notes:b.notes };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(cols)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(orNull(v)); } }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()'); params.push(req.params.id);
    const r = await query(`UPDATE customers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json(mapCustomer(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/customers/:id', requireRole(['owner','admin']), async (req, res) => {
  try {
    const r = await query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted', id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================== PROJECTS ======================
// Read: any authenticated user (employees need it for the purchase-request project picker).
// Writes: owner/admin.
app.get('/api/projects', async (req, res) => {
  try {
    const { search, status } = req.query;
    const where = ['1=1']; const params = []; let i = 1;
    if (search) { where.push(`(LOWER(name) LIKE $${i} OR LOWER(COALESCE(client,'')) LIKE $${i})`); params.push(`%${String(search).toLowerCase()}%`); i++; }
    if (status) { where.push(`status = $${i++}`); params.push(status); }
    const r = await query(`SELECT * FROM projects WHERE ${where.join(' AND ')} ORDER BY name ASC`, params);
    res.json(r.rows.map(mapProject));
  } catch (err) { console.error('projects list error:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/projects/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(mapProject(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/projects', requireRole(['owner','admin','accounting']), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Project name is required' });
    const id = newId('PRJ');
    const r = await query(
      `INSERT INTO projects (id,name,description,status,client,location,start_date,end_date,budget_allocation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, b.name, orNull(b.description), orNull(b.status) || 'Active', orNull(b.client), orNull(b.location), orNull(b.startDate), orNull(b.endDate), Number(b.budgetAllocation) || 0]
    );
    res.status(201).json(mapProject(r.rows[0]));
  } catch (err) { console.error('project create error:', err); res.status(500).json({ error: err.message }); }
});
app.patch('/api/projects/:id', requireRole(['owner','admin','accounting']), async (req, res) => {
  try {
    const b = req.body;
    const cols = { name:b.name, description:b.description, status:b.status, client:b.client, location:b.location, start_date:b.startDate, end_date:b.endDate, budget_allocation:b.budgetAllocation };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(cols)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(k === 'budget_allocation' ? (Number(v) || 0) : orNull(v)); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()'); params.push(req.params.id);
    const r = await query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(mapProject(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/projects/:id', requireRole(['owner','admin','accounting']), async (req, res) => {
  try {
    const r = await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted', id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ====================== PURCHASE REQUESTS ======================
// Employees file/read their own; admins list all + review. Inventory withdrawal below.
app.post('/api/purchase-requests', requireAuth, async (req, res) => {
  try {
    const b = req.body;
    const items = Array.isArray(b.items) ? b.items.filter((it) => it && String(it.description || '').trim() && Number(it.quantity) > 0) : [];
    if (items.length === 0) return res.status(400).json({ error: 'At least one item with a description and quantity is required' });
    const total = items.reduce((t, it) => t + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0), 0);

    // Requester identity comes from the token, never the client body.
    const employeeId = req.user?.id ?? null;
    const employeeName = req.user?.name || 'Unknown';

    // Generate PR-YYYY-#### from the current max.
    const year = new Date().getFullYear();
    const last = await query(`SELECT pr_number FROM purchase_requests WHERE pr_number LIKE $1 ORDER BY pr_number DESC LIMIT 1`, [`PR-${year}-%`]);
    let counter = 1;
    if (last.rows[0]) { const n = parseInt(last.rows[0].pr_number.split('-')[2], 10); if (!isNaN(n)) counter = n + 1; }
    const prNumber = `PR-${year}-${String(counter).padStart(4, '0')}`;

    const id = newId('PR');
    const r = await query(
      `INSERT INTO purchase_requests (id, pr_number, employee_id, employee_name, project_id, needed_by, supplier, notes, items, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'pending') RETURNING *`,
      [id, prNumber, employeeId, employeeName, orNull(b.projectId), orNull(b.neededBy), orNull(b.supplier), orNull(b.notes), JSON.stringify(items), total]
    );
    res.status(201).json(mapPurchaseRequest(r.rows[0]));
  } catch (err) { console.error('purchase-request create error:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/purchase-requests/mine', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT pr.*, p.name AS project_name FROM purchase_requests pr
       LEFT JOIN projects p ON p.id = pr.project_id
       WHERE pr.employee_id = $1 ORDER BY pr.created_at DESC, pr.pr_number DESC`,
      [req.user?.id ?? null]
    );
    res.json(r.rows.map(mapPurchaseRequest));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Shared by the admin dashboard (staff admin/owner) AND the purchasing portal (role 'purchasing').
app.get('/api/purchase-requests', requireRole(['admin', 'purchasing', 'accounting']), async (req, res) => {
  try {
    const { status } = req.query;
    const where = ['1=1']; const params = []; let i = 1;
    if (status) { where.push(`pr.status = $${i++}`); params.push(status); }
    // Purchasing only acts on requests Accounting has already checked, so a pending one is
    // not theirs to see. Enforced here rather than in the UI: hiding it client-side would
    // still ship the data. Admin and accounting are unaffected.
    if (effectiveRole(req.user) === 'purchasing') where.push(`pr.status <> 'pending'`);
    const r = await query(
      `SELECT pr.*, p.name AS project_name FROM purchase_requests pr
       LEFT JOIN projects p ON p.id = pr.project_id
       -- created_at is a real TIMESTAMPTZ so this is already newest-first; pr_number is a
       -- deterministic tiebreaker for the theoretical same-instant case, giving a total order.
       WHERE ${where.join(' AND ')} ORDER BY pr.created_at DESC, pr.pr_number DESC`,
      params
    );
    res.json(r.rows.map(mapPurchaseRequest));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin-only hard delete of a purchase request (#2) — lets the admin clear test rows without
// touching the DB by hand. A request that already has a purchase order raised against it is
// protected: deleting it would orphan the PO and the priced-line history mirrored back onto the
// request (see the PR↔PO link in POST /api/purchase-orders). Delete that order first if intended.
app.delete('/api/purchase-requests/:id', requireRole(['admin']), async (req, res) => {
  try {
    const existing = await query('SELECT id FROM purchase_requests WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Purchase request not found' });
    const linked = await query(
      `SELECT id FROM purchase_orders WHERE purchase_request_id = $1 AND COALESCE(order_type,'purchase') <> 'sales' LIMIT 1`,
      [req.params.id]
    );
    if (linked.rows[0]) {
      return res.status(400).json({ error: `Purchase order ${linked.rows[0].id} exists for this request — delete that order first.` });
    }
    await query('DELETE FROM purchase_requests WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Signatures for ONE request, fetched on demand at print time.
//
// Deliberately not part of GET /api/purchase-requests: a signature is ~20KB of base64, so
// joining it onto the list would add ~20KB per row (see the same reasoning behind the explicit
// column list on /api/suppliers, which keeps certificate scans out of that list).
//
// The preparer's signature is read LIVE from their account rather than snapshotted onto the
// request, matching what the production portal already prints for its own Prepared By block
// (RequestsPage.tsx) — snapshotting here would make the two documents disagree for the same PR.
// checked_signature IS a snapshot, because it is proof of a review that happened at a moment.
// 'employee' is admitted so production can print its own request fully signed — but scoped
// below to requests they filed. Without that check any employee could pull the signature
// images off any request by id, which is precisely what the role guard exists to prevent.
app.get('/api/purchase-requests/:id/signatures', requireRole(['admin', 'accounting', 'purchasing', 'employee']), async (req, res) => {
  try {
    const r = await query(
      `SELECT pr.employee_id, pr.checked_signature, e.signature AS prepared_signature, a.signature AS approved_signature
         FROM purchase_requests pr
         LEFT JOIN employee_accounts e ON e.id = pr.employee_id
         LEFT JOIN users a ON a.id = pr.verified_by_id
        WHERE pr.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Purchase request not found' });
    if (effectiveRole(req.user) === 'employee' && r.rows[0].employee_id !== (req.user?.id ?? null)) {
      return res.status(403).json({ error: 'You can only view signatures on your own purchase requests' });
    }
    res.json({
      preparedSignature: r.rows[0].prepared_signature || null,
      checkedSignature: r.rows[0].checked_signature || null,
      approvedSignature: r.rows[0].approved_signature || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// The four signatures on a printed purchase order, fetched on demand at print time. Kept off
// GET /api/purchase-orders for the same reason as the request ones: ~20KB of base64 each would
// otherwise ride on every row of every list.
//
// Prepared / Processed / Approved resolve LIVE from their accounts by id, so saving a signature
// later completes documents already issued. Reviewed is the snapshot taken at accounting's
// review — that one is proof of a moment, not of a person.
//
// A hand-raised order (no purchase request) has no employee and no accounting review; those
// blocks come back null and print as blank ruled lines.
app.get('/api/purchase-orders/:id/signatures', requireRole(['admin', 'purchasing', 'accounting', 'warehouse', 'logistics']), async (req, res) => {
  try {
    // Section C — #12: the printed order has exactly THREE signees, in the order they act:
    //   Prepared By — the purchasing staffer who raised the order (processed_by_id)
    //   Reviewed By — the accounting staffer who reviewed it     (po_reviewed_by_id)
    //   Approved By — the admin who approved it                  (approved_by_id)
    // The old employee/request-verifier joins and the Supervised block are gone (#7).
    const r = await query(
      `SELECT pc.signature AS prepared_signature,
              ac.signature AS reviewed_signature,
              u.signature  AS approved_signature
         FROM purchase_orders po
         LEFT JOIN purchasing_accounts pc ON pc.id = po.processed_by_id
         LEFT JOIN accounting_accounts ac ON ac.id = po.po_reviewed_by_id
         LEFT JOIN users u ON u.id = po.approved_by_id
        WHERE po.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Purchase order not found' });
    res.json({
      preparedSignature: r.rows[0].prepared_signature || null,
      reviewedSignature: r.rows[0].reviewed_signature || null,
      approvedSignature: r.rows[0].approved_signature || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Portal e-signatures --------------------------------------------------------------
// Six identical GET/PUT pairs (one per portal role) collapsed into one mount. The table name
// is a hardcoded literal per call, never user input. Behaviour is unchanged: role-scoped,
// keyed to req.user.id, data-URL validated, 2M-character cap.
function mountSignatureRoutes(path, table, role) {
  app.get(`/api/${path}/signature`, requireRole([role]), async (req, res) => {
    try {
      const r = await query(`SELECT signature FROM ${table} WHERE id = $1`, [req.user?.id]);
      res.json({ signature: r.rows[0]?.signature || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.put(`/api/${path}/signature`, requireRole([role]), async (req, res) => {
    try {
      const sig = req.body?.signature;
      if (typeof sig !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(sig)) {
        return res.status(400).json({ error: 'A PNG or JPEG image signature is required' });
      }
      if (sig.length > 2_000_000) return res.status(400).json({ error: 'Signature image is too large' });
      const r = await query(`UPDATE ${table} SET signature = $1 WHERE id = $2`, [sig, req.user?.id]);
      // This route used to echo the signature back unconditionally. When req.user.id was
      // undefined the UPDATE matched zero rows, so it reported success and saved nothing —
      // the pad said "Signature saved" and the drawing vanished on reload. Never report a
      // write that did not happen.
      if (!r.rowCount) return res.status(404).json({ error: 'Your account could not be found — sign out and back in' });
      res.json({ signature: sig });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
mountSignatureRoutes('purchasing', 'purchasing_accounts', 'purchasing');
mountSignatureRoutes('accounting', 'accounting_accounts', 'accounting');
mountSignatureRoutes('employee', 'employee_accounts', 'employee');
mountSignatureRoutes('warehouse', 'warehouse_accounts', 'warehouse');
// The admin dashboard's own staff identity lives in `users`, not a portal accounts table.
// requireRole(['admin']) also admits 'owner', so a super-admin can sign too.
mountSignatureRoutes('admin', 'users', 'admin');
mountSignatureRoutes('sales', 'sales_accounts', 'sales');
mountSignatureRoutes('logistics', 'logistics_accounts', 'logistics');

// Accounting review — the FIRST gate. An accounting-portal account marks a pending request
// 'reviewed' (unlocking Purchasing to raise a PO) or rejects it. Plain admins CANNOT review;
// 'owner' is kept only as an emergency override. On 'reviewed' the accounting account's saved
// e-signature is snapshotted onto the request as proof of check.
// [replaced] /purchase-requests/:id/purchasing-review — Purchasing no longer checks PRs; they
// raise a purchase order against an already-reviewed request instead (POST /api/purchase-orders).
app.put('/api/purchase-requests/:id/accounting-review', requireRole(['accounting', 'owner']), async (req, res) => {
  try {
    const { action } = req.body;
    if (!['reviewed', 'rejected'].includes(action)) return res.status(400).json({ error: "action must be 'reviewed' or 'rejected'" });
    const cur = await query('SELECT status FROM purchase_requests WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Purchase request not found' });
    if (cur.rows[0].status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be reviewed by Accounting' });
    if (action === 'reviewed') {
      // Snapshot the reviewer's signature (accounting accounts only; owner override has none).
      let signature = null;
      if (req.user?.role === 'accounting' && req.user?.id) {
        const sig = await query('SELECT signature FROM accounting_accounts WHERE id = $1', [req.user.id]);
        signature = sig.rows[0]?.signature || null;
      }
      const r = await query(
        `UPDATE purchase_requests SET status='reviewed', checked_by=$1, checked_at=NOW(), checked_signature=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
        [req.user?.name || 'Accounting', signature, req.params.id]
      );
      return res.json(mapPurchaseRequest(r.rows[0]));
    }
    const r = await query(
      `UPDATE purchase_requests SET status='disapproved', checked_by=$1, checked_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.user?.name || 'Accounting', req.params.id]
    );
    res.json(mapPurchaseRequest(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin verification — the SECOND gate, between Accounting's review and Purchasing's order.
// Only an already-'reviewed' request can be verified; verifying is what lets Purchasing assign
// a supplier (POST /api/purchase-orders requires status='verified'). This is distinct from the
// admin's LATER approval of the resulting purchase order, which is what approves the request.
app.put('/api/purchase-requests/:id/verify', requireRole(['admin']), async (req, res) => {
  try {
    const { action } = req.body;
    if (!['verified', 'rejected'].includes(action)) return res.status(400).json({ error: "action must be 'verified' or 'rejected'" });
    const cur = await query('SELECT status FROM purchase_requests WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Purchase request not found' });
    if (cur.rows[0].status !== 'reviewed') {
      return res.status(400).json({ error: 'Only requests already reviewed by Accounting can be verified' });
    }
    const status = action === 'verified' ? 'verified' : 'disapproved';
    // verified_by_id is what lets the printed "Approved By" block resolve this admin's
    // signature — verified_by alone is a display name and cannot be joined on.
    const r = await query(
      `UPDATE purchase_requests SET status=$1, verified_by=$2, verified_by_id=$3, verified_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status, req.user?.name || 'Admin', req.user?.id ?? null, req.params.id]
    );
    res.json(mapPurchaseRequest(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [removed] PUT /api/purchase-requests/:id/review — the admin no longer approves the PR
// directly. Approval now happens on the purchase order (PUT /api/purchase-orders/:id/approve),
// which flips its linked PR to approved/disapproved in the same transaction.
// [removed] PUT /api/purchase-requests/:id/withdrawn — see the note by the withdrawal routes.
// `withdrawn` is now set by PUT /api/inventory-withdrawals/:id/review, in the same transaction
// as the stock deduction, and only once every line of the request has been approved.

// Employee ad-hoc withdrawal — no longer deducts on the spot. Creates a PENDING
// withdrawal request that an admin must approve (approval performs the deduction).
app.post('/api/inventory/:id/withdraw', requireAuth, async (req, res) => {
  try {
    const qty = Number(req.body.quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'A positive quantity is required' });
    const item = await query('SELECT id, item_name, quantity, unit FROM inventory WHERE id = $1', [req.params.id]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    // Advisory only — stock is re-checked against a locked row at approval time, which is the
    // check that counts. This one just fails fast on an obviously impossible request.
    if (qty > parseFloat(item.rows[0].quantity)) return res.status(400).json({ error: 'Cannot withdraw more than available stock' });

    // One live request per purchase-request line. Without this the production screen could
    // raise a second full set of withdrawals for the same PR — the button was gated only on
    // `withdrawn`, which doesn't flip until every line is approved — and approving both would
    // deduct the stock TWICE, each passing its own locked re-check. Enforced here rather than
    // in the UI for the same reason the deduct-fulfill hole was closed: a client-side check is
    // not a check. A rejected line stays re-requestable.
    if (req.body.purchaseRequestId) {
      const dupe = await query(
        `SELECT withdrawal_number, status FROM inventory_withdrawal_requests
          WHERE purchase_request_id = $1 AND inventory_id = $2 AND status <> 'rejected' LIMIT 1`,
        [req.body.purchaseRequestId, req.params.id]
      );
      if (dupe.rows[0]) {
        return res.status(409).json({
          error: `${item.rows[0].item_name} has already been requested on this purchase request (${dupe.rows[0].withdrawal_number}, ${dupe.rows[0].status})`,
        });
      }
    }

    // WD-YYYY-NNNN, same recipe as pr_number. Gives the receipt a number to cite.
    const year = new Date().getFullYear();
    const last = await query(`SELECT withdrawal_number FROM inventory_withdrawal_requests WHERE withdrawal_number LIKE $1 ORDER BY withdrawal_number DESC LIMIT 1`, [`WD-${year}-%`]);
    let counter = 1;
    if (last.rows[0]) { const n = parseInt(last.rows[0].withdrawal_number.split('-')[2], 10); if (!isNaN(n)) counter = n + 1; }
    const withdrawalNumber = `WD-${year}-${String(counter).padStart(4, '0')}`;

    const id = newId('WDR');
    try {
      // Section D — #5/#15: an optional destination marks this as a logistics-origin withdrawal
      // that should become a delivery once an admin approves it. Production withdrawals omit it.
      await query(
        `INSERT INTO inventory_withdrawal_requests
           (id, withdrawal_number, inventory_id, item_name, quantity, reason, requested_by_id, requested_by_name, purchase_request_id, destination, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
        [id, withdrawalNumber, req.params.id, item.rows[0].item_name, qty, orNull(req.body.reason),
         req.user?.id ?? null, req.user?.name || 'Unknown', orNull(req.body.purchaseRequestId), orNull(req.body.destination)]
      );
      // Re-read through the joined SELECT rather than using RETURNING *: a bare row has no
      // pr_number or unit, so the created object would differ in shape from the same row in
      // the list — the caller would silently lose them until the next refetch.
      const r = await query(`${WITHDRAWAL_SELECT} WHERE w.id = $1`, [id]);
      res.status(201).json(mapWithdrawalRequest(r.rows[0]));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'That withdrawal number was just taken — try again' });
      throw e;
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [removed] POST /api/inventory/:id/deduct-fulfill — it deducted stock immediately when an
// employee "fulfilled" an approved purchase request, on the reasoning that the request had
// already been approved. But it was requireAuth-only, took no purchase-request id, and had no
// transaction or row lock: any authenticated caller could deduct any quantity of any item, and
// nothing tied a call to an approved request. Double-withdrawal was prevented only by a
// client-side `!req.withdrawn` check. Every withdrawal now goes through the approval queue
// above, which locks both rows and re-checks stock.
// [removed] PUT /api/purchase-requests/:id/withdrawn — the client asked the server to trust
// that it had finished deducting. `withdrawn` is now set by the review route, and only once
// every line of that request has actually been approved.

// ---- Inventory withdrawal requests (approval queue) ----
// Employee's own withdrawal requests.
// Joined so a row can render (and print) without a second fetch. Signatures are NOT joined —
// they are ~20KB each and would bloat every list row; see the /signatures route below.
const WITHDRAWAL_SELECT = `
  SELECT w.*, pr.pr_number, i.unit
    FROM inventory_withdrawal_requests w
    LEFT JOIN purchase_requests pr ON pr.id = w.purchase_request_id
    LEFT JOIN inventory i ON i.id = w.inventory_id`;

app.get('/api/inventory-withdrawals/mine', requireAuth, async (req, res) => {
  try {
    const r = await query(`${WITHDRAWAL_SELECT} WHERE w.requested_by_id = $1 ORDER BY w.created_at DESC`, [req.user?.id ?? null]);
    res.json(r.rows.map(mapWithdrawalRequest));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin review list (optional ?status= filter).
// Both approvers share this queue; each portal filters by the stage it acts on.
app.get('/api/inventory-withdrawals', requireRole(['admin', 'warehouse']), async (req, res) => {
  try {
    const { status } = req.query;
    const where = []; const params = []; let i = 1;
    if (status) { where.push(`w.status = $${i++}`); params.push(status); }
    const sql = `${WITHDRAWAL_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY w.created_at DESC`;
    const r = await query(sql, params);
    res.json(r.rows.map(mapWithdrawalRequest));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Signatures for ONE withdrawal, fetched on demand at print time — kept off the list for the
// same reason as the purchase-request ones: ~20KB of base64 per row.
// Requester and approver are both resolved LIVE from their accounts (by id), so saving a
// signature later retroactively completes receipts already issued.
// The warehouse's release joins on a TEXT column, so cast the SERIAL id to match rather than
// the other way round — warehouse_by_id also holds a users.id when an admin releases it.
app.get('/api/inventory-withdrawals/:id/signatures', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT e.signature AS requested_signature,
              COALESCE(wa.signature, wu.signature) AS released_signature,
              u.signature AS approved_signature
         FROM inventory_withdrawal_requests w
         LEFT JOIN employee_accounts e ON e.id = w.requested_by_id
         LEFT JOIN warehouse_accounts wa ON wa.id::TEXT = w.warehouse_by_id
         LEFT JOIN users wu ON wu.id = w.warehouse_by_id
         LEFT JOIN users u ON u.id = w.reviewed_by_id
        WHERE w.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Withdrawal request not found' });
    res.json({
      requestedSignature: r.rows[0].requested_signature || null,
      releasedSignature: r.rows[0].released_signature || null,
      approvedSignature: r.rows[0].approved_signature || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Two-stage approval, in order:
//   pending            → the WAREHOUSE confirms the stock is physically on the shelf
//   warehouse-approved → the ADMIN authorises, and only THAT deducts the stock
// Stock moves once, at the end, so a rejection never has to put anything back — which is why
// the admin is last even though the warehouse is the one holding the goods. Either stage can
// reject, and rejection is terminal.
app.put('/api/inventory-withdrawals/:id/review', requireRole(['admin', 'warehouse']), async (req, res) => {
  const { status } = req.body;
  if (!['warehouse-approved', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'warehouse-approved', 'approved' or 'rejected'" });
  }
  const role = effectiveRole(req.user);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const wr = await client.query(`SELECT * FROM inventory_withdrawal_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!wr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Withdrawal request not found' }); }
    const from = wr.rows[0].status;
    if (from === 'approved' || from === 'rejected') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already reviewed' }); }

    // Stage gates. An admin must not be able to skip the warehouse: the warehouse check is
    // what establishes the stock is really there, and the admin's screen can't see the shelf.
    if (status === 'warehouse-approved' && from !== 'pending') {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'The warehouse has already released this request' });
    }
    if (status === 'approved') {
      if (role === 'warehouse') {
        await client.query('ROLLBACK'); return res.status(403).json({ error: 'The warehouse releases a request; only an admin approves it' });
      }
      if (from !== 'warehouse-approved') {
        await client.query('ROLLBACK'); return res.status(400).json({ error: 'The warehouse must release this request before it can be approved' });
      }
    }

    // The warehouse's release — no stock moves here, only the record of who confirmed it.
    if (status === 'warehouse-approved') {
      await client.query(
        `UPDATE inventory_withdrawal_requests SET status='warehouse-approved', warehouse_by=$1, warehouse_by_id=$2, warehouse_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [req.user?.name || 'Warehouse', req.user?.id ?? null, req.params.id]
      );
      const upd = await client.query(`${WITHDRAWAL_SELECT} WHERE w.id = $1`, [req.params.id]);
      await client.query('COMMIT');
      return res.json(mapWithdrawalRequest(upd.rows[0]));
    }

    if (status === 'approved') {
      const qty = parseFloat(wr.rows[0].quantity);
      const item = await client.query('SELECT quantity, unit FROM inventory WHERE id = $1 FOR UPDATE', [wr.rows[0].inventory_id]);
      if (!item.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Inventory item no longer exists' }); }
      if (qty > parseFloat(item.rows[0].quantity)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot approve — exceeds available stock' }); }
      await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [qty, wr.rows[0].inventory_id]);
      await client.query(
        `UPDATE inventory_withdrawal_requests SET status='approved', reviewed_by=$1, reviewed_by_id=$2, reviewed_at=NOW(), deducted_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [req.user?.name || 'Admin', req.user?.id ?? null, req.params.id]
      );
      // Re-read joined, not RETURNING *: the admin screen merges this response over the row it
      // already has, so a bare row would null out pr_number/unit on screen the moment you approve.
      const upd = await client.query(`${WITHDRAWAL_SELECT} WHERE w.id = $1`, [req.params.id]);

      // A purchase-request withdrawal raises one request per line. The request counts as
      // withdrawn only when every one of its lines has actually been approved — a partial
      // approval must not unlock it. Set here, in the same transaction as the deduction:
      // the old client-side PUT /withdrawn asked the server to take its word for it.
      const prId = wr.rows[0].purchase_request_id;
      if (prId) {
        const left = await client.query(
          `SELECT COUNT(*)::int AS n FROM inventory_withdrawal_requests WHERE purchase_request_id = $1 AND status <> 'approved'`,
          [prId]
        );
        if (left.rows[0].n === 0) {
          await client.query(`UPDATE purchase_requests SET withdrawn=true, updated_at=NOW() WHERE id=$1`, [prId]);
        }
      }

      // Section D — #15: a logistics-origin withdrawal (one with a destination) becomes a
      // delivery the moment it's approved and the stock is deducted — in THIS transaction, so a
      // deducted withdrawal can never exist without its delivery. It lands in Logistics' "for
      // delivery" tab (a deliveries row with no sales_order_id). Production withdrawals skip this.
      const destination = wr.rows[0].destination;
      if (destination) {
        const year = new Date().getFullYear();
        const last = await client.query(`SELECT delivery_number FROM deliveries WHERE delivery_number LIKE $1 ORDER BY delivery_number DESC LIMIT 1 FOR UPDATE`, [`DR-${year}-%`]);
        let counter = 1;
        if (last.rows[0]) { const n = parseInt(last.rows[0].delivery_number.split('-')[2], 10); if (!isNaN(n)) counter = n + 1; }
        const deliveryNumber = `DR-${year}-${String(counter).padStart(4, '0')}`;
        const items = JSON.stringify([{ itemName: wr.rows[0].item_name, quantity: qty, unit: item.rows[0].unit || null }]);
        await client.query(
          `INSERT INTO deliveries (id, delivery_number, sales_order_id, withdrawal_id, destination, items, status, notes)
           VALUES ($1,$2,NULL,$3,$4,$5::jsonb,'pending',$6)`,
          [`DEL-${req.params.id}`, deliveryNumber, req.params.id, destination, items, orNull(wr.rows[0].reason)]
        );
      }
      await client.query('COMMIT');
      return res.json(mapWithdrawalRequest(upd.rows[0]));
    }

    // Rejection, from either stage — terminal, and moves no stock. Recorded in reviewed_* even
    // when the warehouse is the one refusing, so "who ended this and when" has one home.
    await client.query(
      `UPDATE inventory_withdrawal_requests SET status='rejected', reviewed_by=$1, reviewed_by_id=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [req.user?.name || (role === 'warehouse' ? 'Warehouse' : 'Admin'), req.user?.id ?? null, req.params.id]
    );
    const upd = await client.query(`${WITHDRAWAL_SELECT} WHERE w.id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json(mapWithdrawalRequest(upd.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('withdrawal review error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---- New-item requests (production → warehouse) ---------------------------------------
// The purchase-request item picker only offers items that already exist in inventory, so
// production had no way to ask for one that doesn't. This queue is that path: they request,
// the warehouse creates the item, and it becomes selectable like any other.
//
// Joined so a row can render without a second fetch — item_code is what production needs to
// see once the request lands, and it lives on the created inventory row, not here.
const ITEM_REQUEST_SELECT = `
  SELECT r.*, i.item_code
    FROM inventory_item_requests r
    LEFT JOIN inventory i ON i.id = r.inventory_id`;

const mapItemRequest = (r) => ({
  id: r.id,
  requestNumber: r.request_number ?? null,
  itemName: r.item_name,
  description: r.description ?? null,
  unit: r.unit ?? null,
  reason: r.reason ?? null,
  requestedById: r.requested_by_id ?? null,
  requestedByName: r.requested_by_name ?? null,
  status: r.status,
  reviewedBy: r.reviewed_by ?? null,
  reviewedAt: r.reviewed_at ?? null,
  inventoryId: r.inventory_id ?? null,
  itemCode: r.item_code ?? null,
  createdAt: r.created_at,
});

// Anyone signed in may ask for an item; only the warehouse (or an admin) may create it.
app.post('/api/item-requests', requireAuth, async (req, res) => {
  try {
    const itemName = String(req.body.itemName || '').trim();
    if (!itemName) return res.status(400).json({ error: 'An item name is required' });

    // The picker matches on name, so a duplicate would be indistinguishable from the real
    // item and split its stock across two rows. Point them at the one that already exists.
    const dupe = await query(`SELECT item_code FROM inventory WHERE LOWER(item_name) = LOWER($1) LIMIT 1`, [itemName]);
    if (dupe.rows[0]) {
      return res.status(409).json({ error: `"${itemName}" is already in inventory as ${dupe.rows[0].item_code} — pick it from the list instead` });
    }
    // Likewise, don't let the same item be asked for twice while the first ask is still open.
    const open = await query(
      `SELECT request_number FROM inventory_item_requests WHERE LOWER(item_name) = LOWER($1) AND status = 'pending' LIMIT 1`, [itemName]);
    if (open.rows[0]) {
      return res.status(409).json({ error: `"${itemName}" has already been requested (${open.rows[0].request_number}) and is awaiting the warehouse` });
    }

    // IR-YYYY-NNNN — the same recipe as PR-, WD- and ITM-.
    const year = new Date().getFullYear();
    const last = await query(
      `SELECT request_number FROM inventory_item_requests WHERE request_number LIKE $1 ORDER BY request_number DESC LIMIT 1`,
      [`IR-${year}-%`]
    );
    let counter = 1;
    if (last.rows[0]) { const n = parseInt(last.rows[0].request_number.split('-')[2], 10); if (!isNaN(n)) counter = n + 1; }
    const requestNumber = `IR-${year}-${String(counter).padStart(4, '0')}`;

    const id = newId('ITR');
    try {
      await query(
        `INSERT INTO inventory_item_requests
           (id, request_number, item_name, description, unit, reason, requested_by_id, requested_by_name, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [id, requestNumber, itemName, orNull(req.body.description), req.body.unit || 'pcs', orNull(req.body.reason),
         req.user?.id ?? null, req.user?.name || 'Unknown']
      );
      const r = await query(`${ITEM_REQUEST_SELECT} WHERE r.id = $1`, [id]);
      res.status(201).json(mapItemRequest(r.rows[0]));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'That request number was just taken — try again' });
      throw e;
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// The requester's own asks — how they learn the item has landed.
app.get('/api/item-requests/mine', requireAuth, async (req, res) => {
  try {
    const r = await query(`${ITEM_REQUEST_SELECT} WHERE r.requested_by_id = $1 ORDER BY r.created_at DESC`, [req.user?.id ?? null]);
    res.json(r.rows.map(mapItemRequest));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// The warehouse queue (optional ?status= filter).
app.get('/api/item-requests', requireRole(['admin', 'warehouse']), async (req, res) => {
  try {
    const { status } = req.query;
    const where = []; const params = []; let i = 1;
    if (status) { where.push(`r.status = $${i++}`); params.push(status); }
    const sql = `${ITEM_REQUEST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC`;
    const r = await query(sql, params);
    res.json(r.rows.map(mapItemRequest));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Warehouse accept/decline. Accepting CREATES the inventory item, here, in the same
// transaction that marks the request approved — rather than having the client call
// POST /inventory and then flip the request. Two calls would strand an item whenever the
// second failed, and the retry would create a second one.
app.put('/api/item-requests/:id/review', requireRole(['admin', 'warehouse']), async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const rr = await client.query(`SELECT * FROM inventory_item_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!rr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item request not found' }); }
    if (rr.rows[0].status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already reviewed' }); }

    if (status === 'approved') {
      // The warehouse may correct what production typed before it becomes a permanent row.
      const itemName = String(req.body.itemName || rr.rows[0].item_name || '').trim();
      if (!itemName) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'An item name is required' }); }
      const unit = req.body.unit || rr.rows[0].unit || 'pcs';
      const quantity = Number(req.body.quantity) || 0;
      if (quantity < 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Starting quantity cannot be negative' }); }

      // Re-check under the transaction: the name was free when the request was raised, but
      // the warehouse may have added it by hand in the meantime.
      const dupe = await client.query(`SELECT item_code FROM inventory WHERE LOWER(item_name) = LOWER($1) LIMIT 1`, [itemName]);
      if (dupe.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `"${itemName}" already exists as ${dupe.rows[0].item_code}` });
      }

      const itemCode = await nextItemCode((sql, params) => client.query(sql, params));
      const invId = `INV-${Date.now()}`;
      try {
        await client.query(
          `INSERT INTO inventory (id, item_code, item_name, description, quantity, unit, reorder_level, unit_cost)
           VALUES ($1,$2,$3,$4,$5,$6,10,0)`,
          [invId, itemCode, itemName, orNull(rr.rows[0].description), quantity, unit]
        );
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return res.status(409).json({ error: `Item code ${itemCode} was just taken — try again` });
        throw e;
      }
      await client.query(
        `UPDATE inventory_item_requests
            SET status='approved', item_name=$1, unit=$2, inventory_id=$3,
                reviewed_by=$4, reviewed_by_id=$5, reviewed_at=NOW(), updated_at=NOW()
          WHERE id=$6`,
        [itemName, unit, invId, req.user?.name || 'Warehouse', req.user?.id ?? null, req.params.id]
      );
      // Re-read joined, not RETURNING *: the queue merges this over the row it already holds,
      // and a bare row carries no item_code — the one thing the requester is waiting for.
      const upd = await client.query(`${ITEM_REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
      await client.query('COMMIT');
      return res.json(mapItemRequest(upd.rows[0]));
    }

    await client.query(
      `UPDATE inventory_item_requests SET status='rejected', reviewed_by=$1, reviewed_by_id=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [req.user?.name || 'Warehouse', req.user?.id ?? null, req.params.id]
    );
    const upd = await client.query(`${ITEM_REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json(mapItemRequest(upd.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('item request review error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ====================== INQUIRIES / QUOTATIONS ======================
// Writes: owner/admin/purchasing.
app.get('/api/inquiries', async (req, res) => {
  try {
    const { search, status, source } = req.query;
    const where = ['1=1']; const params = []; let i = 1;
    if (search) { where.push(`(LOWER(COALESCE(customer_name,'')) LIKE $${i} OR LOWER(COALESCE(what_they_want,'')) LIKE $${i} OR LOWER(COALESCE(supplier_name,'')) LIKE $${i})`); params.push(`%${String(search).toLowerCase()}%`); i++; }
    if (status) { where.push(`status = $${i++}`); params.push(status); }
    if (source) { where.push(`source = $${i++}`); params.push(source); }
    const r = await query(`SELECT * FROM inquiries WHERE ${where.join(' AND ')} ORDER BY inquiry_date DESC, created_at DESC`, params);
    res.json(r.rows.map(mapInquiry));
  } catch (err) { console.error('inquiries list error:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/inquiries/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM inquiries WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
    res.json(mapInquiry(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/inquiries', requireRole(['owner','admin','purchasing','office_admin','sales']), async (req, res) => {
  try {
    const b = req.body; const id = newId('INQ');
    const r = await query(
      `INSERT INTO inquiries (id,inquiry_date,customer_id,customer_name,contact,what_they_want,line,source,status,quote_amount,supplier_id,supplier_name,supplier_quote_amount,follow_up_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, b.inquiryDate || new Date().toISOString().split('T')[0], orNull(b.customerId), orNull(b.customerName), orNull(b.contact), orNull(b.whatTheyWant), orNull(b.line), orNull(b.source), orNull(b.status) || 'New', orNull(b.quoteAmount), orNull(b.supplierId), orNull(b.supplierName), orNull(b.supplierQuoteAmount), orNull(b.followUpDate), orNull(b.notes)]
    );
    res.status(201).json(mapInquiry(r.rows[0]));
  } catch (err) { console.error('inquiry create error:', err); res.status(500).json({ error: err.message }); }
});
app.patch('/api/inquiries/:id', requireRole(['owner','admin','purchasing','office_admin','sales']), async (req, res) => {
  try {
    const b = req.body;
    const cols = { inquiry_date:b.inquiryDate, customer_id:b.customerId, customer_name:b.customerName, contact:b.contact, what_they_want:b.whatTheyWant, line:b.line, source:b.source, status:b.status, quote_amount:b.quoteAmount, supplier_id:b.supplierId, supplier_name:b.supplierName, supplier_quote_amount:b.supplierQuoteAmount, follow_up_date:b.followUpDate, notes:b.notes };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(cols)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(orNull(v)); } }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()'); params.push(req.params.id);
    const r = await query(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
    res.json(mapInquiry(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/inquiries/:id', requireRole(['owner','admin','purchasing','office_admin']), async (req, res) => {
  try {
    const r = await query('DELETE FROM inquiries WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Inquiry not found' });
    res.json({ message: 'Inquiry deleted', id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Convert a won quotation -> Sales Order (client) + optional Purchase Order (supplier).
// raisePurchaseOrder (bool) controls the buying side. Cost (supplier quote) is stored on the
// SO as cost_amount for per-order margin; the raised PO is the cost on the financial dashboard.
app.post('/api/inquiries/:id/convert', requireRole(['owner','admin','purchasing','office_admin','sales']), async (req, res) => {
  try {
    const { raisePurchaseOrder = true } = req.body || {};
    const inqRes = await query('SELECT * FROM inquiries WHERE id = $1', [req.params.id]);
    const inq = inqRes.rows[0];
    if (!inq) return res.status(404).json({ error: 'Inquiry not found' });
    if (inq.sales_order_id) return res.status(400).json({ error: 'Inquiry already converted', salesOrderId: inq.sales_order_id });

    // Resolve client name + address/contact for the SO (customer record wins, else free-text)
    let clientName = inq.customer_name;
    let customerAddress = null, customerContact = null;
    if (inq.customer_id) {
      const c = await query('SELECT name, location, contact_person, phone FROM customers WHERE id = $1', [inq.customer_id]);
      if (c.rows[0]) {
        clientName = c.rows[0].name;
        customerAddress = c.rows[0].location || null;
        customerContact = c.rows[0].phone || c.rows[0].contact_person || null;
      }
    }
    clientName = clientName || 'Walk-in customer';

    // PDF header fields pre-filled on conversion (all editable afterward):
    // doc_date = today, prepared_by = default 'Kim Karen D. Tagle', payment terms default — handled by createSalesOrder/createPurchaseOrder.
    const so = await createSalesOrder({
      client: clientName,
      customerId: inq.customer_id || null,
      description: inq.what_they_want || `Converted from quotation ${inq.id}`,
      amount: inq.quote_amount || 0,
      line: inq.line || null,
      source: inq.source || null,
      inquiryId: inq.id,
      costAmount: inq.supplier_quote_amount || null,
      customerAddress,
      customerContact: customerContact || inq.contact || null,
    });

    // Resolve supplier name + address/contact for the PO
    let supplierName = inq.supplier_name;
    let supplierAddress = null, supplierContact = null;
    if (inq.supplier_id) {
      const s = await query('SELECT name, location, contact_person, phone FROM suppliers WHERE id = $1', [inq.supplier_id]);
      if (s.rows[0]) {
        supplierName = s.rows[0].name;
        supplierAddress = s.rows[0].location || null;
        supplierContact = s.rows[0].phone || s.rows[0].contact_person || null;
      }
    }

    let po = null;
    const wantPO = raisePurchaseOrder && (inq.supplier_id || inq.supplier_name) && inq.supplier_quote_amount != null;
    if (wantPO) {
      po = await createPurchaseOrder({
        client: supplierName || 'Supplier',
        description: inq.what_they_want || `Supply for quotation ${inq.id}`,
        amount: inq.supplier_quote_amount || 0,
        supplierId: inq.supplier_id || null,
        inquiryId: inq.id,
        supplierAddress,
        supplierContact,
      });
    }

    const upd = await query(
      `UPDATE inquiries SET status='Won', sales_order_id=$1, purchase_order_id=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [so.id, po ? po.id : inq.purchase_order_id, inq.id]
    );

    res.status(201).json({
      message: 'Quotation converted',
      inquiry: mapInquiry(upd.rows[0]),
      salesOrder: { id: so.id, soNumber: so.so_number, client: so.client, amount: parseFloat(so.amount), costAmount: so.cost_amount === null ? null : parseFloat(so.cost_amount), status: so.status },
      purchaseOrder: po ? { id: po.id, poNumber: po.po_number, client: po.client, amount: parseFloat(po.amount), status: po.status } : null,
    });
  } catch (err) { console.error('inquiry convert error:', err); res.status(500).json({ error: err.message }); }
});

// ========================= STAFF ACCOUNTS =========================
// Owner-only. Create/list/deactivate admin-login accounts (admin|bookkeeper|purchasing).
app.get('/api/staff', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT id,email,name,role,is_super_admin,is_active,created_at FROM users WHERE role IN ('admin','bookkeeper','purchasing','office_admin') ORDER BY created_at DESC`);
    res.json(r.rows.map(u => ({ id:u.id, email:u.email, name:u.name, role:u.role, isSuperAdmin:u.is_super_admin, isActive:u.is_active, createdAt:u.created_at })));
  } catch (err) { console.error('staff list error:', err); res.status(500).json({ error: err.message }); }
});
app.post('/api/staff', requireSuperAdmin, async (req, res) => {
  try {
    const { email, name, password, role } = req.body;
    if (!email || !name || !password || !role) return res.status(400).json({ error: 'email, name, password, role are required' });
    if (!['admin','bookkeeper','office_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const exists = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'An account with that email already exists' });
    const id = `staff-${Date.now()}`;
    const hash = await hashPassword(password);
    const r = await query(
      `INSERT INTO users (id,email,password_hash,name,role,is_super_admin,is_active,created_at)
       VALUES ($1,$2,$3,$4,$5,false,true,NOW()) RETURNING id,email,name,role,is_active,created_at`,
      [id, email.toLowerCase(), hash, name, role]
    );
    const u = r.rows[0];
    res.status(201).json({ id:u.id, email:u.email, name:u.name, role:u.role, isActive:u.is_active, createdAt:u.created_at });
  } catch (err) { console.error('staff create error:', err); res.status(500).json({ error: err.message }); }
});
app.patch('/api/staff/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { name, role, password, isActive } = req.body;
    const sets = []; const params = []; let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); params.push(name); }
    if (role !== undefined) {
      if (!['admin','bookkeeper','office_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      sets.push(`role = $${i++}`); params.push(role);
    }
    if (isActive !== undefined) { sets.push(`is_active = $${i++}`); params.push(!!isActive); }
    if (password) { sets.push(`password_hash = $${i++}`); params.push(await hashPassword(password)); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const r = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} AND is_super_admin = false RETURNING id,email,name,role,is_active`, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Staff account not found (or is a super admin)' });
    const u = r.rows[0];
    res.json({ id:u.id, email:u.email, name:u.name, role:u.role, isActive:u.is_active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Permanently delete a staff account. Super admins are protected (is_super_admin = false
// guard). admin_approval_requests.decided_by is a RESTRICT FK, so null it first.
app.delete('/api/staff/:id', requireSuperAdmin, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE admin_approval_requests SET decided_by = NULL WHERE decided_by = $1', [req.params.id]);
    const r = await client.query('DELETE FROM users WHERE id = $1 AND is_super_admin = false', [req.params.id]);
    if (!r.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Staff account not found (or is a super admin)' });
    }
    await client.query('COMMIT');
    res.json({ message: 'Staff account deleted', id: req.params.id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('staff delete error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Create new tables before starting server
const startServer = async () => {
  // Skip database connection for testing if DATABASE_URL not set
  if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL not set - starting server without database (login will be limited)');
  } else {
    try {
      await createNewTables();
      console.log('✅ Database connection established');
    } catch (err) {
      console.log('❌ Database connection failed, starting server without database');
      console.log('   Error:', err.message);
      // do NOT rethrow — let the server keep running
    }
  }
  
  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running at http://0.0.0.0:${PORT}`);
    console.log(`Using PORT from environment: ${PORT}`);
  });

  // ----- HTTPS server for phone GPS tracker (geolocation requires HTTPS) -----
  // Skip HTTPS server on Render (only run locally)
  let httpsSrv = null;
  if (!process.env.RENDER && process.env.ENABLE_HTTPS === "true") {
    try {
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
    } catch (err) {
      console.error('❌ HTTPS server failed to start (non-fatal):', err.message);
      // do NOT rethrow — let the HTTP server keep running
    }
  }

  return httpServer;
};

// SPA fallback — registered LAST, after every /api route, so it only catches
// client-side (non-API) paths in production. Registering it earlier shadowed the
// CRM / work-schedule / staff routes, which then returned index.html and made those
// admin pages fail to load in production while working locally (dev skips this block).
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(process.cwd(), 'dist');
  app.get(/.*/, (req, res) => {
    // Defense-in-depth: never answer an /api request with HTML. If an API route is
    // genuinely missing, return a JSON 404 (not the SPA shell) so the client gets a
    // real error instead of a JSON.parse crash.
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found', path: req.path });
    }
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(distDir, 'index.html'), { cacheControl: false });
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  // do NOT call process.exit() — let Render keep the process alive for debugging
});

