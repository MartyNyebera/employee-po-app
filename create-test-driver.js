import { query } from './server/db.js';
import { hashPassword } from './server/auth.js';

async function createTestDriver() {
  try {
    // Create a test driver with known password
    const hashedPassword = await hashPassword('driver123');
    
    const result = await query(
      `INSERT INTO driver_accounts 
       (full_name, email, password_hash, phone, license_number, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash, status = EXCLUDED.status`,
      ['Test Driver Portal', 'driver@portal.com', hashedPassword, '1234567890', 'DL789012', 'approved']
    );
    
    console.log('✅ Test driver created/updated');
    console.log('Email: driver@portal.com');
    console.log('Password: driver123');
    
    // Get the driver ID
    const driverResult = await query('SELECT id FROM driver_accounts WHERE email = $1', ['driver@portal.com']);
    console.log('Driver ID:', driverResult.rows[0].id);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createTestDriver();
