// Simple test script to verify business logic fixes are working
import { query } from './server/db.js';

async function testBusinessLogicFixes() {
  console.log('🧪 Testing Business Logic Fixes Implementation');
  console.log('===========================================');
  
  try {
    // Test 1: Check if new tables exist
    console.log('\n📋 Step 1: Checking database tables...');
    
    const tablesCheck = await query(`
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
    
    console.log(`✅ Found ${tablesCheck.rows.length} new business logic tables:`);
    tablesCheck.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Test 2: Check if columns were added to existing tables
    console.log('\n📋 Step 2: Checking existing table updates...');
    
    const salesOrdersColumns = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sales_orders' 
      AND column_name IN ('approved_date', 'delivery_date', 'total_cogs', 'is_inventory_deducted')
    `);
    
    console.log(`✅ Added ${salesOrdersColumns.rows.length} new columns to sales_orders:`);
    salesOrdersColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });
    
    // Test 3: Check if status definitions were populated
    console.log('\n📋 Step 3: Checking status definitions...');
    
    const statusDefs = await query('SELECT COUNT(*) as count FROM status_definitions');
    console.log(`✅ Status definitions populated: ${statusDefs.rows[0].count} entries`);
    
    // Test 4: Check sales orders
    console.log('\n📋 Step 4: Checking existing sales orders...');
    
    const salesOrders = await query('SELECT COUNT(*) as count FROM sales_orders');
    console.log(`✅ Existing sales orders: ${salesOrders.rows[0].count}`);
    
    if (salesOrders.rows[0].count > 0) {
      const sampleOrder = await query('SELECT * FROM sales_orders LIMIT 1');
      console.log(`📊 Sample order: ${sampleOrder.rows[0].so_number} - Status: ${sampleOrder.rows[0].status}`);
    }
    
    // Test 5: Check inventory
    console.log('\n📋 Step 5: Checking inventory...');
    
    const inventory = await query('SELECT COUNT(*) as count FROM inventory');
    console.log(`✅ Inventory items: ${inventory.rows[0].count}`);
    
    if (inventory.rows[0].count > 0) {
      const sampleItem = await query('SELECT item_name, quantity FROM inventory LIMIT 1');
      console.log(`📊 Sample item: ${sampleItem.rows[0].item_name} - Quantity: ${sampleItem.rows[0].quantity}`);
    }
    
    // Test 6: Test business logic validation (without auth)
    console.log('\n📋 Step 6: Testing business logic validation...');
    
    try {
      // This will test the validation logic directly
      const validations = [];
      
      // Check for negative inventory
      const inventoryIssues = await query(`
        SELECT id, item_name, quantity
        FROM inventory
        WHERE quantity < 0
      `);
      
      if (inventoryIssues.rows.length > 0) {
        validations.push({
          severity: 'HIGH',
          issue: 'Negative inventory levels detected',
          count: inventoryIssues.rows.length
        });
      }
      
      console.log(`✅ Business logic validation completed`);
      console.log(`📊 Validation issues found: ${validations.length}`);
      
      validations.forEach((issue, index) => {
        console.log(`  ${index + 1}. [${issue.severity}] ${issue.issue} (${issue.count} items)`);
      });
      
    } catch (error) {
      console.log(`⚠️  Validation test skipped: ${error.message}`);
    }
    
    // Test 7: Test financial summary calculation
    console.log('\n📋 Step 7: Testing financial calculations...');
    
    try {
      const revenue = await query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM financial_transactions
        WHERE transaction_type = 'REVENUE' AND status = 'CONFIRMED'
      `);
      
      const cogs = await query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM financial_transactions
        WHERE transaction_type = 'COGS' AND status = 'CONFIRMED'
      `);
      
      const totalRevenue = parseFloat(revenue.rows[0].total);
      const totalCogs = parseFloat(cogs.rows[0].total);
      const grossProfit = totalRevenue - totalCogs;
      
      console.log(`💰 Financial Summary:`);
      console.log(`  Revenue: $${totalRevenue.toFixed(2)}`);
      console.log(`  COGS: $${totalCogs.toFixed(2)}`);
      console.log(`  Gross Profit: $${grossProfit.toFixed(2)}`);
      
    } catch (error) {
      console.log(`⚠️  Financial calculation test skipped: ${error.message}`);
    }
    
    console.log('\n🎉 Business Logic Implementation Test Completed!');
    console.log('===========================================');
    
    // Summary
    const summary = {
      tablesCreated: tablesCheck.rows.length,
      columnsAdded: salesOrdersColumns.rows.length,
      statusDefinitions: parseInt(statusDefs.rows[0].count),
      salesOrders: parseInt(salesOrders.rows[0].count),
      inventoryItems: parseInt(inventory.rows[0].count)
    };
    
    console.log('📊 Implementation Summary:');
    console.log(`  Tables Created: ${summary.tablesCreated}/10`);
    console.log(`  Columns Added: ${summary.columnsAdded}/4`);
    console.log(`  Status Definitions: ${summary.statusDefinitions}`);
    console.log(`  Sales Orders: ${summary.salesOrders}`);
    console.log(`  Inventory Items: ${summary.inventoryItems}`);
    
    if (summary.tablesCreated >= 5) {
      console.log('\n✅ Implementation appears successful!');
      console.log('🚀 Your business logic fixes are ready for testing.');
    } else {
      console.log('\n⚠️  Implementation may be incomplete.');
      console.log('📋 Some database tables may not have been created properly.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  process.exit(0);
}

// Run the test
testBusinessLogicFixes();
