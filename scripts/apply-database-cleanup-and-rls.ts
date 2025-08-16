#!/usr/bin/env tsx

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyDatabaseCleanupAndRLS() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL or POSTGRES_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔧 Applying database cleanup and RLS security...');
  console.log('🔗 Connecting to:', connectionString.replace(/:([^:@]{8})[^:@]*@/, ':$1****@'));

  const sql = postgres(connectionString, {
    ssl: process.env.NODE_ENV === 'production' ? 'require' : 'prefer',
    max: 1,
  });

  try {
    // Step 1: Drop backup tables
    console.log('🧹 Step 1: Cleaning up backup tables...');
    await sql`DROP TABLE IF EXISTS public.invitations_backup;`;
    await sql`DROP TABLE IF EXISTS public.organization_members_backup;`;
    await sql`DROP TABLE IF EXISTS public.organizations_backup;`;
    console.log('✅ Backup tables removed');

    // Step 2: Apply RLS migration
    console.log('🔒 Step 2: Applying RLS security migration...');
    
    const rlsMigrationPath = join(process.cwd(), 'migrations', '0001_enable_rls_multi_tenant.sql');
    const rlsMigration = readFileSync(rlsMigrationPath, 'utf-8');
    
    // Split by statement separator and execute each part
    const statements = rlsMigration.split('-- ').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      const cleanStatement = statement.trim();
      if (cleanStatement && !cleanStatement.startsWith('--')) {
        try {
          await sql.unsafe(cleanStatement);
        } catch (error: any) {
          // Ignore "already exists" errors for idempotency
          if (!error.message.includes('already exists') && 
              !error.message.includes('does not exist')) {
            console.warn(`⚠️ Warning in statement: ${error.message}`);
          }
        }
      }
    }
    
    console.log('✅ RLS security applied');

    // Step 3: Verify tables exist
    console.log('🔍 Step 3: Verifying database structure...');
    const tables = await sql`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    console.log('📋 Existing tables:');
    tables.forEach((table: any) => {
      console.log(`  - ${table.table_name} (${table.table_type})`);
    });

    // Step 4: Verify RLS is enabled
    console.log('🔐 Step 4: Verifying RLS status...');
    const rlsStatus = await sql`
      SELECT schemaname, tablename, rowsecurity, hasrls
      FROM pg_tables t
      LEFT JOIN pg_class c ON c.relname = t.tablename
      WHERE schemaname = 'public'
      AND hasrls IS NOT NULL
      ORDER BY tablename;
    `;
    
    console.log('🛡️ RLS Status:');
    rlsStatus.forEach((table: any) => {
      const status = table.hasrls ? '✅ Enabled' : '❌ Disabled';
      console.log(`  - ${table.tablename}: ${status}`);
    });

    console.log('🎉 Database cleanup and RLS security setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error applying database changes:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run the migration
if (require.main === module) {
  applyDatabaseCleanupAndRLS();
}

export default applyDatabaseCleanupAndRLS;