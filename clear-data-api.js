// Run this in browser console on your dashboard to clear ALL data
// Open: http://localhost:3000 -> Press F12 -> Paste this code -> Press Enter

async function clearAllData() {
  if (!confirm('⚠️ This will delete ALL data including overview, fleet, PMS, assets, POs, transactions, and vehicles. Users will be preserved. Continue?')) {
    return;
  }
  
  console.log('🧹 Clearing ALL data from database...');
  
  try {
    // Clear in correct order (respecting foreign keys)
    console.log('Step 1: Clearing transactions...');
    await fetch('http://192.168.254.107:3001/api/transactions', { method: 'DELETE' });
    console.log('✅ Transactions cleared');
    
    console.log('Step 2: Clearing maintenance records...');
    await fetch('http://192.168.254.107:3001/api/maintenance', { method: 'DELETE' });
    console.log('✅ Maintenance records cleared');
    
    console.log('Step 3: Clearing odometer logs...');
    await fetch('http://192.168.254.107:3001/api/odometer-logs', { method: 'DELETE' });
    console.log('✅ Odometer logs cleared');
    
    console.log('Step 4: Clearing purchase orders...');
    await fetch('http://192.168.254.107:3001/api/purchase-orders', { method: 'DELETE' });
    console.log('✅ Purchase orders cleared');
    
    console.log('Step 5: Clearing vehicles...');
    await fetch('http://192.168.254.107:3001/api/vehicles', { method: 'DELETE' });
    console.log('✅ Vehicles cleared');
    
    console.log('Step 6: Clearing assets...');
    await fetch('http://192.168.254.107:3001/api/assets', { method: 'DELETE' });
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
