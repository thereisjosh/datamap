import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function createMissingProject() {
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
    // Test connection
    await sql`SELECT 1`;
    console.log('✅ Connected to PostgreSQL database\n');

    // Project details based on previous data
    const projectId = 'e397ceb7-2a6b-4555-ae53-41a12ad8a4de';
    const projectName = 'GSG Data Dictionary';
    const organizationId = '89dfe569-aad3-4703-80e5-0d5e5500b7f0';
    const userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // The user ID we found earlier

    // Check if project already exists
    console.log('🔍 Checking if project already exists...');
    const existing = await sql`
      SELECT id FROM projects WHERE id = ${projectId}
    `;

    if (existing.length > 0) {
      console.log('✅ Project already exists, no need to create');
      return;
    }

    // Create the missing project
    console.log('📝 Creating missing project...');
    const [project] = await sql`
      INSERT INTO projects (
        id,
        name,
        description,
        organization_id,
        owner_id,
        status,
        settings,
        created_at,
        updated_at
      ) VALUES (
        ${projectId},
        ${projectName},
        'Excel data import project',
        ${organizationId},
        ${userId},
        'active',
        '{}',
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    console.log('✅ Project created successfully!');
    console.log('Project details:', {
      id: project.id,
      name: project.name,
      owner_id: project.owner_id,
      organization_id: project.organization_id
    });

    // Verify the data is now properly linked
    console.log('\n🔍 Verifying data linkage...');
    
    const tablesCount = await sql`
      SELECT COUNT(*) as count FROM tables WHERE project_id = ${projectId}
    `;
    console.log(`  - Tables linked to project: ${tablesCount[0].count}`);
    
    const relationshipsCount = await sql`
      SELECT COUNT(*) as count FROM relationships WHERE project_id = ${projectId}
    `;
    console.log(`  - Relationships linked to project: ${relationshipsCount[0].count}`);
    
    const filesCount = await sql`
      SELECT COUNT(*) as count FROM project_files WHERE project_id = ${projectId}
    `;
    console.log(`  - Project files linked: ${filesCount[0].count}`);

    // If no project files exist, create one to maintain consistency
    if (parseInt(filesCount[0].count) === 0 && parseInt(tablesCount[0].count) > 0) {
      console.log('\n📝 Creating project file record...');
      
      // Get tables and relationships data
      const tables = await sql`
        SELECT name, attributes FROM tables WHERE project_id = ${projectId}
      `;
      const relationships = await sql`
        SELECT source_table, source_column, target_table, target_column 
        FROM relationships WHERE project_id = ${projectId}
      `;

      const [projectFile] = await sql`
        INSERT INTO project_files (
          project_id,
          filename,
          file_data,
          erd_data,
          mermaid_code,
          version,
          created_at,
          updated_at
        ) VALUES (
          ${projectId},
          'uploaded_data.xlsx',
          '{}',
          ${JSON.stringify({ tables, relationships })},
          '',
          '1',
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      console.log('✅ Project file created:', projectFile.id);
    }

    console.log('\n✅ Missing project has been successfully created and linked to existing data!');

  } catch (error) {
    console.error('❌ Error creating project:', error);
  } finally {
    await sql.end();
  }
}

createMissingProject();