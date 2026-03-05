const { Pool } = require('pg');
const fs = require('fs');

async function run() {
  const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5436/postgres' });
  const schema = fs.readFileSync('./server/db/schema.sql', 'utf8');
  try {
    await pool.query(schema);
    console.log('Success');
  } catch (err) {
    console.error('Error:', err);
  }
  await pool.end();
}
run();
