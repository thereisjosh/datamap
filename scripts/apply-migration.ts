#!/usr/bin/env node

import dotenv from "dotenv";
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

async function applyMigration() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ No connection string found');
    return;
  }

  const sql = postgres(connectionString, {
    ssl: 'prefer',
    max: 1,
  });

  try {
    console.log('Connected to database');

    // Read the migration file
    const migrationPath = join(__dirname, '../migrations/0001_clean_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('Applying migration...');
    
    // Execute the entire migration as one transaction
    await sql.begin(async sql => {
      await sql.unsafe(migrationSQL);
    });

    console.log('✅ Migration applied successfully!');
    console.log('Database schema cleaned and RLS policies implemented');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

applyMigration();