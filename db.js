import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const client_cert = process.env.CLIENT_CERT?.replace(/\\n/g, '\n');
const server_ca = process.env.SERVER_CA?.replace(/\\n/g, '\n');
const client_key = process.env.CLIENT_KEY?.replace(/\\n/g, '\n');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    ca: server_ca,
    cert: client_cert,
    key: client_key,
  },
});

// Test the connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Successfully connected to the database');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error.message);
  }
})();

export default pool;
