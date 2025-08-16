import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function addOrganizationIdColumns() {
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

    // Add organization_id column to tables table
    console.log('🔧 Adding organization_id column to tables table...');
    await sql`ALTER TABLE tables ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE`;
    
    // Add organization_id column to relationships table  
    console.log('🔧 Adding organization_id column to relationships table...');
    await sql`ALTER TABLE relationships ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE`;
    
    console.log('✅ Organization ID columns added successfully!');

    // Verify the columns were added
    console.log('🔍 Verifying columns exist...');
    
    const tablesColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tables' 
      AND column_name = 'organization_id'
    `;
    
    const relationshipsColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'relationships' 
      AND column_name = 'organization_id'
    `;
    
    if (tablesColumns.length > 0) {
      console.log('✅ Tables organization_id column verified:', tablesColumns[0]);
    } else {
      console.log('❌ Tables organization_id column not found');
    }
    
    if (relationshipsColumns.length > 0) {
      console.log('✅ Relationships organization_id column verified:', relationshipsColumns[0]);
    } else {
      console.log('❌ Relationships organization_id column not found');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sql.end();
  }
}

addOrganizationIdColumns();