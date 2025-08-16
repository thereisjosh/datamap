import { readFileSync } from 'fs';
import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function runMigration() {
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

    // Read migration file
    const migrationSQL = readFileSync('migrations/001_add_projects_schema.sql', 'utf8');
    console.log('📖 Read migration file (length:', migrationSQL.length, 'chars)');

    // Run migration
    console.log('🚀 Running migration...');
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables were created
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('projects', 'project_files')
    `;
    
    console.log('📋 Created tables:', tables.map(t => t.table_name));
    
    // Check if project_id columns were added
    const columns = await sql`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('tables', 'relationships', 'upload_sessions')
      AND column_name = 'project_id'
    `;
    
    console.log('🔗 Added project_id columns:', columns.map(c => `${c.table_name}.${c.column_name}`));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();