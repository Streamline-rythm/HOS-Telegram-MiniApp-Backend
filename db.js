import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

dotenv.config();

const client = new SecretManagerServiceClient();

async function getSecretValue(secretName) {
  try {
    const [accessResponse] = await client.accessSecretVersion({
      name: secretName,
    });

    const secretPayload = accessResponse.payload.data.toString('utf8');
    return secretPayload;
  } catch (error) {
    console.error(`Failed to access secret ${secretName}:`, error);
    throw error;
  }
}

const client_cert = getSecretValue(process.env.CLIENT_CERT_PATH);
const server_ca = getSecretValue(process.env.SERVER_CA_PATH);
const client_key = getSecretValue(process.env.CLIENT_KEY_PATH);

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
  }
});
export default pool; 