-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE erd_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE erd_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organizations
CREATE OR REPLACE FUNCTION get_user_organizations(user_uuid UUID)
RETURNS TABLE(organization_id UUID, role organization_role)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT om.organization_id, om.role
    FROM organization_members om
    WHERE om.user_id = user_uuid;
END;
$$;

-- Helper function to check if user can access project
CREATE OR REPLACE FUNCTION can_access_project(user_uuid UUID, project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    project_org_id UUID;
    user_in_org BOOLEAN := FALSE;
    has_explicit_access BOOLEAN := FALSE;
BEGIN
    -- Get project's organization
    SELECT organization_id INTO project_org_id
    FROM erd_projects
    WHERE id = project_uuid;
    
    -- Check if user is member of project's organization
    SELECT EXISTS(
        SELECT 1 FROM organization_members
        WHERE organization_id = project_org_id AND user_id = user_uuid
    ) INTO user_in_org;
    
    -- Check if user has explicit project access
    SELECT EXISTS(
        SELECT 1 FROM project_access
        WHERE project_id = project_uuid AND user_id = user_uuid
    ) INTO has_explicit_access;
    
    RETURN user_in_org OR has_explicit_access;
END;
$$;

-- User profiles: Users can view their own profile and profiles in their organizations
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view org member profiles" ON user_profiles
    FOR SELECT USING (
        EXISTS(
            SELECT 1 FROM organization_members om1
            JOIN organization_members om2 ON om1.organization_id = om2.organization_id
            WHERE om1.user_id = auth.uid() AND om2.user_id = user_profiles.id
        )
    );

-- Organizations: Users can only see organizations they're members of
CREATE POLICY "Members can view their organizations" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can update organizations" ON organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Organization members: Users can see members of their organizations
CREATE POLICY "Members can view org membership" ON organization_members
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage org membership" ON organization_members
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- ERD Projects: Domain-based access + explicit permissions
CREATE POLICY "Users can view accessible projects" ON erd_projects
    FOR SELECT USING (can_access_project(auth.uid(), id));

CREATE POLICY "Users can create projects in their orgs" ON erd_projects
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "Users can update projects they have write access" ON erd_projects
    FOR UPDATE USING (
        -- Check organization role
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
        )
        OR
        -- Check explicit project permission
        id IN (
            SELECT project_id FROM project_access
            WHERE user_id = auth.uid() AND permission IN ('write', 'admin')
        )
    );

-- ERD Data: Follows project access
CREATE POLICY "Users can view project data" ON erd_data
    FOR SELECT USING (can_access_project(auth.uid(), project_id));

CREATE POLICY "Users can manage project data" ON erd_data
    FOR ALL USING (can_access_project(auth.uid(), project_id));

-- Project Access: Users can see access for projects they can access
CREATE POLICY "Users can view project access" ON project_access
    FOR SELECT USING (can_access_project(auth.uid(), project_id));

CREATE POLICY "Admins can manage project access" ON project_access
    FOR ALL USING (
        project_id IN (
            SELECT ep.id FROM erd_projects ep
            JOIN organization_members om ON ep.organization_id = om.organization_id
            WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
        )
        OR
        project_id IN (
            SELECT project_id FROM project_access
            WHERE user_id = auth.uid() AND permission = 'admin'
        )
    );

-- Audit logs: Users can see logs for their organizations
CREATE POLICY "Users can view org audit logs" ON audit_logs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );