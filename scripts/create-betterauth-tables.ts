#!/usr/bin/env node

import dotenv from "dotenv";
import postgres from "postgres";

// Load environment variables
dotenv.config({ path: '.env.local' });

async function createBetterAuthTables() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ No connection string found');
    return;
  }

  const sql = postgres(connectionString, {
    ssl: 'prefer',
    max: 1,
  });

  try {
    console.log('🔧 Creating BetterAuth tables...');
    
    // Create user table
    await sql`
      CREATE TABLE IF NOT EXISTS public.user (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        "emailVerified" boolean NOT NULL DEFAULT false,
        image text,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log('✅ User table created');

    // Create session table
    await sql`
      CREATE TABLE IF NOT EXISTS public.session (
        id text PRIMARY KEY,
        "expiresAt" timestamp with time zone NOT NULL,
        token text NOT NULL UNIQUE,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        "ipAddress" text,
        "userAgent" text,
        "userId" text NOT NULL REFERENCES public.user(id) ON DELETE CASCADE
      );
    `;
    console.log('✅ Session table created');

    // Create verification table
    await sql`
      CREATE TABLE IF NOT EXISTS public.verification (
        id text PRIMARY KEY,
        identifier text NOT NULL,
        value text NOT NULL,
        "expiresAt" timestamp with time zone NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log('✅ Verification table created');

    // Update account table to have proper foreign key
    await sql`
      ALTER TABLE public.account 
      DROP CONSTRAINT IF EXISTS account_userid_user_id_fk;
    `;
    
    await sql`
      ALTER TABLE public.account 
      ADD CONSTRAINT account_userid_user_id_fk 
      FOREIGN KEY ("userId") REFERENCES public.user(id) ON DELETE CASCADE;
    `;
    console.log('✅ Account table constraints updated');

    console.log('🎉 All BetterAuth tables ready!');
    
    await sql.end();
  } catch (error) {
    console.error('❌ Creation failed:', error);
    await sql.end();
  }
}

createBetterAuthTables();