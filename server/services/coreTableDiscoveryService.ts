import type { TableData } from '@shared/schema';

// TableInfo interface for AI-enhanced domain analysis services
export interface TableInfo {
  name: string;
  columns: { name: string; type: string }[];
  foreignKeys: { column: string; referencedTable: string; referencedColumn: string }[];
  primaryKeys: string[];
}

export class CoreTableDiscoveryService {
  /**
   * Convert TableData format to TableInfo format for AI-enhanced domain analysis services
   * This is the only method used by the AI-enhanced pipeline in routes.ts
   */
  public convertTableDataToTableInfo(tableData: TableData[]): TableInfo[] {
    return tableData.map(table => ({
      name: table.name,
      columns: table.columns.map(col => ({
        name: col.name,
        type: col.type
      })),
      foreignKeys: table.foreignKeys || [],
      primaryKeys: table.primaryKeys || ['id'] // Default assumption
    }));
  }
}

// Export singleton instance for use in routes
export const coreTableDiscoveryService = new CoreTableDiscoveryService();