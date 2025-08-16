-- Migration to rename database columns from snake_case to camelCase
-- This aligns our database schema with BetterAuth expectations

BEGIN;

-- Step 1: Rename columns in organization table
-- BetterAuth expects: createdAt, updatedAt (camelCase)
ALTER TABLE organization RENAME COLUMN created_at TO "createdAt";
ALTER TABLE organization RENAME COLUMN updated_at TO "updatedAt";

-- Step 2: Rename columns in member table  
-- BetterAuth expects: organizationId, userId, createdAt (camelCase)
ALTER TABLE member RENAME COLUMN organization_id TO "organizationId";
ALTER TABLE member RENAME COLUMN user_id TO "userId";
ALTER TABLE member RENAME COLUMN joined_at TO "createdAt"; -- Rename to match BetterAuth convention

-- Step 3: Rename columns in invitations table
-- BetterAuth expects: organizationId, createdBy, expiresAt, createdAt, updatedAt (camelCase)
ALTER TABLE invitations RENAME COLUMN organization_id TO "organizationId";
ALTER TABLE invitations RENAME COLUMN created_by TO "createdBy";
ALTER TABLE invitations RENAME COLUMN expires_at TO "expiresAt";
ALTER TABLE invitations RENAME COLUMN created_at TO "createdAt";
ALTER TABLE invitations RENAME COLUMN updated_at TO "updatedAt";

-- Step 4: Rename columns in projects table
-- Update to camelCase for consistency
ALTER TABLE projects RENAME COLUMN organization_id TO "organizationId";
ALTER TABLE projects RENAME COLUMN owner_id TO "ownerId";
ALTER TABLE projects RENAME COLUMN created_at TO "createdAt";
ALTER TABLE projects RENAME COLUMN updated_at TO "updatedAt";

-- Step 5: Rename columns in project_files table
-- Update to camelCase for consistency
ALTER TABLE project_files RENAME COLUMN project_id TO "projectId";
ALTER TABLE project_files RENAME COLUMN file_data TO "fileData";
ALTER TABLE project_files RENAME COLUMN erd_data TO "erdData";
ALTER TABLE project_files RENAME COLUMN mermaid_code TO "mermaidCode";
ALTER TABLE project_files RENAME COLUMN created_at TO "createdAt";
ALTER TABLE project_files RENAME COLUMN updated_at TO "updatedAt";

-- Step 6: Rename columns in tables table
-- Update to camelCase for consistency
ALTER TABLE tables RENAME COLUMN project_id TO "projectId";
ALTER TABLE tables RENAME COLUMN organization_id TO "organizationId";
ALTER TABLE tables RENAME COLUMN created_at TO "createdAt";

-- Step 7: Rename columns in relationships table
-- Update to camelCase for consistency
ALTER TABLE relationships RENAME COLUMN source_table TO "sourceTable";
ALTER TABLE relationships RENAME COLUMN source_column TO "sourceColumn";
ALTER TABLE relationships RENAME COLUMN target_table TO "targetTable";
ALTER TABLE relationships RENAME COLUMN target_column TO "targetColumn";
ALTER TABLE relationships RENAME COLUMN project_id TO "projectId";
ALTER TABLE relationships RENAME COLUMN organization_id TO "organizationId";
ALTER TABLE relationships RENAME COLUMN created_at TO "createdAt";

-- Step 8: Rename columns in upload_sessions table
-- Update to camelCase for consistency
ALTER TABLE upload_sessions RENAME COLUMN tables_count TO "tablesCount";
ALTER TABLE upload_sessions RENAME COLUMN relationships_count TO "relationshipsCount";
ALTER TABLE upload_sessions RENAME COLUMN project_id TO "projectId";
ALTER TABLE upload_sessions RENAME COLUMN created_at TO "createdAt";

-- Step 9: Update foreign key constraints to reference new column names
-- Note: PostgreSQL automatically handles this for us, but we should verify

-- Step 10: Verification query
-- This will help us confirm all columns were renamed correctly
SELECT 
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('organization', 'member', 'invitations', 'projects', 'project_files', 'tables', 'relationships', 'upload_sessions')
  AND (column_name LIKE '%_%' OR column_name LIKE '%At' OR column_name LIKE '%Id' OR column_name LIKE '%Data')
ORDER BY table_name, column_name;

COMMIT;

-- Note: After this migration, BetterAuth organization plugin should work correctly
-- as all column names now match the expected camelCase convention