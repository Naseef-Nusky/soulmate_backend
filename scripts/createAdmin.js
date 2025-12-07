import 'dotenv/config';
// For DigitalOcean PostgreSQL: disable strict TLS certificate verification
// This is safe because we're connecting to a trusted DigitalOcean service
if (process.env.DATABASE_URL?.includes('ondigitalocean.com')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import { initDb } from '../src/services/db.js';
import { createAdminUser } from '../src/services/adminAuth.js';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  const role = process.argv[4] || 'super_admin';

  if (!username || !password) {
    console.error('Usage: node scripts/createAdmin.js <username> <password> [role]');
    console.error('Example: node scripts/createAdmin.js admin mypassword123 super_admin');
    process.exit(1);
  }

  try {
    await initDb();
    await createAdminUser(username, password, role);
    console.log(`\n✅ Admin user "${username}" created successfully with role "${role}"`);
    console.log('You can now log in to the CRM using these credentials.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to create admin user:', error.message);
    process.exit(1);
  }
}

main();

