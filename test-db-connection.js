import 'dotenv/config';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set in .env file');
  process.exit(1);
}

console.log('🔍 Testing database connection...\n');

// Extract connection info (without password)
try {
  const url = new URL(connectionString.replace(/^postgresql:/, 'http:'));
  console.log(`Host: ${url.hostname}`);
  console.log(`Port: ${url.port || 5432}`);
  console.log(`Database: ${url.pathname.slice(1) || 'defaultdb'}`);
  console.log(`User: ${url.username || 'unknown'}`);
  console.log(`SSL required: ${connectionString.includes('sslmode=require') ? 'YES' : 'NO'}\n`);
} catch (e) {
  console.log('Connection string format:', connectionString.substring(0, 50) + '...\n');
}

const useSsl = /sslmode=require/i.test(connectionString);
const clientConfig = {
  connectionString,
  ssl: useSsl ? {
    rejectUnauthorized: false, // Required for DigitalOcean self-signed certificates
  } : false,
};
const client = new Client(clientConfig);

try {
  console.log('⏳ Connecting...');
  await client.connect();
  console.log('✅ Connected successfully!\n');
  
  console.log('⏳ Testing query...');
  const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
  console.log('✅ Query successful!\n');
  
  console.log('Database Info:');
  console.log(`  Current time: ${result.rows[0].current_time}`);
  console.log(`  PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}\n`);
  
  await client.end();
  console.log('✅ Connection closed. Database is working correctly!');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Connection failed!\n');
  console.error('Error Code:', err.code || 'UNKNOWN');
  console.error('Error Message:', err.message || String(err));
  
  console.error('\n🔧 Troubleshooting:');
  
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    console.error('  → Connection timeout or refused');
    console.error('  → For DigitalOcean:');
    console.error('     1. Check your IP is in "Trusted Sources" (wait 1-2 min after adding)');
    console.error('     2. Verify hostname and port (should be 25060)');
    console.error('     3. Check if connecting from droplet or your PC');
  } else if (err.code === 'ENOTFOUND') {
    console.error('  → Hostname not found');
    console.error('  → Check DATABASE_URL hostname is correct');
  } else if (err.message?.includes('password') || err.message?.includes('authentication')) {
    console.error('  → Authentication failed');
    console.error('  → Check username and password in DATABASE_URL');
  } else if (err.message?.includes('SSL') || err.message?.includes('TLS') || err.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    console.error('  → SSL/TLS certificate error');
    console.error('  → DigitalOcean uses self-signed certificates');
    console.error('  → The connection should use rejectUnauthorized: false');
    console.error('  → Check that test-db-connection.js has correct SSL config');
  }
  
  await client.end().catch(() => {});
  process.exit(1);
}

