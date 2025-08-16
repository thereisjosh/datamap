-- Add description column to organizations table
-- Migration: 0002_add_organization_description.sql

ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS description text;

-- Update any existing records to have NULL description (which is fine)
-- No need to update existing records as NULL is acceptable for this field