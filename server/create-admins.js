import dotenv from 'dotenv';
import { query } from './db.js';
import { hashPassword } from './auth.js';

dotenv.config();

async function createAdmins() {
  console.log('Creating super admin accounts...');

  try {
    // Create super admin owner
    const ownerEmail = (process.env.SUPER_ADMIN_OWNER_EMAIL || 'owner@kimoel.local').toLowerCase();
    const ownerName = process.env.SUPER_ADMIN_OWNER_NAME || 'Owner';
    const ownerPassword = process.env.SUPER_ADMIN_OWNER_PASSWORD || 'ChangeMe123!';

    console.log(`Creating admin: ${ownerEmail}`);
    
    // Check if admin already exists
    const existingOwner = await query('SELECT * FROM users WHERE email = $1', [ownerEmail]);
    
    if (existingOwner.rows.length === 0) {
      const hashedPassword = await hashPassword(ownerPassword);
      await query(`
        INSERT INTO users (id, email, name, password, is_super_admin, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, ['super-admin-owner', ownerEmail, ownerName, hashedPassword]);
      
      console.log('✅ Super admin owner created successfully');
    } else {
      console.log('ℹ️ Super admin owner already exists');
    }

    // Create second admin
    const adminEmail = 'admin@kimoel.local';
    const adminName = 'Admin';
    const adminPassword = 'ChangeMe123!';

    console.log(`Creating admin: ${adminEmail}`);
    
    const existingAdmin = await query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    
    if (existingAdmin.rows.length === 0) {
      const hashedPassword = await hashPassword(adminPassword);
      await query(`
        INSERT INTO users (id, email, name, password, is_super_admin, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, ['admin-local', adminEmail, adminName, hashedPassword]);
      
      console.log('✅ Super admin created successfully');
    } else {
      console.log('ℹ️ Super admin already exists');
    }

    console.log('\n🎉 Admin account setup complete!');
    console.log('\n📋 Login Credentials:');
    console.log('1. Email:', ownerEmail, '| Password:', ownerPassword);
    console.log('2. Email:', adminEmail, '| Password:', adminPassword);
    
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
