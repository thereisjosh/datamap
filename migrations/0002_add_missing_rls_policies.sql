-- Add missing RLS policies for user, session, and verification tables
-- These tables contain sensitive data and need proper row-level security

-- Enable RLS on user table
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;

-- User policies: users can only see their own user record
CREATE POLICY "Users can view their own profile" ON "user"
  FOR SELECT
  USING (
    id = current_setting('app.current_user_id', true)
  );

CREATE POLICY "Users can update their own profile" ON "user"
  FOR UPDATE
  USING (
    id = current_setting('app.current_user_id', true)
  );

-- Enable RLS on session table
ALTER TABLE session ENABLE ROW LEVEL SECURITY;

-- Session policies: users can only see their own sessions
CREATE POLICY "Users can view their own sessions" ON session
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)
  );

CREATE POLICY "Users can manage their own sessions" ON session
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)
  );

-- Enable RLS on verification table
ALTER TABLE verification ENABLE ROW LEVEL SECURITY;

-- Verification policies: allow access for verification flows
-- Note: Verification tokens are typically accessed by email/identifier, not user_id
-- We need to allow broader access for email verification flows to work
CREATE POLICY "Allow verification token access" ON verification
  FOR ALL
  USING (true); -- Verification tokens need broader access for email flows

-- Alternative more restrictive policy (commented out):
-- This would be more secure but might break email verification flows
-- CREATE POLICY "Users can access verification by identifier" ON verification
--   FOR SELECT
--   USING (
--     identifier = current_setting('app.current_user_email', true)
--   );

-- Add index for performance on user sessions
CREATE INDEX IF NOT EXISTS idx_session_user_id 
ON session (user_id);

-- Add index for performance on verification lookups
CREATE INDEX IF NOT EXISTS idx_verification_identifier 
ON verification (identifier);

-- Add comments for documentation
COMMENT ON POLICY "Users can view their own profile" ON "user" IS 'Allows users to read their own user profile data';
COMMENT ON POLICY "Users can update their own profile" ON "user" IS 'Allows users to update their own profile information';
COMMENT ON POLICY "Users can view their own sessions" ON session IS 'Allows users to view only their own active sessions';
COMMENT ON POLICY "Users can manage their own sessions" ON session IS 'Allows users to create/update/delete their own sessions';
COMMENT ON POLICY "Allow verification token access" ON verification IS 'Allows access to verification tokens for email flows - consider restricting further based on app needs';