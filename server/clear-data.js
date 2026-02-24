import { query } from './db.js';

async function clearAllData() {
  console.log('Clearing all existing data...');
  
  try {
    // Clear all tables in order (respecting foreign keys)
    await query('DELETE FROM transactions');
    console.log('  - Transactions cleared');
    
    await query('DELETE FROM maintenance_records');
    console.log('  - Maintenance records cleared');
    
    await query('DELETE FROM purchase_orders');
    console.log('  - Purchase orders cleared');
    
    await query('DELETE FROM odometer_logs');
    console.log('  - Odometer logs cleared');
    
    await query('DELETE FROM vehicles');
    console.log('  - Vehicles cleared');
    
    await query('DELETE FROM assets');
    console.log('  - Assets cleared');
    
    // Keep users (admin accounts) - only clear data, not users
    console.log('✅ All data cleared! Users preserved.');
    
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('clear-data.js')) {
  clearAllData()
    .then(() => {
      console.log('Database cleared successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to clear database:', err);
      process.exit(1);
    });
}

export { clearAllData };
