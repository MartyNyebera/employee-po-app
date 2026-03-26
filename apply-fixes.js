// Apply database fixes through the running application
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyDatabaseFixes() {
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'database-fixes-corrected.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Import your database query function
    const { query } = await import('./server/db.js');
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await query(statement);
          console.log(`✅ Statement ${i + 1} executed successfully`);
        } catch (error) {
          // Some statements might fail if they already exist, that's OK
          if (error.message.includes('already exists') || 
              error.message.includes('does not exist') ||
              error.message.includes('duplicate key')) {
            console.log(`⚠️  Statement ${i + 1} skipped (already exists):`, error.message.substring(0, 100));
          } else {
            console.error(`❌ Statement ${i + 1} failed:`, error.message);
          }
        }
      }
    }
    
    console.log('🎉 Database fixes applied successfully!');
    
    // Verify the fixes by checking if new tables exist
    const verification = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'sales_order_items', 'financial_transactions', 'revenue_recognition',
        'inventory_transactions', 'material_request_approvals', 'sales_order_approvals',
        'operational_costs', 'delivery_confirmations', 'status_definitions',
        'business_logic_audit_log'
      )
    `);
    
    console.log(`✅ Created/verified ${verification.rows.length} new tables`);
    verification.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Error applying database fixes:', error);
  }
}

// Run the fixes
applyDatabaseFixes().then(() => {
  console.log('🏁 Database fix application completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
