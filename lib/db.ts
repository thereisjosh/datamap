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
    
    // Test the connection with retry logic
    let connectionAttempts = 0;
    const maxRetries = 3;
    
    while (connectionAttempts < maxRetries) {
      try {
        connectionAttempts++;
        console.log(`🔄 Database connection attempt ${connectionAttempts}/${maxRetries}...`);
        
        await sql`SELECT 1`;
        console.log('✅ Connected to PostgreSQL database');
        break; // Success, exit retry loop
        
      } catch (error) {
        console.error(`❌ Database connection attempt ${connectionAttempts} failed:`, {
          error: error instanceof Error ? error.message : error,
          code: (error as any)?.code,
          errno: (error as any)?.errno,
          address: (error as any)?.address,
          port: (error as any)?.port,
          connectionString: connectionString.replace(/:([^:@]{8})[^:@]*@/, ':$1****@')
        });
        
        if (connectionAttempts >= maxRetries) {
          console.error('❌ Max database connection retries exceeded');
          console.error('The server will start but database features will be unavailable');
          // Don't throw error - let the server start without database
          sql = null;
          dbInstance = null;
          return null;
        } else {
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, connectionAttempts) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
  }
  
  return dbInstance;
}

// Export the lazy connection function
// Set RLS context for multi-tenant security
async function setRLSContext(userId?: string, organizationId?: string) {
  if (!sql) return;
  
  try {
    if (userId) {
      await sql`SELECT set_config('app.current_user_id', ${userId}, true)`;
    }
    if (organizationId) {
      await sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    }
  } catch (error) {
    console.warn('Warning: Could not set RLS context:', error);
  }
}

// Clear RLS context
async function clearRLSContext() {
  if (!sql) return;
  
  try {
    await sql`SELECT set_config('app.current_user_id', NULL, true)`;
    await sql`SELECT set_config('app.current_organization_id', NULL, true)`;
  } catch (error) {
    console.warn('Warning: Could not clear RLS context:', error);
  }
}

// Get database instance with RLS context
async function getDbWithContext(userId?: string, organizationId?: string) {
  const db = await getDb();
  if (db && (userId || organizationId)) {
    await setRLSContext(userId, organizationId);
  }
  return db;
}

export { getDb, setRLSContext, clearRLSContext, getDbWithContext };