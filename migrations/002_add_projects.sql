-- Migration: Add Project Management Tables
-- Created: 2025-08-13
-- Description: Add projects and project_files tables for proper project management

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_files table
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_data JSONB,
  erd_data JSONB,
  mermaid_code TEXT,
  version TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add project_id columns to existing tables (optional/nullable for backwards compatibility)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_tables_project_id ON tables(project_id);
CREATE INDEX IF NOT EXISTS idx_relationships_project_id ON relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_project_id ON upload_sessions(project_id);

-- Add updated_at trigger for projects table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at 
  BEFORE UPDATE ON projects 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_files_updated_at 
  BEFORE UPDATE ON project_files 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for projects (assuming RLS is enabled)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see projects from organizations they're members of
CREATE POLICY "Users can view organization projects" ON projects
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create projects in organizations where they're admin or owner
CREATE POLICY "Users can create organization projects" ON projects
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Policy: Users can update projects they own or are admin in the organization
CREATE POLICY "Users can update their projects" ON projects
  FOR UPDATE USING (
    owner_id = auth.uid() OR 
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Policy: Users can delete projects they own or are admin in the organization
CREATE POLICY "Users can delete their projects" ON projects
  FOR DELETE USING (
    owner_id = auth.uid() OR 
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Policy: Users can view project files for projects they have access to
CREATE POLICY "Users can view project files" ON project_files
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE 
      organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can manage project files for projects they have access to
CREATE POLICY "Users can manage project files" ON project_files
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE 
      organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );