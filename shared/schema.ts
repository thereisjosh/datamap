import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Table metadata schema
export const tables = pgTable("tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  attributes: jsonb("attributes").notNull(), // Array of column definitions
  createdAt: timestamp("created_at").defaultNow(),
});

// Relationship schema for foreign keys
export const relationships = pgTable("relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTable: text("source_table").notNull(),
  sourceColumn: text("source_column").notNull(),
  targetTable: text("target_table").notNull(),
  targetColumn: text("target_column").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Upload session schema for tracking file processing
export const uploadSessions = pgTable("upload_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  status: text("status").notNull(), // 'processing', 'completed', 'failed'
  tablesCount: text("tables_count"),
  relationshipsCount: text("relationships_count"),
  errors: jsonb("errors"), // Array of error messages
  createdAt: timestamp("created_at").defaultNow(),
});

// Zod schemas for validation
export const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  isPrimaryKey: z.boolean().default(false),
  isForeignKey: z.boolean().default(false),
  references: z.object({
    table: z.string(),
    column: z.string(),
  }).optional(),
});

export const tableSchema = z.object({
  name: z.string(),
  attributes: z.array(columnSchema),
});

export const relationshipSchema = z.object({
  sourceTable: z.string(),
  sourceColumn: z.string(),
  targetTable: z.string(),
  targetColumn: z.string(),
});

export const parseExcelRequestSchema = z.object({
  file: z.any(), // File will be validated by multer
});

export const generateMermaidRequestSchema = z.object({
  tables: z.array(tableSchema),
  relationships: z.array(relationshipSchema).optional(),
  options: z.object({
    theme: z.string().default("default"),
    direction: z.string().default("TB"),
  }).optional(),
});

// Insert schemas
export const insertTableSchema = createInsertSchema(tables).omit({
  id: true,
  createdAt: true,
});

export const insertRelationshipSchema = createInsertSchema(relationships).omit({
  id: true,
  createdAt: true,
});

export const insertUploadSessionSchema = createInsertSchema(uploadSessions).omit({
  id: true,
  createdAt: true,
});

// Types
export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Column = z.infer<typeof columnSchema>;
export type TableData = z.infer<typeof tableSchema>;
export type Relationship = typeof relationships.$inferSelect;
export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type InsertUploadSession = z.infer<typeof insertUploadSessionSchema>;
export type ParseExcelRequest = z.infer<typeof parseExcelRequestSchema>;
export type GenerateMermaidRequest = z.infer<typeof generateMermaidRequestSchema>;
