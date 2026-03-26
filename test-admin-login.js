import { query } from './server/db.js';

async function testAdminLogin() {
  try {
    console.log('=== Testing Admin Login ===');
    
    // Try common admin passwords
    const passwords = ['admin123', 'password', '123456', 'admin'];
    const adminEmail = 'kimoel_leotagle@yahoo.com';
    
    for (const password of passwords) {
      console.log(`Trying password: ${password}`);
      
      const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password: password
        })
      });
      
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        console.log('✅ Admin login successful with password:', password);
        console.log('Token:', loginData.token.substring(0, 50) + '...');
        
        // Now test delivery creation
        console.log('\n📦 Testing delivery creation...');
        
        const deliveryData = {
          so_number: 'SO-2026-001',
          driver_id: '3',
          vehicle_id: '1',
          customer_name: 'John Doe',
          customer_address: '123 Main Street, Manila',
          delivery_date: '2026-03-26',
          notes: 'Test delivery assignment'
        };
        
        const createResponse = await fetch('http://localhost:3001/api/deliveries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginData.token}`
          },
          body: JSON.stringify(deliveryData)
        });
        
        if (createResponse.ok) {
          const delivery = await createResponse.json();
          console.log('✅ Delivery created successfully!');
          console.log('Delivery ID:', delivery.id);
          console.log('Status:', delivery.status);
          console.log('Assigned to driver:', delivery.driver_id);
          return;
        } else {
          console.log('❌ Delivery creation failed');
        }
        
        return;
      }
    }
    
    console.log('❌ All admin passwords failed');
    console.log('Check your .env file for SUPER_ADMIN_OWNER_PASSWORD');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testAdminLogin();
