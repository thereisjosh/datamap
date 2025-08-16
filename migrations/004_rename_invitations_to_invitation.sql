-- Migration to rename invitations table to invitation (singular)
-- BetterAuth expects singular table names

BEGIN;

-- Step 1: Rename invitations table to invitation
ALTER TABLE invitations RENAME TO invitation;

-- Step 2: Update any references in our schema that might point to the old name
-- (PostgreSQL automatically handles foreign key updates)

-- Step 3: Verification
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('organization', 'member', 'invitation')
ORDER BY table_name;

COMMIT;