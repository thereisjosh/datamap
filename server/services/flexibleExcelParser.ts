import ExcelJS from 'exceljs';

// TypeScript interfaces for flexible parser
export interface ExcelSheet {
  name: string;
  columns: string[];
  rowCount: number;
  preview: string[][]; // First 5 rows for preview
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

export interface ExcelAnalysis {
  sheets: ExcelSheet[];
  codemasterSheets: CodemasterSheet[];
  analysis: {
    suggestedTableSheet?: string;
    suggestedColumnSheet?: string;
    suggestedCodemasterSheets?: string[];
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

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class FlexibleExcelParser {
  
  private worksheetToArray(worksheet: ExcelJS.Worksheet): string[][] {
    const data: string[][] = [];
    
    worksheet.eachRow((row, rowNumber) => {
      const rowData: string[] = [];
      row.eachCell((cell, colNumber) => {
        // Handle different cell types
        let value = cell.value;
        if (value && typeof value === 'object' && 'text' in value) {
          value = value.text; // Handle rich text
        }
        rowData[colNumber - 1] = value?.toString() || '';
      });
      data.push(rowData);
    });
    
    return data;
  }
  
  /**
   * Analyze Excel structure and extract sheet/column information
   */
  async analyzeExcelStructure(buffer: Buffer): Promise<ExcelAnalysis> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheets: ExcelSheet[] = [];
      
      // Process each sheet
      for (const worksheet of workbook.worksheets) {
        const sheetName = worksheet.name;
        const jsonData = this.worksheetToArray(worksheet);
        
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
      
      // Detect codemaster sheets
      const codemasterSheets = this.detectCodemasterSheets(workbook, sheets);
      
      // Generate intelligent suggestions
      const analysis = this.generateSuggestions(sheets, codemasterSheets);
      
      return {
        sheets,
        codemasterSheets,
        analysis
      };
      
    } catch (error) {
      console.error('Error analyzing Excel structure:', error);
      throw new Error('Failed to analyze Excel file structure');
    }
  }
  
  /**
   * Detect codemaster/lookup sheets based on naming patterns and content structure
   */
  private detectCodemasterSheets(workbook: ExcelJS.Workbook, sheets: ExcelSheet[]): CodemasterSheet[] {
    const codemasterSheets: CodemasterSheet[] = [];
    
    // Common patterns for codemaster sheet names
    const codemasterPatterns = [
      /code/i, /master/i, /lookup/i, /reference/i, /enum/i, 
      /list/i, /values/i, /domain/i, /catalogue/i, /catalog/i
    ];
    
    for (const sheet of sheets) {
      const sheetName = sheet.name.toLowerCase();
      
      // Check if sheet name matches codemaster patterns
      const isCodemasterByName = codemasterPatterns.some(pattern => pattern.test(sheetName));
      
      // Check if sheet structure looks like a codemaster (2-3 columns, simple structure)
      const hasSimpleStructure = sheet.columns.length >= 2 && sheet.columns.length <= 4;
      const hasCodePattern = sheet.columns.some(col => 
        /code|id|key|value/i.test(col.toLowerCase())
      );
      const hasDescPattern = sheet.columns.some(col => 
        /desc|description|name|label|text/i.test(col.toLowerCase())
      );
      
      const isCodemasterByStructure = hasSimpleStructure && hasCodePattern && hasDescPattern;
      
      if (isCodemasterByName || isCodemasterByStructure) {
        // Determine codemaster type
        let type: 'lookup' | 'enum' | 'reference' | 'code' = 'code';
        if (/lookup/i.test(sheetName)) type = 'lookup';
        else if (/enum/i.test(sheetName)) type = 'enum';
        else if (/reference/i.test(sheetName)) type = 'reference';
        
        // Find potential code and description columns
        const codeColumn = sheet.columns.find(col => 
          /^(code|id|key|value)$/i.test(col) || 
          /code$/i.test(col) || 
          /id$/i.test(col)
        ) || sheet.columns[0];
        
        const descColumn = sheet.columns.find(col => 
          /desc|description|name|label|text/i.test(col.toLowerCase())
        ) || sheet.columns[1];
        
        if (codeColumn && descColumn) {
          // Extract a sample of code values for preview
          const sampleMappings: CodemasterMapping[] = [];
          
          // Create a basic mapping for this sheet
          const mapping: CodemasterMapping = {
            fieldName: sheetName.replace(/[^a-zA-Z0-9]/g, ''),
            tableName: 'Unknown', // Will be determined during field analysis
            sheetName: sheet.name,
            codeColumn,
            descriptionColumn: descColumn,
            codeValues: this.extractCodeValues(sheet.preview, codeColumn, descColumn),
            totalRecords: sheet.rowCount
          };
          
          sampleMappings.push(mapping);
          
          codemasterSheets.push({
            name: sheet.name,
            type,
            detectedMappings: sampleMappings,
            columns: sheet.columns,
            rowCount: sheet.rowCount,
            preview: sheet.preview
          });
          
          console.log(`🔍 Detected codemaster sheet: "${sheet.name}" (${type}) with ${sheet.rowCount} rows`);
        }
      }
    }
    
    return codemasterSheets;
  }
  
  /**
   * Extract code values from sheet preview data
   */
  private extractCodeValues(preview: string[][], codeColumn: string, descColumn: string): CodeValue[] {
    if (!preview || preview.length < 2) return [];
    
    const headerRow = preview[0];
    const codeColIndex = headerRow.indexOf(codeColumn);
    const descColIndex = headerRow.indexOf(descColumn);
    
    if (codeColIndex === -1 || descColIndex === -1) return [];
    
    const codeValues: CodeValue[] = [];
    
    // Process up to 10 sample rows (excluding header)
    for (let i = 1; i < Math.min(preview.length, 11); i++) {
      const row = preview[i];
      if (row && row.length > Math.max(codeColIndex, descColIndex)) {
        const code = row[codeColIndex];
        const description = row[descColIndex];
        
        if (code && description) {
          codeValues.push({
            code: code.toString().trim(),
            description: description.toString().trim(),
            isActive: true // Default to active
          });
        }
      }
    }
    
    return codeValues;
  }
  
  /**
   * Create codemaster mappings by analyzing which table fields might use codemaster sheets
   */
  private createCodemasterMappings(tables: ParseResult['tables'], codemasterSheets: CodemasterSheet[]): CodemasterMapping[] {
    const mappings: CodemasterMapping[] = [];
    
    for (const codemasterSheet of codemasterSheets) {
      // Look for table fields that might reference this codemaster
      for (const table of tables) {
        for (const column of table.columns) {
          // Check if field name suggests it uses this codemaster
          const fieldName = column.name.toLowerCase();
          const sheetName = codemasterSheet.name.toLowerCase();
          
          // Pattern matching for potential codemaster usage
          const isMatch = this.fieldMatchesCodemaster(fieldName, sheetName, codemasterSheet.type);
          
          if (isMatch && codemasterSheet.detectedMappings.length > 0) {
            const baseMapping = codemasterSheet.detectedMappings[0];
            
            // Create a specific mapping for this field
            const mapping: CodemasterMapping = {
              fieldName: column.name,
              tableName: table.name,
              sheetName: codemasterSheet.name,
              codeColumn: baseMapping.codeColumn,
              descriptionColumn: baseMapping.descriptionColumn,
              codeValues: baseMapping.codeValues,
              totalRecords: codemasterSheet.rowCount
            };
            
            mappings.push(mapping);
            console.log(`🔗 Mapped field "${table.name}.${column.name}" to codemaster "${codemasterSheet.name}"`);
          }
        }
      }
    }
    
    return mappings;
  }
  
  /**
   * Check if a field name matches a codemaster sheet
   */
  private fieldMatchesCodemaster(fieldName: string, sheetName: string, type: CodemasterSheet['type']): boolean {
    // Remove common suffixes/prefixes for comparison
    const cleanFieldName = fieldName
      .replace(/id$/i, '')
      .replace(/code$/i, '')
      .replace(/type$/i, '')
      .replace(/status$/i, '');
    
    const cleanSheetName = sheetName
      .replace(/code/i, '')
      .replace(/master/i, '')
      .replace(/lookup/i, '')
      .replace(/reference/i, '');
    
    // Direct name matching
    if (cleanFieldName.includes(cleanSheetName) || cleanSheetName.includes(cleanFieldName)) {
      return true;
    }
    
    // Common patterns
    const commonPatterns = [
      // Status fields
      /status/i.test(fieldName) && /status/i.test(sheetName),
      // Type fields  
      /type/i.test(fieldName) && /type/i.test(sheetName),
      // Category fields
      /categor/i.test(fieldName) && /categor/i.test(sheetName),
      // Country/State fields
      /country/i.test(fieldName) && /country/i.test(sheetName),
      /state/i.test(fieldName) && /state/i.test(sheetName),
    ];
    
    return commonPatterns.some(pattern => pattern);
  }
  
  /**
   * Parse Excel using provided column mappings
   */
  async parseWithMappings(buffer: Buffer, mappings: ColumnMappings): Promise<ParseResult> {
    try {
      // Validate mappings first
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const analysis = await this.analyzeExcelStructure(buffer);
      const validation = this.validateMappings(mappings, analysis.sheets);
      
      if (!validation.isValid) {
        return {
          tables: [],
          relationships: [],
          codemasterMappings: [],
          codemasterSheets: [],
          errors: validation.errors,
          summary: { tablesFound: 0, columnsFound: 0, relationshipsFound: 0, codemasterSheetsFound: 0, codeMappingsFound: 0 }
        };
      }
      
      const result: ParseResult = {
        tables: [],
        relationships: [],
        codemasterMappings: [],
        codemasterSheets: analysis.codemasterSheets,
        errors: validation.warnings, // Start with warnings
        summary: { tablesFound: 0, columnsFound: 0, relationshipsFound: 0, codemasterSheetsFound: analysis.codemasterSheets.length, codeMappingsFound: 0 }
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
      
      // Create codemaster mappings by analyzing table fields
      result.codemasterMappings = this.createCodemasterMappings(result.tables, analysis.codemasterSheets);
      result.summary.codeMappingsFound = result.codemasterMappings.length;
      
      return result;
      
    } catch (error) {
      console.error('Error parsing Excel with mappings:', error);
      return {
        tables: [],
        relationships: [],
        codemasterMappings: [],
        codemasterSheets: [],
        errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        summary: { tablesFound: 0, columnsFound: 0, relationshipsFound: 0, codemasterSheetsFound: 0, codeMappingsFound: 0 }
      };
    }
  }
  
  /**
   * Generate intelligent suggestions for sheet mappings
   */
  private generateSuggestions(sheets: ExcelSheet[], codemasterSheets: CodemasterSheet[] = []): ExcelAnalysis['analysis'] {
    let suggestedTableSheet: string | undefined;
    let suggestedColumnSheet: string | undefined;
    let suggestedCodemasterSheets: string[] = [];
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
    
    // Add codemaster sheet suggestions
    suggestedCodemasterSheets = codemasterSheets.map(sheet => sheet.name);
    if (suggestedCodemasterSheets.length > 0) {
      confidence += 0.1;
    }
    
    // Boost confidence if we found both
    if (suggestedTableSheet && suggestedColumnSheet) {
      confidence += 0.2;
    }
    
    return {
      suggestedTableSheet,
      suggestedColumnSheet,
      suggestedCodemasterSheets,
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
  private async extractTables(workbook: ExcelJS.Workbook, mappings: ColumnMappings): Promise<ParseResult['tables']> {
    const worksheet = workbook.getWorksheet(mappings.tableSheet);
    if (!worksheet) {
      throw new Error(`Table sheet "${mappings.tableSheet}" not found`);
    }
    const jsonData = this.worksheetToArray(worksheet);
    
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
    let processedRows = 0;
    let skippedRows = 0;
    let filteredOutByType = 0;
    
    // Process each data row
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      processedRows++;
      
      if (!row || !row[tableNameIndex]) {
        skippedRows++;
        continue;
      }
      
      const tableName = row[tableNameIndex].toString().trim();
      if (!tableName) {
        skippedRows++;
        continue;
      }
      
      // Check table type filter if provided
      if (tableTypeIndex >= 0 && mappings.tableTypeColumn) {
        const tableType = row[tableTypeIndex]?.toString().toLowerCase();
        // Only include entities (exact match to original parser logic)
        if (tableType && !['entity', 'staticentity'].includes(tableType)) {
          filteredOutByType++;
          console.log(`  🔍 Filtered out table "${tableName}" with Data Kind: "${tableType}"`);
          continue;
        }
      }
      
      tables.push({
        name: tableName,
        columns: [] // Will be populated later
      });
    }
    
    console.log(`📊 Table extraction summary:`);
    console.log(`  Processed rows: ${processedRows}`);
    console.log(`  Skipped rows (empty/invalid): ${skippedRows}`);
    console.log(`  Filtered out by Data Kind: ${filteredOutByType}`);
    console.log(`  Final tables included: ${tables.length}`);
    
    return tables;
  }
  
  /**
   * Extract column definitions and relationships
   */
  private async extractColumnsAndRelationships(
    workbook: ExcelJS.Workbook, 
    mappings: ColumnMappings, 
    tables: ParseResult['tables']
  ): Promise<{ columns: any[], relationships: ParseResult['relationships'] }> {
    const worksheet = workbook.getWorksheet(mappings.columnSheet);
    if (!worksheet) {
      throw new Error(`Column sheet "${mappings.columnSheet}" not found`);
    }
    const jsonData = this.worksheetToArray(worksheet);
    
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