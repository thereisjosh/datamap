import { type Table, type InsertTable, type Relationship, type InsertRelationship, type UploadSession, type InsertUploadSession, type Project, type InsertProject, type ProjectFile, type InsertProjectFile } from "@shared/schema";
import { randomUUID } from "crypto";
// Organization operations handled by custom API - see server/organization-api.ts
// TEMPORARY: Keep Organization type for backward compatibility during migration
import type { Organization } from "../lib/auth";

export interface IStorage {
  // Table operations
  createTable(table: InsertTable): Promise<Table>;
  getTables(organizationId?: string): Promise<Table[]>;
  getTablesBySession(sessionId: string): Promise<Table[]>;
  clearTables(): Promise<void>;

  // Relationship operations
  createRelationship(relationship: InsertRelationship): Promise<Relationship>;
  getRelationships(organizationId?: string): Promise<Relationship[]>;
  clearRelationships(): Promise<void>;

  // Upload session operations
  createUploadSession(session: InsertUploadSession): Promise<UploadSession>;
  getUploadSession(id: string): Promise<UploadSession | undefined>;
  updateUploadSession(id: string, updates: Partial<InsertUploadSession>): Promise<UploadSession>;

  // Project operations
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: string, userId: string): Promise<Project | undefined>;
  getProjectsByOrganization(userId: string): Promise<Project[]>;
  updateProject(id: string, updates: Partial<InsertProject>, userId: string): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<boolean>;

  // Project file operations
  saveProjectFile(projectFile: InsertProjectFile): Promise<ProjectFile>;
  updateProjectFile(projectId: string, updates: Partial<InsertProjectFile>): Promise<ProjectFile | undefined>;
  getProjectFiles(projectId: string): Promise<ProjectFile[]>;

  // Enhanced table/relationship operations with project context
  storeTables(tables: any[], projectId?: string, organizationId?: string): Promise<void>;
  storeRelationships(relationships: any[], projectId?: string, organizationId?: string): Promise<void>;
  clearProjectTables(projectId: string): Promise<void>;
  clearProjectRelationships(projectId: string): Promise<void>;
  
  // Transaction-safe replace operations
  replaceProjectTables?(tables: any[], projectId: string, organizationId?: string): Promise<void>;
  replaceProjectRelationships?(relationships: any[], projectId: string, organizationId?: string): Promise<void>;
  replaceProjectData?(tables: any[], relationships: any[], projectId: string, organizationId?: string): Promise<void>;

  // Organization operations moved to custom API endpoints
  
  // LEGACY: Invitation operations (will be migrated to BetterAuth)
  createInvitation(invitation: any): Promise<any>;
  getInvitationsByOrganization(organizationId: string): Promise<any[]>;
  getInvitationByToken(token: string): Promise<any | undefined>;
  updateInvitationStatus(id: string, status: string): Promise<boolean>;
  deleteInvitation(id: string): Promise<{ success: boolean; error?: string }>;
  createOrganizationMembership(userId: string, organizationId: string, role: string): Promise<any>;
}

export class MemStorage implements IStorage {
  private tables: Map<string, Table>;
  private relationships: Map<string, Relationship>;
  private uploadSessions: Map<string, UploadSession>;
  private projects: Map<string, Project>;
  private projectFiles: Map<string, ProjectFile>;

  constructor() {
    this.tables = new Map();
    this.relationships = new Map();
    this.uploadSessions = new Map();
    this.projects = new Map();
    this.projectFiles = new Map();
  }

  // Table operations
  async createTable(insertTable: InsertTable): Promise<Table> {
    const id = randomUUID();
    const table = { 
      ...insertTable, 
      id,
      createdAt: new Date(),
      projectId: insertTable.projectId || null,
      organizationId: insertTable.organizationId || null,
      attributes: Array.isArray(insertTable.attributes) ? insertTable.attributes : []
    } as Table;
    this.tables.set(id, table);
    return table;
  }

  async getTables(organizationId?: string): Promise<Table[]> {
    const tables = Array.from(this.tables.values());
    if (organizationId) {
      return tables.filter(table => table.organizationId === organizationId);
    }
    return tables;
  }

  async getTablesBySession(sessionId: string): Promise<Table[]> {
    // In this implementation, we'll return all tables since we don't have session linking
    // In a real implementation, we'd link tables to sessions
    return Array.from(this.tables.values());
  }

