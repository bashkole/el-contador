require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  database: process.env.DB_NAME || 'el_contador_finance',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

module.exports = { pool };
