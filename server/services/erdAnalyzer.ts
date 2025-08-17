import {
  ParsedERD,
  TableDefinition,
  ColumnDefinition,
  RelationshipDefinition,
  ERDMetadata,
  SchemaPattern,
  ForeignKeyDefinition,
  ERDAnalysisError,
  SCHEMA_PATTERNS
} from '../../shared/llm-types.js';

export class ERDAnalyzer {
  private readonly mermaidRegexPatterns = {
    // Matches table definitions: "TableName {"
    tableStart: /^\s*(\w+)\s*\{\s*$/,
    // Matches table end: "}"
    tableEnd: /^\s*\}\s*$/,
    // Matches column definitions: "columnName dataType PK|FK"
    column: /^\s*(\w+)\s+(\w+)(\s+(PK|FK))?\s*$/,
    // Matches relationships: "SourceTable }o--|| TargetTable : "description""
    relationship: /^\s*(\w+)\s+(\}[o|]*--[\|\}]*)\s+(\w+)\s*:\s*"([^"]*)"\s*$/,
    // Matches erDiagram declaration
    erDiagram: /^\s*erDiagram\s*$/,
    // Matches comments (for future use)
    comment: /^\s*%%.*$/
  };

  /**
   * Main entry point for parsing Mermaid ERD code
   */
  public parseMermaidERD(mermaidCode: string): ParsedERD {
    try {
      console.log(`🔍 Starting ERD analysis for ${mermaidCode.length} characters of Mermaid code`);
      
      const lines = this.preprocessMermaidCode(mermaidCode);
      const tables = this.extractTables(lines);
      const relationships = this.extractRelationships(lines, tables);
      const patterns = this.detectSchemaPatterns(tables, relationships);
      const metadata = this.generateMetadata(tables, relationships, patterns);

      const result: ParsedERD = {
        tables,
        relationships,
        metadata,
        patterns
      };

      console.log(`✅ ERD analysis complete: ${tables.length} tables, ${relationships.length} relationships, ${patterns.length} patterns`);
      return result;
    } catch (error) {
      console.error('❌ ERD analysis failed:', error);
      throw new ERDAnalysisError(
        `Failed to parse Mermaid ERD: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PARSE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Preprocess Mermaid code to normalize format
   */
  private preprocessMermaidCode(mermaidCode: string): string[] {
    return mermaidCode
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !this.mermaidRegexPatterns.comment.test(line));
  }

  /**
   * Extract table definitions from Mermaid code
   */
  private extractTables(lines: string[]): TableDefinition[] {
    const tables: TableDefinition[] = [];
    let currentTable: Partial<TableDefinition> | null = null;
    let isInsideTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip erDiagram declaration
      if (this.mermaidRegexPatterns.erDiagram.test(line)) {
        continue;
      }

      // Check for table start
      const tableStartMatch = line.match(this.mermaidRegexPatterns.tableStart);
      if (tableStartMatch) {
        if (currentTable) {
          console.warn(`⚠️ Unclosed table found: ${currentTable.name}`);
          // Close previous table
          this.finalizeTable(currentTable, tables);
        }
        
        currentTable = {
          name: tableStartMatch[1],
          columns: [],
          primaryKeys: [],
          foreignKeys: []
        };
        isInsideTable = true;
        console.log(`📋 Found table: ${currentTable.name}`);
        continue;
      }

      // Check for table end
      if (this.mermaidRegexPatterns.tableEnd.test(line)) {
        if (currentTable && isInsideTable) {
          this.finalizeTable(currentTable, tables);
          currentTable = null;
          isInsideTable = false;
        }
        continue;
      }

      // Parse column definitions
      if (isInsideTable && currentTable) {
        const columnMatch = line.match(this.mermaidRegexPatterns.column);
        if (columnMatch) {
          const [, columnName, dataType, , keyType] = columnMatch;
          
          const column: ColumnDefinition = {
            name: columnName,
            type: dataType,
            isPrimaryKey: keyType === 'PK',
            isForeignKey: keyType === 'FK'
          };

          currentTable.columns!.push(column);

          if (column.isPrimaryKey) {
            currentTable.primaryKeys!.push(columnName);
          }

          if (column.isForeignKey) {
            // We'll resolve FK references later in extractRelationships
            currentTable.foreignKeys!.push({
              column: columnName,
              referencedTable: '', // Will be filled later
              referencedColumn: ''
            });
          }

          console.log(`  📄 Column: ${columnName} (${dataType}${keyType ? ` ${keyType}` : ''})`);
        }
      }
    }

    // Close any remaining open table
    if (currentTable && isInsideTable) {
      this.finalizeTable(currentTable, tables);
    }

    return tables;
  }

  /**
   * Finalize table definition and add to tables array
   */
  private finalizeTable(currentTable: Partial<TableDefinition>, tables: TableDefinition[]): void {
    if (!currentTable.name || !currentTable.columns) {
      console.warn(`⚠️ Incomplete table definition: ${currentTable.name}`);
      return;
    }

    const table: TableDefinition = {
      name: currentTable.name,
      columns: currentTable.columns,
      primaryKeys: currentTable.primaryKeys || [],
      foreignKeys: currentTable.foreignKeys || []
    };

    tables.push(table);
  }

  /**
   * Extract relationship definitions from Mermaid code
   */
  private extractRelationships(lines: string[], tables: TableDefinition[]): RelationshipDefinition[] {
    const relationships: RelationshipDefinition[] = [];
    const tableMap = new Map(tables.map(t => [t.name, t]));

    for (const line of lines) {
      const relationshipMatch = line.match(this.mermaidRegexPatterns.relationship);
      if (relationshipMatch) {
        const [, sourceTable, relationshipSymbol, targetTable, description] = relationshipMatch;

        // Validate that both tables exist
        if (!tableMap.has(sourceTable) || !tableMap.has(targetTable)) {
          console.warn(`⚠️ Relationship references unknown table: ${sourceTable} -> ${targetTable}`);
          continue;
        }

        const cardinality = this.parseCardinality(relationshipSymbol);
        const { sourceColumn, targetColumn } = this.extractColumnsFromDescription(description);

        const relationship: RelationshipDefinition = {
          sourceTable,
          targetTable,
          sourceColumn: sourceColumn || this.inferForeignKeyColumn(sourceTable, targetTable, tableMap),
          targetColumn: targetColumn || 'id', // Default assumption
          cardinality,
          relationshipType: 'foreign'
        };

        relationships.push(relationship);

        // Update foreign key references in tables
        this.updateForeignKeyReferences(sourceTable, targetTable, relationship.sourceColumn, tableMap);

        console.log(`🔗 Relationship: ${sourceTable}.${relationship.sourceColumn} -> ${targetTable}.${relationship.targetColumn} (${cardinality})`);
      }
    }

    return relationships;
  }

  /**
   * Parse relationship cardinality from Mermaid symbols
   */
  private parseCardinality(symbol: string): 'one-to-one' | 'one-to-many' | 'many-to-many' {
    // Mermaid relationship symbols:
    // }o--|| : one-to-many
    // ||--|| : one-to-one  
    // }o--o{ : many-to-many
    
    if (symbol.includes('o{') || symbol.includes('}o') && symbol.includes('o{')) {
      return 'many-to-many';
    } else if (symbol.includes('||') && !symbol.includes('o')) {
      return 'one-to-one';
    } else {
      return 'one-to-many'; // Default and most common
    }
  }

  /**
   * Extract column names from relationship description
   */
  private extractColumnsFromDescription(description: string): { sourceColumn?: string; targetColumn?: string } {
    // Look for patterns like "FK columnName" or "columnName -> otherColumn"
    const fkMatch = description.match(/FK\s+(\w+)/i);
    const arrowMatch = description.match(/(\w+)\s*->\s*(\w+)/);

    if (arrowMatch) {
      return {
        sourceColumn: arrowMatch[1],
        targetColumn: arrowMatch[2]
      };
    }

    if (fkMatch) {
      return {
        sourceColumn: fkMatch[1]
      };
    }

    return {};
  }

  /**
   * Infer foreign key column name based on convention
   */
  private inferForeignKeyColumn(sourceTable: string, targetTable: string, tableMap: Map<string, TableDefinition>): string {
    const sourceTableDef = tableMap.get(sourceTable);
    if (!sourceTableDef) return '';

    // Look for column that ends with targetTable + 'Id'
    const conventionalName = `${targetTable.toLowerCase()}Id`;
    const conventionalColumn = sourceTableDef.columns.find(col => 
      col.name.toLowerCase() === conventionalName || 
      col.name.toLowerCase() === `${targetTable}Id`.toLowerCase()
    );

    if (conventionalColumn) {
      return conventionalColumn.name;
    }

    // Look for any FK column that might reference the target
    const fkColumn = sourceTableDef.columns.find(col => 
      col.isForeignKey && col.name.toLowerCase().includes(targetTable.toLowerCase())
    );

    return fkColumn?.name || '';
  }

  /**
   * Update foreign key references in table definitions
   */
  private updateForeignKeyReferences(
    sourceTable: string, 
    targetTable: string, 
    sourceColumn: string, 
    tableMap: Map<string, TableDefinition>
  ): void {
    const table = tableMap.get(sourceTable);
    if (!table) return;

    const fkDef = table.foreignKeys.find(fk => fk.column === sourceColumn);
    if (fkDef) {
      fkDef.referencedTable = targetTable;
      fkDef.referencedColumn = 'id'; // Default assumption
    }

    // Update column definition with reference information
    const column = table.columns.find(col => col.name === sourceColumn);
    if (column && column.isForeignKey) {
      column.references = {
        table: targetTable,
        column: 'id'
      };
    }
  }

  /**
   * Detect common schema patterns in the ERD
   */
  private detectSchemaPatterns(tables: TableDefinition[], relationships: RelationshipDefinition[]): SchemaPattern[] {
    const patterns: SchemaPattern[] = [];

    // Detect junction tables
    patterns.push(...this.detectJunctionTables(tables, relationships));
    
    // Detect audit trail patterns
    patterns.push(...this.detectAuditTrails(tables));
    
    // Detect hierarchical structures
    patterns.push(...this.detectHierarchies(tables, relationships));
    
    // Detect lookup tables
    patterns.push(...this.detectLookupTables(tables, relationships));

    console.log(`🔍 Pattern detection complete: found ${patterns.length} patterns`);
    return patterns;
  }

  /**
   * Detect junction/bridge tables for many-to-many relationships
   */
  private detectJunctionTables(tables: TableDefinition[], relationships: RelationshipDefinition[]): SchemaPattern[] {
    const patterns: SchemaPattern[] = [];

    for (const table of tables) {
      const foreignKeys = table.columns.filter(col => col.isForeignKey);
      
      // Junction table indicators:
      // - Has 2 or more foreign keys
      // - Small number of total columns (usually just FKs + maybe metadata)
      // - Composite primary key or auto-increment PK + unique constraint on FKs
      if (foreignKeys.length >= 2 && table.columns.length <= 6) {
        const referencedTables = foreignKeys
          .map(fk => fk.references?.table)
          .filter(Boolean) as string[];

        if (referencedTables.length >= 2) {
          patterns.push({
            type: 'junction-table',
            tables: [table.name, ...referencedTables],
            description: `${table.name} serves as a junction table connecting ${referencedTables.join(' and ')} in a many-to-many relationship`,
            recommendation: `Ensure ${table.name} has proper composite keys or unique constraints to prevent duplicate relationships`
          });

          console.log(`🔄 Junction table detected: ${table.name} (connects ${referencedTables.join(', ')})`);
        }
      }
    }

    return patterns;
  }

  /**
   * Detect audit trail patterns
   */
  private detectAuditTrails(tables: TableDefinition[]): SchemaPattern[] {
    const patterns: SchemaPattern[] = [];
    const auditColumns = ['createdAt', 'updatedAt', 'createdBy', 'modifiedBy', 'lastModifiedBy', 'lastModifiedOn'];

    for (const table of tables) {
      const foundAuditColumns = table.columns.filter(col => 
        auditColumns.some(auditCol => 
          col.name.toLowerCase().includes(auditCol.toLowerCase())
        )
      );

      if (foundAuditColumns.length >= 2) {
        patterns.push({
          type: 'audit-trail',
          tables: [table.name],
          description: `${table.name} implements audit trail pattern with timestamp and user tracking`,
          recommendation: `Consider adding indexes on audit columns for performance and ensure proper triggers or application logic updates these fields`
        });

        console.log(`📝 Audit trail detected: ${table.name} (${foundAuditColumns.map(c => c.name).join(', ')})`);
      }
    }

    return patterns;
  }

  /**
   * Detect hierarchical/tree structures
   */
  private detectHierarchies(tables: TableDefinition[], relationships: RelationshipDefinition[]): SchemaPattern[] {
    const patterns: SchemaPattern[] = [];

    for (const table of tables) {
      // Look for self-referencing foreign keys
      const selfReferences = relationships.filter(rel => 
        rel.sourceTable === table.name && rel.targetTable === table.name
      );

      const parentColumns = table.columns.filter(col => 
        col.name.toLowerCase().includes('parent') || 
        col.name.toLowerCase().includes('parentid')
      );

      if (selfReferences.length > 0 || parentColumns.length > 0) {
        patterns.push({
          type: 'hierarchy',
          tables: [table.name],
          description: `${table.name} implements hierarchical structure with self-referencing relationships`,
          recommendation: `Consider adding path or level columns for query optimization, and ensure referential integrity constraints prevent circular references`
        });

        console.log(`🌳 Hierarchy detected: ${table.name}`);
      }
    }

    return patterns;
  }

  /**
   * Detect lookup/reference tables
   */
  private detectLookupTables(tables: TableDefinition[], relationships: RelationshipDefinition[]): SchemaPattern[] {
    const patterns: SchemaPattern[] = [];

    for (const table of tables) {
      // Lookup table indicators:
      // - Small number of columns (typically id, name/label, maybe description)
      // - Referenced by other tables but doesn't reference many others
      // - Column names suggest lookup values
      
      const isReferencedByOthers = relationships.some(rel => rel.targetTable === table.name);
      const referencesOthers = relationships.filter(rel => rel.sourceTable === table.name).length;
      const hasLookupColumns = table.columns.some(col => 
        ['name', 'label', 'code', 'value', 'description', 'type'].some(lookup => 
          col.name.toLowerCase().includes(lookup)
        )
      );

      if (table.columns.length <= 5 && isReferencedByOthers && referencesOthers <= 1 && hasLookupColumns) {
        patterns.push({
          type: 'lookup-table',
          tables: [table.name],
          description: `${table.name} appears to be a lookup/reference table containing enumerated values`,
          recommendation: `Consider caching lookup values in application layer and ensure data stability for referenced values`
        });

        console.log(`📚 Lookup table detected: ${table.name}`);
      }
    }

    return patterns;
  }

  /**
   * Generate metadata about the ERD
   */
  private generateMetadata(tables: TableDefinition[], relationships: RelationshipDefinition[], patterns: SchemaPattern[]): ERDMetadata {
    const totalColumns = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const junctionTables = patterns
      .filter(p => p.type === 'junction-table')
      .flatMap(p => p.tables.slice(0, 1)); // First table in pattern is the junction table
    
    const orphanedTables = tables
      .filter(table => !relationships.some(rel => 
        rel.sourceTable === table.name || rel.targetTable === table.name
      ))
      .map(table => table.name);

    // Calculate complexity based on various factors
    const complexity = this.calculateComplexity(tables, relationships, patterns);

    // Calculate maximum relationship depth (simplified - could be more sophisticated)
    const maxDepth = Math.min(Math.floor(Math.sqrt(tables.length)), 10);

    return {
      totalTables: tables.length,
      totalRelationships: relationships.length,
      totalColumns,
      junctionTables,
      orphanedTables,
      maxDepth,
      complexity
    };
  }

  /**
   * Calculate schema complexity score
   */
  private calculateComplexity(
    tables: TableDefinition[], 
    relationships: RelationshipDefinition[], 
    patterns: SchemaPattern[]
  ): 'simple' | 'moderate' | 'complex' {
    let complexityScore = 0;

    // Base complexity from table count
    complexityScore += tables.length * 2;

    // Relationship complexity
    complexityScore += relationships.length * 3;

    // Pattern complexity
    complexityScore += patterns.length * 5;

    // Junction table complexity
    const junctionCount = patterns.filter(p => p.type === 'junction-table').length;
    complexityScore += junctionCount * 10;

    // Average columns per table
    const avgColumns = tables.reduce((sum, t) => sum + t.columns.length, 0) / tables.length;
    complexityScore += avgColumns * 2;

    if (complexityScore < 50) return 'simple';
    if (complexityScore < 150) return 'moderate';
    return 'complex';
  }

  /**
   * Build relationship graph for pathfinding and analysis
   */
  public buildRelationshipGraph(tables: TableDefinition[], relationships: RelationshipDefinition[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    // Initialize graph with all tables
    for (const table of tables) {
      graph.set(table.name, []);
    }

    // Add relationships as edges
    for (const rel of relationships) {
      const sourceConnections = graph.get(rel.sourceTable) || [];
      const targetConnections = graph.get(rel.targetTable) || [];

      sourceConnections.push(rel.targetTable);
      targetConnections.push(rel.sourceTable); // Bidirectional for pathfinding

      graph.set(rel.sourceTable, sourceConnections);
      graph.set(rel.targetTable, targetConnections);
    }

    return graph;
  }

  /**
   * Find shortest path between two tables for join optimization
   */
  public findShortestPath(
    startTable: string, 
    endTable: string, 
    graph: Map<string, string[]>
  ): string[] | null {
    if (startTable === endTable) return [startTable];

    const queue: string[][] = [[startTable]];
    const visited = new Set<string>([startTable]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const currentTable = path[path.length - 1];
      const connections = graph.get(currentTable) || [];

      for (const neighbor of connections) {
        if (neighbor === endTable) {
          return [...path, neighbor];
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get table statistics for analysis
   */
  public getTableStatistics(table: TableDefinition): {
    columnCount: number;
    primaryKeyCount: number;
    foreignKeyCount: number;
    hasAuditFields: boolean;
    estimatedSize: 'small' | 'medium' | 'large';
  } {
    const auditColumns = ['createdAt', 'updatedAt', 'createdBy', 'modifiedBy', 'lastModifiedBy'];
    const hasAuditFields = table.columns.some(col => 
      auditColumns.some(audit => col.name.toLowerCase().includes(audit.toLowerCase()))
    );

    // Estimate table size based on column count and types
    let estimatedSize: 'small' | 'medium' | 'large' = 'small';
    if (table.columns.length > 15) estimatedSize = 'large';
    else if (table.columns.length > 7) estimatedSize = 'medium';

    return {
      columnCount: table.columns.length,
      primaryKeyCount: table.primaryKeys.length,
      foreignKeyCount: table.foreignKeys.length,
      hasAuditFields,
      estimatedSize
    };
  }
}

// Export singleton instance
export const erdAnalyzer = new ERDAnalyzer();