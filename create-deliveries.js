import { query } from './server/db.js';

async function createSampleDeliveries() {
  try {
    // Get the test driver ID
    const driverResult = await query('SELECT id FROM driver_accounts WHERE email = $1', ['driver@portal.com']);
    const driverId = driverResult.rows[0].id;
    
    console.log('Creating sample deliveries for driver:', driverId);
    
    // Create sample deliveries
    const deliveries = [
      {
        delivery_number: 'DEL-2026-001',
        customer_name: 'John Smith',
        delivery_address: '123 Main St, Manila',
        items: 'Office Supplies - 5 boxes',
        status: 'pending'
      },
      {
        delivery_number: 'DEL-2026-002', 
        customer_name: 'Jane Doe',
        delivery_address: '456 Oak Ave, Quezon City',
        items: 'Computer Equipment - 3 packages',
        status: 'pending'
      },
      {
        delivery_number: 'DEL-2026-003',
        customer_name: 'Bob Johnson',
        delivery_address: '789 Pine Rd, Makati',
        items: 'Documents - 2 envelopes',
        status: 'pending'
      }
    ];
    
    for (const delivery of deliveries) {
      await query(
        `INSERT INTO driver_deliveries 
         (driver_id, delivery_number, customer_name, delivery_address, items, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [driverId, delivery.delivery_number, delivery.customer_name, delivery.delivery_address, delivery.items, delivery.status]
      );
    }
    
    console.log('✅ Sample deliveries created');
    
    // Check created deliveries
    const result = await query('SELECT * FROM driver_deliveries WHERE driver_id = $1', [driverId]);
    console.log('Total deliveries:', result.rows.length);
    result.rows.forEach(d => {
      console.log(`- ${d.delivery_number}: ${d.customer_name} (${d.status})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createSampleDeliveries();
