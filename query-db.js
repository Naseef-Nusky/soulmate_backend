import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set in .env file');
  process.exit(1);
}

const useSsl = /sslmode=require/i.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

try {
  console.log('🔍 Querying database...\n');
  
  // List all tables
  console.log('📋 Available tables:');
  const tablesResult = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  tablesResult.rows.forEach(row => {
    console.log(`  - ${row.table_name}`);
  });
  console.log('');
  
  // Query each table with LIMIT 10
  for (const row of tablesResult.rows) {
    const tableName = row.table_name;
    console.log(`📊 Querying ${tableName} (LIMIT 10):`);
    try {
      const result = await pool.query(`SELECT * FROM ${tableName} LIMIT 10;`);
      console.log(`  Rows: ${result.rows.length}`);
      if (result.rows.length > 0) {
        console.log('  Columns:', Object.keys(result.rows[0]).join(', '));
        console.log('  Sample data:', JSON.stringify(result.rows[0], null, 2));
      }
      console.log('');
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }
  
  await pool.end();
  console.log('✅ Query complete!');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Query failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
}



