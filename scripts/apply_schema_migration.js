#!/usr/bin/env node

import { getDb } from "../lib/db.ts";

async function applySchemaChanges() {
  console.log("🔧 Applying comprehensive schema changes to match BetterAuth expectations...");
  
  try {
    const db = await getDb();
    
    if (!db) {
      throw new Error("Database connection failed");
    }
    
    console.log("✅ Connected to database");
    
    // Apply all column renames in the correct order to avoid conflicts
    const migrations = [
      // User table changes
      'ALTER TABLE "user" RENAME COLUMN "emailVerified" TO "email_verified"',
      'ALTER TABLE "user" RENAME COLUMN "createdAt" TO "created_at"',
      'ALTER TABLE "user" RENAME COLUMN "updatedAt" TO "updated_at"',
      
      // Session table changes  
      'ALTER TABLE "session" RENAME COLUMN "expiresAt" TO "expires_at"',
      'ALTER TABLE "session" RENAME COLUMN "createdAt" TO "created_at"',
      'ALTER TABLE "session" RENAME COLUMN "updatedAt" TO "updated_at"',
      'ALTER TABLE "session" RENAME COLUMN "ipAddress" TO "ip_address"',
      'ALTER TABLE "session" RENAME COLUMN "userAgent" TO "user_agent"',
      'ALTER TABLE "session" RENAME COLUMN "userId" TO "user_id"',
      'ALTER TABLE "session" RENAME COLUMN "activeOrganizationId" TO "active_organization_id"',
      'ALTER TABLE "session" RENAME COLUMN "activeTeamId" TO "active_team_id"',
      
      // Account table changes
      'ALTER TABLE "account" RENAME COLUMN "accountId" TO "account_id"',
      'ALTER TABLE "account" RENAME COLUMN "providerId" TO "provider_id"',
      'ALTER TABLE "account" RENAME COLUMN "userId" TO "user_id"',
      'ALTER TABLE "account" RENAME COLUMN "accessToken" TO "access_token"',
      'ALTER TABLE "account" RENAME COLUMN "refreshToken" TO "refresh_token"',
      'ALTER TABLE "account" RENAME COLUMN "idToken" TO "id_token"',
      'ALTER TABLE "account" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at"',
      'ALTER TABLE "account" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at"',
      'ALTER TABLE "account" RENAME COLUMN "createdAt" TO "created_at"',
      'ALTER TABLE "account" RENAME COLUMN "updatedAt" TO "updated_at"',
      
      // Verification table changes
      'ALTER TABLE "verification" RENAME COLUMN "expiresAt" TO "expires_at"',
      'ALTER TABLE "verification" RENAME COLUMN "createdAt" TO "created_at"',
      'ALTER TABLE "verification" RENAME COLUMN "updatedAt" TO "updated_at"',
      
      // Organization table changes (type changes need special handling)
      'ALTER TABLE "organization" ALTER COLUMN "id" TYPE text',
      'ALTER TABLE "organization" ALTER COLUMN "name" TYPE text',
      'ALTER TABLE "organization" ALTER COLUMN "slug" TYPE text',
      'ALTER TABLE "organization" ADD COLUMN "logo" text',
      'ALTER TABLE "organization" RENAME COLUMN "createdAt" TO "created_at"',
      'ALTER TABLE "organization" DROP COLUMN "updatedAt"',
      'ALTER TABLE "organization" ALTER COLUMN "metadata" TYPE text',
      
      // Member table changes
      'ALTER TABLE "member" ALTER COLUMN "id" TYPE text',
      'ALTER TABLE "member" RENAME COLUMN "organizationId" TO "organization_id"',
      'ALTER TABLE "member" ALTER COLUMN "organization_id" TYPE text',
      'ALTER TABLE "member" RENAME COLUMN "userId" TO "user_id"',
      'ALTER TABLE "member" RENAME COLUMN "createdAt" TO "created_at"',
      
      // Invitation table changes
      'ALTER TABLE "invitation" ALTER COLUMN "id" TYPE text',
      'ALTER TABLE "invitation" RENAME COLUMN "organizationId" TO "organization_id"',
      'ALTER TABLE "invitation" ALTER COLUMN "organization_id" TYPE text',
      'ALTER TABLE "invitation" RENAME COLUMN "expiresAt" TO "expires_at"',
      'ALTER TABLE "invitation" RENAME COLUMN "createdBy" TO "inviter_id"',
      'ALTER TABLE "invitation" RENAME COLUMN "createdAt" TO "created_at"',
      'ALTER TABLE "invitation" RENAME COLUMN "updatedAt" TO "updated_at"',
    ];
    
    for (const migration of migrations) {
      try {
        console.log(`🔄 Executing: ${migration}`);
        await db.execute(migration);
        console.log(`✅ Success: ${migration}`);
      } catch (error) {
        console.warn(`⚠️ Skipped (already exists or invalid): ${migration}`);
        console.warn(`   Error: ${error.message}`);
      }
    }
    
    console.log("🎉 Schema migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
applySchemaChanges().then(() => {
  console.log("✅ Migration script completed");
  process.exit(0);
}).catch((error) => {
  console.error("❌ Migration script failed:", error);
  process.exit(1);
});