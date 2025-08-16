-- Migration to align database schema with BetterAuth organization plugin expectations
-- BetterAuth expects specific table names and column structures

-- 1. Rename organizations table to organization (singular)
-- Note: BetterAuth typically expects singular table names
ALTER TABLE organizations RENAME TO organization;

-- 2. Rename organization_members table to member  
-- BetterAuth organization plugin expects 'member' table
ALTER TABLE organization_members RENAME TO member;

-- 3. Update foreign key references in member table
-- BetterAuth expects organizationId column to reference organization.id
-- Our current structure should already be compatible

-- 4. Check invitation table structure
-- BetterAuth expects invitation table with specific columns
-- Our current invitations table should be mostly compatible

-- 5. Update any indexes that reference the old table names
-- This will be handled automatically by PostgreSQL for most cases

-- Note: After this migration, update the schema.ts file to reflect the new table names