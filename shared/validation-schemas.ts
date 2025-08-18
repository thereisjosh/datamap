import { z } from "zod";

// File upload validation schemas
export const fileUploadSchema = z.object({
  file: z.object({
    mimetype: z.enum([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ], {
      errorMap: () => ({ message: 'Only Excel files (.xlsx, .xls) are allowed' })
    }),
    size: z.number()
      .max(10 * 1024 * 1024, 'File size must be less than 10MB')
      .min(1, 'File cannot be empty'),
    originalname: z.string()
      .min(1, 'Filename is required')
      .max(255, 'Filename too long')
      .regex(/^[^<>:"/\\|?*\x00-\x1f]+$/, 'Invalid filename characters'),
    buffer: z.instanceof(Buffer, { message: 'File buffer is required' })
  })
});

// Excel parsing request validation
export const parseExcelRequestSchema = z.object({
  parseOptions: z.object({
    includeHeaders: z.boolean().default(true),
    maxRows: z.number().int().min(1).max(10000).default(1000),
    maxColumns: z.number().int().min(1).max(100).default(50)
  }).optional()
});

// ERD Chat validation schemas
export const chatMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long (max 2000 characters)')
    .regex(/^[^<>]*$/, 'Message contains invalid characters'),
  sessionId: z.string()
    .uuid('Invalid session ID format')
    .optional(),
  context: z.object({
    projectId: z.string().uuid('Invalid project ID').optional(),
    tables: z.array(z.string()).max(50, 'Too many tables in context').optional(),
    relationships: z.array(z.string()).max(100, 'Too many relationships in context').optional()
  }).optional()
});

export const sqlGenerationRequestSchema = z.object({
  query: z.string()
    .min(1, 'Query description is required')
    .max(1000, 'Query description too long')
    .regex(/^[^<>]*$/, 'Query contains invalid characters'),
  tables: z.array(z.string())
    .min(1, 'At least one table is required')
    .max(20, 'Too many tables specified'),
  dialect: z.enum(['postgresql', 'mysql', 'sqlite', 'mssql']).default('postgresql'),
  complexity: z.enum(['simple', 'medium', 'complex']).default('medium')
});

// Project management validation
export const projectCreateSchema = z.object({
  name: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name too long')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Project name contains invalid characters'),
  description: z.string()
    .max(500, 'Description too long')
    .optional(),
  isPublic: z.boolean().default(false),
  organizationId: z.string().uuid('Invalid organization ID').optional()
});

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  id: z.string().uuid('Invalid project ID')
});

// Organization validation
export const organizationCreateSchema = z.object({
  name: z.string()
    .min(1, 'Organization name is required')
    .max(100, 'Organization name too long')
    .regex(/^[a-zA-Z0-9\s\-_&.]+$/, 'Organization name contains invalid characters'),
  description: z.string()
    .max(500, 'Description too long')
    .optional(),
  website: z.string()
    .url('Invalid website URL')
    .optional()
    .or(z.literal(''))
});

export const memberInviteSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(254, 'Email address too long'),
  role: z.enum(['viewer', 'member', 'editor', 'admin'], {
    errorMap: () => ({ message: 'Invalid role specified' })
  }),
  message: z.string()
    .max(500, 'Invitation message too long')
    .optional()
});

// Flexible parser validation
export const columnMappingsSchema = z.object({
  tableSheet: z.string()
    .min(1, 'Table sheet name is required')
    .max(100, 'Table sheet name too long'),
  tableNameColumn: z.string()
    .min(1, 'Table name column is required')
    .max(100, 'Table name column too long'),
  tableTypeColumn: z.string()
    .max(100, 'Table type column too long')
    .optional(),
  columnSheet: z.string()
    .min(1, 'Column sheet name is required')
    .max(100, 'Column sheet name too long'),
  columnTableNameColumn: z.string()
    .min(1, 'Column table name column is required')
    .max(100, 'Column table name column too long'),
  columnNameColumn: z.string()
    .min(1, 'Column name column is required')
    .max(100, 'Column name column too long'),
  columnTypeColumn: z.string()
    .min(1, 'Column type column is required')
    .max(100, 'Column type column too long'),
  primaryKeyColumn: z.string()
    .max(100, 'Primary key column too long')
    .optional(),
  foreignKeyTableColumn: z.string()
    .max(100, 'Foreign key table column too long')
    .optional(),
  foreignKeyColumnColumn: z.string()
    .max(100, 'Foreign key column column too long')
    .optional()
});

// Generic validation schemas
export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// Query parameter validation
export const searchQuerySchema = z.object({
  q: z.string()
    .min(1, 'Search query is required')
    .max(100, 'Search query too long')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid search characters'),
  category: z.enum(['projects', 'tables', 'relationships', 'organizations']).optional(),
  ...paginationSchema.shape
});

// Rate limiting context
export const rateLimitContextSchema = z.object({
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional()
});

// Security validation
export const securityEventSchema = z.object({
  eventType: z.enum([
    'auth_failure',
    'rate_limit_exceeded',
    'invalid_file_upload',
    'suspicious_sql_request',
    'large_data_export',
    'admin_operation',
    'data_breach_attempt'
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  userId: z.string().uuid().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  details: z.object({}).passthrough(), // Allow additional details
  timestamp: z.date().default(() => new Date())
});

// Input sanitization helpers
export const sanitizeString = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .trim();
};

export const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace invalid filename chars
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
};

// Export types for TypeScript
export type FileUpload = z.infer<typeof fileUploadSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type SqlGenerationRequest = z.infer<typeof sqlGenerationRequestSchema>;
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
export type OrganizationCreate = z.infer<typeof organizationCreateSchema>;
export type MemberInvite = z.infer<typeof memberInviteSchema>;
export type ColumnMappings = z.infer<typeof columnMappingsSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SecurityEvent = z.infer<typeof securityEventSchema>;