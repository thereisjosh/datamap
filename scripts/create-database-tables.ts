#!/usr/bin/env tsx

import { config } from 'dotenv';
import { getDb } from '../lib/db';
import { sql } from 'drizzle-orm';

// Load environment variables
config({ path: '.env.local' });

async function createDatabaseTables() {
  console.log('🔄 Creating database tables manually...');
  
  try {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection failed');
    }

    console.log('✅ Database connection successful');

    // Create tables in the correct order (respecting foreign key dependencies)
    
    // 1. User table (base table, no dependencies)
    console.log('\n1️⃣ Creating user table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "email_verified" boolean NOT NULL DEFAULT false,
        "image" text,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    console.log('  ✅ User table created');

    // 2. Organization table (no dependencies)
    console.log('\n2️⃣ Creating organization table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "organization" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text UNIQUE,
        "logo" text,
        "created_at" timestamp with time zone NOT NULL,
        "metadata" text,
        "domain" varchar UNIQUE,
        "description" text,
        "subscription_tier" text DEFAULT 'free',
        "settings" jsonb DEFAULT '{}'::jsonb
      );
    `);
    console.log('  ✅ Organization table created');

    // 3. Session table (depends on user and organization)
    console.log('\n3️⃣ Creating session table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "id" text PRIMARY KEY,
        "expires_at" timestamp with time zone NOT NULL,
        "token" text NOT NULL UNIQUE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        "ip_address" text,
        "user_agent" text,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
        "active_organization_id" text REFERENCES "organization"("id") ON DELETE set null,
        "active_team_id" text
      );
    `);
    console.log('  ✅ Session table created');

    // 4. Account table (depends on user)
    console.log('\n4️⃣ Creating account table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "account" (
        "id" text PRIMARY KEY,
        "account_id" text NOT NULL,
        "provider_id" text NOT NULL,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
        "access_token" text,
        "refresh_token" text,
        "id_token" text,
        "access_token_expires_at" timestamp with time zone,
        "refresh_token_expires_at" timestamp with time zone,
        "scope" text,
        "password" text,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    console.log('  ✅ Account table created');

    // 5. Verification table (independent)
    console.log('\n5️⃣ Creating verification table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "verification" (
        "id" text PRIMARY KEY,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    console.log('  ✅ Verification table created');

    // 6. Member table (depends on organization and user)
    console.log('\n6️⃣ Creating member table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "member" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
        "role" text NOT NULL DEFAULT 'member',
        "created_at" timestamp with time zone NOT NULL
      );
    `);
    console.log('  ✅ Member table created');

    // 7. Invitation table (depends on organization and user)
    console.log('\n7️⃣ Creating invitation table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "invitation" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "email" text NOT NULL,
        "role" text,
        "status" text NOT NULL DEFAULT 'pending',
        "expires_at" timestamp with time zone NOT NULL,
        "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
        "token" text UNIQUE,
        "created_at" timestamp with time zone DEFAULT now(),
        "updated_at" timestamp with time zone DEFAULT now()
      );
    `);
    console.log('  ✅ Invitation table created');

    // 8. Projects table (depends on organization and user)
    console.log('\n8️⃣ Creating projects table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "description" text,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
        "status" text NOT NULL DEFAULT 'active',
        "settings" jsonb DEFAULT '{}'::jsonb,
        "created_at" timestamp with time zone DEFAULT now(),
        "updated_at" timestamp with time zone DEFAULT now()
      );
    `);
    console.log('  ✅ Projects table created');

    // 9. Project files table (depends on projects)
    console.log('\n9️⃣ Creating project_files table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "project_files" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
        "filename" text NOT NULL,
        "file_data" jsonb,
        "erd_data" jsonb,
        "mermaid_code" text,
        "version" text NOT NULL DEFAULT '1',
        "created_at" timestamp with time zone DEFAULT now(),
        "updated_at" timestamp with time zone DEFAULT now()
      );
    `);
    console.log('  ✅ Project files table created');

    // 10. Tables table (legacy, depends on projects and organization)
    console.log('\n🔟 Creating tables table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "tables" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "attributes" jsonb NOT NULL,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
        "organization_id" text REFERENCES "organization"("id") ON DELETE cascade,
        "created_at" timestamp with time zone DEFAULT now()
      );
    `);
    console.log('  ✅ Tables table created');

    // 11. Relationships table (legacy, depends on projects and organization)
    console.log('\n1️⃣1️⃣ Creating relationships table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "relationships" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "source_table" text NOT NULL,
        "source_column" text NOT NULL,
        "target_table" text NOT NULL,
        "target_column" text NOT NULL,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
        "organization_id" text REFERENCES "organization"("id") ON DELETE cascade,
        "created_at" timestamp with time zone DEFAULT now()
      );
    `);
    console.log('  ✅ Relationships table created');

    // 12. Upload sessions table (depends on projects)
    console.log('\n1️⃣2️⃣ Creating upload_sessions table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "upload_sessions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "filename" text NOT NULL,
        "status" text NOT NULL,
        "tables_count" text,
        "relationships_count" text,
        "errors" jsonb,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE cascade,
        "created_at" timestamp with time zone DEFAULT now()
      );
    `);
    console.log('  ✅ Upload sessions table created');

    console.log('\n🎉 All database tables created successfully!');

  } catch (error) {
    console.error('❌ Table creation failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

createDatabaseTables();