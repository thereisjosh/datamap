import * as XLSX from 'xlsx';

// TypeScript interfaces for flexible parser
export interface ExcelSheet {
  name: string;
  columns: string[];
  rowCount: number;
  preview: string[][]; // First 5 rows for preview
}

export interface ExcelAnalysis {
  sheets: ExcelSheet[];
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

export interface ParseResult {
  tables: Array<{
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
    }>;
  }>;
  relationships: Array<{
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
  }>;
  errors: string[];
  summary: {
    tablesFound: number;
    columnsFound: number;
    relationshipsFound: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class FlexibleExcelParser {
  
  /**
   * Analyze Excel structure and extract sheet/column information
   */
  async analyzeExcelStructure(buffer: Buffer): Promise<ExcelAnalysis> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: ExcelSheet[] = [];
      
      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        
        if (jsonData.length === 0) continue;
        
        // Extract column headers (first non-empty row)
        let headerRow = 0;
        while (headerRow < jsonData.length && (!jsonData[headerRow] || jsonData[headerRow].length === 0)) {
          headerRow++;
        }
        
        if (headerRow >= jsonData.length) continue;
        
        const columns = jsonData[headerRow]?.filter(col => col && col.toString().trim()) || [];
        const preview = jsonData.slice(headerRow, headerRow + 6); // Header + 5 data rows
        
        sheets.push({
          name: sheetName,
          columns,
          rowCount: jsonData.length - headerRow - 1, // Exclude header
          preview
        });
      }
      
      // Generate intelligent suggestions
      const analysis = this.generateSuggestions(sheets);
      
      return {
        sheets,
        analysis
      };
      
    } catch (error) {
      console.error('Error analyzing Excel structure:', error);
      throw new Error('Failed to analyze Excel file structure');
    }
  }
  
  /**
   * Parse Excel using provided column mappings
   */
  async parseWithMappings(buffer: Buffer, mappings: ColumnMappings): Promise<ParseResult> {
    try {
      // Validate mappings first
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const analysis = await this.analyzeExcelStructure(buffer);
      const validation = this.validateMappings(mappings, analysis.sheets);
      
      if (!validation.isValid) {
        return {
          tables: [],
          relationships: [],
          errors: validation.errors,
          summary: { tablesFound: 0, columnsFound: 0, relationshipsFound: 0 }
        };
      }
      
      const result: ParseResult = {
        tables: [],
        relationships: [],
        errors: validation.warnings, // Start with warnings
        summary: { tablesFound: 0, columnsFound: 0, relationshipsFound: 0 }
      };
      
      // Parse tables
      const tables = await this.extractTables(workbook, mappings);
      result.tables = tables;
      result.summary.tablesFound = tables.length;
      
      // Parse columns and relationships
      const { columns, relationships } = await this.extractColumnsAndRelationships(workbook, mappings, tables);
      
      // Merge columns into tables
      this.mergeColumnsIntoTables(result.tables, columns);
      result.relationships = relationships;
      result.summary.columnsFound = columns.length;
      result.summary.relationshipsFound = relationships.length;
      
      // Auto-create missing target tables for foreign keys
      this.autoCreateMissingTables(result);
      
      return result;
      
    } catch (error) {
      console.error('Error parsing Excel with mappings:', error);
      return {
        tables: [],
        relationships: [],
        errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        summary: { tablesFound: 0, columnsFound: 0, relationshipsFound: 0 }
      };
    }
  }
  
  /**
   * Generate intelligent suggestions for sheet mappings
   */
  private generateSuggestions(sheets: ExcelSheet[]): ExcelAnalysis['analysis'] {
    let suggestedTableSheet: string | undefined;
    let suggestedColumnSheet: string | undefined;
    let confidence = 0;
    
    // Look for sheets that might contain table definitions
    const tableSheetCandidates = sheets.filter(sheet => {
      const name = sheet.name.toLowerCase();
      return name.includes('table') || name.includes('entity') || name.includes('metadata');
    });
    
    // Look for sheets that might contain column definitions  
    const columnSheetCandidates = sheets.filter(sheet => {
      const name = sheet.name.toLowerCase();
      const columns = sheet.columns.map(c => c.toLowerCase());
      return (
        name.includes('column') || 
        name.includes('attribute') || 
        name.includes('field') ||
        columns.some(col => col.includes('column') || col.includes('attribute') || col.includes('field'))
      );
    });
    
    // Make suggestions based on analysis
    if (tableSheetCandidates.length > 0) {
      suggestedTableSheet = tableSheetCandidates[0].name;
      confidence += 0.4;
    }
    
    if (columnSheetCandidates.length > 0) {
      suggestedColumnSheet = columnSheetCandidates[0].name;
      confidence += 0.4;
    }
    
    // Boost confidence if we found both
    if (suggestedTableSheet && suggestedColumnSheet) {
      confidence += 0.2;
    }
    
    return {
      suggestedTableSheet,
      suggestedColumnSheet,
      confidence: Math.min(confidence, 1.0)
    };
  }
  
  /**
   * Validate that mappings are correct and all required columns exist
   */
  private validateMappings(mappings: ColumnMappings, sheets: ExcelSheet[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if specified sheets exist
    const tableSheet = sheets.find(s => s.name === mappings.tableSheet);
    if (!tableSheet) {
      errors.push(`Table sheet "${mappings.tableSheet}" not found`);
      return { isValid: false, errors, warnings };
    }
    
    const columnSheet = sheets.find(s => s.name === mappings.columnSheet);
    if (!columnSheet) {
      errors.push(`Column sheet "${mappings.columnSheet}" not found`);
      return { isValid: false, errors, warnings };
    }
    
    // Check if required columns exist in table sheet
    if (!tableSheet.columns.includes(mappings.tableNameColumn)) {
      errors.push(`Column "${mappings.tableNameColumn}" not found in table sheet "${mappings.tableSheet}"`);
    }
    
    // Check if required columns exist in column sheet
    const requiredColumnMappings = [
      { key: 'columnTableNameColumn', name: 'table name column' },
      { key: 'columnNameColumn', name: 'column name column' },
      { key: 'columnTypeColumn', name: 'column type column' }
    ];
    
    for (const mapping of requiredColumnMappings) {
      const columnName = mappings[mapping.key as keyof ColumnMappings] as string;
      if (columnName && !columnSheet.columns.includes(columnName)) {
        errors.push(`Column "${columnName}" (${mapping.name}) not found in column sheet "${mappings.columnSheet}"`);
      }
    }
    
    // Check optional columns and warn if not found
    const optionalMappings = [
      { key: 'tableTypeColumn', name: 'table type column' },
      { key: 'primaryKeyColumn', name: 'primary key column' },
      { key: 'foreignKeyTableColumn', name: 'foreign key table column' },
      { key: 'foreignKeyColumnColumn', name: 'foreign key column column' }
    ];
    
    for (const mapping of optionalMappings) {
      const columnName = mappings[mapping.key as keyof ColumnMappings] as string;
      if (columnName && !columnSheet.columns.includes(columnName)) {
        warnings.push(`Optional column "${columnName}" (${mapping.name}) not found in column sheet "${mappings.columnSheet}"`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Extract table definitions from the specified sheet
   */
  private async extractTables(workbook: XLSX.WorkBook, mappings: ColumnMappings): Promise<ParseResult['tables']> {
    const worksheet = workbook.Sheets[mappings.tableSheet];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
    
    // Find header row
    let headerRowIndex = 0;
    for (let i = 0; i < jsonData.length; i++) {
      if (jsonData[i] && jsonData[i].includes(mappings.tableNameColumn)) {
        headerRowIndex = i;
        break;
      }
    }
    
    const headers = jsonData[headerRowIndex];
    const tableNameIndex = headers.indexOf(mappings.tableNameColumn);
    const tableTypeIndex = mappings.tableTypeColumn ? headers.indexOf(mappings.tableTypeColumn) : -1;
    
    const tables: ParseResult['tables'] = [];
    
    // Process each data row
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || !row[tableNameIndex]) continue;
      
      const tableName = row[tableNameIndex].toString().trim();
      if (!tableName) continue;
      
      // Check table type filter if provided
      if (tableTypeIndex >= 0 && mappings.tableTypeColumn) {
        const tableType = row[tableTypeIndex]?.toString().toLowerCase();
        // Only include entities (similar to original parser logic)
        if (tableType && !['entity', 'staticentity', 'table'].includes(tableType)) {
          continue;
        }
      }
      
      tables.push({
        name: tableName,
        columns: [] // Will be populated later
      });
    }
    
    return tables;
  }
  
  /**
   * Extract column definitions and relationships
   */
  private async extractColumnsAndRelationships(
    workbook: XLSX.WorkBook, 
    mappings: ColumnMappings, 
    tables: ParseResult['tables']
  ): Promise<{ columns: any[], relationships: ParseResult['relationships'] }> {
    const worksheet = workbook.Sheets[mappings.columnSheet];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
    
    // Find header row
    let headerRowIndex = 0;
    for (let i = 0; i < jsonData.length; i++) {
      if (jsonData[i] && jsonData[i].includes(mappings.columnNameColumn)) {
        headerRowIndex = i;
        break;
      }
    }
    
    const headers = jsonData[headerRowIndex];
    const tableNameIndex = headers.indexOf(mappings.columnTableNameColumn);
    const columnNameIndex = headers.indexOf(mappings.columnNameColumn);
    const columnTypeIndex = headers.indexOf(mappings.columnTypeColumn);
    const primaryKeyIndex = mappings.primaryKeyColumn ? headers.indexOf(mappings.primaryKeyColumn) : -1;
    const foreignKeyTableIndex = mappings.foreignKeyTableColumn ? headers.indexOf(mappings.foreignKeyTableColumn) : -1;
    const foreignKeyColumnIndex = mappings.foreignKeyColumnColumn ? headers.indexOf(mappings.foreignKeyColumnColumn) : -1;
    
    const columns: any[] = [];
    const relationships: ParseResult['relationships'] = [];
    const tableNames = new Set(tables.map(t => t.name));
    
    // Process each data row
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || !row[tableNameIndex] || !row[columnNameIndex]) continue;
      
      const tableName = row[tableNameIndex].toString().trim();
      const columnName = row[columnNameIndex].toString().trim();
      const columnType = row[columnTypeIndex]?.toString().trim() || 'text';
      
      if (!tableName || !columnName) continue;
      
      // Only process columns for tables we've identified
      if (!tableNames.has(tableName)) continue;
      
      // Determine if this is a primary key
      const isPrimaryKey = primaryKeyIndex >= 0 
        ? this.parseBooleanValue(row[primaryKeyIndex])
        : false;
      
      // Check for foreign key relationship
      let isForeignKey = false;
      let references: { table: string; column: string } | undefined;
      
      if (foreignKeyTableIndex >= 0 && foreignKeyColumnIndex >= 0) {
        const refTable = row[foreignKeyTableIndex]?.toString().trim();
        const refColumn = row[foreignKeyColumnIndex]?.toString().trim();
        
        if (refTable && refColumn) {
          isForeignKey = true;
          references = { table: refTable, column: refColumn };
          
          // Add to relationships
          relationships.push({
            sourceTable: tableName,
            sourceColumn: columnName,
            targetTable: refTable,
            targetColumn: refColumn
          });
        }
      }
      
      columns.push({
        tableName,
        name: columnName,
        type: columnType,
        isPrimaryKey,
        isForeignKey,
        references
      });
    }
    
    return { columns, relationships };
  }
  
  /**
   * Merge extracted columns into their respective tables
   */
  private mergeColumnsIntoTables(tables: ParseResult['tables'], columns: any[]): void {
    const columnsByTable = new Map<string, any[]>();
    
    // Group columns by table
    for (const column of columns) {
      if (!columnsByTable.has(column.tableName)) {
        columnsByTable.set(column.tableName, []);
      }
      columnsByTable.get(column.tableName)!.push({
        name: column.name,
        type: column.type,
        isPrimaryKey: column.isPrimaryKey,
        isForeignKey: column.isForeignKey,
        references: column.references
      });
    }
    
    // Assign columns to tables
    for (const table of tables) {
      table.columns = columnsByTable.get(table.name) || [];
    }
  }
  
  /**
   * Auto-create missing target tables for foreign key relationships
   */
  private autoCreateMissingTables(result: ParseResult): void {
    const existingTableNames = new Set(result.tables.map(t => t.name));
    const missingTables = new Set<string>();
    
    // Find missing target tables
    for (const relationship of result.relationships) {
      if (!existingTableNames.has(relationship.targetTable)) {
        missingTables.add(relationship.targetTable);
      }
    }
    
    // Create missing tables
    for (const tableName of missingTables) {
      result.tables.push({
        name: tableName,
        columns: [{
          name: 'id', // Default primary key
          type: 'int',
          isPrimaryKey: true,
          isForeignKey: false
        }]
      });
      
      result.errors.push(`Auto-created missing table: ${tableName}`);
    }
  }
  
  /**
   * Parse boolean values from Excel cells
   */
  private parseBooleanValue(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const str = value.toLowerCase().trim();
      return ['true', 'yes', '1', 'y', 'on'].includes(str);
    }
    if (typeof value === 'number') return value !== 0;
    return false;
  }
}

export const flexibleExcelParser = new FlexibleExcelParser();