  async clearTables(): Promise<void> {
    this.tables.clear();
  }

  // Relationship operations
  async createRelationship(insertRelationship: InsertRelationship): Promise<Relationship> {
    const id = randomUUID();
    const relationship: Relationship = { 
      ...insertRelationship, 
      id,
      createdAt: new Date(),
      projectId: insertRelationship.projectId || null,
      organizationId: insertRelationship.organizationId || null
    };
    this.relationships.set(id, relationship);
    return relationship;
  }

  async getRelationships(organizationId?: string): Promise<Relationship[]> {
    const relationships = Array.from(this.relationships.values());
    if (organizationId) {
      return relationships.filter(relationship => relationship.organizationId === organizationId);
    }
    return relationships;
  }

  async clearRelationships(): Promise<void> {
    this.relationships.clear();
  }

  // Upload session operations
  async createUploadSession(insertSession: InsertUploadSession): Promise<UploadSession> {
    const id = randomUUID();
    const session: UploadSession = { 
      ...insertSession, 
      id,
      createdAt: new Date(),
      errors: insertSession.errors || null,
      tablesCount: insertSession.tablesCount || null,
      relationshipsCount: insertSession.relationshipsCount || null,
      projectId: insertSession.projectId || null
    };
    this.uploadSessions.set(id, session);
    return session;
  }

  async getUploadSession(id: string): Promise<UploadSession | undefined> {
    return this.uploadSessions.get(id);
  }

  async updateUploadSession(id: string, updates: Partial<InsertUploadSession>): Promise<UploadSession> {
    const existingSession = this.uploadSessions.get(id);
    if (!existingSession) {
      throw new Error(`Upload session with id ${id} not found`);
    }
    
    const updatedSession: UploadSession = { ...existingSession, ...updates };
    this.uploadSessions.set(id, updatedSession);
    return updatedSession;
  }

