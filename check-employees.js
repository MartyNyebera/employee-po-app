import { query } from './server/db.js';

async function checkEmployees() {
  try {
    const result = await query('SELECT id, full_name, email, status FROM employee_accounts WHERE status = $1 LIMIT 1', ['approved']);
    console.log('Approved employees:', result.rows);
    
    if (result.rows.length === 0) {
      console.log('No approved employees found. Checking all employees...');
      const allResult = await query('SELECT id, full_name, email, status FROM employee_accounts LIMIT 5');
      console.log('All employees:', allResult.rows);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkEmployees();
