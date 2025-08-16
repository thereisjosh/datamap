import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema.ts';

// Lazy database connection
let sql: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

async function getDb() {
  if (!dbInstance) {
    // Debug environment variables
    console.log('Database connection debug:', {
      POSTGRES_URL: process.env.POSTGRES_URL ? 'Present' : 'Missing',
      DATABASE_URL: process.env.DATABASE_URL ? 'Present' : 'Missing',
      NODE_ENV: process.env.NODE_ENV
    });

    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('No database connection string found. Please set POSTGRES_URL or DATABASE_URL environment variable.');
    }

    console.log('Attempting connection to:', connectionString.replace(/:([^:@]{8})[^:@]*@/, ':$1****@'));

    // Create postgres.js client with SSL handling
    sql = postgres(connectionString, {
      ssl: process.env.NODE_ENV === 'production' ? 'require' : 'prefer',
      max: 10,
    });

    dbInstance = drizzle(sql, { schema });
    
    // Test the connection
    try {
      await sql`SELECT 1`;
      console.log('✅ Connected to PostgreSQL database');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      console.error('The server will start but database features will be unavailable');
      // Don't throw error - let the server start without database
      sql = null;
      dbInstance = null;
      return null;
    }
  }
  
  return dbInstance;
}

// Export the lazy connection function
export { getDb };