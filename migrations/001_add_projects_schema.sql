-- Migration: Add missing projects and project_files tables
-- This migration adds the core project management schema that was missing from the database

-- 1. Create projects table
-- Note: owner_id uses text type to match existing user.id type
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  organization_id uuid NOT NULL,
  owner_id text NOT NULL,  -- text type to match user.id
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public."user"(id) ON DELETE CASCADE
);

-- 2. Create project_files table - CRITICAL for ERD data storage
-- This table stores the actual ERD data (tables, relationships) and generated Mermaid code
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  filename text NOT NULL,
  file_data jsonb,  -- Original uploaded file data (optional)
  erd_data jsonb,   -- CRITICAL: Processed ERD data (tables, relationships)
  mermaid_code text, -- CRITICAL: Generated Mermaid diagram code
  version text NOT NULL DEFAULT '1',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_files_pkey PRIMARY KEY (id),
  CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

-- 3. Add missing project_id columns to existing tables
-- This allows linking existing tables to specific projects

-- Add project_id to tables
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tables' AND column_name = 'project_id') THEN
    ALTER TABLE public.tables ADD COLUMN project_id uuid;
    ALTER TABLE public.tables ADD CONSTRAINT tables_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add project_id to relationships
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'relationships' AND column_name = 'project_id') THEN
    ALTER TABLE public.relationships ADD COLUMN project_id uuid;
    ALTER TABLE public.relationships ADD CONSTRAINT relationships_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add project_id to upload_sessions
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'upload_sessions' AND column_name = 'project_id') THEN
    ALTER TABLE public.upload_sessions ADD COLUMN project_id uuid;
    ALTER TABLE public.upload_sessions ADD CONSTRAINT upload_sessions_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Add missing subscription_tier column to organizations table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'subscription_tier') THEN
    ALTER TABLE public.organizations ADD COLUMN subscription_tier text NOT NULL DEFAULT 'free' 
      CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));
  END IF;
END $$;

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_tables_project_id ON public.tables(project_id);
CREATE INDEX IF NOT EXISTS idx_relationships_project_id ON public.relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_project_id ON public.upload_sessions(project_id);

-- 6. Insert a default organization if none exists (for testing)
INSERT INTO public.organizations (name, domain, subscription_tier, settings) 
VALUES ('Default Organization', 'localhost', 'free', '{}'::jsonb)
ON CONFLICT (domain) DO NOTHING;

COMMENT ON TABLE public.projects IS 'Core projects table storing project metadata';
COMMENT ON TABLE public.project_files IS 'Critical table storing ERD data (erd_data) and Mermaid diagrams (mermaid_code)';
COMMENT ON COLUMN public.project_files.erd_data IS 'JSON object containing tables and relationships data';
COMMENT ON COLUMN public.project_files.mermaid_code IS 'Generated Mermaid diagram code for ERD visualization';