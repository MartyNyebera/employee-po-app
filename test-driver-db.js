import { query } from './server/db.js';

async function testDriverDatabaseConnection() {
  try {
    console.log('=== Testing Driver Database Connection ===');
    
    // Test 1: Check if driver_deliveries table exists and has data
    console.log('\n📋 Checking driver_deliveries table...');
    const deliveriesResult = await query('SELECT COUNT(*) as count FROM driver_deliveries');
    console.log(`✅ driver_deliveries table exists with ${deliveriesResult.rows[0].count} records`);
    
    if (deliveriesResult.rows[0].count > 0) {
      const sampleDeliveries = await query('SELECT * FROM driver_deliveries LIMIT 3');
      console.log('Sample deliveries:');
      sampleDeliveries.rows.forEach(d => {
        console.log(`  - ${d.delivery_number}: ${d.customer_name} (${d.status})`);
      });
    }
    
    // Test 2: Check if driver_accounts table exists and has data
    console.log('\n👨‍✈️ Checking driver_accounts table...');
    const driversResult = await query('SELECT COUNT(*) as count FROM driver_accounts');
    console.log(`✅ driver_accounts table exists with ${driversResult.rows[0].count} records`);
    
    if (driversResult.rows[0].count > 0) {
      const sampleDrivers = await query('SELECT id, full_name, status FROM driver_accounts LIMIT 3');
      console.log('Sample drivers:');
      sampleDrivers.rows.forEach(d => {
        console.log(`  - ${d.full_name} (ID: ${d.id}, Status: ${d.status})`);
      });
    }
    
    // Test 3: Check if driver_locations table exists
    console.log('\n📍 Checking driver_locations table...');
    const locationsResult = await query('SELECT COUNT(*) as count FROM driver_locations');
    console.log(`✅ driver_locations table exists with ${locationsResult.rows[0].count} records`);
    
    // Test 4: Check if driver_messages table exists
    console.log('\n💬 Checking driver_messages table...');
    const messagesResult = await query('SELECT COUNT(*) as count FROM driver_messages');
    console.log(`✅ driver_messages table exists with ${messagesResult.rows[0].count} records`);
    
    // Test 5: Test the actual API endpoint that driver portal uses
    console.log('\n🔧 Testing driver API endpoint...');
    const driverId = 3; // YZER DEBODA
    const apiDeliveries = await query('SELECT * FROM driver_deliveries WHERE driver_id = $1 ORDER BY assigned_at DESC', [driverId]);
    console.log(`✅ Driver ${driverId} has ${apiDeliveries.rows.length} deliveries`);
    
    if (apiDeliveries.rows.length > 0) {
      console.log('Driver deliveries:');
      apiDeliveries.rows.forEach(d => {
        console.log(`  - ${d.delivery_number}: ${d.customer_name} (${d.status})`);
      });
    }
    
    // Test 6: Check if the API server is responding correctly
    console.log('\n🌐 Testing API server response...');
    try {
      const response = await fetch('http://localhost:3001/api/driver/3/deliveries');
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ API endpoint responding with ${data.length} deliveries`);
      } else {
        console.log(`❌ API endpoint returned ${response.status}`);
      }
    } catch (error) {
      console.log('❌ API endpoint not reachable:', error.message);
    }
    
    console.log('\n=== Database Connection Test Complete ===');
    console.log('✅ All driver tables exist and are accessible');
    console.log('✅ Database connection is working properly');
    
  } catch (error) {
    console.error('❌ Database connection error:', error);
  }
}

testDriverDatabaseConnection();
