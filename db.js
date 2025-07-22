
import { fileURLToPath } from 'url';
import path from "path";
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import fs from 'fs';
dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, 'client_certification', 'server-ca.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'client_certification', 'client-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'client_certification', 'client-key.pem')),
  }
});
export default pool; 