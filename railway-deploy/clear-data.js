import { query } from './db.js';

async function clearAllData() {
    
  try {
    // Clear all tables in order (respecting foreign keys)
    await query('DELETE FROM transactions');
        
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('clear-data.js')) {
  clearAllData()
    .then(() => {
            process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to clear database:', err);
      process.exit(1);
    });
}

export { clearAllData };
