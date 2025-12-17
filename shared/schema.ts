import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, boolean, timestamp, uuid, index, real, integer } from "drizzle-orm/pg-core";
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
  role: text("role").notNull().default("viewer"), // Standard organization roles: 'owner', 'admin', 'editor', 'viewer'
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

// Reusable Invitation Links (Alternative to email invitations)
export const invitationLink = pgTable("invitation_link", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'member', 'admin'
  token: text("token").notNull().unique(), // URL token for the invitation link
  description: text("description"), // Optional description for the link
  maxUses: integer("max_uses"), // Max number of times this link can be used (null = unlimited)
  currentUses: integer("current_uses").notNull().default(0), // Current number of uses
  isActive: boolean("is_active").notNull().default(true), // Whether the link is currently active
  expiresAt: timestamp("expires_at", { withTimezone: true }), // Expiration date (null = never expires)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => ({
  // Invitation link management optimization indexes
  orgActiveIdx: index("invitation_link_org_active_idx").on(table.organizationId, table.isActive),
  tokenIdx: index("invitation_link_token_idx").on(table.token),
  expiresAtIdx: index("invitation_link_expires_at_idx").on(table.expiresAt),
  orgIdx: index("invitation_link_org_idx").on(table.organizationId),
  createdByIdx: index("invitation_link_created_by_idx").on(table.createdById),
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
  // Extended properties for codemaster metadata
  codemasterValues: z.array(z.any()).optional(),
  codemasterSource: z.string().optional(),
});

export const tableSchema = z.object({
  name: z.string(),
  attributes: z.array(columnSchema).optional(),
  columns: z.array(columnSchema).optional(),
}).refine(
  (data) => data.attributes || data.columns,
  {
    message: "Either 'attributes' or 'columns' must be provided",
    path: ["attributes", "columns"],
  }
);

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
    forceRefresh: z.boolean().optional(),
  }).optional(),
  projectId: z.string().optional(),
});

// Project schemas
export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  settings: z.record(z.any()).optional(),
});

// Vector-Based Domain Clustering Tables
export const projectDomains = pgTable("project_domains", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  domainName: varchar("domain_name").notNull(), // e.g., "payments_donations"
  displayName: varchar("display_name").notNull(), // e.g., "Donations & Payments"
  purpose: text("purpose"), // AI-generated business purpose description
  confidenceScore: text("confidence_score"), // 0.0-1.0 confidence in domain grouping
  businessMetrics: jsonb("business_metrics"), // completeness, independence, usability scores
  aiEnhanced: boolean("ai_enhanced").notNull().default(true),
  clusteringMethod: varchar("clustering_method").notNull().default("vector"), // "vector", "llm", "traditional"
  modelVersion: varchar("model_version").default("all-MiniLM-L6-v2"), // Track embedding model used
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index("project_domains_project_idx").on(table.projectId),
  orgIdx: index("project_domains_org_idx").on(table.organizationId),
  projectDomainIdx: index("project_domains_project_domain_idx").on(table.projectId, table.domainName),
  methodIdx: index("project_domains_method_idx").on(table.clusteringMethod),
  createdAtIdx: index("project_domains_created_at_idx").on(table.createdAt),
}));

export const projectDomainTables = pgTable("project_domain_tables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  domainId: uuid("domain_id").notNull().references(() => projectDomains.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  tableName: varchar("table_name").notNull(),
  relevanceScore: real("relevance_score").notNull().default(0.5), // 0.0-1.0 relevance to this domain
  isJunctionTable: boolean("is_junction_table").notNull().default(false),
  businessJustification: text("business_justification"), // Why this table belongs to this domain
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  domainIdx: index("project_domain_tables_domain_idx").on(table.domainId),
  orgIdx: index("project_domain_tables_org_idx").on(table.organizationId),
  domainTableIdx: index("project_domain_tables_domain_table_idx").on(table.domainId, table.tableName),
  tableIdx: index("project_domain_tables_table_idx").on(table.tableName),
}));

export const tableEmbeddings = pgTable("table_embeddings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  tableName: varchar("table_name").notNull(),
  embedding: text("embedding").notNull(), // JSON array of embedding values
  embeddingModel: varchar("embedding_model").notNull().default("all-MiniLM-L6-v2"),
  metadata: jsonb("metadata"), // Additional metadata about the table
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index("table_embeddings_project_idx").on(table.projectId),
  orgIdx: index("table_embeddings_org_idx").on(table.organizationId),
  tableIdx: index("table_embeddings_table_idx").on(table.tableName),
  modelIdx: index("table_embeddings_model_idx").on(table.embeddingModel),
  createdAtIdx: index("table_embeddings_created_at_idx").on(table.createdAt),
}));

// Security events table for audit logging
export const securityEvents = pgTable("security_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(), // auth_failure, rate_limit_exceeded, etc.
  severity: varchar("severity").notNull(), // low, medium, high, critical
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  path: text("path").notNull(),
  method: varchar("method").notNull(),
  statusCode: real("status_code"),
  details: jsonb("details"), // Additional event details
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  eventTypeIdx: index("security_events_event_type_idx").on(table.eventType),
  severityIdx: index("security_events_severity_idx").on(table.severity),
  userIdx: index("security_events_user_idx").on(table.userId),
  orgIdx: index("security_events_org_idx").on(table.organizationId),
  timestampIdx: index("security_events_timestamp_idx").on(table.timestamp),
  ipIdx: index("security_events_ip_idx").on(table.ipAddress),
}));

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

export const insertProjectDomainSchema = createInsertSchema(projectDomains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectDomainTableSchema = createInsertSchema(projectDomainTables).omit({
  id: true,
  createdAt: true,
});

export const insertTableEmbeddingSchema = createInsertSchema(tableEmbeddings).omit({
  id: true,
  createdAt: true,
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

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({
  id: true,
  createdAt: true,
  timestamp: true,
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
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
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
export type InvitationLink = typeof invitationLink.$inferSelect;
export type InsertInvitationLink = typeof invitationLink.$inferInsert;
