import dotenv from 'dotenv';

dotenv.config();

function validateEnvironment() {
  console.log('=== ENVIRONMENT VALIDATION ===');
  
  const requiredVars = [
    'DATABASE_URL',
    'NODE_ENV'
  ];
  
  const emailVars = [
    'SMTP_HOST',
    'SMTP_PORT', 
    'SMTP_USER',
    'SMTP_PASS'
  ];
  
  const adminVars = [
    'SUPER_ADMIN_EMAIL',
    'SUPER_ADMIN_EMAILS'
  ];
  
  let allValid = true;
  
  // Check required vars
  console.log('\n🔍 Required Environment Variables:');
  requiredVars.forEach(varName => {
    const present = !!process.env[varName];
    console.log(`${varName}: ${present ? '✅' : '❌'}`);
    if (!present) allValid = false;
  });
  
  // Check email configuration
  console.log('\n📧 Email Configuration:');
  emailVars.forEach(varName => {
    const present = !!process.env[varName];
    console.log(`${varName}: ${present ? '✅' : '❌'}`);
  });
  
  // Check admin configuration
  console.log('\n👑 Super Admin Configuration:');
  const hasAdminEmail = !!(process.env.SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAILS);
  console.log(`Admin emails: ${hasAdminEmail ? '✅' : '❌'}`);
  
  if (!allValid) {
    console.error('\n❌ Missing required environment variables');
    return false;
  }
  
  console.log('\n✅ Environment validation complete');
  return true;
}

export { validateEnvironment };
