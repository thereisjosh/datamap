import { readFileSync } from 'fs';
import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function addDescriptionColumn() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ No database connection string found');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');
  const sql = postgres(connectionString, {
    ssl: 'prefer',
    max: 1
  });

  try {
    // Test connection
    await sql`SELECT 1`;
    console.log('✅ Connected to PostgreSQL database');

    // Add description column
    console.log('🔧 Adding description column to organizations table...');
    await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description text`;
    
    console.log('✅ Description column added successfully!');

    // Verify the column was added
    console.log('🔍 Verifying column exists...');
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' 
      AND column_name = 'description'
    `;
    
    if (columns.length > 0) {
      console.log('✅ Column verified:', columns[0]);
    } else {
      console.log('❌ Column not found');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sql.end();
  }
}

addDescriptionColumn();