import { query } from './server/db.js';
import jwt from 'jsonwebtoken';

async function checkEmployee() {
  try {
    // Check if employee ID 3 exists
    const employeeResult = await query('SELECT * FROM employee_accounts WHERE id = $1', [3]);
    console.log('Employee with ID 3:', employeeResult.rows);
    
    // Test token verification
    const employeeToken = jwt.sign(
      { id: 3, email: 'test@employee.com', role: 'employee', name: 'Test Employee' },
      process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production',
      { expiresIn: '7d' }
    );
    
    console.log('Token created:', employeeToken.substring(0, 50) + '...');
    
    // Verify token
    const decoded = jwt.verify(employeeToken, process.env.JWT_SECRET || 'fleet-manager-secret-change-in-production');
    console.log('Decoded token:', decoded);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkEmployee();
