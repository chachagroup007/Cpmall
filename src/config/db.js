const mysql = require("mysql2/promise");

const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);

let pool = null;

function getPool() {
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(", ")}`);
  }

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "Z",
      decimalNumbers: true
    });
  }

  return pool;
}

async function checkDatabase() {
  const connectionPool = getPool();
  const [rows] = await connectionPool.query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

module.exports = { getPool, checkDatabase };
