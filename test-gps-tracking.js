// Test script to verify GPS tracking
const testGPSTracking = async () => {
  console.log('=== GPS Tracking Test ===');
  
  try {
    // Test 1: Check if driver can send GPS data
    console.log('\n1. Testing driver GPS submission...');
    const gpsResponse = await fetch('http://localhost:3001/api/driver/location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        driver_id: 1,
        driver_name: 'Test Driver',
        latitude: 14.5995,
        longitude: 120.9842,
        accuracy: 10,
        speed: 0,
        heading: 0
      })
    });
    
    if (gpsResponse.ok) {
      console.log('✅ GPS data submitted successfully');
    } else {
      console.log('❌ GPS data submission failed:', gpsResponse.statusText);
    }
    
    // Test 2: Check if admin can fetch GPS data
    console.log('\n2. Testing admin GPS fetch...');
    const fetchResponse = await fetch('http://localhost:3001/api/driver/locations/live');
    
    if (fetchResponse.ok) {
      const locations = await fetchResponse.json();
      console.log('✅ GPS data fetched successfully:', locations);
    } else {
      console.log('❌ GPS data fetch failed:', fetchResponse.statusText);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Run the test
testGPSTracking();
