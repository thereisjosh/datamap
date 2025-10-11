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
    .max(500, 'Query description too long')
    .regex(/^[^<>]*$/, 'Query contains invalid characters')
});

// Project validation schemas for VAPT compliance
export const projectCreateSchema = z.object({
  name: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name too long')
    .regex(/^[a-zA-Z0-9\s\-_\.]+$/, 'Project name contains invalid characters'),
  description: z.string()
    .max(500, 'Description too long')
    .regex(/^[^<>]*$/, 'Description contains invalid characters')
    .optional(),
  organizationId: z.string()
    .uuid('Invalid organization ID format')
    .optional()
});

export const projectUpdateSchema = z.object({
  name: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name too long')
    .regex(/^[a-zA-Z0-9\s\-_\.]+$/, 'Project name contains invalid characters')
    .optional(),
  description: z.string()
    .max(500, 'Description too long')
    .regex(/^[^<>]*$/, 'Description contains invalid characters')
    .optional(),
  status: z.enum(['active', 'archived', 'deleted'])
    .optional()
});

// Project data saving schema
export const projectDataSaveSchema = z.object({
  tables: z.array(z.object({
    name: z.string()
      .min(1, 'Table name required')
      .max(100, 'Table name too long')
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid table name format'),
    columns: z.array(z.object({
      name: z.string()
        .min(1, 'Column name required')
        .max(100, 'Column name too long')
        .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid column name format'),
      type: z.string()
        .min(1, 'Column type required')
        .max(50, 'Column type too long'),
      isPrimaryKey: z.boolean().optional(),
      isForeignKey: z.boolean().optional(),
      isNullable: z.boolean().optional(),
      // Codemaster metadata fields
      codemasterValues: z.array(z.any()).optional(),
      codemasterSource: z.string().optional()
    })).max(200, 'Too many columns')
  })).max(500, 'Too many tables'),
  relationships: z.array(z.object({
    sourceTable: z.string().min(1).max(100),
    targetTable: z.string().min(1).max(100),
    sourceColumn: z.string().min(1).max(100),
    targetColumn: z.string().min(1).max(100),
    type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']).optional()
  })).max(1000, 'Too many relationships'),
  mermaidCode: z.string()
    .min(1, 'Mermaid code required')
    .max(200000, 'Mermaid code too large'),
  filename: z.string()
    .min(1, 'Filename required')
    .max(255, 'Filename too long')
    .optional()
});

// Organization validation schemas
export const organizationCreateSchema = z.object({
  name: z.string()
    .min(1, 'Organization name is required')
    .max(100, 'Organization name too long')
    .regex(/^[a-zA-Z0-9\s\-_\.]+$/, 'Organization name contains invalid characters'),
  description: z.string()
    .max(500, 'Description too long')
    .regex(/^[^<>]*$/, 'Description contains invalid characters')
    .optional(),
  domain: z.string()
    .max(100, 'Domain too long')
    .regex(/^[a-zA-Z0-9\-\.]+$/, 'Invalid domain format')
    .optional()
});

export const invitationCreateSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email too long'),
  role: z.enum(['owner', 'admin', 'editor', 'viewer'], {
    errorMap: () => ({ message: 'Invalid role' })
  }),
  message: z.string()
    .max(500, 'Message too long')
    .regex(/^[^<>]*$/, 'Message contains invalid characters')
    .optional()
});

// Profile update schema
export const profileUpdateSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z\s\-\.]+$/, 'Name contains invalid characters'),
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email too long')
});

// UUID parameter validation
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format')
});

export const projectIdParamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format')
});

export const organizationIdParamSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID format')
});

export const tokenParamSchema = z.object({
  token: z.string()
    .min(10, 'Invalid token')
    .max(255, 'Token too long')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Invalid token format')
});

// Codemaster configuration validation
export const codemasterConfigurationSchema = z.object({
  selectedSheet: z.string()
    .min(1, 'Codemaster sheet name is required')
    .max(100, 'Codemaster sheet name too long'),
  type: z.enum(['entity_tables', 'field_enums', 'mixed'], {
    errorMap: () => ({ message: 'Invalid codemaster type' })
  }),
  codeColumn: z.string()
    .min(1, 'Code column is required')
    .max(100, 'Code column name too long'),
  descriptionColumn: z.string()
    .min(1, 'Description column is required')
    .max(100, 'Description column name too long'),
  statusColumn: z.string()
    .max(100, 'Status column name too long')
    .optional(),
  entityColumn: z.string()
    .max(100, 'Entity column name too long')
    .optional(),
  fieldColumn: z.string()
    .max(100, 'Field column name too long')
    .optional(),
  categoryColumn: z.string()
    .max(100, 'Category column name too long')
    .optional(),
  targetFields: z.array(z.object({
    tableName: z.string()
      .min(1, 'Target table name is required')
      .max(100, 'Target table name too long'),
    fieldName: z.string()
      .min(1, 'Target field name is required')
      .max(100, 'Target field name too long')
  })).max(50, 'Too many target fields')
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
    .optional(),
  codemasterConfigurations: z.array(codemasterConfigurationSchema)
    .max(20, 'Too many codemaster configurations')
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
export type MemberInvite = z.infer<typeof invitationCreateSchema>;
export type ColumnMappings = z.infer<typeof columnMappingsSchema>;
export type CodemasterConfiguration = z.infer<typeof codemasterConfigurationSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SecurityEvent = z.infer<typeof securityEventSchema>;