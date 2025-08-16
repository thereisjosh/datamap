#!/usr/bin/env tsx

import { config } from 'dotenv';
import { getDb } from '../lib/db';
import { member, user } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Load environment variables
config({ path: '.env.local' });

async function testMemberQuery() {
  console.log('🧪 Testing member query with Drizzle ORM...');
  
  try {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection failed');
    }

    // Test 1: Simple select from member table
    console.log('\n1️⃣ Testing simple member select...');
    try {
      const members = await db
        .select()
        .from(member)
        .limit(3);
      console.log(`  ✅ Found ${members.length} members`);
      if (members.length > 0) {
        console.log('  📄 Sample member:', members[0]);
      }
    } catch (error) {
      console.error('  ❌ Simple member query failed:', error.message);
    }

    // Test 2: Member join with user
    console.log('\n2️⃣ Testing member-user join...');
    try {
      const membersWithUsers = await db
        .select({
          id: member.id,
          role: member.role,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          }
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .limit(3);
      console.log(`  ✅ Found ${membersWithUsers.length} members with users`);
      if (membersWithUsers.length > 0) {
        console.log('  📄 Sample joined record:', membersWithUsers[0]);
      }
    } catch (error) {
      console.error('  ❌ Member-user join failed:', error.message);
      console.error('  🔍 This is likely the same error we\'re seeing in the API');
    }

    // Test 3: Raw query to verify columns
    console.log('\n3️⃣ Testing raw query...');
    try {
      const rawMembers = await db.execute(`
        SELECT m.id, m.organization_id, m.user_id, m.role, u.name, u.email
        FROM member m
        INNER JOIN "user" u ON m.user_id = u.id
        LIMIT 3;
      `);
      console.log(`  ✅ Raw query successful, found ${rawMembers.rows.length} rows`);
      if (rawMembers.rows.length > 0) {
        console.log('  📄 Sample raw record:', rawMembers.rows[0]);
      }
    } catch (error) {
      console.error('  ❌ Raw query failed:', error.message);
    }

    // Test 4: Check schema fields vs column names
    console.log('\n4️⃣ Testing schema field mapping...');
    console.log('  📋 Member schema fields:');
    console.log('    - member.id (maps to column "id")');
    console.log('    - member.userId (maps to column "user_id")');
    console.log('    - member.organizationId (maps to column "organization_id")');
    console.log('    - member.role (maps to column "role")');
    console.log('    - member.createdAt (maps to column "created_at")');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testMemberQuery();