  // Project operations
  async createProject(insertProject: InsertProject): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
      ...insertProject,
      description: insertProject.description || null,
      settings: insertProject.settings || {},
    };
    
    this.projects.set(project.id, project);
    return project;
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const project = this.projects.get(id);
    // Check if user has access to this project (owner or organization member)
    if (project && project.ownerId === userId) {
      return project;
    }
    return undefined;
  }

  async getProjectsByOrganization(userId: string): Promise<Project[]> {
    // Simplified implementation: returns all projects owned by the user
    // Organization-based filtering not yet implemented
    const userProjects = Array.from(this.projects.values()).filter(
      project => project.ownerId === userId
    );
    return userProjects;
  }

  async updateProject(id: string, updates: Partial<InsertProject>, userId: string): Promise<Project | undefined> {
    const existingProject = await this.getProject(id, userId);
    if (!existingProject) {
      return undefined;
    }
    
    const updatedProject: Project = { 
      ...existingProject, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const project = await this.getProject(id, userId);
    if (!project) {
      return false;
    }
    
    // Delete associated project files
    const projectFiles = Array.from(this.projectFiles.values()).filter(
      pf => pf.projectId === id
    );
    projectFiles.forEach(pf => this.projectFiles.delete(pf.id));
    
    // Delete associated tables and relationships
    const projectTables = Array.from(this.tables.values()).filter(
      t => t.projectId === id
    );
    projectTables.forEach(t => this.tables.delete(t.id));
    
    const projectRelationships = Array.from(this.relationships.values()).filter(
      r => r.projectId === id
    );
    projectRelationships.forEach(r => this.relationships.delete(r.id));
    
    // Delete the project
    this.projects.delete(id);
    return true;
  }

  // Project file operations
  async saveProjectFile(insertProjectFile: InsertProjectFile): Promise<ProjectFile> {
    const projectFile: ProjectFile = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...insertProjectFile,
      version: insertProjectFile.version || '1',
      mermaidCode: insertProjectFile.mermaidCode || null,
      fileData: insertProjectFile.fileData || {},
      erdData: insertProjectFile.erdData || {},
    };
    
    this.projectFiles.set(projectFile.id, projectFile);
    return projectFile;
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return Array.from(this.projectFiles.values()).filter(
      pf => pf.projectId === projectId
    );
  }

  async updateProjectFile(projectId: string, updates: Partial<InsertProjectFile>): Promise<ProjectFile | undefined> {
    // Find the most recent project file for this project
    const projectFiles = await this.getProjectFiles(projectId);
    if (projectFiles.length === 0) {
      return undefined;
    }
    
    // Get the most recent file (sorted by updatedAt)
    const latestFile = projectFiles.sort((a, b) => 
      new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    )[0];
    
    // Update the file
    const updatedFile: ProjectFile = {
      ...latestFile,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.projectFiles.set(updatedFile.id, updatedFile);
    return updatedFile;
  }

  // Enhanced table/relationship operations with project context
  async storeTables(tables: any[], projectId?: string, organizationId?: string): Promise<void> {
    for (const table of tables) {
      const insertTable: InsertTable = {
        name: table.name,
        attributes: table.columns || table.attributes,
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
    const projectTables = Array.from(this.tables.values()).filter(
      t => t.projectId === projectId
    );
    projectTables.forEach(t => this.tables.delete(t.id));
  }

  async clearProjectRelationships(projectId: string): Promise<void> {
    const projectRelationships = Array.from(this.relationships.values()).filter(
      r => r.projectId === projectId
    );
    projectRelationships.forEach(r => this.relationships.delete(r.id));
  }

  // Transaction-safe replace operations (MemStorage implementations)
  async replaceProjectTables(tables: any[], projectId: string, organizationId?: string): Promise<void> {
    // Clear existing tables for this project
    await this.clearProjectTables(projectId);
    
    // Store new tables
    await this.storeTables(tables, projectId, organizationId);
    console.log(`Replaced ${tables.length} tables for project: ${projectId}`);
  }

  async replaceProjectRelationships(relationships: any[], projectId: string, organizationId?: string): Promise<void> {
    // Clear existing relationships for this project
    await this.clearProjectRelationships(projectId);
    
    // Store new relationships
    await this.storeRelationships(relationships, projectId, organizationId);
    console.log(`Replaced ${relationships.length} relationships for project: ${projectId}`);
  }

  async replaceProjectData(tables: any[], relationships: any[], projectId: string, organizationId?: string): Promise<void> {
    // Clear existing data for this project
    await this.clearProjectTables(projectId);
    await this.clearProjectRelationships(projectId);
    
    // Store new data
    await this.storeTables(tables, projectId, organizationId);
    await this.storeRelationships(relationships, projectId, organizationId);
    console.log(`Replaced project data: ${tables.length} tables, ${relationships.length} relationships for project: ${projectId}`);
  }

  // Get project statistics (table/relationship counts)
  async getProjectStatistics(projectId: string): Promise<{ tables_count: number; relationships_count: number }> {
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
    
    // Fallback to legacy storage
    const allTables = await this.getTables();
    const allRelationships = await this.getRelationships();
    
    const projectTables = allTables.filter(t => t.projectId === projectId);
    const projectRelationships = allRelationships.filter(r => r.projectId === projectId);
    
    return {
      tables_count: projectTables.length,
      relationships_count: projectRelationships.length
    };
  }

  // Organization operations moved to custom API endpoints

  // Invitation operations (in-memory fallback)
  async createInvitation(invitation: any): Promise<any> {
    console.log('In-memory invitation creation (not persisted):', invitation);
    return { ...invitation, id: randomUUID() };
  }

  async getInvitationsByOrganization(organizationId: string): Promise<any[]> {
    console.log('In-memory invitation retrieval for org:', organizationId);
    return [];
  }

  async getInvitationByToken(token: string): Promise<any | undefined> {
    console.log('In-memory invitation token lookup:', token);
    return undefined;
  }

  async updateInvitationStatus(id: string, status: string): Promise<boolean> {
    console.log('In-memory invitation status update:', { id, status });
    return true;
  }

  async deleteInvitation(id: string): Promise<{ success: boolean; error?: string }> {
    console.log('In-memory invitation deletion:', id);
    return { success: true };
  }

  async createOrganizationMembership(userId: string, organizationId: string, role: string): Promise<any> {
    console.log('In-memory organization membership creation (not persisted):', { userId, organizationId, role });
    return { id: randomUUID(), userId, organizationId, role, joinedAt: new Date() };
  }

  // Organization membership operations moved to custom API endpoints
}

import { DatabaseStorage } from './database-storage';

// Use DatabaseStorage for persistent data storage
export const storage = new DatabaseStorage();

// Keep MemStorage available for fallback if needed
export const memStorage = new MemStorage();
