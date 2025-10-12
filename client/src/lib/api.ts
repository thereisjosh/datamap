import { apiRequest } from './queryClient';
import type { ExcelAnalysis, ColumnMappings, ParseResult } from '@/components/excel/types';

// LLM API types
export interface ChatRequest {
  message: string;
  sessionId?: string;
  projectId?: string;
  mermaidCode: string;
  includeSQL?: boolean;
  sqlDialect?: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
}

export interface ChatResponse {
  message: {
    id: string;
    role: 'assistant';
    content: string;
    timestamp: string;
    metadata?: {
      confidence?: number;
      sqlCode?: string;
      relatedTables?: string[];
      messageType?: 'explanation' | 'sql-generation' | 'pattern-analysis' | 'general';
    };
  };
  sessionId: string;
  suggestedQuestions?: string[];
  confidence: number;
}

export interface SQLGenerationRequest {
  naturalLanguageQuery: string;
  mermaidCode: string;
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
  mermaidCode: string;
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

export interface PatternAnalysisResponse {
  content: string;
  confidence: number;
  detectedPatterns?: any[];
  metadata?: any;
  recommendations?: string[];
}

export interface Column {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface Relationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

export interface ParseExcelResponse {
  tables: Table[];
  relationships: Relationship[];
  sessionId: string;
  filename: string;
  metadata: {
    tables_count: number;
    relationships_count: number;
  };
}

export interface GenerateMermaidResponse {
  diagram: string;
  metadata: {
    tables_count: number;
    relationships_count: number;
    domain?: string;
  };
}

export interface GenerateDomainMermaidResponse {
  domains: Record<string, GenerateMermaidResponse>;
  metadata: {
    total_domains: number;
    total_tables: number;
    total_relationships: number;
  };
}

export interface MermaidOptions {
  domain?: string;
  maxTables?: number;
  maxRelationships?: number;
  theme?: string;
  direction?: string;
}

export interface ProjectCreateRequest {
  name: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface ProjectSaveRequest {
  tables: Table[];
  relationships: Relationship[];
  mermaidCode: string;
  filename?: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  organizationId: string;
  status: string;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  tables_count?: number;
  relationships_count?: number;
}

export const api = {
  async parseExcelFile(file: File, projectId?: string): Promise<ParseExcelResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (projectId) {
      formData.append('projectId', projectId);
    }

    const response = await fetch('/api/parse-excel', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to parse Excel file');
    }

    return response.json();
  },

  async generateMermaid(tables: Table[], relationships: Relationship[] = [], options: MermaidOptions = {}): Promise<GenerateMermaidResponse> {
    const response = await apiRequest('POST', '/api/generate-mermaid', {
      tables: tables.map(table => ({
        name: table.name,
        attributes: table.columns.map(col => ({
          name: col.name,
          type: col.type,
          isPrimaryKey: col.isPrimaryKey,
          isForeignKey: col.isForeignKey,
          references: col.references
        }))
      })),
      relationships,
      options
    });

    return response.json();
  },

  async generateDomainMermaid(tables: Table[], relationships: Relationship[] = [], projectId?: string): Promise<GenerateDomainMermaidResponse> {
    const response = await apiRequest('POST', '/api/generate-domain-mermaid', {
      tables: tables.map(table => ({
        name: table.name,
        attributes: table.columns.map(col => ({
          name: col.name,
          type: col.type,
          isPrimaryKey: col.isPrimaryKey,
          isForeignKey: col.isForeignKey,
          references: col.references
        }))
      })),
      relationships,
      options: {},
      projectId
    });

    return response.json();
  },

  async getTables(): Promise<{ tables: Table[]; relationships: Relationship[] }> {
    const response = await apiRequest('GET', '/api/tables');
    return response.json();
  },

  async healthCheck(): Promise<any> {
    const response = await apiRequest('GET', '/api/health');
    return response.json();
  },

  // Project API methods
  async getProjects(): Promise<{ projects: ProjectResponse[] }> {
    const response = await apiRequest('GET', '/api/projects');
    return response.json();
  },

