import { query } from './server/db.js';

async function demonstrateDeliveryAssignment() {
  try {
    console.log('=== Delivery Assignment Demonstration ===');
    
    // Step 1: Get available drivers
    const driversResult = await query('SELECT id, full_name, status FROM driver_accounts WHERE status = $1', ['approved']);
    console.log('Available drivers:');
    driversResult.rows.forEach(driver => {
      console.log(`  - ${driver.full_name} (ID: ${driver.id})`);
    });
    
    if (driversResult.rows.length === 0) {
      console.log('❌ No approved drivers available');
      return;
    }
    
    const driver = driversResult.rows[0];
    console.log(`\nUsing driver: ${driver.full_name} (ID: ${driver.id})`);
    
    // Step 2: Create sample delivery assignments for this driver
    const sampleDeliveries = [
      {
        delivery_number: 'DRV-' + Date.now() + '-1',
        customer_name: 'Alice Johnson',
        delivery_address: '123 Business Park, Manila',
        items: 'Office Supplies Package',
        status: 'assigned'
      },
      {
        delivery_number: 'DRV-' + Date.now() + '-2',
        customer_name: 'Bob Smith',
        delivery_address: '456 Commercial Center, Quezon City',
        items: 'Computer Equipment Box',
        status: 'assigned'
      },
      {
        delivery_number: 'DRV-' + Date.now() + '-3',
        customer_name: 'Carol Davis',
        delivery_address: '789 Industrial Area, Makati',
        items: 'Documents Folder',
        status: 'assigned'
      }
    ];
    
    console.log('\nCreating assigned deliveries...');
    
    for (const delivery of sampleDeliveries) {
      await query(
        `INSERT INTO driver_deliveries 
         (driver_id, delivery_number, customer_name, delivery_address, items, status, assigned_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [driver.id, delivery.delivery_number, delivery.customer_name, delivery.delivery_address, delivery.items, delivery.status]
      );
      console.log(`✅ Created: ${delivery.delivery_number} for ${delivery.customer_name}`);
    }
    
    // Step 3: Show the assigned deliveries
    const assignedDeliveries = await query(
      'SELECT * FROM driver_deliveries WHERE driver_id = $1 ORDER BY assigned_at DESC',
      [driver.id]
    );
    
    console.log(`\n📋 Driver ${driver.full_name} has ${assignedDeliveries.rows.length} assigned deliveries:`);
    assignedDeliveries.rows.forEach(delivery => {
      console.log(`  - ${delivery.delivery_number}: ${delivery.customer_name} (${delivery.status})`);
      console.log(`    📍 ${delivery.delivery_address}`);
      console.log(`    📦 ${delivery.items}`);
      console.log(`    📅 Assigned: ${new Date(delivery.assigned_at).toLocaleString()}`);
      console.log('');
    });
    
    // Step 4: Show how to assign a new delivery to a specific driver
    console.log('🔧 How to assign a delivery to a driver:');
    console.log('1. Admin creates delivery via API: POST /api/deliveries');
    console.log('2. Include driver_id in the request body');
    console.log('3. Status automatically set to "Assigned"');
    console.log('4. Driver sees the delivery in their portal');
    
    console.log('\n📱 Example API call:');
    console.log(`POST /api/deliveries`);
    console.log(`Body: {`);
    console.log(`  "so_number": "SO-2026-001",`);
    console.log(`  "driver_id": ${driver.id},`);
    console.log(`  "customer_name": "New Customer",`);
    console.log(`  "customer_address": "New Address",`);
    console.log(`  "delivery_date": "2026-03-26",`);
    console.log(`  "notes": "Handle with care"`);
    console.log(`}`);
    
    console.log('\n=== Assignment Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

demonstrateDeliveryAssignment();
