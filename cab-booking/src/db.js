// MySQL connection pool. mysql2 is the only dependency: Node has no built-in MySQL client.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'cab',
  password: process.env.DB_PASSWORD || 'cabpass',
  database: process.env.DB_NAME || 'cab_booking',
  connectionLimit: 10,
  dateStrings: true, // DATETIME/TIMESTAMP come back as 'YYYY-MM-DD HH:MM:SS' strings
  decimalNumbers: true, // DECIMAL comes back as a JS number
});

// q(sql, params) -> rows (SELECT) or result header (INSERT/UPDATE); `conn` lets it run inside tx()
async function q(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function one(sql, params = [], conn = pool) {
  return (await q(sql, params, conn))[0] || null;
}

async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, q, one, tx };