  async createProject(project: ProjectCreateRequest): Promise<{ project: ProjectResponse }> {
    const response = await apiRequest('POST', '/api/projects', project);
    return response.json();
  },

  async getProject(projectId: string): Promise<{ project: ProjectResponse }> {
    const response = await apiRequest('GET', `/api/projects/${projectId}`);
    return response.json();
  },

  async updateProject(projectId: string, updates: Partial<ProjectCreateRequest>): Promise<{ project: ProjectResponse }> {
    const response = await apiRequest('PUT', `/api/projects/${projectId}`, updates);
    return response.json();
  },

  async deleteProject(projectId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiRequest('DELETE', `/api/projects/${projectId}`);
    return response.json();
  },

  async duplicateProject(projectId: string): Promise<{ project: ProjectResponse }> {
    const response = await apiRequest('POST', `/api/projects/${projectId}/duplicate`);
    return response.json();
  },

  async saveProject(projectId: string, data: ProjectSaveRequest): Promise<{ success: boolean; message: string }> {
    const response = await apiRequest('POST', `/api/projects/${projectId}/save`, data);
    return response.json();
  },

  async getProjectData(projectId: string): Promise<{
    project: ProjectResponse;
    tables: Table[];
    relationships: Relationship[];
    mermaidCode: string;
    codemasterMappings?: any[];
    metadata: {
      tables_count: number;
      relationships_count: number;
    };
  }> {
    const response = await apiRequest('GET', `/api/projects/${projectId}/data`);
    return response.json();
  },

  // Organization API methods
  async updateOrganization(organizationId: string, updates: {
    name?: string;
    domain?: string;
    description?: string;
  }): Promise<{ organization: any }> {
    const response = await apiRequest('PUT', `/api/organizations/${organizationId}`, updates);
    return response.json();
  },

  // Organization member management moved to custom API endpoints
  // See server/organization-api.ts for current implementation

  // Flexible Excel Parser API methods
  async analyzeExcelStructure(file: File): Promise<ExcelAnalysis> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/flexible-parser/analyze', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to analyze Excel file');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to analyze Excel file');
    }

    return result.data;
  },

  async parseExcelWithMappings(file: File, mappings: ColumnMappings): Promise<ParseResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mappings));

    const response = await fetch('/api/flexible-parser/parse', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to parse Excel file');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to parse Excel file');
    }

    return result.data;
  },

  async checkFlexibleParserHealth(): Promise<{ success: boolean; message: string; timestamp: string }> {
    const response = await apiRequest('GET', '/api/flexible-parser/health');
    return response.json();
  },

  // LLM Chat API methods
  async sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await apiRequest('POST', '/api/erd/chat', request);
    return response.json();
  },

  async generateSQL(request: SQLGenerationRequest): Promise<SQLGenerationResponse> {
    const response = await apiRequest('POST', '/api/erd/generate-sql', request);
    return response.json();
  },

  async explainRelationship(request: RelationshipExplanationRequest): Promise<RelationshipExplanationResponse> {
    const response = await apiRequest('POST', '/api/erd/explain-relationship', request);
    return response.json();
  },

  async analyzePatterns(mermaidCode: string): Promise<PatternAnalysisResponse> {
    const response = await apiRequest('POST', '/api/erd/analyze-patterns', { mermaidCode });
    return response.json();
  },

  async getChatHistory(sessionId: string): Promise<{ sessionId: string; messages: any[]; createdAt: string; updatedAt: string }> {
    const response = await apiRequest('GET', `/api/erd/chat/${sessionId}/history`);
    return response.json();
  },

  async clearChatSession(sessionId: string): Promise<{ message: string; sessionId: string }> {
    const response = await apiRequest('DELETE', `/api/erd/chat/${sessionId}`);
    return response.json();
  },

  async checkLLMHealth(): Promise<any> {
    const response = await apiRequest('GET', '/api/erd/health');
    return response.json();
  },
};
