// TypeScript interfaces for flexible Excel parser components

export interface ExcelSheet {
  name: string;
  columns: string[];
  rowCount: number;
  preview: string[][]; // First 5 rows for preview
}

export interface ExcelAnalysis {
  sheets: ExcelSheet[];
  codemasterSheets: CodemasterSheet[];
  analysis: {
    suggestedTableSheet?: string;
    suggestedColumnSheet?: string;
    confidence: number;
  };
}

export interface ColumnMappings {
  tableSheet: string;
  tableNameColumn: string;
  tableTypeColumn?: string;
  columnSheet: string;
  columnTableNameColumn: string;
  columnNameColumn: string;
  columnTypeColumn: string;
  primaryKeyColumn?: string;
  foreignKeyTableColumn?: string;
  foreignKeyColumnColumn?: string;
}

export interface ParsedTable {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: {
      table: string;
      column: string;
    };
    // Codemaster metadata fields
    codemasterValues?: any[];
    codemasterSource?: string;
  }>;
}

export interface ParsedRelationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

// Codemaster/lookup value interfaces
export interface CodeValue {
  code: string | number;
  description: string;
  isActive?: boolean;
  notes?: string;
}

export interface CodemasterMapping {
  fieldName: string;
  tableName: string;
  sheetName: string;
  codeColumn: string;
  descriptionColumn: string;
  codeValues: CodeValue[];
  totalRecords: number;
}

export interface CodemasterSheet {
  name: string;
  type: 'lookup' | 'enum' | 'reference' | 'code';
  detectedMappings: CodemasterMapping[];
  columns: string[];
  rowCount: number;
  preview: string[][];
}

export interface ParseResult {
  tables: ParsedTable[];
  relationships: ParsedRelationship[];
  codemasterMappings: CodemasterMapping[];
  codemasterSheets: CodemasterSheet[];
  errors: string[];
  summary: {
    tablesFound: number;
    columnsFound: number;
    relationshipsFound: number;
    codemasterSheetsFound: number;
    codeMappingsFound: number;
  };
}

export interface FlexibleParserStep {
  id: 'upload' | 'analyze' | 'map' | 'preview' | 'result';
  title: string;
  description: string;
  completed: boolean;
  current: boolean;
}

// API response types
export interface FlexibleParserApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

// Validation result for mappings
export interface MappingValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Codemaster mapping configuration for individual sheets
export interface CodemasterSheetMapping {
  sheetName: string;
  codeColumn: string;
  descriptionColumn: string;
  statusColumn?: string;
  targetFields: Array<{
    tableName: string;
    fieldName: string;
  }>;
}

// Codemaster configuration types
export type CodemasterType = 'entity_tables' | 'field_enums' | 'mixed';

export interface CodemasterConfiguration {
  selectedSheet: string;
  type: CodemasterType;
  codeColumn: string;
  descriptionColumn: string;
  statusColumn?: string;
  // For entity_tables type
  entityColumn?: string;
  // For field_enums type  
  fieldColumn?: string;
  // For mixed type
  categoryColumn?: string;
  targetFields: Array<{
    tableName: string;
    fieldName: string;
  }>;
}

// Column mapping form state
export interface MappingFormState {
  // Table mappings
  tableSheet: string;
  tableNameColumn: string;
  tableTypeColumn: string;
  
  // Column mappings
  columnSheet: string;
  columnTableNameColumn: string;
  columnNameColumn: string;
  columnTypeColumn: string;
  
  // Optional mappings
  primaryKeyColumn: string;
  foreignKeyTableColumn: string;
  foreignKeyColumnColumn: string;
  
  // Codemaster mappings
  codemasterConfigurations: CodemasterConfiguration[];
}

// Step validation state
export interface StepValidation {
  canProceed: boolean;
  errors: string[];
  warnings: string[];
}

// File upload state
export interface FileUploadState {
  file: File | null;
  uploading: boolean;
  error: string | null;
}

// Loading states for different operations
export interface LoadingStates {
  analyzing: boolean;
  parsing: boolean;
  uploading: boolean;
}