import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, boolean, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// BetterAuth Core Tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Organization context fields for multi-tenant support
  activeOrganizationId: text("active_organization_id").references(() => organization.id, { onDelete: "set null" }),
  activeTeamId: text("active_team_id"), // For future team support
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Organization Management Tables for multi-tenant SaaS
export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").unique(), // BetterAuth standard
  logo: text("logo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  metadata: text("metadata"), // BetterAuth uses text, not jsonb
  // Custom fields for our app
  domain: varchar("domain").unique(),
  description: text("description"),
  subscription_tier: text("subscription_tier").default("free"), // 'free', 'pro', 'enterprise'
  settings: jsonb("settings").default(sql`'{}'::jsonb`), // Keep for backward compatibility
});

export const member = pgTable("member", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // Standard organization roles: 'owner', 'admin', 'member'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Multi-tenant membership optimization indexes
  orgUserIdx: index("member_org_user_idx").on(table.organizationId, table.userId),
  userOrgIdx: index("member_user_org_idx").on(table.userId, table.organizationId),
  orgRoleIdx: index("member_org_role_idx").on(table.organizationId, table.role),
  userIdx: index("member_user_idx").on(table.userId),
  orgIdx: index("member_org_idx").on(table.organizationId),
}));

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"), // 'pending', 'accepted', 'expired', 'cancelled'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Keep custom fields for our app
  token: text("token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Invitation management optimization indexes
  orgStatusIdx: index("invitation_org_status_idx").on(table.organizationId, table.status),
  emailStatusIdx: index("invitation_email_status_idx").on(table.email, table.status),
  tokenIdx: index("invitation_token_idx").on(table.token),
  expiresAtIdx: index("invitation_expires_at_idx").on(table.expiresAt),
  orgIdx: index("invitation_org_idx").on(table.organizationId),
  inviterIdx: index("invitation_inviter_idx").on(table.inviterId),
}));

// Project Management Tables
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"), // 'active', 'archived', 'deleted'
  settings: jsonb("settings").default(sql`'{}'::jsonb`), // Theme, layout preferences, etc.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Multi-tenant optimization indexes
  orgOwnerIdx: index("projects_org_owner_idx").on(table.organizationId, table.ownerId),
  orgStatusIdx: index("projects_org_status_idx").on(table.organizationId, table.status),
  ownerIdx: index("projects_owner_idx").on(table.ownerId),
  orgIdx: index("projects_org_idx").on(table.organizationId),
  statusIdx: index("projects_status_idx").on(table.status),
  createdAtIdx: index("projects_created_at_idx").on(table.createdAt),
  updatedAtIdx: index("projects_updated_at_idx").on(table.updatedAt),
}));

export const projectFiles = pgTable("project_files", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileData: jsonb("file_data"), // Original uploaded file data
  erdData: jsonb("erd_data"), // Processed ERD data (tables, relationships)
  mermaidCode: text("mermaid_code"), // Generated Mermaid diagram code
  version: text("version").notNull().default("1"), // For versioning ERD changes
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // File management optimization indexes
  projectIdx: index("project_files_project_idx").on(table.projectId),
  projectVersionIdx: index("project_files_project_version_idx").on(table.projectId, table.version),
  createdAtIdx: index("project_files_created_at_idx").on(table.createdAt),
  updatedAtIdx: index("project_files_updated_at_idx").on(table.updatedAt),
}));

// ERD Application Tables (Legacy - will be migrated to project-based)
export const tables = pgTable("tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  attributes: jsonb("attributes").notNull(), // Array of column definitions
  projectId: uuid("projectId").references(() => projects.id, { onDelete: "cascade" }),
  organizationId: uuid("organizationId").references(() => organization.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Multi-tenant optimization indexes
  orgProjectIdx: index("tables_org_project_idx").on(table.organizationId, table.projectId),
  projectIdx: index("tables_project_idx").on(table.projectId),
  orgIdx: index("tables_org_idx").on(table.organizationId),
  createdAtIdx: index("tables_created_at_idx").on(table.createdAt),
}));

export const relationships = pgTable("relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTable: text("sourceTable").notNull(),
  sourceColumn: text("sourceColumn").notNull(),
  targetTable: text("targetTable").notNull(),
  targetColumn: text("targetColumn").notNull(),
  projectId: uuid("projectId").references(() => projects.id, { onDelete: "cascade" }),
  organizationId: uuid("organizationId").references(() => organization.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Multi-tenant optimization indexes
  orgProjectIdx: index("relationships_org_project_idx").on(table.organizationId, table.projectId),
  projectIdx: index("relationships_project_idx").on(table.projectId),
  orgIdx: index("relationships_org_idx").on(table.organizationId),
  sourceTableIdx: index("relationships_source_table_idx").on(table.sourceTable),
  targetTableIdx: index("relationships_target_table_idx").on(table.targetTable),
  createdAtIdx: index("relationships_created_at_idx").on(table.createdAt),
}));

export const uploadSessions = pgTable("upload_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  status: text("status").notNull(), // 'processing', 'completed', 'failed'
  tablesCount: text("tablesCount"),
  relationshipsCount: text("relationshipsCount"),
  errors: jsonb("errors"), // Array of error messages
  projectId: uuid("projectId").references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
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

// Project schemas
export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  settings: z.record(z.any()).optional(),
});

// Insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectFileSchema = createInsertSchema(projectFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

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
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type Table = typeof tables.$inferSelect & {
  attributes: Column[];
};
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Column = z.infer<typeof columnSchema>;
export type TableData = z.infer<typeof tableSchema>;
export type Relationship = typeof relationships.$inferSelect;
export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type InsertUploadSession = z.infer<typeof insertUploadSessionSchema>;
export type ParseExcelRequest = z.infer<typeof parseExcelRequestSchema>;
export type GenerateMermaidRequest = z.infer<typeof generateMermaidRequestSchema>;

// Type definitions
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Organization = typeof organization.$inferSelect & {
  subscription_tier: string;
};
export type OrganizationMember = typeof member.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type InsertInvitation = typeof invitation.$inferInsert;
