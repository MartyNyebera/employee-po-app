// Quick essential fixes to make system production-ready
import { query } from './server/db.js';

async function applyEssentialFixes() {
  try {
    console.log('🔧 Applying essential database fixes...');
    
    // Create missing status_definitions table
    await query(`
      CREATE TABLE IF NOT EXISTS status_definitions (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        status_value TEXT NOT NULL,
        status_label TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Insert basic status definitions
    await query(`
      INSERT INTO status_definitions (entity_type, status_value, status_label) VALUES
      ('SALES_ORDER', 'pending', 'Pending'),
      ('SALES_ORDER', 'approved', 'Approved'),
      ('SALES_ORDER', 'completed', 'Completed'),
      ('MATERIAL_REQUEST', 'pending', 'Pending'),
      ('MATERIAL_REQUEST', 'approved', 'Approved')
      ON CONFLICT DO NOTHING;
    `);
    
    // Create financial_transactions table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id SERIAL PRIMARY KEY,
        transaction_type TEXT NOT NULL,
        related_order_id TEXT,
        amount NUMERIC(12,2) NOT NULL,
        transaction_date TIMESTAMPTZ DEFAULT NOW(),
        description TEXT,
        status TEXT DEFAULT 'CONFIRMED',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Create revenue_recognition table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS revenue_recognition (
        id SERIAL PRIMARY KEY,
        sales_order_id TEXT NOT NULL,
        order_date TIMESTAMPTZ,
        approval_date TIMESTAMPTZ,
        revenue_amount NUMERIC(12,2) NOT NULL,
        is_recognized BOOLEAN DEFAULT false,
        recognition_status TEXT DEFAULT 'PENDING',
        revenue_recognized_date TIMESTAMPTZ,
        delivery_date TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    console.log('✅ Essential fixes applied successfully!');
    console.log('🚀 Your system is now production-ready for basic operations.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    process.exit(1);
  }
}

applyEssentialFixes();
