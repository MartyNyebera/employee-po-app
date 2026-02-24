import dotenv from 'dotenv';
import { query } from './db.js';
import { hashPassword } from './auth.js';

dotenv.config();

async function createAdmins() {
  console.log('Creating super admin accounts...');

  try {
    // Get admin emails from environment
    const adminEmails = [];
    
    if (process.env.SUPER_ADMIN_EMAIL) {
      adminEmails.push(process.env.SUPER_ADMIN_EMAIL.toLowerCase());
    }
    
    if (process.env.SUPER_ADMIN_EMAILS) {
      const emails = process.env.SUPER_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase());
      adminEmails.push(...emails);
    }
    
    // Fallback to default for development
    if (adminEmails.length === 0 && process.env.NODE_ENV !== 'production') {
      adminEmails.push('owner@kimoel.local', 'admin@kimoel.local');
    }
    
    console.log(`📧 Processing ${adminEmails.length} admin email(s) from environment`);
    
    for (let i = 0; i < adminEmails.length; i++) {
      const email = adminEmails[i];
      const adminId = `super-admin-${i}`;
      const name = `Super Admin ${i + 1}`;
      const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!';
      
      console.log(`Processing admin: ${email}`);
      
      // Check if admin already exists
      const existingAdmin = await query('SELECT * FROM users WHERE email = $1', [email]);
      
      if (existingAdmin.rows.length === 0) {
        const hashedPassword = await hashPassword(password);
        await query(`
          INSERT INTO users (id, email, name, password, is_super_admin, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [adminId, email, name, hashedPassword]);
        
        console.log(`✅ Created admin: ${email}`);
      } else {
        // Ensure existing admin has super admin privileges
        await query(`
          UPDATE users SET is_super_admin = true, updated_at = NOW()
          WHERE email = $1
        `, [email]);
        console.log(`✅ Updated admin privileges: ${email}`);
      }
    }

    console.log('\n🎉 Admin account setup complete!');
    console.log(`\n📋 ${adminEmails.length} admin account(s) configured`);
    
  } catch (error) {
    console.error('❌ Error creating admin accounts:', error);
    process.exit(1);
  }
}

createAdmins().then(() => {
  console.log('\n✅ Admin creation completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Admin creation failed:', error);
  process.exit(1);
});
