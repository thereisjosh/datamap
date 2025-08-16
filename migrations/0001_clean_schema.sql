-- Clean Database Schema Migration
-- This migration removes unnecessary tables and implements a clean BetterAuth + ERD schema

-- Step 1: Drop legacy/duplicate tables
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.erd_data CASCADE;  
DROP TABLE IF EXISTS public.erd_projects CASCADE;
DROP TABLE IF EXISTS public.project_access CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Step 2: Drop existing BetterAuth tables to recreate with proper constraints
DROP TABLE IF EXISTS public.account CASCADE;
DROP TABLE IF EXISTS public.session CASCADE;
DROP TABLE IF EXISTS public.user CASCADE;
DROP TABLE IF EXISTS public.verification CASCADE;

-- Step 3: Create clean BetterAuth schema with standardized timestamps
CREATE TABLE public.user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  emailVerified boolean NOT NULL DEFAULT false,
  image text,
  createdAt timestamp with time zone NOT NULL DEFAULT now(),
  updatedAt timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.session (
  id text PRIMARY KEY,
  expiresAt timestamp with time zone NOT NULL,
  token text NOT NULL UNIQUE,
  createdAt timestamp with time zone NOT NULL DEFAULT now(),
  updatedAt timestamp with time zone NOT NULL DEFAULT now(),
  ipAddress text,
  userAgent text,
  userId text NOT NULL REFERENCES public.user(id) ON DELETE CASCADE
);

CREATE TABLE public.account (
  id text PRIMARY KEY,
  accountId text NOT NULL,
  providerId text NOT NULL,
  userId text NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  accessToken text,
  refreshToken text,
  idToken text,
  accessTokenExpiresAt timestamp with time zone,
  refreshTokenExpiresAt timestamp with time zone,
  scope text,
  password text,
  createdAt timestamp with time zone NOT NULL DEFAULT now(),
  updatedAt timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expiresAt timestamp with time zone NOT NULL,
  createdAt timestamp with time zone NOT NULL DEFAULT now(),
  updatedAt timestamp with time zone NOT NULL DEFAULT now()
);

-- Step 4: Recreate essential application tables with proper timestamps
DROP TABLE IF EXISTS public.organizations CASCADE;
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  domain varchar NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  settings jsonb DEFAULT '{}'::jsonb
);

DROP TABLE IF EXISTS public.organization_members CASCADE;
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Step 5: Keep essential ERD tables with proper timestamps  
-- (tables and relationships are already properly defined, just update timestamps if needed)
ALTER TABLE public.tables ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
ALTER TABLE public.relationships ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
ALTER TABLE public.upload_sessions ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';

-- Step 6: Enable Row Level Security
ALTER TABLE public.user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS Policies

-- Users can only see their own user record
CREATE POLICY "Users can view own profile" ON public.user FOR SELECT USING (id = auth.uid()::text);
CREATE POLICY "Users can update own profile" ON public.user FOR UPDATE USING (id = auth.uid()::text);

-- Sessions: Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON public.session FOR SELECT USING (userId = auth.uid()::text);
CREATE POLICY "Users can manage own sessions" ON public.session FOR ALL USING (userId = auth.uid()::text);

-- Accounts: Users can only see their own accounts
CREATE POLICY "Users can view own accounts" ON public.account FOR SELECT USING (userId = auth.uid()::text);
CREATE POLICY "Users can manage own accounts" ON public.account FOR ALL USING (userId = auth.uid()::text);

-- Organizations: Users can only see organizations they belong to
CREATE POLICY "Users can view member organizations" ON public.organizations FOR SELECT 
USING (id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()::text
));

CREATE POLICY "Org owners can update organization" ON public.organizations FOR UPDATE 
USING (id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()::text AND role = 'owner'
));

-- Organization Members: Users can see memberships for their organizations
CREATE POLICY "Users can view org memberships" ON public.organization_members FOR SELECT
USING (
  user_id = auth.uid()::text OR 
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Org admins can manage memberships" ON public.organization_members FOR ALL
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
));

-- Tables: Scoped to user's organizations (for now, allow full access - can restrict later)
CREATE POLICY "Users can manage tables" ON public.tables FOR ALL USING (true);
CREATE POLICY "Users can manage relationships" ON public.relationships FOR ALL USING (true);
CREATE POLICY "Users can manage upload sessions" ON public.upload_sessions FOR ALL USING (true);

-- Step 8: Create indexes for performance
CREATE INDEX idx_user_email ON public.user(email);
CREATE INDEX idx_session_token ON public.session(token);
CREATE INDEX idx_session_user_id ON public.session(userId);
CREATE INDEX idx_account_user_id ON public.account(userId);
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.organization_members(organization_id);

-- Step 9: Insert a default organization for development
INSERT INTO public.organizations (id, name, domain) 
VALUES (gen_random_uuid(), 'Personal Workspace', 'localhost')
ON CONFLICT (domain) DO NOTHING;

COMMIT;