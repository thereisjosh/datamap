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

export const api = {
  async parseExcelFile(file: File): Promise<ParseExcelResponse> {
    const formData = new FormData();
    formData.append('file', file);

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
  }
};
