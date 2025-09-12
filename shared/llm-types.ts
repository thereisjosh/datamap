import { z } from "zod";

// ========== Core ERD Analysis Types ==========

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
  constraints?: string[];
  description?: string;
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyDefinition[];
  indexes?: string[];
  description?: string;
}

export interface ForeignKeyDefinition {
  column: string;
  referencedTable: string;
  referencedColumn: string;
  constraint?: string;
}

export interface RelationshipDefinition {
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
  relationshipType: 'primary' | 'foreign' | 'junction';
  isJunctionTable?: boolean;
  junctionTable?: string;
}

export interface ParsedERD {
  tables: TableDefinition[];
  relationships: RelationshipDefinition[];
  metadata: ERDMetadata;
  patterns: SchemaPattern[];
}

export interface ERDMetadata {
  totalTables: number;
  totalRelationships: number;
  totalColumns: number;
  junctionTables: string[];
  orphanedTables: string[];
  maxDepth: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface SchemaPattern {
  type: 'junction-table' | 'audit-trail' | 'hierarchy' | 'lookup-table' | 'polymorphic';
  tables: string[];
  description: string;
  recommendation?: string;
}

// ========== LLM Service Types ==========

export interface ERDContext {
  tables: TableDefinition[];
  relationships: RelationshipDefinition[];
  patterns: SchemaPattern[];
  domainContext?: string;
  userQuestion: string;
  conversationHistory?: ChatMessage[];
}

export interface LLMResponse {
  content: string;
  confidence: number;
  reasoning?: string;
  suggestions?: string[];
  relatedQuestions?: string[];
  sqlCode?: string;
  warnings?: string[];
}

export interface SQLGenerationRequest {
  naturalLanguageQuery: string;
  erdContext: ERDContext;
  sqlDialect?: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
  includeExplanation?: boolean;
}

export interface SQLGenerationResponse {
  sql: string;
  explanation: string;
  confidence: number;
  estimatedPerformance?: 'fast' | 'medium' | 'slow';
  optimizationTips?: string[];
  warnings?: string[];
  alternativeQueries?: string[];
}

export interface RelationshipExplanationRequest {
  sourceTable: string;
  targetTable: string;
  erdContext: ERDContext;
  includeSQL?: boolean;
}

export interface RelationshipExplanationResponse {
  explanation: string;
  businessLogic: string;
  technicalDetails: string;
  sqlExamples: string[];
  bestPractices: string[];
  warnings?: string[];
}

// ========== Chat Interface Types ==========

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    confidence?: number;
    sqlCode?: string;
    relatedTables?: string[];
    messageType?: 'explanation' | 'sql-generation' | 'pattern-analysis' | 'general';
  };
}

export interface ChatSession {
  id: string;
  projectId?: string;
  userId: string;
  messages: ChatMessage[];
  context: ERDContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  projectId?: string;
  mermaidCode: string;
  includeSQL?: boolean;
  sqlDialect?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  sessionId: string;
  suggestedQuestions?: string[];
  relatedTables?: string[];
  confidence: number;
}

// ========== Query Builder Types ==========

export interface QueryCondition {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'BETWEEN';
  value: string | string[];
  table?: string;
}

export interface QueryJoin {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
}

export interface QuerySpecification {
  tables: string[];
  columns?: string[];
  joins: QueryJoin[];
  conditions: QueryCondition[];
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
  groupBy?: string[];
}

// ========== Pattern Analysis Types ==========

export interface PatternAnalysisResult {
  patterns: SchemaPattern[];
  recommendations: SchemaRecommendation[];
  issues: SchemaIssue[];
  metrics: SchemaMetrics;
}

export interface SchemaRecommendation {
  type: 'performance' | 'design' | 'naming' | 'indexing' | 'normalization';
  severity: 'info' | 'warning' | 'error';
  table?: string;
  column?: string;
  description: string;
  suggestion: string;
  impact?: string;
}

export interface SchemaIssue {
  type: 'missing-index' | 'orphaned-table' | 'circular-reference' | 'naming-convention' | 'missing-foreign-key';
  severity: 'low' | 'medium' | 'high';
  table: string;
  column?: string;
  description: string;
  resolution: string;
}

export interface SchemaMetrics {
  complexity: number;
  normalizationLevel: number;
  relationshipDensity: number;
  indexCoverage: number;
  namingConsistency: number;
}

