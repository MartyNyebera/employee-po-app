import dotenv from 'dotenv';
import { query } from './db.js';
import { hashPassword } from './auth.js';

dotenv.config();

async function createAdmins() {
  console.log('Creating super admin accounts...');

  try {
    // Get admin emails from environment
    const adminEmails = [];
    
    if (process.env.SUPER_ADMIN_OWNER_EMAIL) {
      adminEmails.push(process.env.SUPER_ADMIN_OWNER_EMAIL.toLowerCase());
    }
    
    if (process.env.SUPER_ADMIN_DEVELOPER_EMAIL) {
      adminEmails.push(process.env.SUPER_ADMIN_DEVELOPER_EMAIL.toLowerCase());
    }
    
    if (process.env.SUPER_ADMIN_EMAILS) {
      const emails = process.env.SUPER_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase());
      adminEmails.push(...emails);
    }
    
    // Fallback to default emails
    if (adminEmails.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        adminEmails.push('owner@kimoel.local', 'admin@kimoel.local');
      } else {
        // Production fallback - add your specific email
        adminEmails.push('kimoel_leotagle@yahoo.com');
        console.log('⚠️ No SUPER_ADMIN_EMAIL set, using production fallback');
      }
    }
    
    console.log(`📧 Processing ${adminEmails.length} admin email(s) from environment`);
    console.log('Admin emails to process:', adminEmails);
    console.log('Environment check - SUPER_ADMIN_EMAIL:', !!process.env.SUPER_ADMIN_EMAIL);
    console.log('Environment check - SUPER_ADMIN_EMAILS:', !!process.env.SUPER_ADMIN_EMAILS);
    
    for (let i = 0; i < adminEmails.length; i++) {
      const email = adminEmails[i];
      const adminId = `super-admin-${i}`;
      let name = `Super Admin ${i + 1}`;
      let password = 'ChangeMe123!';
      
      // Use specific passwords for each admin type
      if (email === process.env.SUPER_ADMIN_OWNER_EMAIL?.toLowerCase()) {
        name = process.env.SUPER_ADMIN_OWNER_NAME || 'Owner';
        password = process.env.SUPER_ADMIN_OWNER_PASSWORD || 'ChangeMe123!';
      } else if (email === process.env.SUPER_ADMIN_DEVELOPER_EMAIL?.toLowerCase()) {
        name = process.env.SUPER_ADMIN_DEVELOPER_NAME || 'Developer';
        password = process.env.SUPER_ADMIN_DEVELOPER_PASSWORD || 'ChangeMe123!';
      }
      
      console.log(`Processing admin: ${email} with name: ${name}`);
      
      // Check if admin already exists
      const existingAdmin = await query('SELECT * FROM users WHERE email = $1', [email]);
      
      if (existingAdmin.rows.length === 0) {
        const hashedPassword = await hashPassword(password);
        await query(`
          INSERT INTO users (id, email, name, password_hash, role, is_super_admin, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'admin', true, NOW(), NOW())
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
