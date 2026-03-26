import jwt from 'jsonwebtoken';

async function testDriverDeliveryStatus() {
  try {
    console.log('=== Testing Driver Delivery Status Update ===');
    
    // Login as driver
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
      const token = loginData.token;
      console.log('✅ Driver logged in');
      
      // Get deliveries
      const deliveriesResponse = await fetch('http://localhost:3001/api/driver/4/deliveries', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (deliveriesResponse.ok) {
        const deliveries = await deliveriesResponse.json();
        console.log('✅ Found deliveries:', deliveries.length);
        
        if (deliveries.length > 0) {
          const delivery = deliveries[0];
          console.log('Testing delivery status update for:', delivery.delivery_number);
          
          // Update status
          const statusResponse = await fetch(`http://localhost:3001/api/deliveries/${delivery.id}/status`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              status: 'Picked Up',
              notes: 'Picked up from warehouse'
            })
          });
          
          console.log('Status response:', statusResponse.status);
          const result = await statusResponse.text();
          console.log('Response body:', result);
          
          if (statusResponse.ok) {
            console.log('✅ Status updated successfully');
          } else {
            console.log('❌ Status update failed');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testDriverDeliveryStatus();
