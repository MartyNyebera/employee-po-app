// Simple script to clear demo data
import fetch from 'node-fetch';

async function clearDemoData() {
  try {
    // Login as admin
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'admin@example.com', password: 'admin123'})
    });
    
    const {token} = await loginResponse.json();
    console.log('Logged in successfully');
    
    // Clear all data
    const clearPromises = [
      fetch('http://localhost:3001/api/purchase-orders/admin/clear', {
        method: 'POST',
        headers: {'Authorization': `Bearer ${token}`}
      }),
      fetch('http://localhost:3001/api/transactions/admin/clear', {
        method: 'POST', 
        headers: {'Authorization': `Bearer ${token}`}
      }),
      fetch('http://localhost:3001/api/fleet/admin/clear', {
        method: 'POST',
        headers: {'Authorization': `Bearer ${token}`}
      })
    ];
    
    await Promise.all(clearPromises);
    console.log('✅ All demo data cleared successfully!');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
  }
}

clearDemoData();
