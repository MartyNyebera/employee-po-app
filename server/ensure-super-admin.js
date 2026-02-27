import dotenv from 'dotenv';
import { query } from './db.js';
import { hashPassword } from './auth.js';

dotenv.config();

async function ensureSuperAdmin() {
  console.log('=== ENSURING SUPER ADMIN EXISTS ===');
  console.log('🔍 ENV DEBUG:');
  console.log('- SUPER_ADMIN_OWNER_EMAIL:', !!process.env.SUPER_ADMIN_OWNER_EMAIL);
  console.log('- SUPER_ADMIN_OWNER_PASSWORD:', !!process.env.SUPER_ADMIN_OWNER_PASSWORD);
  console.log('- SUPER_ADMIN_OWNER_NAME:', !!process.env.SUPER_ADMIN_OWNER_NAME);
  
  const adminEmail = process.env.SUPER_ADMIN_OWNER_EMAIL;
  const adminPassword = process.env.SUPER_ADMIN_OWNER_PASSWORD;
  const adminName = process.env.SUPER_ADMIN_OWNER_NAME || 'Super Admin';
  
  if (!adminEmail) {
    console.log('ℹ️ No SUPER_ADMIN_OWNER_EMAIL configured - skipping auto-creation');
    return;
  }
  
  if (!adminPassword) {
    console.log('❌ SUPER_ADMIN_OWNER_PASSWORD missing - cannot create admin');
    return;
  }
  
  try {
    // Check if admin exists
    const result = await query(
      'SELECT id, email, is_super_admin FROM users WHERE LOWER(email) = LOWER($1)',
      [adminEmail]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (!user.is_super_admin) {
        // Update to super admin
        await query(
          'UPDATE users SET is_super_admin = true, updated_at = NOW() WHERE id = $1',
          [user.id]
        );
        console.log(`✅ Updated existing user to super admin: ${adminEmail}`);
      } else {
        console.log(`✅ Super admin already exists: ${adminEmail}`);
      }
      return;
    }
    
    // Create new super admin
    console.log(`🔧 Creating super admin: ${adminEmail}`);
    const hashedPassword = await hashPassword(adminPassword);
    const adminId = `super-admin-${Date.now()}`;
    
    await query(`
      INSERT INTO users (id, email, name, password_hash, role, is_super_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'admin', true, NOW(), NOW())
    `, [adminId, adminEmail.toLowerCase(), adminName, hashedPassword]);
    
    console.log(`✅ Super admin created successfully: ${adminEmail}`);
    
  } catch (error) {
    console.error('❌ Failed to ensure super admin:', error.message);
  }
}

export { ensureSuperAdmin };
