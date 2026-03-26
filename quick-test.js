// Quick System Test Script
import { query } from './server/db.js';

async function quickSystemTest() {
  console.log('🧪 QUICK SYSTEM TEST');
  console.log('====================');
  
  try {
    // Test 1: Database Connection
    console.log('\n1. Testing Database Connection...');
    const testQuery = await query('SELECT NOW() as current_time');
    console.log('✅ Database connected:', testQuery.rows[0].current_time);
    
    // Test 2: Check Users
    console.log('\n2. Checking User Accounts...');
    const users = await query('SELECT role, COUNT(*) as count FROM users GROUP BY role');
    console.log('📊 User Accounts:');
    users.rows.forEach(row => {
      console.log(`  - ${row.role}: ${row.count} users`);
    });
    
    // Test 3: Check Vehicles
    console.log('\n3. Checking Fleet Vehicles...');
    const vehicles = await query('SELECT COUNT(*) as count FROM vehicles');
    console.log(`🚗 Fleet Vehicles: ${vehicles.rows[0].count}`);
    
    // Test 4: Check Inventory
    console.log('\n4. Checking Inventory...');
    const inventory = await query('SELECT COUNT(*) as count FROM inventory');
    console.log(`📦 Inventory Items: ${inventory.rows[0].count}`);
    
    // Test 5: Check Purchase Orders
    console.log('\n5. Checking Purchase Orders...');
    const orders = await query('SELECT COUNT(*) as count FROM purchase_orders');
    console.log(`📋 Purchase Orders: ${orders.rows[0].count}`);
    
    // Test 6: Check Business Logic Tables
    console.log('\n6. Checking Business Logic Tables...');
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('financial_transactions', 'revenue_recognition', 'status_definitions')
    `);
    console.log('🔧 Business Logic Tables:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}: ✅`);
    });
    
    // Test 7: Server Health
    console.log('\n7. Testing Server Health...');
    try {
      const response = await fetch('http://localhost:3001/health');
      if (response.ok) {
        console.log('✅ Backend Server: Healthy');
      } else {
        console.log('❌ Backend Server: Not responding correctly');
      }
    } catch (error) {
      console.log('❌ Backend Server: Connection failed');
    }
    
    console.log('\n🎉 SYSTEM TEST COMPLETE!');
    console.log('========================');
    
    // Summary
    const summary = {
      database: '✅ Connected',
      users: users.rows.length > 0 ? '✅ Found' : '⚠️ None',
      vehicles: vehicles.rows[0].count > 0 ? '✅ Found' : '⚠️ None',
      inventory: inventory.rows[0].count > 0 ? '✅ Found' : '⚠️ None',
      businessTables: tables.rows.length === 3 ? '✅ Complete' : '⚠️ Incomplete'
    };
    
    console.log('\n📊 QUICK SUMMARY:');
    Object.entries(summary).forEach(([key, status]) => {
      console.log(`  ${key}: ${status}`);
    });
    
    console.log('\n🚀 READY FOR TESTING:');
    console.log('  Frontend: http://localhost:3000');
    console.log('  Backend:  http://localhost:3001');
    console.log('  Health:   http://localhost:3001/health');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

quickSystemTest();
