// Run this in browser console on your dashboard to clear all data
// Open: http://localhost:3000 -> Press F12 -> Paste this code -> Press Enter

async function clearAllData() {
  if (!confirm('⚠️ This will delete ALL assets, POs, transactions, and vehicles. Users will be preserved. Continue?')) {
    return;
  }
  
  console.log('🧹 Clearing all data...');
  
  try {
    // Clear transactions
    await fetch('/api/transactions', { method: 'DELETE' });
    console.log('✅ Transactions cleared');
    
    // Clear maintenance records  
    await fetch('/api/maintenance', { method: 'DELETE' });
    console.log('✅ Maintenance records cleared');
    
    // Clear purchase orders
    await fetch('/api/purchase-orders', { method: 'DELETE' });
    console.log('✅ Purchase orders cleared');
    
    // Clear vehicles
    await fetch('/api/vehicles', { method: 'DELETE' });
    console.log('✅ Vehicles cleared');
    
    // Clear assets
    await fetch('/api/assets', { method: 'DELETE' });
    console.log('✅ Assets cleared');
    
    console.log('🎉 All data cleared! Refresh the page to see empty dashboard.');
    alert('✅ All data cleared successfully! Refresh the page to see changes.');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    alert('❌ Error: ' + error.message);
  }
}

// Auto-run
clearAllData();
