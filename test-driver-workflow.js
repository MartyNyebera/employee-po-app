import jwt from 'jsonwebtoken';
import { query } from './server/db.js';

async function testCompleteDriverWorkflow() {
  try {
    console.log('=== Testing Complete Driver Workflow ===');
    
    // Step 1: Driver login
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
      console.log('✅ Driver logged in:', loginData.driver.full_name);
      
      // Step 2: Fetch deliveries
      const deliveriesResponse = await fetch(`http://localhost:3001/api/driver/${driverId}/deliveries`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (deliveriesResponse.ok) {
        const deliveries = await deliveriesResponse.json();
        console.log('✅ Found deliveries:', deliveries.length);
        
        if (deliveries.length > 0) {
          const delivery = deliveries[0];
          console.log('Testing with delivery:', delivery.delivery_number);
          
          // Step 3: Update delivery status to "pickup"
          const pickupResponse = await fetch(`http://localhost:3001/api/deliveries/${delivery.id}/status`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              status: 'pickup',
              notes: 'Picked up items from warehouse'
            })
          });
          
          if (pickupResponse.ok) {
            console.log('✅ Delivery status updated to: pickup');
            
            // Step 4: Update to "on_the_way"
            const onWayResponse = await fetch(`http://localhost:3001/api/deliveries/${delivery.id}/status`, {
              method: 'PUT',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                status: 'on_the_way',
                notes: 'On the way to customer'
              })
            });
            
            if (onWayResponse.ok) {
              console.log('✅ Delivery status updated to: on_the_way');
              
              // Step 5: Test GPS tracking
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
                  speed: 25,
                  heading: 90
                })
              });
              
              if (gpsResponse.ok) {
                console.log('✅ GPS location updated');
              }
              
              // Step 6: Test admin can see driver location
              const adminLocationsResponse = await fetch('http://localhost:3001/api/driver/locations/live', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (adminLocationsResponse.ok) {
                const locations = await adminLocationsResponse.json();
                console.log('✅ Admin can see live locations:', locations.length);
              }
              
            } else {
              console.log('❌ Failed to update to on_the_way');
            }
          } else {
            console.log('❌ Failed to update to pickup');
          }
        }
      }
      
      // Step 7: Test chat functionality
      const messagesResponse = await fetch(`http://localhost:3001/api/driver/${driverId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        console.log('✅ Driver messages:', messages.length);
        
        // Send a test message
        const sendMessageResponse = await fetch(`http://localhost:3001/api/driver/messages`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            driver_id: driverId,
            driver_name: loginData.driver.full_name,
            sender_type: 'driver',
            message: 'Test message from driver portal'
          })
        });
        
        if (sendMessageResponse.ok) {
          console.log('✅ Message sent successfully');
        }
      }
      
    } else {
      console.log('❌ Driver login failed');
    }
    
    console.log('=== Driver Workflow Test Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testCompleteDriverWorkflow();
