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
    confidence: number;
  };
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
  // Codemaster configurations
  codemasterConfigurations?: CodemasterConfiguration[];
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
      // Codemaster metadata fields
      codemasterValues?: any[];
      codemasterSource?: string;
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
      
      // Generate intelligent suggestions
      const analysis = this.generateSuggestions(sheets);
      
      return {
        sheets,
        codemasterSheets: [], // Will be populated based on user mapping
        analysis
      };
      
    } catch (error) {
      console.error('Error analyzing Excel structure:', error);
      throw new Error('Failed to analyze Excel file structure');
    }
  }
  
  /**
   * Process manual codemaster configurations created by the user
   * If targetFields is empty, automatically enhance existing tables with codemaster values
   */
  private processCodemasterMappings(workbook: ExcelJS.Workbook, mappings: ColumnMappings, parsedTables: ParsedTable[]): CodemasterMapping[] {
    console.log('🔍 [CODEMASTER DEBUG] processCodemasterMappings called with:', {
      hasCodemasterConfigs: !!mappings.codemasterConfigurations,
      configCount: mappings.codemasterConfigurations?.length || 0,
      allMappingKeys: Object.keys(mappings)
    });

    const codemasterMappings: CodemasterMapping[] = [];
    
    if (!mappings.codemasterConfigurations || mappings.codemasterConfigurations.length === 0) {
      console.log('🔍 [CODEMASTER DEBUG] No codemaster configurations found, returning empty array');
      return codemasterMappings;
    }
    
    for (const config of mappings.codemasterConfigurations) {
      const worksheet = workbook.getWorksheet(config.selectedSheet);
      if (!worksheet) {
        console.warn(`Codemaster sheet "${config.selectedSheet}" not found`);
        continue;
      }
      
      // Extract code values based on configuration type
      const codeValues = this.extractCodeValuesFromConfiguration(
        worksheet, 
        config
      );
      
      console.log(`🔍 [CODEMASTER DEBUG] Extracted ${codeValues.length} code values from ${config.selectedSheet}`);
      
      // If targetFields is empty, auto-enhance existing tables
      if (config.targetFields.length === 0) {
        console.log('🔍 [CODEMASTER DEBUG] No target fields specified, attempting table enhancement...');
        const enhancedMappings = this.enhanceTablesWithCodemasterValues(
          config, 
          codeValues, 
          parsedTables
        );
        codemasterMappings.push(...enhancedMappings);
      } else {
        // Create mappings for each manually specified target field
        for (const targetField of config.targetFields) {
          const mapping: CodemasterMapping = {
            fieldName: targetField.fieldName,
            tableName: targetField.tableName,
            sheetName: config.selectedSheet,
            codeColumn: config.codeColumn,
            descriptionColumn: config.descriptionColumn,
            codeValues,
            totalRecords: codeValues.length
          };
          
          codemasterMappings.push(mapping);
          console.log(`🔗 ${config.type} mapping: ${targetField.tableName}.${targetField.fieldName} → ${config.selectedSheet}`);
        }
      }
    }
    
    return codemasterMappings;
  }
  
  /**
   * Extract code values based on codemaster configuration type
   */
  private extractCodeValuesFromConfiguration(
    worksheet: ExcelJS.Workbook.Worksheet, 
    config: CodemasterConfiguration
  ): CodeValue[] {
    const jsonData = this.worksheetToArray(worksheet);
    if (!jsonData || jsonData.length < 2) return [];
    
    const headerRow = jsonData[0];
    const codeColIndex = headerRow.indexOf(config.codeColumn);
    const descColIndex = headerRow.indexOf(config.descriptionColumn);
    const statusColIndex = config.statusColumn ? headerRow.indexOf(config.statusColumn) : -1;
    
    if (codeColIndex === -1 || descColIndex === -1) {
      console.warn(`Column mapping error: ${config.codeColumn} or ${config.descriptionColumn} not found`);
      return [];
    }
    
    const codeValues: CodeValue[] = [];
    
    // Process based on configuration type
    switch (config.type) {
      case 'field_enums':
        // Simple code-description pairs for specific fields
        return this.extractFieldEnumValues(jsonData, codeColIndex, descColIndex, statusColIndex, config);
        
      case 'entity_tables':
        // Codes organized by entity/table categories
        return this.extractEntityTableValues(jsonData, codeColIndex, descColIndex, statusColIndex, config);
        
      case 'mixed':
        // Multiple code types with category column
        return this.extractMixedCategoryValues(jsonData, codeColIndex, descColIndex, statusColIndex, config);
        
      default:
        console.warn(`Unknown codemaster type: ${config.type}`);
        return [];
    }
  }

  /**
   * Extract simple field enum values
   */
  private extractFieldEnumValues(
    jsonData: string[][],
    codeColIndex: number,
    descColIndex: number,
    statusColIndex: number,
    config: CodemasterConfiguration
  ): CodeValue[] {
    const codeValues: CodeValue[] = [];
    const fieldColIndex = config.fieldColumn ? jsonData[0].indexOf(config.fieldColumn) : -1;
    
    // Process all data rows (excluding header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row.length > Math.max(codeColIndex, descColIndex)) {
        // If field column is specified, only include rows for specific fields
        if (fieldColIndex >= 0 && config.targetFields.length > 0) {
          const fieldName = row[fieldColIndex]?.toString().toLowerCase();
          const hasMatchingField = config.targetFields.some(
            tf => tf.fieldName.toLowerCase() === fieldName
          );
          if (!hasMatchingField) continue;
        }
        
        const code = row[codeColIndex];
        const description = row[descColIndex];
        const status = statusColIndex >= 0 ? row[statusColIndex] : undefined;
        
        if (code && description) {
          codeValues.push({
            code: code.toString().trim(),
            description: description.toString().trim(),
            isActive: status ? this.parseActiveStatus(status.toString()) : true
          });
        }
      }
    }
    
    return codeValues;
  }

  /**
   * Extract entity table values organized by entity/table
   */
  private extractEntityTableValues(
    jsonData: string[][],
    codeColIndex: number,
    descColIndex: number,
    statusColIndex: number,
    config: CodemasterConfiguration
  ): CodeValue[] {
    const codeValues: CodeValue[] = [];
    const entityColIndex = config.entityColumn ? jsonData[0].indexOf(config.entityColumn) : -1;
    
    // Process all data rows (excluding header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row.length > Math.max(codeColIndex, descColIndex)) {
        const code = row[codeColIndex];
        const description = row[descColIndex];
        const status = statusColIndex >= 0 ? row[statusColIndex] : undefined;
        const entityName = entityColIndex >= 0 ? row[entityColIndex]?.toString().trim() : undefined;
        
        // If entity column is specified and target fields exist, filter by target tables
        if (entityColIndex >= 0 && config.targetFields.length > 0) {
          const hasMatchingEntity = config.targetFields.some(
            tf => tf.tableName.toLowerCase() === entityName?.toLowerCase()
          );
          if (!hasMatchingEntity) continue;
        }
        
        if (code && description) {
          codeValues.push({
            code: code.toString().trim(),
            description: description.toString().trim(),
            isActive: status ? this.parseActiveStatus(status.toString()) : true,
            notes: entityName ? `Entity: ${entityName}` : undefined
          });
        }
      }
    }
    
    return codeValues;
  }

  /**
   * Extract mixed category values with category grouping
   */
  private extractMixedCategoryValues(
    jsonData: string[][],
    codeColIndex: number,
    descColIndex: number,
    statusColIndex: number,
    config: CodemasterConfiguration
  ): CodeValue[] {
    const codeValues: CodeValue[] = [];
    const categoryColIndex = config.categoryColumn ? jsonData[0].indexOf(config.categoryColumn) : -1;
    
    // Process all data rows (excluding header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row.length > Math.max(codeColIndex, descColIndex)) {
        const code = row[codeColIndex];
        const description = row[descColIndex];
        const status = statusColIndex >= 0 ? row[statusColIndex] : undefined;
        
        if (code && description) {
          const notes = categoryColIndex >= 0 ? row[categoryColIndex]?.toString() : undefined;
          
          codeValues.push({
            code: code.toString().trim(),
            description: description.toString().trim(),
            isActive: status ? this.parseActiveStatus(status.toString()) : true,
            notes: notes ? `Category: ${notes}` : undefined
          });
        }
      }
    }
    
    return codeValues;
  }

  /**
   * Extract code values from a codemaster sheet (legacy method)
   */
  private extractCodeValuesFromSheet(
    worksheet: ExcelJS.Workbook.Worksheet, 
    codeColumn: string, 
    descriptionColumn: string,
    statusColumn?: string
  ): CodeValue[] {
    const jsonData = this.worksheetToArray(worksheet);
    if (!jsonData || jsonData.length < 2) return [];
    
    const headerRow = jsonData[0];
    const codeColIndex = headerRow.indexOf(codeColumn);
    const descColIndex = headerRow.indexOf(descriptionColumn);
    const statusColIndex = statusColumn ? headerRow.indexOf(statusColumn) : -1;
    
    if (codeColIndex === -1 || descColIndex === -1) {
      console.warn(`Column mapping error: ${codeColumn} or ${descriptionColumn} not found`);
      return [];
    }
    
    const codeValues: CodeValue[] = [];
    
    // Process all data rows (excluding header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row.length > Math.max(codeColIndex, descColIndex)) {
        const code = row[codeColIndex];
        const description = row[descColIndex];
        const status = statusColIndex >= 0 ? row[statusColIndex] : undefined;
        
        if (code && description) {
          codeValues.push({
            code: code.toString().trim(),
            description: description.toString().trim(),
            isActive: status ? this.parseActiveStatus(status.toString()) : true
          });
        }
      }
    }
    
    return codeValues;
  }
  
  /**
   * Parse status column value to determine if code is active
   */
  private parseActiveStatus(status: string): boolean {
    const statusLower = status.toLowerCase().trim();
    // Common patterns for active status
    return !['inactive', 'disabled', 'false', '0', 'no', 'n'].includes(statusLower);
  }

  /**
   * Enhance existing tables with codemaster values when targetFields is empty
   * Matches codemaster table names to existing parsed tables and adds value metadata
   */
  private enhanceTablesWithCodemasterValues(
    config: CodemasterConfiguration,
    codeValues: CodeValue[],
    parsedTables: ParsedTable[]
  ): CodemasterMapping[] {
    const enhancedMappings: CodemasterMapping[] = [];
    
    console.log('🔍 [CODEMASTER DEBUG] Attempting to enhance tables with codemaster values');
    console.log('🔍 [CODEMASTER DEBUG] Available tables:', parsedTables.map(t => t.name));
    
    // Extract table names from codemaster data based on configuration type
    const codemasterTableNames = this.extractTableNamesFromCodemaster(config, codeValues);
    console.log('🔍 [CODEMASTER DEBUG] Codemaster table names found:', codemasterTableNames);
    
    // Fallback strategy: If no table names were extracted, try to infer from sheet name
    let tablesToProcess = codemasterTableNames;
    if (tablesToProcess.length === 0) {
      console.log('🔍 [CODEMASTER DEBUG] No table names extracted, attempting fallback with sheet name');
      const sheetName = config.selectedSheet;
      
      // Try to match the sheet name against available tables using similarity matching
      const bestTableMatch = this.findMatchingTable(sheetName, parsedTables);
      if (bestTableMatch) {
        tablesToProcess = [sheetName]; // Use the original sheet name for matching
        console.log(`🔍 [CODEMASTER DEBUG] Fallback: Using sheet name "${sheetName}" for table matching`);
      } else {
        console.log('🔍 [CODEMASTER DEBUG] Fallback failed: No similar table found for sheet name');
      }
    }
    
    // Match each codemaster table name to existing parsed tables
    for (const codemasterTableName of tablesToProcess) {
      const matchingTable = this.findMatchingTable(codemasterTableName, parsedTables);
      
      if (matchingTable) {
        console.log(`🔗 [CODEMASTER DEBUG] Matched codemaster table "${codemasterTableName}" to existing table "${matchingTable.name}"`);
        
        // Get values specific to this table
        const tableSpecificValues = this.getValuesForTable(codemasterTableName, config, codeValues);
        
        // Enhance the table with codemaster values
        this.enhanceTableWithValues(matchingTable, tableSpecificValues, config);
        
        // Create a mapping entry for documentation
        const mapping: CodemasterMapping = {
          fieldName: '_table_values', // Special field name indicating table-level enhancement
          tableName: matchingTable.name,
          sheetName: config.selectedSheet,
          codeColumn: config.codeColumn,
          descriptionColumn: config.descriptionColumn,
          codeValues: tableSpecificValues,
          totalRecords: tableSpecificValues.length
        };
        
        enhancedMappings.push(mapping);
        console.log(`✅ [CODEMASTER DEBUG] Enhanced table "${matchingTable.name}" with ${tableSpecificValues.length} values`);
      } else {
        console.log(`⚠️ [CODEMASTER DEBUG] No matching table found for codemaster table "${codemasterTableName}"`);
      }
    }
    
    return enhancedMappings;
  }

  /**
   * Extract table names from codemaster data based on configuration type
   */
  private extractTableNamesFromCodemaster(config: CodemasterConfiguration, codeValues: CodeValue[]): string[] {
    console.log(`🔍 [CODEMASTER DEBUG] Extracting table names for type: ${config.type}`);
    
    // For entity_tables type, the entity column contains table names
    if (config.type === 'entity_tables' && config.entityColumn) {
      // Extract unique table names from the entity column values
      const tableNames = new Set<string>();
      codeValues.forEach(value => {
        if (value.notes && value.notes.includes('Entity:')) {
          const entityName = value.notes.replace('Entity:', '').trim();
          if (entityName) {
            tableNames.add(entityName);
          }
        }
      });
      console.log(`🔍 [CODEMASTER DEBUG] Entity tables found: ${Array.from(tableNames)}`);
      return Array.from(tableNames);
    }
    
    // For field_enums type, extract table names from targetFields configuration
    if (config.type === 'field_enums' && config.targetFields && config.targetFields.length > 0) {
      const tableNames = new Set<string>();
      config.targetFields.forEach(target => {
        if (target.tableName) {
          tableNames.add(target.tableName);
        }
      });
      console.log(`🔍 [CODEMASTER DEBUG] Field enum tables found: ${Array.from(tableNames)}`);
      return Array.from(tableNames);
    }
    
    // For mixed type, extract table names from category notes or targetFields
    if (config.type === 'mixed') {
      const tableNames = new Set<string>();
      
      // First try to extract from targetFields if available
      if (config.targetFields && config.targetFields.length > 0) {
        config.targetFields.forEach(target => {
          if (target.tableName) {
            tableNames.add(target.tableName);
          }
        });
      }
      
      // Also try to extract from category notes if they contain table-like names
      codeValues.forEach(value => {
        if (value.notes && value.notes.includes('Category:')) {
          const categoryName = value.notes.replace('Category:', '').trim();
          if (categoryName && categoryName.length > 2) {
            tableNames.add(categoryName);
          }
        }
      });
      
      console.log(`🔍 [CODEMASTER DEBUG] Mixed type tables found: ${Array.from(tableNames)}`);
      return Array.from(tableNames);
    }
    
    console.log(`🔍 [CODEMASTER DEBUG] No table names extracted for type: ${config.type}`);
    return [];
  }

  /**
   * Calculate string similarity using Jaro-Winkler algorithm
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // Normalize strings to lowercase for comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    
    // Calculate Jaro similarity
    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    
    const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
    
    // Calculate Jaro-Winkler similarity (gives more weight to common prefix)
    const prefixLength = Math.min(4, this.getCommonPrefixLength(s1, s2));
    return jaro + (0.1 * prefixLength * (1 - jaro));
  }
  
  /**
   * Get common prefix length up to 4 characters
   */
  private getCommonPrefixLength(str1: string, str2: string): number {
    let prefixLength = 0;
    const maxLength = Math.min(str1.length, str2.length, 4);
    
    for (let i = 0; i < maxLength; i++) {
      if (str1[i] === str2[i]) {
        prefixLength++;
      } else {
        break;
      }
    }
    
    return prefixLength;
  }

  /**
   * Find matching table in parsed tables using percentage-based similarity matching
   */
  private findMatchingTable(codemasterTableName: string, parsedTables: ParsedTable[]): ParsedTable | null {
    // First try exact match
    const exactMatch = parsedTables.find(table => 
      table.name.toLowerCase() === codemasterTableName.toLowerCase()
    );
    
    if (exactMatch) return exactMatch;
    
    // Calculate similarity scores for all tables
    const similarities = parsedTables.map(table => ({
      table,
      similarity: this.calculateSimilarity(codemasterTableName, table.name)
    }));
    
    // Sort by similarity score (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Return the best match if it meets the minimum threshold (70%)
    const bestMatch = similarities[0];
    const SIMILARITY_THRESHOLD = 0.7;
    
    if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLD) {
      return bestMatch.table;
    }
    
    return null;
  }

  /**
   * Get codemaster values specific to a table
   */
  private getValuesForTable(tableName: string, config: CodemasterConfiguration, allValues: CodeValue[]): CodeValue[] {
    console.log(`🔍 [CODEMASTER DEBUG] getValuesForTable called for table: "${tableName}", config type: "${config.type}"`);
    console.log(`🔍 [CODEMASTER DEBUG] Total available values: ${allValues.length}`);
    
    // For entity_tables type, filter by exact entity name match in notes
    if (config.type === 'entity_tables') {
      const filteredValues = allValues.filter(value => {
        const hasExactEntityNote = value.notes === `Entity: ${tableName}`;
        if (hasExactEntityNote) {
          console.log(`✅ [CODEMASTER DEBUG] Value matches table "${tableName}": ${value.code} - ${value.description} (notes: ${value.notes})`);
        }
        return hasExactEntityNote;
      });
      console.log(`🔍 [CODEMASTER DEBUG] Filtered values for table "${tableName}": ${filteredValues.length} values`);
      return filteredValues;
    }
    
    // For field_enums type, check if this table has specific target field configurations
    if (config.type === 'field_enums' && config.targetFields && config.targetFields.length > 0) {
      const hasTargetForThisTable = config.targetFields.some(target => 
        target.tableName.toLowerCase() === tableName.toLowerCase()
      );
      if (hasTargetForThisTable) {
        console.log(`🔍 [CODEMASTER DEBUG] field_enums type - table "${tableName}" has explicit target fields, returning all values`);
        return allValues;
      } else {
        console.log(`🔍 [CODEMASTER DEBUG] field_enums type - table "${tableName}" has no explicit target fields, returning empty array`);
        return [];
      }
    }
    
    // For mixed type, try to filter by category or return values for configured tables only
    if (config.type === 'mixed') {
      // If target fields are specified, only return values for explicitly configured tables
      if (config.targetFields && config.targetFields.length > 0) {
        const hasTargetForThisTable = config.targetFields.some(target => 
          target.tableName.toLowerCase() === tableName.toLowerCase()
        );
        if (hasTargetForThisTable) {
          return allValues;
        } else {
          return [];
        }
      }
      
      // If no target fields, try to filter by category in notes (fallback behavior)
      const categoryFilteredValues = allValues.filter(value => 
        value.notes && value.notes.toLowerCase().includes(tableName.toLowerCase())
      );
      
      if (categoryFilteredValues.length > 0) {
        console.log(`🔍 [CODEMASTER DEBUG] mixed type - found ${categoryFilteredValues.length} values for table "${tableName}" by category filtering`);
        return categoryFilteredValues;
      }
    }
    
    // Safer fallback: instead of returning ALL values, return empty array
    // This prevents cross-contamination between tables
    console.log(`⚠️ [CODEMASTER DEBUG] No specific filtering logic for type "${config.type}" and table "${tableName}" - returning empty array to prevent cross-contamination`);
    return [];
  }

  /**
   * Enhance a table with codemaster values by adding metadata
   */
  private enhanceTableWithValues(table: ParsedTable, values: CodeValue[], config: CodemasterConfiguration): void {
    // Add codemaster values as table metadata
    // We can extend the ParsedTable interface later to include metadata
    // For now, we'll add it as a comment or note in a special column
    
    // Look for ID or similar primary key column to enhance
    const idColumn = table.columns.find(col => 
      col.isPrimaryKey || 
      col.name.toLowerCase().includes('id') ||
      col.name.toLowerCase() === 'code'
    );
    
    if (idColumn && values.length > 0) {
      // Add values as a comment/note to the column
      const valuesText = values.map(v => `${v.code}: ${v.description}`).join(', ');
      
      // Store the enhancement information (this could be extended to a proper metadata field)
      (idColumn as any).codemasterValues = values;
      (idColumn as any).codemasterSource = config.selectedSheet;
      
      console.log(`📝 [CODEMASTER DEBUG] Added ${values.length} codemaster values to column "${idColumn.name}" in table "${table.name}"`);
    }
  }
  
  /**
   * Parse Excel using provided column mappings
   */
  async parseWithMappings(buffer: Buffer, mappings: ColumnMappings): Promise<ParseResult> {
    try {
      console.log('🔍 [CODEMASTER DEBUG] Starting parseWithMappings with mappings:', {
        hasCodemasterConfigs: !!mappings.codemasterConfigurations,
        codemasterConfigCount: mappings.codemasterConfigurations?.length || 0,
        codemasterConfigs: mappings.codemasterConfigurations
      });

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
      
      // Process manual codemaster mappings and enhance existing tables
      console.log('🔍 [CODEMASTER DEBUG] About to process codemaster mappings...');
      result.codemasterMappings = this.processCodemasterMappings(workbook, mappings, result.tables);
      console.log('🔍 [CODEMASTER DEBUG] Processed codemaster mappings:', {
        count: result.codemasterMappings.length,
        mappings: result.codemasterMappings
      });
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