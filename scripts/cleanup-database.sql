-- Database Cleanup Script
-- Removes unnecessary backup tables and legacy data

-- Drop backup tables (no longer needed)
DROP TABLE IF EXISTS public.invitations_backup;
DROP TABLE IF EXISTS public.organization_members_backup;
DROP TABLE IF EXISTS public.organizations_backup;

-- Verify backup tables are removed
SELECT 'Backup tables cleanup completed' as status;

-- Add comments for remaining essential tables
COMMENT ON TABLE public.user IS 'BetterAuth user accounts';
COMMENT ON TABLE public.session IS 'BetterAuth user sessions with organization context';
COMMENT ON TABLE public.account IS 'BetterAuth OAuth provider accounts';
COMMENT ON TABLE public.verification IS 'BetterAuth email verification tokens';
COMMENT ON TABLE public.organization IS 'Multi-tenant organizations';
COMMENT ON TABLE public.member IS 'Organization membership and roles';
COMMENT ON TABLE public.invitation IS 'Organization invitations';
COMMENT ON TABLE public.projects IS 'User projects within organizations';
COMMENT ON TABLE public.project_files IS 'Project file storage and ERD data';
COMMENT ON TABLE public.tables IS 'ERD table definitions (legacy but active)';
COMMENT ON TABLE public.relationships IS 'ERD relationships (legacy but active)';
COMMENT ON TABLE public.upload_sessions IS 'File upload session tracking';

-- Verify tables exist after cleanup
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;