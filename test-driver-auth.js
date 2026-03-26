import jwt from 'jsonwebtoken';

async function testDriverAuth() {
  try {
    console.log('=== Testing Driver Portal Authentication ===');
    
    // Test driver login
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
      const driverId = loginData.driver.id;
      const token = loginData.token;
      console.log('✅ Driver login successful');
      console.log('Driver:', loginData.driver.full_name);
      
      // Test driver deliveries with auth
      const deliveriesResponse = await fetch(`http://localhost:3001/api/driver/${driverId}/deliveries`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (deliveriesResponse.ok) {
        const deliveries = await deliveriesResponse.json();
        console.log('✅ Driver deliveries:', deliveries.length);
      } else {
        console.log('❌ Driver deliveries failed:', deliveriesResponse.status);
      }
      
      // Test driver messages with auth
      const messagesResponse = await fetch(`http://localhost:3001/api/driver/${driverId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        console.log('✅ Driver messages:', messages.length);
      } else {
        console.log('❌ Driver messages failed:', messagesResponse.status);
      }
      
      // Test GPS location with auth
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
        console.log('❌ GPS location failed:', gpsResponse.status);
      }
      
    } else {
      console.log('❌ Driver login failed');
    }
    
    console.log('=== Driver Authentication Test Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testDriverAuth();
