import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function createInvitationsTable() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ No database connection string found');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');
  const sql = postgres(connectionString, {
    ssl: 'prefer',
    max: 1
  });

  try {
    await sql`SELECT 1`;
    console.log('✅ Connected to PostgreSQL database\n');

    // Create invitations table
    console.log('📝 Creating invitations table...');
    await sql`
      CREATE TABLE IF NOT EXISTS invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create indexes for better performance
    console.log('📝 Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at)`;

    // Add constraint to prevent duplicate pending invitations
    console.log('📝 Adding unique constraint...');
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_pending 
      ON invitations(organization_id, email) 
      WHERE status = 'pending'
    `;

    console.log('✅ Invitations table created successfully!');

    // Verify the table structure
    console.log('\n🔍 Verifying table structure...');
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'invitations'
      ORDER BY ordinal_position
    `;
    
    console.log('Table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sql.end();
  }
}

createInvitationsTable();