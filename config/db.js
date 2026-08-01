'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('⚠️ DB pool error:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection:', reason?.message || reason);
});

module.exports = pool;
