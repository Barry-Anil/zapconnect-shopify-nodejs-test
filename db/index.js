import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Use environment variables with fallbacks - EXPLICITLY DISABLE SSL
const DATABASE_URL_PROD = process.env.DATABASE_URL || "postgresql://dev_mustafa:Mstf3Dev!@31.97.207.243:5432/zapconnect?sslmode=disable";
const NODE_ENV = process.env.NODE_ENV || "production";

console.log("🔧 Database Configuration:");
console.log("Environment:", NODE_ENV);
console.log("Database URL:", DATABASE_URL_PROD.replace(/:[^:@]*@/, ':****@')); // Hide password in logs

// Simple pool configuration with SSL explicitly disabled
const pool = new Pool({
  connectionString: DATABASE_URL_PROD,
  ssl: false, // CRITICAL: Disable SSL entirely
  max: 10,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  acquireTimeoutMillis: 60000,
});

// Connection event handlers
pool.on("connect", (client) => {
  console.log("✅ New client connected to Postgres DB (No SSL)");
});

pool.on("error", (err, client) => {
  console.error("❌ Unexpected error on idle Postgres client:", err.message);
});

// Test the connection
async function testConnection() {
  try {
    console.log("🧪 Testing database connection (No SSL)...");
    
    const client = await pool.connect();
    console.log("✅ Connected! Testing query...");
    
    const result = await client.query('SELECT NOW() as current_time, version() as db_version, current_user, current_database()');
    console.log("✅ Database connection successful!");
    console.log("📅 Server time:", result.rows[0].current_time);
    console.log("🗄️  Database version:", result.rows[0].db_version.split(' ')[0]);
    console.log("👤 Connected as:", result.rows[0].current_user);
    console.log("🏦 Database:", result.rows[0].current_database);
    
    client.release();
    return true;
  } catch (err) {
    console.error("❌ Database connection test failed:", err.message);
    return false;
  }
}

// Helper function to execute queries with error handling
export const executeQuery = async (text, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

// Test connection immediately
testConnection().then(success => {
  if (success) {
    console.log("🎉 Database is ready for use!");
  } else {
    console.error("🚨 Database connection failed. Check the logs above.");
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, closing database pool...');
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error closing database pool:', err);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing database pool...');
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error closing database pool:', err);
    process.exit(1);
  }
});

export default pool;