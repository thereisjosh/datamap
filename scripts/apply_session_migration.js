#!/usr/bin/env node

import { getDb } from "../lib/db.ts";

async function applySessionMigration() {
  console.log("🔧 Applying session table migration for BetterAuth organization plugin...");
  
  try {
    const db = await getDb();
    
    if (!db) {
      throw new Error("Database connection failed");
    }
    
    console.log("✅ Connected to database");
    
    // Check if columns already exist
    const checkColumnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'session' 
        AND column_name IN ('activeOrganizationId', 'activeTeamId');
    `;
    
    const existingColumns = await db.execute(checkColumnsQuery);
    console.log("🔍 Existing session columns:", existingColumns);
    
    if (existingColumns.length === 0) {
      console.log("🚀 Adding activeOrganizationId and activeTeamId columns to session table...");
      
      // Add activeOrganizationId column
      await db.execute(`
        ALTER TABLE session ADD COLUMN IF NOT EXISTS "activeOrganizationId" text;
      `);
      console.log("✅ Added activeOrganizationId column");
      
      // Add activeTeamId column
      await db.execute(`
        ALTER TABLE session ADD COLUMN IF NOT EXISTS "activeTeamId" text;
      `);
      console.log("✅ Added activeTeamId column");
      
      // Add foreign key constraint (if organization table exists)
      try {
        await db.execute(`
          ALTER TABLE session 
          ADD CONSTRAINT IF NOT EXISTS session_activeOrganizationId_fkey 
          FOREIGN KEY ("activeOrganizationId") 
          REFERENCES organization(id) 
          ON DELETE SET NULL;
        `);
        console.log("✅ Added foreign key constraint");
      } catch (fkError) {
        console.warn("⚠️ Could not add foreign key constraint:", fkError.message);
      }
      
      // Add index for performance
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_session_active_organization 
        ON session("activeOrganizationId") 
        WHERE "activeOrganizationId" IS NOT NULL;
      `);
      console.log("✅ Added performance index");
      
    } else {
      console.log("✅ Session columns already exist, skipping migration");
    }
    
    // Verify the changes
    const verificationQuery = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'session'
        AND column_name IN ('activeOrganizationId', 'activeTeamId')
      ORDER BY column_name;
    `;
    
    const verification = await db.execute(verificationQuery);
    console.log("🔍 Session table verification:", verification);
    
    console.log("🎉 Session migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
applySessionMigration().then(() => {
  console.log("✅ Migration script completed");
  process.exit(0);
}).catch((error) => {
  console.error("❌ Migration script failed:", error);
  process.exit(1);
});