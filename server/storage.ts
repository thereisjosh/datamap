import { type Table, type InsertTable, type Relationship, type InsertRelationship, type UploadSession, type InsertUploadSession } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Table operations
  createTable(table: InsertTable): Promise<Table>;
  getTables(): Promise<Table[]>;
  getTablesBySession(sessionId: string): Promise<Table[]>;
  clearTables(): Promise<void>;

  // Relationship operations
  createRelationship(relationship: InsertRelationship): Promise<Relationship>;
  getRelationships(): Promise<Relationship[]>;
  clearRelationships(): Promise<void>;

  // Upload session operations
  createUploadSession(session: InsertUploadSession): Promise<UploadSession>;
  getUploadSession(id: string): Promise<UploadSession | undefined>;
  updateUploadSession(id: string, updates: Partial<InsertUploadSession>): Promise<UploadSession>;
}

export class MemStorage implements IStorage {
  private tables: Map<string, Table>;
  private relationships: Map<string, Relationship>;
  private uploadSessions: Map<string, UploadSession>;

  constructor() {
    this.tables = new Map();
    this.relationships = new Map();
    this.uploadSessions = new Map();
  }

  // Table operations
  async createTable(insertTable: InsertTable): Promise<Table> {
    const id = randomUUID();
    const table: Table = { 
      ...insertTable, 
      id,
      createdAt: new Date()
    };
    this.tables.set(id, table);
    return table;
  }

  async getTables(): Promise<Table[]> {
    return Array.from(this.tables.values());
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
      createdAt: new Date()
    };
    this.relationships.set(id, relationship);
    return relationship;
  }

  async getRelationships(): Promise<Relationship[]> {
    return Array.from(this.relationships.values());
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
      relationshipsCount: insertSession.relationshipsCount || null
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
}

export const storage = new MemStorage();
