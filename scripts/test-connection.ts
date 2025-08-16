#!/usr/bin/env node

import dotenv from "dotenv";
import postgres from "postgres";

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testConnection() {
  // Try different connection strings
  const connections = [
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    // Try direct database connection
    `postgres://postgres.wwjrfdhqnirvoraodtvi:${process.env.POSTGRES_PASSWORD}@db.wwjrfdhqnirvoraodtvi.supabase.co:5432/postgres`
  ];

  for (let i = 0; i < connections.length; i++) {
    const connectionString = connections[i];
    if (!connectionString) continue;

    console.log(`\n🔍 Testing connection ${i + 1}:`, connectionString.replace(/:([^:@]{8})[^:@]*@/, ':$1****@'));

    try {
      const sql = postgres(connectionString, {
        ssl: 'prefer',
        max: 1,
        connect_timeout: 10,
      });

      // Test the connection
      const result = await sql`SELECT version(), current_database(), current_user`;
      
      console.log('✅ Connection successful!');
      console.log('Database version:', result[0].version);
      console.log('Database name:', result[0].current_database);
      console.log('Connected as:', result[0].current_user);
      
      await sql.end();
      return; // Success, stop trying other connections
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
    }
  }

  console.error('\n💥 All connection attempts failed');
}

testConnection();