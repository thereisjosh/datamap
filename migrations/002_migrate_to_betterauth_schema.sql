-- Migration to align database schema with BetterAuth organization plugin expectations
-- This migration transforms our custom organization schema to match BetterAuth standards

BEGIN;

-- Step 1: Create backup tables for safety (only if original tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN
    CREATE TABLE IF NOT EXISTS organizations_backup AS SELECT * FROM organizations;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_members' AND table_schema = 'public') THEN
    CREATE TABLE IF NOT EXISTS organization_members_backup AS SELECT * FROM organization_members;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invitations' AND table_schema = 'public') THEN
    CREATE TABLE IF NOT EXISTS invitations_backup AS SELECT * FROM invitations;
  END IF;
END
$$;

-- Step 2: Rename tables to BetterAuth standard names (singular)
-- BetterAuth expects: organization, member, invitation

-- Rename organizations -> organization (only if organizations exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN
    ALTER TABLE organizations RENAME TO organization;
  END IF;
END
$$;

-- Rename organization_members -> member (only if organization_members exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_members' AND table_schema = 'public') THEN
    ALTER TABLE organization_members RENAME TO member;
  END IF;
END
$$;

-- invitations table name is already correct for BetterAuth

-- Step 3: Update foreign key constraint names
-- Update member table to reference the renamed organization table
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'organization_members_organization_id_fkey' AND table_name = 'member') THEN
    ALTER TABLE member DROP CONSTRAINT organization_members_organization_id_fkey;
  END IF;
  
  -- Add new constraint if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'member_organization_id_organization_id_fk' AND table_name = 'member') THEN
    ALTER TABLE member ADD CONSTRAINT member_organization_id_organization_id_fk 
        FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Update invitations table to reference the renamed organization table  
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invitations_organization_id_fkey' AND table_name = 'invitations') THEN
    ALTER TABLE invitations DROP CONSTRAINT invitations_organization_id_fkey;
  END IF;
  
  -- Add new constraint if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invitations_organization_id_organization_id_fk' AND table_name = 'invitations') THEN
    ALTER TABLE invitations ADD CONSTRAINT invitations_organization_id_organization_id_fk 
        FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Step 4: Update other tables that reference organizations
-- Update projects table - use conditional logic for safety
DO $$
BEGIN
  -- Drop old constraints if they exist
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'projects_organization_id_fkey' AND table_name = 'projects') THEN
    ALTER TABLE projects DROP CONSTRAINT projects_organization_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'projects_organization_id_organizations_id_fk' AND table_name = 'projects') THEN
    ALTER TABLE projects DROP CONSTRAINT projects_organization_id_organizations_id_fk;
  END IF;
  
  -- Add new constraint if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'projects_organization_id_organization_id_fk' AND table_name = 'projects') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_organization_id_organization_id_fk 
        FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Update tables table if it has organization reference - use conditional logic for safety
DO $$
BEGIN
  -- Drop old constraints if they exist
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tables_organization_id_fkey' AND table_name = 'tables') THEN
    ALTER TABLE tables DROP CONSTRAINT tables_organization_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tables_organization_id_organizations_id_fk' AND table_name = 'tables') THEN
    ALTER TABLE tables DROP CONSTRAINT tables_organization_id_organizations_id_fk;
  END IF;
  
  -- Add new constraint if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tables_organization_id_organization_id_fk' AND table_name = 'tables') THEN
    ALTER TABLE tables ADD CONSTRAINT tables_organization_id_organization_id_fk 
        FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Update relationships table if it has organization reference - use conditional logic for safety
DO $$
BEGIN
  -- Drop old constraints if they exist
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'relationships_organization_id_fkey' AND table_name = 'relationships') THEN
    ALTER TABLE relationships DROP CONSTRAINT relationships_organization_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'relationships_organization_id_organizations_id_fk' AND table_name = 'relationships') THEN
    ALTER TABLE relationships DROP CONSTRAINT relationships_organization_id_organizations_id_fk;
  END IF;
  
  -- Add new constraint if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'relationships_organization_id_organization_id_fk' AND table_name = 'relationships') THEN
    ALTER TABLE relationships ADD CONSTRAINT relationships_organization_id_organization_id_fk 
        FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Step 5: Verify BetterAuth compatibility
-- BetterAuth typically expects these columns:
-- organization: id, name, slug, metadata, createdAt, updatedAt
-- member: id, organizationId, userId, role, createdAt  
-- invitation: id, organizationId, email, role, status, token, expiresAt

-- Add slug column to organization if missing (BetterAuth standard)
ALTER TABLE organization ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

-- Update slug values based on existing data
UPDATE organization SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

-- Add unique constraint on slug if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'organization_slug_unique' AND table_name = 'organization') THEN
    ALTER TABLE organization ADD CONSTRAINT organization_slug_unique UNIQUE (slug);
  END IF;
END
$$;

-- Add metadata column if missing (BetterAuth standard for extensibility)
ALTER TABLE organization ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Step 6: Create indexes for performance (BetterAuth best practices)
CREATE INDEX IF NOT EXISTS idx_member_organization_id ON member(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_user_id ON member(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- Step 7: Add comments for documentation
COMMENT ON TABLE organization IS 'BetterAuth organization table - stores organization/tenant data';
COMMENT ON TABLE member IS 'BetterAuth member table - stores organization memberships';
COMMENT ON TABLE invitations IS 'BetterAuth invitation table - stores pending organization invitations';

COMMIT;

-- Verification queries (run these after migration)
-- SELECT 'Organizations:' as table_name, count(*) as count FROM organization
-- UNION ALL
-- SELECT 'Members:', count(*) FROM member  
-- UNION ALL
-- SELECT 'Invitations:', count(*) FROM invitations;