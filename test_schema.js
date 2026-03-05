const { pool } = require('./server/db/pool');
const fs = require('fs');

async function run() {
  const schema = fs.readFileSync('./server/db/schema.sql', 'utf8');
  const queries = schema.split(';').map(q => q.trim()).filter(q => q.length > 0);
  for (let i = 0; i < queries.length; i++) {
    try {
      await pool.query(queries[i]);
      console.log(`Query ${i} succeeded.`);
    } catch (err) {
      console.error(`Query ${i} failed:\n${queries[i]}\nERROR:`, err.message);
      break;
    }
  }
  await pool.end();
}
run();