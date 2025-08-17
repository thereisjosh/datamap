import { getDb } from "../lib/db";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
const { organization, invitation: invitationTable, member } = schema;
// Organization operations handled by custom API - see server/organization-api.ts
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";
import type { 
  Table, 
  InsertTable, 
  Relationship, 
  InsertRelationship, 
  UploadSession, 
  InsertUploadSession, 
  Project, 
  InsertProject, 
  ProjectFile, 
  InsertProjectFile 
} from "@shared/schema";

export class DatabaseStorage implements IStorage {
  
  // Table operations
  async createTable(insertTable: InsertTable): Promise<Table> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [table] = await db.insert(schema.tables).values({
      id: randomUUID(),
      name: insertTable.name,
      attributes: insertTable.attributes,
      projectId: insertTable.projectId || null,
      organizationId: insertTable.organizationId || null,
    }).returning();

    return {
      id: table.id,
      name: table.name,
      attributes: table.attributes,
      projectId: table.projectId,
      organizationId: table.organizationId,
      createdAt: table.createdAt || new Date(),
    };
  }

  async getTables(organizationId?: string): Promise<Table[]> {
    const db = await getDb();
    if (!db) return [];

    let query = db.select().from(schema.tables);
    
    // Filter by organizationId for multi-tenant security if provided
    if (organizationId) {
      query = query.where(eq(schema.tables.organizationId, organizationId));
    }

    const tables = await query;
    return tables.map(table => ({
      id: table.id,
      name: table.name,
      attributes: table.attributes,
      projectId: table.projectId,
      organizationId: table.organizationId,
      createdAt: table.createdAt || new Date(),
    }));
  }

  async getTablesBySession(sessionId: string): Promise<Table[]> {
    // For now, return all tables since we don't have session-specific filtering
    return this.getTables();
  }

  async clearTables(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.delete(schema.tables);
  }

  // Relationship operations
  async createRelationship(insertRelationship: InsertRelationship): Promise<Relationship> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [relationship] = await db.insert(schema.relationships).values({
      id: randomUUID(),
      sourceTable: insertRelationship.sourceTable,
      sourceColumn: insertRelationship.sourceColumn,
      targetTable: insertRelationship.targetTable,
      targetColumn: insertRelationship.targetColumn,
      projectId: insertRelationship.projectId || null,
      organizationId: insertRelationship.organizationId || null,
    }).returning();

    return {
      id: relationship.id,
      sourceTable: relationship.sourceTable,
      sourceColumn: relationship.sourceColumn,
      targetTable: relationship.targetTable,
      targetColumn: relationship.targetColumn,
      projectId: relationship.projectId,
      organizationId: relationship.organizationId,
      createdAt: relationship.createdAt || new Date(),
    };
  }

  async getRelationships(organizationId?: string): Promise<Relationship[]> {
    const db = await getDb();
    if (!db) return [];

    let query = db.select().from(schema.relationships);
    
    // Filter by organizationId for multi-tenant security if provided
    if (organizationId) {
      query = query.where(eq(schema.relationships.organizationId, organizationId));
    }

    const relationships = await query;
    return relationships.map(rel => ({
      id: rel.id,
      sourceTable: rel.sourceTable,
      sourceColumn: rel.sourceColumn,
      targetTable: rel.targetTable,
      targetColumn: rel.targetColumn,
      projectId: rel.projectId,
      organizationId: rel.organizationId,
      createdAt: rel.createdAt || new Date(),
    }));
  }

  async clearRelationships(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.delete(schema.relationships);
  }

  // Upload session operations
  async createUploadSession(insertSession: InsertUploadSession): Promise<UploadSession> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [session] = await db.insert(schema.uploadSessions).values({
      id: randomUUID(),
      filename: insertSession.filename,
      status: insertSession.status,
      tablesCount: insertSession.tablesCount || null,
      relationshipsCount: insertSession.relationshipsCount || null,
      errors: insertSession.errors || null,
      projectId: insertSession.projectId || null,
    }).returning();

    return {
      id: session.id,
      filename: session.filename,
      status: session.status,
      tablesCount: session.tablesCount,
      relationshipsCount: session.relationshipsCount,
      errors: session.errors,
      projectId: session.projectId,
      createdAt: session.createdAt || new Date(),
    };
  }

  async getUploadSession(id: string): Promise<UploadSession | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const [session] = await db.select().from(schema.uploadSessions).where(eq(schema.uploadSessions.id, id));
    if (!session) return undefined;

    return {
      id: session.id,
      filename: session.filename,
      status: session.status,
      tablesCount: session.tablesCount,
      relationshipsCount: session.relationshipsCount,
      errors: session.errors,
      projectId: session.projectId,
      createdAt: session.createdAt || new Date(),
    };
  }

  async updateUploadSession(id: string, updates: Partial<InsertUploadSession>): Promise<UploadSession> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [session] = await db.update(schema.uploadSessions)
      .set(updates)
      .where(eq(schema.uploadSessions.id, id))
      .returning();

    return {
      id: session.id,
      filename: session.filename,
      status: session.status,
      tablesCount: session.tablesCount,
      relationshipsCount: session.relationshipsCount,
      errors: session.errors,
      projectId: session.projectId,
      createdAt: session.createdAt || new Date(),
    };
  }

  // Project operations
  async createProject(insertProject: InsertProject): Promise<Project> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection not available');
    }

    // Get or create default organization if organizationId is 'default'
    let orgId = insertProject.organizationId;
    if (orgId === 'default') {
      // Find existing default organization or get the first one
      const orgs = await db.select().from(schema.organization).limit(1);
      if (orgs.length > 0) {
        orgId = orgs[0].id;
      } else {
        // Create a default organization
        const [newOrg] = await db.insert(schema.organization).values({
          name: 'Default Organization',
          domain: 'localhost',
          subscription_tier: 'free',
        }).returning();
        orgId = newOrg.id;
      }
    }

    const [project] = await db.insert(schema.projects).values({
      name: insertProject.name,
      description: insertProject.description || null,
      organizationId: orgId,
      ownerId: insertProject.ownerId,
      status: 'active',
      settings: insertProject.settings || {},
    }).returning();

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      organizationId: project.organizationId,
      ownerId: project.ownerId,
      status: project.status,
      settings: project.settings,
      createdAt: project.createdAt || new Date(),
      updatedAt: project.updatedAt || new Date(),
    };
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    // Check if user has access to this project through organization membership
    const [result] = await db
      .select({
        project: schema.projects
      })
      .from(schema.projects)
      .innerJoin(member, eq(schema.projects.organizationId, member.organizationId))
      .where(and(
        eq(schema.projects.id, id),
        eq(member.userId, userId)
      ))
      .limit(1);

    if (!result) return undefined;
    const project = result.project;

    if (!project) return undefined;

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      organizationId: project.organizationId,
      ownerId: project.ownerId,
      status: project.status,
      settings: project.settings,
      createdAt: project.createdAt || new Date(),
      updatedAt: project.updatedAt || new Date(),
    };
  }

  async getProjectsByOrganization(userId: string): Promise<Project[]> {
    const db = await getDb();
    if (!db) return [];

    // Get all projects in organizations where the user is a member
    const projects = await db
      .select({
        project: schema.projects
      })
      .from(schema.projects)
      .innerJoin(member, eq(schema.projects.organizationId, member.organizationId))
      .where(eq(member.userId, userId));

    return projects.map(({ project }) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      organizationId: project.organizationId,
      ownerId: project.ownerId,
      status: project.status,
      settings: project.settings,
      createdAt: project.createdAt || new Date(),
      updatedAt: project.updatedAt || new Date(),
    }));
  }

  async updateProject(id: string, updates: Partial<InsertProject>, userId: string): Promise<Project | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const [project] = await db.update(schema.projects)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.projects.id, id),
        eq(schema.projects.ownerId, userId)
      ))
      .returning();

    if (!project) return undefined;

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      organizationId: project.organizationId,
      ownerId: project.ownerId,
      status: project.status,
      settings: project.settings,
      createdAt: project.createdAt || new Date(),
      updatedAt: project.updatedAt || new Date(),
    };
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    const result = await db.delete(schema.projects)
      .where(and(
        eq(schema.projects.id, id),
        eq(schema.projects.ownerId, userId)
      ));

    return result.length > 0;
  }

  // Project file operations
  async saveProjectFile(insertProjectFile: InsertProjectFile): Promise<ProjectFile> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [projectFile] = await db.insert(schema.projectFiles).values({
      id: randomUUID(),
      projectId: insertProjectFile.projectId,
      filename: insertProjectFile.filename,
      fileData: insertProjectFile.fileData || {},
      erdData: insertProjectFile.erdData || {},
      mermaidCode: insertProjectFile.mermaidCode || null,
      version: insertProjectFile.version || '1',
    }).returning();

    return {
      id: projectFile.id,
      projectId: projectFile.projectId,
      filename: projectFile.filename,
      fileData: projectFile.fileData,
      erdData: projectFile.erdData,
      mermaidCode: projectFile.mermaidCode,
      version: projectFile.version,
      createdAt: projectFile.createdAt || new Date(),
      updatedAt: projectFile.updatedAt || new Date(),
    };
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const db = await getDb();
    if (!db) return [];

    const projectFiles = await db.select().from(schema.projectFiles)
      .where(eq(schema.projectFiles.projectId, projectId));

    return projectFiles.map(file => ({
      id: file.id,
      projectId: file.projectId,
      filename: file.filename,
      fileData: file.fileData,
      erdData: file.erdData,
      mermaidCode: file.mermaidCode,
      version: file.version,
      createdAt: file.createdAt || new Date(),
      updatedAt: file.updatedAt || new Date(),
    }));
  }

  async updateProjectFile(projectId: string, updates: Partial<InsertProjectFile>): Promise<ProjectFile | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    try {
      // Find the most recent project file for this project
      const projectFiles = await this.getProjectFiles(projectId);
      if (projectFiles.length === 0) {
        return undefined;
      }

      // Sort by updatedAt to get the most recent file
      const latestFile = projectFiles.sort((a, b) => 
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      )[0];

      // Update the file in the database
      const [updatedFile] = await db
        .update(schema.projectFiles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(schema.projectFiles.id, latestFile.id))
        .returning();

      if (!updatedFile) {
        return undefined;
      }

      return {
        id: updatedFile.id,
        projectId: updatedFile.projectId,
        filename: updatedFile.filename,
        fileData: updatedFile.fileData,
        erdData: updatedFile.erdData,
        mermaidCode: updatedFile.mermaidCode,
        version: updatedFile.version,
        createdAt: updatedFile.createdAt || new Date(),
        updatedAt: updatedFile.updatedAt || new Date(),
      };
    } catch (error) {
      console.error('Error updating project file:', error);
      return undefined;
    }
  }

  // Enhanced table/relationship operations with project context
  async storeTables(tables: any[], projectId?: string, organizationId?: string): Promise<void> {
    for (const table of tables) {
      const insertTable: InsertTable = {
        name: table.name,
        attributes: table.attributes || table.columns,
        projectId: projectId || null,
        organizationId: organizationId || null,
      };
      await this.createTable(insertTable);
    }
  }

  async storeRelationships(relationships: any[], projectId?: string, organizationId?: string): Promise<void> {
    for (const relationship of relationships) {
      const insertRelationship: InsertRelationship = {
        sourceTable: relationship.sourceTable,
        sourceColumn: relationship.sourceColumn,
        targetTable: relationship.targetTable,
        targetColumn: relationship.targetColumn,
        projectId: projectId || null,
        organizationId: organizationId || null,
      };
      await this.createRelationship(insertRelationship);
    }
  }

  async clearProjectTables(projectId: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.delete(schema.tables).where(eq(schema.tables.projectId, projectId));
      console.log(`Cleared tables for project: ${projectId}`);
    } catch (error) {
      console.error('Error clearing project tables:', error);
    }
  }

  async clearProjectRelationships(projectId: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.delete(schema.relationships).where(eq(schema.relationships.projectId, projectId));
      console.log(`Cleared relationships for project: ${projectId}`);
    } catch (error) {
      console.error('Error clearing project relationships:', error);
    }
  }

  // Get project statistics (table/relationship counts)
  async getProjectStatistics(projectId: string): Promise<{ tables_count: number; relationships_count: number }> {
    const db = await getDb();
    if (!db) {
      return { tables_count: 0, relationships_count: 0 };
    }

    // Get project files first (most accurate)
    const projectFiles = await this.getProjectFiles(projectId);
    
    if (projectFiles.length > 0) {
      // Use the most recent project file
      const latestFile = projectFiles.sort((a, b) => 
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      )[0];
      
      if (latestFile.erdData && typeof latestFile.erdData === 'object') {
        const erdData = latestFile.erdData as any;
        const tables = erdData.tables || [];
        const relationships = erdData.relationships || [];
        
        return {
          tables_count: tables.length,
          relationships_count: relationships.length
        };
      }
    }
    
    // Fallback to legacy storage - use SQL count
    const [tablesResult] = await db.select({
      count: sql<number>`count(*)`
    }).from(schema.tables).where(eq(schema.tables.projectId, projectId));
    
    const [relationshipsResult] = await db.select({
      count: sql<number>`count(*)`
    }).from(schema.relationships).where(eq(schema.relationships.projectId, projectId));
    
    return {
      tables_count: Number(tablesResult?.count || 0),
      relationships_count: Number(relationshipsResult?.count || 0)
    };
  }

  // Organization operations moved to custom API endpoints

  // Invitation operations
  async createInvitation(invitation: any): Promise<any> {
    const db = await getDb();
    if (!db) return undefined;

    try {
      const [newInvitation] = await db.insert(invitationTable).values({
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        inviterId: invitation.inviterId,
        expiresAt: invitation.expiresAt,
        status: invitation.status
      }).returning();

      return {
        id: newInvitation.id,
        organizationId: newInvitation.organizationId,
        email: newInvitation.email,
        role: newInvitation.role,
        token: newInvitation.token,
        status: newInvitation.status,
        createdBy: newInvitation.createdBy,
        expiresAt: newInvitation.expiresAt,
        createdAt: newInvitation.createdAt,
      };
    } catch (error) {
      console.error('Error creating invitation:', error);
      return undefined;
    }
  }

  async getInvitationsByOrganization(organizationId: string): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const results = await db.select().from(invitationTable)
        .where(eq(invitationTable.organizationId, organizationId));

      return results.map(inv => ({
        id: inv.id,
        organizationId: inv.organizationId,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        createdBy: inv.createdBy,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }));
    } catch (error) {
      console.error('Error fetching invitations:', error);
      return [];
    }
  }

  async getInvitationByToken(token: string): Promise<any | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    try {
      const [invitationResult] = await db.select().from(invitationTable)
        .where(eq(invitationTable.token, token));

      if (!invitationResult) return undefined;

      return {
        id: invitationResult.id,
        organizationId: invitationResult.organizationId,
        email: invitationResult.email,
        role: invitationResult.role,
        status: invitationResult.status,
        createdBy: invitationResult.createdBy,
        expiresAt: invitationResult.expiresAt,
        createdAt: invitationResult.createdAt,
      };
    } catch (error) {
      console.error('Error fetching invitation by token:', error);
      return undefined;
    }
  }

  async updateInvitationStatus(id: string, status: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      const result = await db.update(invitationTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(invitationTable.id, id));

      return result.length > 0;
    } catch (error) {
      console.error('Error updating invitation status:', error);
      return false;
    }
  }

  async deleteInvitation(id: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) {
      return { success: false, error: 'Database connection not available' };
    }

    try {
      // First check if the invitation exists
      const existingInvitation = await db.select()
        .from(invitationTable)
        .where(eq(invitationTable.id, id))
        .limit(1);

      if (existingInvitation.length === 0) {
        console.log(`⚠️ Invitation not found for deletion: ${id}`);
        return { success: false, error: 'Invitation not found' };
      }

      console.log(`🗑️ Deleting invitation: ${id} (${existingInvitation[0].email})`);

      // Delete the invitation
      const result = await db.delete(invitationTable)
        .where(eq(invitationTable.id, id));
      
      // For Drizzle PostgreSQL, an empty array means the delete was successful
      // but no rows were returned (which is expected for delete operations)
      const success = result !== null && result !== undefined;
      if (success) {
        console.log(`✅ Invitation deleted successfully: ${id}`);
      } else {
        console.log(`❌ Failed to delete invitation: ${id}`);
      }

      return { success, error: success ? undefined : 'Failed to delete invitation' };
    } catch (error) {
      console.error('Error deleting invitation:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown deletion error' 
      };
    }
  }

  async createOrganizationMembership(userId: string, organizationId: string, role: string): Promise<any> {
    const db = await getDb();
    if (!db) return undefined;

    try {
      // Check if membership already exists
      const [existingMembership] = await db.select().from(member)
        .where(and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId)
        ));

      if (existingMembership) {
        console.log(`⚠️ User ${userId} is already a member of organization ${organizationId} with role ${existingMembership.role}`);
        return {
          id: existingMembership.id,
          userId: existingMembership.userId,
          organizationId: existingMembership.organizationId,
          role: existingMembership.role,
          joinedAt: existingMembership.createdAt
        };
      }

      const [newMembership] = await db.insert(member).values({
        id: randomUUID(),
        userId,
        organizationId,
        role,
        createdAt: new Date()
      }).returning();

      console.log(`✅ Created organization membership: ${userId} → ${organizationId} as ${role}`);
      
      return {
        id: newMembership.id,
        userId: newMembership.userId,
        organizationId: newMembership.organizationId,
        role: newMembership.role,
        joinedAt: newMembership.createdAt
      };

    } catch (error) {
      console.error('Error creating organization membership:', error);
      return undefined;
    }
  }

  // Organization membership operations moved to custom API endpoints
  // BetterAuth provides: addMember, removeMember, updateMemberRole, etc.
}