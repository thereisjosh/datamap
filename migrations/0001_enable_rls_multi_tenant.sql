-- Enable Row Level Security for Multi-Tenant Organization Isolation
-- This migration implements industry-standard PostgreSQL RLS patterns for SaaS applications

-- Create function to get current organization context
CREATE OR REPLACE FUNCTION current_organization_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_organization_id', true), '');
EXCEPTION
  WHEN undefined_object THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to set organization context (used by application)
CREATE OR REPLACE FUNCTION set_current_organization_id(org_id TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_organization_id', org_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user is organization member
CREATE OR REPLACE FUNCTION is_organization_member(org_id TEXT, user_id TEXT) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM member 
    WHERE organization_id = org_id::uuid AND user_id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user role in organization
CREATE OR REPLACE FUNCTION get_user_organization_role(org_id TEXT, user_id TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role FROM member 
    WHERE organization_id = org_id::uuid AND user_id = user_id
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on organization table
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;

-- Organization policies: users can only see organizations they're members of
CREATE POLICY "Users can view organizations they belong to" ON organization
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- Enable RLS on member table
ALTER TABLE member ENABLE ROW LEVEL SECURITY;

-- Member policies: users can view members of organizations they belong to
CREATE POLICY "Users can view members of their organizations" ON member
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM member AS m2
      WHERE m2.user_id = current_setting('app.current_user_id', true)
    )
  );



-- Enable RLS on invitation table
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;

-- Invitation policies: users can view/manage invitations for organizations they admin
CREATE POLICY "Users can view invitations for their organizations" ON invitation
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );


-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Project policies: users can only access projects in their organizations
CREATE POLICY "Users can view projects in their organizations" ON projects
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "Users can create projects in their organizations" ON projects
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
      AND role IN ('owner', 'admin', 'member')
    )
    AND owner_id = current_setting('app.current_user_id', true)
  );

CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE
  USING (
    owner_id = current_setting('app.current_user_id', true)
    AND organization_id IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "Admins can delete projects in their organizations" ON projects
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
      AND role IN ('owner', 'admin')
    )
  );

-- Enable RLS on project_files table
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Project files policies: access through project's organization membership
CREATE POLICY "Users can view project files through organization membership" ON project_files
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN member m ON p.organization_id = m.organization_id
      WHERE m.user_id = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "Users can manage project files they own" ON project_files
  FOR ALL
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN member m ON p.organization_id = m.organization_id
      WHERE m.user_id = current_setting('app.current_user_id', true)
      AND (p.owner_id = current_setting('app.current_user_id', true) OR m.role IN ('owner', 'admin'))
    )
  );

-- Enable RLS on tables table (legacy)
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

-- Tables policies: organization-scoped access
CREATE POLICY "Users can view tables in their organizations" ON tables
  FOR SELECT
  USING (
    "organizationId" IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
    OR "organizationId" IS NULL -- Allow legacy data without organizationId
  );

CREATE POLICY "Users can manage tables in their organizations" ON tables
  FOR ALL
  USING (
    "organizationId" IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
    OR "organizationId" IS NULL -- Allow legacy data without organizationId
  );

-- Enable RLS on relationships table (legacy)
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

-- Relationships policies: organization-scoped access
CREATE POLICY "Users can view relationships in their organizations" ON relationships
  FOR SELECT
  USING (
    "organizationId" IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
    OR "organizationId" IS NULL -- Allow legacy data without organizationId
  );

CREATE POLICY "Users can manage relationships in their organizations" ON relationships
  FOR ALL
  USING (
    "organizationId" IN (
      SELECT organization_id FROM member 
      WHERE user_id = current_setting('app.current_user_id', true)
    )
    OR "organizationId" IS NULL -- Allow legacy data without organizationId
  );

-- Enable RLS on upload_sessions table
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

-- Upload sessions policies: project-based access through organization membership
CREATE POLICY "Users can view upload sessions through project access" ON upload_sessions
  FOR SELECT
  USING (
    "projectId" IN (
      SELECT p.id FROM projects p
      JOIN member m ON p.organization_id = m.organization_id
      WHERE m.user_id = current_setting('app.current_user_id', true)
    )
    OR "projectId" IS NULL -- Allow sessions without projectId
  );

CREATE POLICY "Users can manage upload sessions for their projects" ON upload_sessions
  FOR ALL
  USING (
    "projectId" IN (
      SELECT p.id FROM projects p
      JOIN member m ON p.organization_id = m.organization_id
      WHERE m.user_id = current_setting('app.current_user_id', true)
      AND (p.owner_id = current_setting('app.current_user_id', true) OR m.role IN ('owner', 'admin'))
    )
    OR "projectId" IS NULL -- Allow sessions without projectId
  );

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_member_user_org 
ON member (user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_projects_org_owner 
ON projects (organization_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_invitations_org_status 
ON invitation (organization_id, status);

-- Grant necessary permissions to application user
-- Note: Replace 'app_user' with your actual application database user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- Add comments for documentation
COMMENT ON FUNCTION current_organization_id() IS 'Returns the current organization context for RLS policies';
COMMENT ON FUNCTION set_current_organization_id(TEXT) IS 'Sets the organization context for the current session';
COMMENT ON FUNCTION is_organization_member(TEXT, TEXT) IS 'Checks if a user is a member of an organization';
COMMENT ON FUNCTION get_user_organization_role(TEXT, TEXT) IS 'Returns the user role within an organization';