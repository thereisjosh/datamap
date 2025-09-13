-- Migration: Add organization_id columns and RLS policies for security compliance
-- Created: 2025-09-12
-- Purpose: Fix RLS security gaps in project_domains, project_domain_tables, and table_embeddings

BEGIN;

-- 1. Add organization_id columns to tables that lack proper RLS
-- These columns will be populated from the associated project's organization_id

-- Add organization_id to project_domains
ALTER TABLE project_domains 
ADD COLUMN organization_id UUID REFERENCES organization(id) ON DELETE CASCADE;

-- Add organization_id to project_domain_tables  
ALTER TABLE project_domain_tables
ADD COLUMN organization_id UUID REFERENCES organization(id) ON DELETE CASCADE;

-- Add organization_id to table_embeddings
ALTER TABLE table_embeddings
ADD COLUMN organization_id UUID REFERENCES organization(id) ON DELETE CASCADE;

-- 2. Populate organization_id columns from existing project relationships
-- This ensures existing data has proper organization context

-- Update project_domains with organization_id from projects
UPDATE project_domains 
SET organization_id = p.organization_id
FROM projects p 
WHERE project_domains.project_id = p.id;

-- Update project_domain_tables with organization_id from projects via project_domains
UPDATE project_domain_tables 
SET organization_id = pd.organization_id
FROM project_domains pd 
WHERE project_domain_tables.domain_id = pd.id;

-- Update table_embeddings with organization_id from projects
UPDATE table_embeddings 
SET organization_id = p.organization_id
FROM projects p 
WHERE table_embeddings.project_id = p.id;

-- 3. Make organization_id columns NOT NULL after population
ALTER TABLE project_domains ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE project_domain_tables ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE table_embeddings ALTER COLUMN organization_id SET NOT NULL;

-- 4. Add indexes for RLS performance optimization
CREATE INDEX project_domains_org_idx ON project_domains(organization_id);
CREATE INDEX project_domain_tables_org_idx ON project_domain_tables(organization_id);
CREATE INDEX table_embeddings_org_idx ON table_embeddings(organization_id);

-- 5. Enable RLS on tables
ALTER TABLE project_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_domain_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_embeddings ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for multi-tenant isolation

-- Project Domains RLS Policies
CREATE POLICY "project_domains_tenant_isolation" ON project_domains
    FOR ALL 
    USING (organization_id::text = current_setting('app.current_organization_id', true));

-- Project Domain Tables RLS Policies
CREATE POLICY "project_domain_tables_tenant_isolation" ON project_domain_tables
    FOR ALL 
    USING (organization_id::text = current_setting('app.current_organization_id', true));

-- Table Embeddings RLS Policies  
CREATE POLICY "table_embeddings_tenant_isolation" ON table_embeddings
    FOR ALL 
    USING (organization_id::text = current_setting('app.current_organization_id', true));

-- 7. Create trigger functions to automatically set organization_id on new records
-- This ensures future records always have proper organization context

CREATE OR REPLACE FUNCTION set_organization_id_from_project()
RETURNS TRIGGER AS $$
BEGIN
    -- For project_domains: get organization_id from projects table
    IF TG_TABLE_NAME = 'project_domains' THEN
        SELECT organization_id INTO NEW.organization_id 
        FROM projects 
        WHERE id = NEW.project_id;
    END IF;
    
    -- For table_embeddings: get organization_id from projects table
    IF TG_TABLE_NAME = 'table_embeddings' THEN
        SELECT organization_id INTO NEW.organization_id 
        FROM projects 
        WHERE id = NEW.project_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_organization_id_from_domain()
RETURNS TRIGGER AS $$
BEGIN
    -- For project_domain_tables: get organization_id from project_domains table
    IF TG_TABLE_NAME = 'project_domain_tables' THEN
        SELECT organization_id INTO NEW.organization_id 
        FROM project_domains 
        WHERE id = NEW.domain_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create triggers to automatically populate organization_id on INSERT
CREATE TRIGGER project_domains_set_org_id
    BEFORE INSERT ON project_domains
    FOR EACH ROW
    EXECUTE FUNCTION set_organization_id_from_project();

CREATE TRIGGER table_embeddings_set_org_id
    BEFORE INSERT ON table_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION set_organization_id_from_project();

CREATE TRIGGER project_domain_tables_set_org_id
    BEFORE INSERT ON project_domain_tables
    FOR EACH ROW
    EXECUTE FUNCTION set_organization_id_from_domain();

-- 9. Add security validation comments
COMMENT ON POLICY "project_domains_tenant_isolation" ON project_domains 
IS 'Ensures users can only access project domains within their organization context';

COMMENT ON POLICY "project_domain_tables_tenant_isolation" ON project_domain_tables 
IS 'Ensures users can only access domain tables within their organization context';

COMMENT ON POLICY "table_embeddings_tenant_isolation" ON table_embeddings 
IS 'Ensures users can only access table embeddings within their organization context';

COMMIT;

-- Migration verification queries (run manually to verify)
/*
-- Verify organization_id columns were added and populated
SELECT 'project_domains' as table_name, COUNT(*) as total_rows, COUNT(organization_id) as with_org_id FROM project_domains
UNION ALL
SELECT 'project_domain_tables', COUNT(*), COUNT(organization_id) FROM project_domain_tables  
UNION ALL
SELECT 'table_embeddings', COUNT(*), COUNT(organization_id) FROM table_embeddings;

-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('project_domains', 'project_domain_tables', 'table_embeddings');

-- Verify policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('project_domains', 'project_domain_tables', 'table_embeddings');
*/