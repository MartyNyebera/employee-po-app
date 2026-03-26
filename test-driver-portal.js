import jwt from 'jsonwebtoken';

async function testDriverPortal() {
  try {
    console.log('=== Testing Driver Portal ===');
    
    // Step 1: Test driver login
    const loginResponse = await fetch('http://localhost:3001/api/driver/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'driver@portal.com',
        password: 'driver123'
      })
    });
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('✅ Driver login successful');
      console.log('Driver info:', loginData.driver);
      console.log('Token:', loginData.token.substring(0, 50) + '...');
      
      const driverId = loginData.driver.id;
      const token = loginData.token;
      
      // Step 2: Test driver deliveries
      const deliveriesResponse = await fetch(`http://localhost:3001/api/driver/${driverId}/deliveries`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (deliveriesResponse.ok) {
        const deliveries = await deliveriesResponse.json();
        console.log('✅ Driver deliveries:', deliveries.length);
        console.log('Sample delivery:', deliveries[0]);
      } else {
        console.log('❌ Failed to fetch deliveries');
      }
      
      // Step 3: Test driver messages
      const messagesResponse = await fetch(`http://localhost:3001/api/driver/${driverId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        console.log('✅ Driver messages:', messages.length);
      } else {
        console.log('❌ Failed to fetch messages');
      }
      
      // Step 4: Test GPS location update
      const gpsResponse = await fetch('http://localhost:3001/api/driver/location', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          driver_id: driverId,
          driver_name: loginData.driver.full_name,
          latitude: 14.5995,
          longitude: 120.9842,
          accuracy: 10,
          speed: 0,
          heading: 0
        })
      });
      
      if (gpsResponse.ok) {
        console.log('✅ GPS location update successful');
      } else {
        console.log('❌ Failed to update GPS location');
      }
      
    } else {
      console.log('❌ Driver login failed');
      const error = await loginResponse.text();
      console.log('Error:', error);
    }
    
    console.log('=== Driver Portal Test Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testDriverPortal();
