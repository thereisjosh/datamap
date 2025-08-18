import * as ExcelJS from 'exceljs';
import { type TableData, type Column, type Relationship, tableSchema, relationshipSchema } from '@shared/schema';

interface ExcelRow {
  [key: string]: any;
}

interface ParsedMetadata {
  tables: TableData[];
  relationships: Relationship[];
  errors: string[];
}

export class ExcelParserService {
  private worksheetToJson(worksheet: ExcelJS.Worksheet): ExcelRow[] {
    const jsonData: ExcelRow[] = [];
    const headers: string[] = [];
    
    // Get headers from first row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString() || '';
    });
    
    // Process data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      
      const rowData: ExcelRow = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          // Handle different cell types
          let value = cell.value;
          if (value && typeof value === 'object' && 'text' in value) {
            value = value.text; // Handle rich text
          }
          rowData[header] = value;
        }
      });
      
      // Only add row if it has data
      if (Object.keys(rowData).length > 0) {
        jsonData.push(rowData);
      }
    });
    
    return jsonData;
  }

  private normalizeColumnName(name: string): string {
    return name?.toString().trim().toLowerCase().replace(/\s+/g, '_') || '';
  }

  private findColumn(row: ExcelRow, possibleNames: string[]): any {
    for (const name of possibleNames) {
      const normalizedName = this.normalizeColumnName(name);
      for (const [key, value] of Object.entries(row)) {
        if (this.normalizeColumnName(key) === normalizedName) {
          return value;
        }
      }
    }
    return null;
  }

  private findTableMetadataColumn(row: ExcelRow, columnType: 'tableName' | 'dataKind'): any {
    if (columnType === 'tableName') {
      return this.findColumn(row, [
        'Name',  // Primary column for TableMetadata sheet
        'Logical Table Name',  // Fallback 
        'logical_table_name',
        'table_name',
        'Table Name'
      ]);
    } else if (columnType === 'dataKind') {
      return this.findColumn(row, [
        'Data Kind',
        'data_kind',
        'kind'
      ]);
    }
    return null;
  }

  private findAttributeMetadataColumn(row: ExcelRow, columnType: 'tableName' | 'attributeName' | 'dataType' | 'isAutonumber' | 'referenceTable' | 'columnTable'): any {
    switch (columnType) {
      case 'tableName':
        return this.findColumn(row, [
          'Logical Table Name',  // Primary for AttributeMetadata
          'logical_table_name',
          'table_name',
          'Table Name'
        ]);
      case 'attributeName':
        return this.findColumn(row, [
          'Attribute Name',
          'attribute_name',
          'column_name',
          'Column Name'
        ]);
      case 'dataType':
        return this.findColumn(row, [
          'Type',
          'Data Type',
          'data_type',
          'type'
        ]);
      case 'isAutonumber':
        return this.findColumn(row, [
          'Is Autonumber',
          'is_autonumber',
          'autonumber',
          'auto_increment'
        ]);
      case 'referenceTable':
        return this.findColumn(row, [
          'Reference Table',
          'reference_table',
          'ref_table'
        ]);
      case 'columnTable':
        return this.findColumn(row, [
          'Column Table',
          'column_table',
          'ref_column'
        ]);
      default:
        return null;
    }
  }

  private inferRelationshipFromNaming(columnName: string, tableMap: Map<string, { name: string; attributes: Column[] }>): { table: string; column: string } | null {
    const lowerColumnName = columnName.toLowerCase();
    
    // Skip if it's a primary key
    if (lowerColumnName === 'id') {
      return null;
    }
    
    // Pattern 1: OpportunityStatusId -> OpportunityStatus.Id
    if (lowerColumnName.endsWith('id')) {
      const potentialTableName = columnName.slice(0, -2); // Remove 'Id'
      
      // Look for exact match first
      for (const tableName of tableMap.keys()) {
        if (tableName.toLowerCase() === potentialTableName.toLowerCase()) {
          return { table: tableName, column: 'Id' };
        }
      }
      
      // Look for partial matches between logical table names
      for (const tableName of tableMap.keys()) {
        const tableNameLower = tableName.toLowerCase();
        const potentialTableLower = potentialTableName.toLowerCase();
        
        // Check if table name ends with the potential table name
        if (tableNameLower.endsWith(potentialTableLower) || tableNameLower.includes(potentialTableLower)) {
          return { table: tableName, column: 'Id' };
        }
        
        // Check if potential table name is contained in table name (for compound names)
        if (potentialTableLower.length > 5 && tableNameLower.includes(potentialTableLower)) {
          return { table: tableName, column: 'Id' };
        }
      }
    }
    
    // Pattern 2: opportunity_status_id -> opportunity_status.id
    if (lowerColumnName.includes('_') && lowerColumnName.endsWith('_id')) {
      const potentialTableName = columnName.slice(0, -3); // Remove '_id'
      
      for (const tableName of tableMap.keys()) {
        const tableNameLower = tableName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const potentialTableLower = potentialTableName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        if (tableNameLower.includes(potentialTableLower) || potentialTableLower.includes(tableNameLower)) {
          return { table: tableName, column: 'Id' };
        }
      }
    }
    
    // Pattern 3: CreatedByEntityGroupId -> EntityGroup.Id (remove common prefixes)
    const commonPrefixes = ['created', 'updated', 'modified', 'deleted', 'assigned', 'owned'];
    let cleanColumnName = lowerColumnName;
    
    for (const prefix of commonPrefixes) {
      if (cleanColumnName.startsWith(prefix + 'by') && cleanColumnName.endsWith('id')) {
        cleanColumnName = cleanColumnName.replace(prefix + 'by', '');
        break;
      }
      if (cleanColumnName.startsWith(prefix) && cleanColumnName.endsWith('id')) {
        cleanColumnName = cleanColumnName.replace(prefix, '');
        break;
      }
    }
    
    if (cleanColumnName !== lowerColumnName && cleanColumnName.endsWith('id')) {
      const potentialTableName = cleanColumnName.slice(0, -2);
      
      for (const tableName of tableMap.keys()) {
        const tableNameLower = tableName.toLowerCase();
        if (tableNameLower.includes(potentialTableName) && potentialTableName.length > 3) {
          return { table: tableName, column: 'Id' };
        }
      }
    }
    
    return null;
  }

  async parseExcelFile(buffer: Buffer): Promise<ParsedMetadata> {
    const errors: string[] = [];
    let tables: TableData[] = [];
    let relationships: Relationship[] = [];

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      
      // Debug: Log all available sheet names
      const sheetNames = workbook.worksheets.map(ws => ws.name);
      console.log('📋 Available Excel sheets:', sheetNames);
      
      // Check for required sheets
      const tableMetadataSheet = workbook.getWorksheet('TableMetadata') || workbook.getWorksheet('tablemetadata');
      const attributeMetadataSheet = workbook.getWorksheet('AttributeMetadata') || workbook.getWorksheet('attributemetadata');

      console.log('🔍 TableMetadata sheet found:', !!tableMetadataSheet);
      console.log('🔍 AttributeMetadata sheet found:', !!attributeMetadataSheet);

      if (!tableMetadataSheet) {
        errors.push('Missing required sheet: TableMetadata');
      }

      if (!attributeMetadataSheet) {
        errors.push('Missing required sheet: AttributeMetadata');
      }

      if (errors.length > 0) {
        console.log('❌ Excel parsing errors:', errors);
        return { tables: [], relationships: [], errors };
      }

      // Parse table metadata
      const tableRows: ExcelRow[] = this.worksheetToJson(tableMetadataSheet!);
      const allTables: { name: string; attributes: Column[] }[] = []; // Store all table entries
      const tableMap = new Map<string, { name: string; attributes: Column[] }>(); // For column lookup

      console.log(`📊 TableMetadata sheet contains ${tableRows.length} rows`);
      
      // Debug: Log the first few rows to understand structure
      if (tableRows.length > 0) {
        console.log('📋 TableMetadata headers:', Object.keys(tableRows[0]));
        console.log('📋 First row sample:', tableRows[0]);
      }

      // Initialize tables from TableMetadata sheet
      let createdTablesCount = 0;
      let processedRowsCount = 0;
      let skippedRowsCount = 0;
      const skippedTables = [];
      
      console.log(`📊 HARDCODED PARSER: Processing ${tableRows.length} rows from TableMetadata`);
      
      for (const row of tableRows) {
        processedRowsCount++;
        console.log('\n🔍 Processing table row:', row);
        
        // Use sheet-specific column mapping for TableMetadata
        const logicalTableName = this.findTableMetadataColumn(row, 'tableName');
        const dataKind = this.findTableMetadataColumn(row, 'dataKind');

        console.log(`  Found logicalTableName: "${logicalTableName}"`);
        console.log(`  Found dataKind: "${dataKind}"`);
        console.log(`  dataKind?.toLowerCase(): "${dataKind?.toLowerCase()}"`);
        const isEntity = dataKind?.toLowerCase() === 'entity';
        const isStaticEntity = dataKind?.toLowerCase() === 'staticentity';
        const shouldCreateTable = logicalTableName && (isEntity || isStaticEntity);
        
        console.log(`  Condition check: isEntity=${isEntity}, isStaticEntity=${isStaticEntity}, shouldCreateTable=${shouldCreateTable}`);

        if (shouldCreateTable) {
          const tableName = logicalTableName.toString().trim();
          console.log(`  ✅ Creating table: "${tableName}"`);
          
          // FIXED: Store ALL valid table entries, even if names are similar
          // Domain-specific tables should be treated as separate entities
          const tableEntry = {
            name: tableName,
            attributes: []
          };
          
          allTables.push(tableEntry); // Store every valid table entry
          
          // Also keep in map for column lookup (use first occurrence for lookup)
          if (!tableMap.has(tableName)) {
            tableMap.set(tableName, tableEntry);
          }
          
          createdTablesCount++;
        } else {
          const tableName = logicalTableName ? logicalTableName.toString().trim() : 'Unknown';
          skippedTables.push({ tableName, dataKind });
          skippedRowsCount++;
          console.log(`  ❌ Skipping row - missing logicalTableName or dataKind not in ['entity', 'staticEntity']`);
        }
      }
      
      console.log(`\n📋 Skipped tables summary:`);
      skippedTables.forEach(({ tableName, dataKind }) => {
        console.log(`  - ${tableName}: dataKind="${dataKind}"`);
      });
      
      console.log(`\n📊 HARDCODED PARSER - TableMetadata processing summary:`);
      console.log(`  Total rows in TableMetadata: ${tableRows.length}`);
      console.log(`  Processed rows: ${processedRowsCount}`);
      console.log(`  Valid table entries: ${createdTablesCount} (should match flexible parser)`);
      console.log(`  Skipped rows: ${skippedRowsCount}`);
      console.log(`  Unique table names in tableMap: ${tableMap.size}`);
      console.log(`  NOTE: Domain-specific tables with same names are now properly preserved`);
      console.log(`  Table names: [${Array.from(tableMap.keys()).join(', ')}]`);

      // Parse attribute metadata
      const attributeRows: ExcelRow[] = this.worksheetToJson(attributeMetadataSheet!);
      
      console.log(`\n📊 AttributeMetadata sheet contains ${attributeRows.length} rows`);
      
      // Debug: Log the first few rows to understand structure
      if (attributeRows.length > 0) {
        console.log('📋 AttributeMetadata headers:', Object.keys(attributeRows[0]));
        console.log('📋 First row sample:', attributeRows[0]);
      }
      
      for (const row of attributeRows) {
        // Use sheet-specific column mapping for AttributeMetadata
        const logicalTableName = this.findAttributeMetadataColumn(row, 'tableName');
        const attributeName = this.findAttributeMetadataColumn(row, 'attributeName');
        const dataType = this.findAttributeMetadataColumn(row, 'dataType');
        const isAutonumber = this.findAttributeMetadataColumn(row, 'isAutonumber');
        const referenceTable = this.findAttributeMetadataColumn(row, 'referenceTable');
        const columnTable = this.findAttributeMetadataColumn(row, 'columnTable');

        if (!logicalTableName || !attributeName) {
          continue; // Skip rows without required fields
        }

        const tableName = logicalTableName.toString().trim();
        const columnName = attributeName.toString().trim();
        const type = dataType?.toString().trim() || 'varchar';

        // Debug: Log the values found for relationship columns
        if (referenceTable || columnTable) {
          console.log('Relationship columns found:', {
            tableName,
            columnName,
            referenceTable: referenceTable?.toString(),
            columnTable: columnTable?.toString(),
            isForeignKey: !!(referenceTable && columnTable)
          });
        }

        // Check if this is a primary key (Id column with autonumber)
        const isPrimaryKey = columnName.toLowerCase() === 'id' && 
                           (isAutonumber === true || isAutonumber?.toString().toLowerCase() === 'true');

        // Check if this is a foreign key (explicit or inferred)
        let isForeignKey = !!(referenceTable && columnTable);
        let referencedTable = referenceTable?.toString().trim();
        let referencedColumn = columnTable?.toString().trim();
        
        // Industry best practice: Trust Excel data completely, no hardcoded inference
        // Following Netflix/Amazon/Google patterns - data should be explicit in source
        if (!isForeignKey) {
          console.log(`No explicit relationship found for ${tableName}.${columnName} - following industry practice of trusting source data only`);
        }
        
        const column: Column = {
          name: columnName,
          type: type,
          isPrimaryKey,
          isForeignKey,
          references: isForeignKey ? {
            table: referencedTable!,
            column: referencedColumn!
          } : undefined
        };

        // Add column to table
        const table = tableMap.get(tableName);
        if (table) {
          table.attributes.push(column);
        }

        // Create relationship if this is a foreign key
        if (isForeignKey && referencedTable && referencedColumn) {
          const relationship = {
            id: '', // Will be set by storage
            sourceTable: tableName,
            sourceColumn: columnName,
            targetTable: referencedTable,
            targetColumn: referencedColumn,
            createdAt: new Date(),
            projectId: null,
            organizationId: null
          };
          
          console.log('Found relationship:', {
            sourceTable: relationship.sourceTable,
            sourceColumn: relationship.sourceColumn,
            targetTable: relationship.targetTable,
            targetColumn: relationship.targetColumn
          });
          
          relationships.push(relationship);
        }
      }
      
      // Auto-create missing target tables for foreign key relationships
      console.log(`\n🔧 Auto-creating missing target tables for relationships...`);
      const missingTargetTables = new Set<string>();
      
      for (const relationship of relationships) {
        if (!tableMap.has(relationship.targetTable)) {
          missingTargetTables.add(relationship.targetTable);
          console.log(`  ⚠️ Missing target table detected: "${relationship.targetTable}" (referenced by ${relationship.sourceTable}.${relationship.sourceColumn})`);
        }
      }
      
      let autoCreatedCount = 0;
      for (const missingTableName of missingTargetTables) {
        console.log(`  🆕 Auto-creating missing table: "${missingTableName}"`);
        const autoCreatedTable = {
          name: missingTableName,
          attributes: [
            {
              name: 'Id',
              type: 'INTEGER',
              isPrimaryKey: true,
              isForeignKey: false
            }
          ]
        };
        
        // Add to both allTables and tableMap
        allTables.push(autoCreatedTable);
        tableMap.set(missingTableName, autoCreatedTable);
        autoCreatedCount++;
      }
      
      console.log(`📈 HARDCODED PARSER - Auto-created ${autoCreatedCount} missing target tables: [${Array.from(missingTargetTables).join(', ')}]`);
      console.log(`📈 HARDCODED PARSER - Tables before auto-creation: ${allTables.length - autoCreatedCount}`);
      console.log(`📈 HARDCODED PARSER - Tables after auto-creation: ${allTables.length}`);

      // Use all table entries instead of just unique ones
      tables = allTables;
      
      console.log(`\n🎯 HARDCODED PARSER - Final table conversion results:`);
      console.log(`  Unique table names in tableMap: ${tableMap.size}`);
      console.log(`  Total table entries in array: ${tables.length} (should match flexible parser)`);
      console.log(`  FIXED: Now preserves domain-specific tables instead of deduplicating`);
      console.log(`  Final table names: [${tables.map(t => t.name).join(', ')}]`);
      
      // Debug: Show each table structure
      tables.forEach((table, index) => {
        console.log(`  Table ${index + 1}: "${table.name}" with ${table.attributes.length} attributes`);
        if (table.attributes.length > 0) {
          console.log(`    Attributes: [${table.attributes.map(a => a.name).join(', ')}]`);
        }
      });

      // Validate the parsed data
      for (const table of tables) {
        try {
          tableSchema.parse(table);
        } catch (error) {
          errors.push(`Invalid table structure for ${table.name}: ${error}`);
        }
      }

      for (const relationship of relationships) {
        try {
          relationshipSchema.parse({
            sourceTable: relationship.sourceTable,
            sourceColumn: relationship.sourceColumn,
            targetTable: relationship.targetTable,
            targetColumn: relationship.targetColumn
          });
        } catch (error) {
          errors.push(`Invalid relationship: ${error}`);
        }
      }

    } catch (error) {
      console.log('❌ Excel parsing exception:', error);
      errors.push(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`\n🏁 HARDCODED PARSER - Final parsing results:`);
    console.log(`  Final Tables: ${tables.length}`);
    console.log(`  Relationships: ${relationships.length}`);
    console.log(`  Errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log(`  Error details:`, errors);
    }

    return { tables, relationships, errors };
  }
}

export const excelParserService = new ExcelParserService();
