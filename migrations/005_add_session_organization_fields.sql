-- Migration to add BetterAuth organization plugin required fields to session table
-- This enables organization context tracking in user sessions

BEGIN;

-- Step 1: Add activeOrganizationId field to session table
-- This field tracks which organization the user is currently working in
ALTER TABLE session ADD COLUMN "activeOrganizationId" text;

-- Step 2: Add activeTeamId field to session table (for future team support)
-- This field tracks which team within an organization the user is currently working in
ALTER TABLE session ADD COLUMN "activeTeamId" text;

-- Step 3: Add foreign key constraint for activeOrganizationId
-- This ensures data integrity but allows NULL for users not in any organization
ALTER TABLE session 
ADD CONSTRAINT session_activeOrganizationId_fkey 
FOREIGN KEY ("activeOrganizationId") 
REFERENCES organization(id) 
ON DELETE SET NULL;

-- Step 4: Create index for performance optimization
-- This improves query performance when filtering sessions by active organization
CREATE INDEX IF NOT EXISTS idx_session_active_organization 
ON session("activeOrganizationId") 
WHERE "activeOrganizationId" IS NOT NULL;

-- Step 5: Verification query
-- Check that the new columns were added successfully
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

-- Step 6: Display session table structure for verification
\d session;

COMMIT;

-- Note: After this migration, BetterAuth organization plugin should properly register
-- the organization endpoints: /api/auth/organization/members and /api/auth/organization/invitations