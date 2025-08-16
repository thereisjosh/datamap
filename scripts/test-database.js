import dotenv from 'dotenv';
import { DatabaseStorage } from '../server/database-storage.ts';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testDatabase() {
  console.log('🧪 Testing Database Integration...');
  
  const storage = new DatabaseStorage();
  
  try {
    // Test 0: Create test user first (insert directly into database)
    console.log('\n👤 Test 0: Create Test User');
    const { getDb } = await import('../lib/db.ts');
    const db = await getDb();
    if (db) {
      await db.query.user.findFirst(); // Just test the connection
      // Insert test user if not exists (using raw SQL to avoid schema conflicts)
      try {
        await db.execute(
          `INSERT INTO "user" (id, name, email, "emailVerified") 
           VALUES ('default-user', 'Test User', 'test@example.com', false) 
           ON CONFLICT (id) DO NOTHING`
        );
        console.log('✅ Test user created/verified');
      } catch (userError) {
        console.log('ℹ️  User might already exist, continuing...');
      }
    }

    // Test 1: Create a project
    console.log('\n📝 Test 1: Create Project');
    const project = await storage.createProject({
      name: 'Test ERD Project',
      description: 'Testing database integration',
      organizationId: 'default', // This will use/create default organization
      ownerId: 'default-user',
      settings: {}
    });
    console.log('✅ Project created:', project.id, project.name);

    // Test 2: Save project file with ERD data
    console.log('\n💾 Test 2: Save Project File');
    const projectFile = await storage.saveProjectFile({
      projectId: project.id,
      filename: 'test_data.xlsx',
      erdData: {
        tables: [
          { name: 'User', columns: [{ name: 'id', type: 'int', isPrimaryKey: true }] },
          { name: 'Order', columns: [{ name: 'id', type: 'int', isPrimaryKey: true }] }
        ],
        relationships: [
          { sourceTable: 'Order', sourceColumn: 'user_id', targetTable: 'User', targetColumn: 'id' }
        ]
      },
      mermaidCode: `erDiagram
        User {
          int id PK
        }
        Order {
          int id PK
          int user_id FK
        }
        User ||--o{ Order : has`
    });
    console.log('✅ Project file saved:', projectFile.id);

    // Test 3: Retrieve project statistics
    console.log('\n📊 Test 3: Get Project Statistics');
    const stats = await storage.getProjectStatistics(project.id);
    console.log('✅ Statistics:', stats);

    // Test 4: Get all projects
    console.log('\n📋 Test 4: Get Projects');
    const projects = await storage.getProjectsByOrganization('default-user');
    console.log('✅ Found projects:', projects.length);

    // Test 5: Get project files
    console.log('\n🗂️  Test 5: Get Project Files');
    const files = await storage.getProjectFiles(project.id);
    console.log('✅ Project files:', files.length);
    if (files.length > 0) {
      console.log('   - ERD Tables:', files[0].erdData?.tables?.length || 0);
      console.log('   - Mermaid Code Length:', files[0].mermaidCode?.length || 0);
    }

    console.log('\n🎉 All database tests passed!');

  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  }
}

testDatabase();