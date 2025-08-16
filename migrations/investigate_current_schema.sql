-- Diagnostic queries to investigate current database schema
-- Run these queries to understand the current state before migration

-- 1. Check what tables currently exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('organizations', 'organization_members', 'organization', 'member', 'invitations')
ORDER BY table_name;

-- 2. Check all foreign key constraints on organization-related tables
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('organizations', 'organization_members', 'organization', 'member', 'invitations')
ORDER BY tc.table_name, tc.constraint_name;

-- 3. Check table structure for organization-related tables
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name IN ('organizations', 'organization_members', 'organization', 'member', 'invitations')
ORDER BY table_name, ordinal_position;

-- 4. Check indexes on organization-related tables
SELECT 
    t.relname AS table_name,
    i.relname AS index_name,
    a.attname AS column_name
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname IN ('organizations', 'organization_members', 'organization', 'member', 'invitations')
ORDER BY t.relname, i.relname;