import { apiRequest } from './queryClient';

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

  async generateDomainMermaid(tables: Table[], relationships: Relationship[] = []): Promise<GenerateDomainMermaidResponse> {
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
      options: {}
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
};
