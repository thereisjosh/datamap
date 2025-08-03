import * as XLSX from 'xlsx';
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

  async parseExcelFile(buffer: Buffer): Promise<ParsedMetadata> {
    const errors: string[] = [];
    let tables: TableData[] = [];
    let relationships: Relationship[] = [];

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // Check for required sheets
      const tableMetadataSheet = workbook.Sheets['TableMetadata'] || workbook.Sheets['tablemetadata'];
      const attributeMetadataSheet = workbook.Sheets['AttributeMetadata'] || workbook.Sheets['attributemetadata'];

      if (!tableMetadataSheet) {
        errors.push('Missing required sheet: TableMetadata');
      }

      if (!attributeMetadataSheet) {
        errors.push('Missing required sheet: AttributeMetadata');
      }

      if (errors.length > 0) {
        return { tables: [], relationships: [], errors };
      }

      // Parse table metadata
      const tableRows: ExcelRow[] = XLSX.utils.sheet_to_json(tableMetadataSheet);
      const tableMap = new Map<string, { name: string; attributes: Column[] }>();

      // Initialize tables from TableMetadata sheet
      for (const row of tableRows) {
        const physicalTableName = this.findColumn(row, [
          'Physical Table Name', 
          'physical_table_name', 
          'table_name',
          'Table Name'
        ]);
        
        const dataKind = this.findColumn(row, [
          'Data Kind',
          'data_kind',
          'kind'
        ]);

        if (physicalTableName && dataKind?.toLowerCase() === 'entity') {
          const tableName = physicalTableName.toString().trim();
          if (!tableMap.has(tableName)) {
            tableMap.set(tableName, {
              name: tableName,
              attributes: []
            });
          }
        }
      }

      // Parse attribute metadata
      const attributeRows: ExcelRow[] = XLSX.utils.sheet_to_json(attributeMetadataSheet);
      
      for (const row of attributeRows) {
        const physicalTableName = this.findColumn(row, [
          'Physical Table Name',
          'physical_table_name',
          'table_name',
          'Table Name'
        ]);
        
        const attributeName = this.findColumn(row, [
          'Attribute Name',
          'attribute_name',
          'column_name',
          'Column Name'
        ]);
        
        const dataType = this.findColumn(row, [
          'Type',
          'Data Type',
          'data_type',
          'type'
        ]);
        
        const isAutonumber = this.findColumn(row, [
          'Is Autonumber',
          'is_autonumber',
          'autonumber',
          'auto_increment'
        ]);
        
        const referenceTable = this.findColumn(row, [
          'Reference Table',
          'reference_table',
          'ref_table'
        ]);
        
        const columnTable = this.findColumn(row, [
          'Column Table',
          'column_table',
          'ref_column'
        ]);

        if (!physicalTableName || !attributeName) {
          continue; // Skip rows without required fields
        }

        const tableName = physicalTableName.toString().trim();
        const columnName = attributeName.toString().trim();
        const type = dataType?.toString().trim() || 'varchar';

        // Check if this is a primary key (Id column with autonumber)
        const isPrimaryKey = columnName.toLowerCase() === 'id' && 
                           (isAutonumber === true || isAutonumber?.toString().toLowerCase() === 'true');

        // Check if this is a foreign key
        const isForeignKey = !!(referenceTable && columnTable);
        
        const column: Column = {
          name: columnName,
          type: type,
          isPrimaryKey,
          isForeignKey,
          references: isForeignKey ? {
            table: referenceTable.toString().trim(),
            column: columnTable.toString().trim()
          } : undefined
        };

        // Add column to table
        const table = tableMap.get(tableName);
        if (table) {
          table.attributes.push(column);
        }

        // Create relationship if this is a foreign key
        if (isForeignKey && referenceTable && columnTable) {
          relationships.push({
            id: '', // Will be set by storage
            sourceTable: tableName,
            sourceColumn: columnName,
            targetTable: referenceTable.toString().trim(),
            targetColumn: columnTable.toString().trim(),
            createdAt: new Date()
          });
        }
      }

      // Convert table map to array
      tables = Array.from(tableMap.values());

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
      errors.push(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { tables, relationships, errors };
  }
}

export const excelParserService = new ExcelParserService();
