import { query } from './server/db.js';

async function checkAdminUser() {
  try {
    console.log('=== Checking Admin User ===');
    
    // Check for admin users
    const adminResult = await query('SELECT * FROM users WHERE role = $1 LIMIT 1', ['admin']);
    console.log('Admin users found:', adminResult.rows.length);
    
    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      console.log('Admin user:', admin.email);
      console.log('Admin ID:', admin.id);
      console.log('Admin name:', admin.name);
      
      // Test login with this admin
      const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: admin.email,
          password: 'admin123' // Try common password
        })
      });
      
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        console.log('✅ Admin login successful');
        console.log('Token:', loginData.token.substring(0, 50) + '...');
        return loginData.token;
      } else {
        console.log('❌ Admin login failed');
        console.log('Try password: admin123 or check your admin credentials');
      }
    } else {
      console.log('❌ No admin users found in database');
      console.log('You may need to create an admin user first');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAdminUser();
