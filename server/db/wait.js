require('dotenv').config();
const { pool } = require('./pool');

const maxAttempts = 60;
const delayMs = 1000;

async function wait() {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database is ready.');
      await pool.end();
      process.exit(0);
    } catch (err) {
      if (i === 0) console.log('Waiting for database...');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('Database did not become ready in time.');
  process.exit(1);
}

wait();
