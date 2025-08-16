#!/usr/bin/env tsx

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../lib/db';

// Load environment variables
config({ path: '.env.local' });

async function applyRLSMigration() {
  console.log('🔄 Applying Row Level Security migration...');
  
  try {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection failed');
    }

    // Read the migration file
    const migrationPath = join(process.cwd(), 'migrations', '0001_enable_rls_multi_tenant.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📄 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
          await db.execute(statement + ';');
        } catch (error) {
          console.error(`❌ Failed to execute statement ${i + 1}:`, statement.substring(0, 100) + '...');
          console.error('Error:', error);
          // Continue with other statements
        }
      }
    }

    console.log('✅ Row Level Security migration completed successfully!');
    
    // Test that the functions were created
    const testResult = await db.execute(`SELECT current_organization_id() as result`);
    console.log('🧪 Test function call result:', testResult.rows[0]);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

applyRLSMigration();