// ========== API Request/Response Schemas ==========

// Zod schemas for runtime validation
export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
  projectId: z.string().optional(),
  mermaidCode: z.string().min(1),
  includeSQL: z.boolean().default(false),
  sqlDialect: z.enum(['postgresql', 'mysql', 'sqlite', 'sqlserver']).default('postgresql'),
});

export const SQLGenerationRequestSchema = z.object({
  naturalLanguageQuery: z.string().min(1).max(500),
  mermaidCode: z.string().min(1),
  sqlDialect: z.enum(['postgresql', 'mysql', 'sqlite', 'sqlserver']).default('postgresql'),
  includeExplanation: z.boolean().default(true),
});

export const RelationshipExplanationRequestSchema = z.object({
  sourceTable: z.string().min(1),
  targetTable: z.string().min(1),
  mermaidCode: z.string().min(1),
  includeSQL: z.boolean().default(true),
});

// ========== Configuration Types ==========

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export interface ERDAnalyzerConfig {
  maxTableSize: number;
  maxRelationships: number;
  enablePatternDetection: boolean;
  strictParsing: boolean;
}

export interface RateLimitConfig {
  maxRequestsPerHour: number;
  maxRequestsPerMinute: number;
  enablePerUserLimiting: boolean;
  enablePerProjectLimiting: boolean;
}

// ========== Error Types ==========

export class ERDAnalysisError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ERDAnalysisError';
  }
}

export class LLMServiceError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'LLMServiceError';
  }
}

export class ChatServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public sessionId?: string
  ) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

// ========== Utility Types ==========

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

// ========== Constants ==========

export const LLM_MODELS = {
  OPENAI: {
    'gpt-4-turbo-preview': { maxTokens: 128000, costPerToken: 0.00001 },
    'gpt-4': { maxTokens: 8192, costPerToken: 0.00003 },
    'gpt-3.5-turbo': { maxTokens: 16384, costPerToken: 0.0000015 },
  },
  ANTHROPIC: {
    'claude-3-5-sonnet-20241022': { maxTokens: 200000, costPerToken: 0.000015 },
    'claude-3-5-haiku-20241022': { maxTokens: 200000, costPerToken: 0.00000025 },
    'claude-3-sonnet-20240229': { maxTokens: 200000, costPerToken: 0.000015 }, // Deprecated - EOL July 21, 2025
    'claude-3-haiku-20240307': { maxTokens: 200000, costPerToken: 0.00000025 },
    'claude-3-opus-20240229': { maxTokens: 200000, costPerToken: 0.000075 },
  }
} as const;

export const SQL_DIALECTS = {
  postgresql: {
    name: 'PostgreSQL',
    supportsWindow: true,
    supportsCTE: true,
    supportsJSON: true,
  },
  mysql: {
    name: 'MySQL',
    supportsWindow: true,
    supportsCTE: true,
    supportsJSON: true,
  },
  sqlite: {
    name: 'SQLite',
    supportsWindow: true,
    supportsCTE: true,
    supportsJSON: true,
  },
  sqlserver: {
    name: 'SQL Server',
    supportsWindow: true,
    supportsCTE: true,
    supportsJSON: true,
  },
} as const;

export const SCHEMA_PATTERNS = {
  'junction-table': {
    name: 'Junction Table',
    description: 'Connects two entities in a many-to-many relationship',
    indicators: ['multiple foreign keys', 'composite primary key', 'small column count'],
  },
  'audit-trail': {
    name: 'Audit Trail',
    description: 'Tracks changes to data with timestamps and user information',
    indicators: ['createdAt', 'updatedAt', 'createdBy', 'modifiedBy'],
  },
  'hierarchy': {
    name: 'Hierarchical Structure',
    description: 'Self-referencing table representing tree-like structures',
    indicators: ['parentId', 'self-reference', 'path or level columns'],
  },
  'lookup-table': {
    name: 'Lookup/Reference Table',
    description: 'Small table containing reference data',
    indicators: ['id and name/label columns only', 'few rows', 'stable data'],
  },
  'polymorphic': {
    name: 'Polymorphic Association',
    description: 'References multiple entity types through type and id columns',
    indicators: ['entity_type', 'entity_id', 'generic foreign key pattern'],
  },
} as const;