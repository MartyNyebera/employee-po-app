// Run this in browser console on your dashboard to clear ALL data
// Open: http://localhost:3000 -> Press F12 -> Paste this code -> Press Enter

async function clearAllData() {
  if (!confirm('⚠️ This will delete ALL data including overview, fleet, PMS, assets, POs, transactions, and vehicles. Users will be preserved. Continue?')) {
    return;
  }
  
  console.log('🧹 Clearing ALL data from database...');
  
  // Get auth token from localStorage
  const auth = JSON.parse(localStorage.getItem('auth') || '{}');
  const headers = {
    'Content-Type': 'application/json',
    ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
  };
  
  try {
    // Clear in correct order (respecting foreign keys)
    console.log('Step 1: Clearing transactions...');
    await fetch('/api/transactions', { 
      method: 'DELETE',
      headers: headers
    });
    console.log('✅ Transactions cleared');
    
    console.log('Step 2: Clearing maintenance records...');
    await fetch('/api/maintenance', { 
      method: 'DELETE',
      headers: headers
    });
    console.log('✅ Maintenance records cleared');
    
    console.log('Step 3: Clearing odometer logs...');
    await fetch('/api/odometer-logs', { 
      method: 'DELETE',
      headers: headers
    });
    console.log('✅ Odometer logs cleared');
    
    console.log('Step 4: Clearing purchase orders...');
    await fetch('/api/purchase-orders', { 
      method: 'DELETE',
      headers: headers
    });
    console.log('✅ Purchase orders cleared');
    
    console.log('Step 5: Clearing vehicles...');
    await fetch('/api/vehicles', { 
      method: 'DELETE',
      headers: headers
    });
    console.log('✅ Vehicles cleared');
    
    console.log('Step 6: Clearing assets...');
    await fetch('/api/assets', { 
      method: 'DELETE',
      headers: headers
    });
    console.log('✅ Assets cleared');
    
    console.log('🎉 ALL DATA CLEARED! Refresh the page to see completely empty dashboard.');
    alert('✅ All data cleared successfully! Refresh the page to see completely empty dashboard with 0 stats.');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    alert('❌ Error: ' + error.message);
  }
}

// Auto-run
clearAllData();
