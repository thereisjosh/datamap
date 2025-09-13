-- Create security_events table for audit logging and security monitoring
-- This table stores all security-related events for compliance and monitoring

-- Enable RLS on security_events table
ALTER TABLE IF EXISTS security_events DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS security_events;

CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR NOT NULL, -- auth_failure, rate_limit_exceeded, etc.
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organization(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  path TEXT NOT NULL,
  method VARCHAR NOT NULL,
  status_code REAL,
  details JSONB, -- Additional event details
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX security_events_event_type_idx ON security_events(event_type);
CREATE INDEX security_events_severity_idx ON security_events(severity);
CREATE INDEX security_events_user_idx ON security_events(user_id);
CREATE INDEX security_events_org_idx ON security_events(organization_id);
CREATE INDEX security_events_timestamp_idx ON security_events(timestamp);
CREATE INDEX security_events_ip_idx ON security_events(ip_address);

-- Enable RLS for multi-tenant security
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see events from their organization
CREATE POLICY "security_events_tenant_isolation" ON security_events
    FOR ALL 
    USING (
        organization_id::text = current_setting('app.current_organization_id', true)
        OR current_setting('app.bypass_rls', true)::boolean = true
    );

-- RLS Policy: System can bypass RLS for admin operations
CREATE POLICY "security_events_system_access" ON security_events
    FOR ALL 
    USING (current_setting('app.bypass_rls', true)::boolean = true);

-- Grant appropriate permissions
GRANT SELECT, INSERT ON security_events TO authenticated;
GRANT SELECT ON security_events TO service_role;

-- Create function to automatically set organization_id from user context
CREATE OR REPLACE FUNCTION set_security_event_org_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If organization_id is not set and we have user_id, try to get it from session
    IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
        SELECT active_organization_id INTO NEW.organization_id
        FROM session 
        WHERE user_id = NEW.user_id 
        ORDER BY created_at DESC 
        LIMIT 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically set organization_id
CREATE TRIGGER set_security_event_org_id_trigger
    BEFORE INSERT ON security_events
    FOR EACH ROW
    EXECUTE FUNCTION set_security_event_org_id();

-- Add comments for documentation
COMMENT ON TABLE security_events IS 'Stores security events and audit logs for compliance monitoring';
COMMENT ON COLUMN security_events.event_type IS 'Type of security event (auth_failure, rate_limit_exceeded, etc.)';
COMMENT ON COLUMN security_events.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN security_events.details IS 'JSON object containing additional event context and metadata';
COMMENT ON COLUMN security_events.timestamp IS 'When the security event occurred';

COMMIT;