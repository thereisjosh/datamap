import {
  QuerySpecification,
  QueryCondition,
  QueryJoin,
  TableDefinition,
  RelationshipDefinition,
  SQL_DIALECTS,
  ParsedERD
} from '../../shared/llm-types.js';

export interface QueryGenerationOptions {
  dialect: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
  includeComments: boolean;
  optimizeForPerformance: boolean;
  formatStyle: 'compact' | 'readable';
}

export interface GeneratedQuery {
  sql: string;
  explanation: string;
  performance: 'fast' | 'medium' | 'slow';
  warnings: string[];
  optimizationTips: string[];
  estimatedComplexity: number;
}

export class QueryGenerator {
  private dialectConfig: typeof SQL_DIALECTS[keyof typeof SQL_DIALECTS];

  constructor(private options: QueryGenerationOptions = {
    dialect: 'postgresql',
    includeComments: true,
    optimizeForPerformance: true,
    formatStyle: 'readable'
  }) {
    this.dialectConfig = SQL_DIALECTS[this.options.dialect];
  }

  /**
   * Generate SQL query from specification
   */
  public generateQuery(spec: QuerySpecification): GeneratedQuery {
    try {
      const sql = this.buildSQL(spec);
      const explanation = this.generateExplanation(spec);
      const performance = this.estimatePerformance(spec);
      const warnings = this.validateQuery(spec);
      const optimizationTips = this.generateOptimizationTips(spec);
      const estimatedComplexity = this.calculateComplexity(spec);

      return {
        sql,
        explanation,
        performance,
        warnings,
        optimizationTips,
        estimatedComplexity
      };
    } catch (error) {
      throw new Error(`Query generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate optimal joins between tables
   */
  public generateJoinPath(
    fromTable: string,
    toTable: string,
    relationships: RelationshipDefinition[]
  ): QueryJoin[] {
    const path = this.findShortestJoinPath(fromTable, toTable, relationships);
    const joins: QueryJoin[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const sourceTable = path[i];
      const targetTable = path[i + 1];
      
      const relationship = relationships.find(rel =>
        (rel.sourceTable === sourceTable && rel.targetTable === targetTable) ||
        (rel.targetTable === sourceTable && rel.sourceTable === targetTable)
      );

      if (relationship) {
        joins.push({
          type: 'INNER',
          sourceTable: relationship.sourceTable,
          targetTable: relationship.targetTable,
          sourceColumn: relationship.sourceColumn,
          targetColumn: relationship.targetColumn
        });
      }
    }

    return joins;
  }

  /**
   * Build SQL query string
   */
  private buildSQL(spec: QuerySpecification): string {
    let sql = '';
    const indent = this.options.formatStyle === 'readable' ? '  ' : ' ';
    const newline = this.options.formatStyle === 'readable' ? '\n' : ' ';

    // Comments
    if (this.options.includeComments) {
      sql += `-- Generated query for ${spec.tables.join(', ')}${newline}`;
    }

    // SELECT clause
    sql += 'SELECT';
    if (spec.columns && spec.columns.length > 0) {
      const columns = spec.columns.map(col => {
        // Add table alias if column contains table reference
        if (col.includes('.')) {
          return col;
        }
        // For unqualified columns, use first table as default
        return `${spec.tables[0]}.${col}`;
      });
      sql += `${newline}${indent}${columns.join(`,${newline}${indent}`)}`;
    } else {
      sql += ` *`;
    }

    // FROM clause
    sql += `${newline}FROM ${spec.tables[0]}`;

    // JOIN clauses
    for (const join of spec.joins) {
      sql += `${newline}${join.type} JOIN ${join.targetTable}`;
      sql += ` ON ${join.sourceTable}.${join.sourceColumn} = ${join.targetTable}.${join.targetColumn}`;
    }

    // WHERE clause
    if (spec.conditions.length > 0) {
      sql += `${newline}WHERE`;
      const whereConditions = spec.conditions.map(cond => this.buildCondition(cond));
      sql += `${newline}${indent}${whereConditions.join(`${newline}${indent}AND `)}`;
    }

    // GROUP BY clause
    if (spec.groupBy && spec.groupBy.length > 0) {
      sql += `${newline}GROUP BY ${spec.groupBy.join(', ')}`;
    }

    // ORDER BY clause
    if (spec.orderBy && spec.orderBy.length > 0) {
      const orderClauses = spec.orderBy.map(order => `${order.column} ${order.direction}`);
      sql += `${newline}ORDER BY ${orderClauses.join(', ')}`;
    }

    // LIMIT clause
    if (spec.limit) {
      sql += `${newline}LIMIT ${spec.limit}`;
    }

    return sql.trim();
  }

  /**
   * Build WHERE condition string
   */
  private buildCondition(condition: QueryCondition): string {
    const column = condition.table ? `${condition.table}.${condition.column}` : condition.column;
    
    switch (condition.operator) {
      case 'IN':
        if (Array.isArray(condition.value)) {
          const values = condition.value.map(v => `'${v}'`).join(', ');
          return `${column} IN (${values})`;
        }
        return `${column} IN ('${condition.value}')`;
      
      case 'BETWEEN':
        if (Array.isArray(condition.value) && condition.value.length === 2) {
          return `${column} BETWEEN '${condition.value[0]}' AND '${condition.value[1]}'`;
        }
        return `${column} = '${condition.value}'`;
      
      case 'LIKE':
        return `${column} LIKE '${condition.value}'`;
      
      default:
        return `${column} ${condition.operator} '${condition.value}'`;
    }
  }

  /**
   * Generate explanation for the query
   */
  private generateExplanation(spec: QuerySpecification): string {
    let explanation = `This query retrieves data from ${spec.tables.length} table(s): ${spec.tables.join(', ')}.`;

    if (spec.joins.length > 0) {
      explanation += ` It uses ${spec.joins.length} join(s) to combine data based on relationships between tables.`;
    }

    if (spec.conditions.length > 0) {
      explanation += ` The query filters results using ${spec.conditions.length} condition(s).`;
    }

    if (spec.groupBy && spec.groupBy.length > 0) {
      explanation += ` Results are grouped by ${spec.groupBy.join(', ')}.`;
    }

    if (spec.orderBy && spec.orderBy.length > 0) {
      explanation += ` Results are sorted by ${spec.orderBy.map(o => `${o.column} ${o.direction}`).join(', ')}.`;
    }

    if (spec.limit) {
      explanation += ` The query limits results to ${spec.limit} rows.`;
    }

    return explanation;
  }

  /**
   * Estimate query performance
   */
  private estimatePerformance(spec: QuerySpecification): 'fast' | 'medium' | 'slow' {
    let complexityScore = 0;

    // Base complexity from table count
    complexityScore += spec.tables.length * 2;

    // Join complexity
    complexityScore += spec.joins.length * 5;

    // Complex joins (many-to-many through junction tables)
    const junctionJoins = spec.joins.filter(join => 
      spec.joins.some(other => other.sourceTable === join.targetTable)
    );
    complexityScore += junctionJoins.length * 10;

    // Condition complexity
    complexityScore += spec.conditions.length * 2;

    // Complex conditions
    const complexConditions = spec.conditions.filter(cond => 
      cond.operator === 'LIKE' || cond.operator === 'IN'
    );
    complexityScore += complexConditions.length * 3;

    // Grouping and aggregation
    if (spec.groupBy && spec.groupBy.length > 0) {
      complexityScore += 5;
    }

    if (complexityScore < 10) return 'fast';
    if (complexityScore < 25) return 'medium';
    return 'slow';
  }

  /**
   * Calculate query complexity score
   */
  private calculateComplexity(spec: QuerySpecification): number {
    let complexity = 0;

    complexity += spec.tables.length * 2;
    complexity += spec.joins.length * 5;
    complexity += spec.conditions.length * 2;
    
    if (spec.groupBy) complexity += spec.groupBy.length * 3;
    if (spec.orderBy) complexity += spec.orderBy.length * 1;

    return complexity;
  }

  /**
   * Validate query specification and return warnings
   */
  private validateQuery(spec: QuerySpecification): string[] {
    const warnings: string[] = [];

    // Check for SELECT * usage
    if (!spec.columns || spec.columns.length === 0) {
      warnings.push('Using SELECT * may impact performance. Consider selecting only needed columns.');
    }

    // Check for missing indexes on join columns
    if (spec.joins.length > 2) {
      warnings.push('Multiple joins detected. Ensure join columns have appropriate indexes.');
    }

    // Check for potential Cartesian products
    const tableCount = new Set([...spec.tables, ...spec.joins.map(j => j.targetTable)]).size;
    if (spec.joins.length < tableCount - 1) {
      warnings.push('Potential Cartesian product detected. Verify all table relationships are properly joined.');
    }

    // Check for LIKE conditions without wildcards
    const likeConditions = spec.conditions.filter(c => c.operator === 'LIKE');
    for (const cond of likeConditions) {
      if (typeof cond.value === 'string' && !cond.value.includes('%') && !cond.value.includes('_')) {
        warnings.push(`LIKE condition on ${cond.column} without wildcards. Consider using = operator instead.`);
      }
    }

    // Check for ORDER BY without LIMIT
    if (spec.orderBy && spec.orderBy.length > 0 && !spec.limit) {
      warnings.push('ORDER BY without LIMIT may be inefficient for large result sets.');
    }

    return warnings;
  }

  /**
   * Generate optimization tips
   */
  private generateOptimizationTips(spec: QuerySpecification): string[] {
    const tips: string[] = [];

    // Index recommendations
    if (spec.joins.length > 0) {
      const joinColumns = spec.joins.map(j => `${j.sourceTable}.${j.sourceColumn}, ${j.targetTable}.${j.targetColumn}`);
      tips.push(`Consider adding indexes on join columns: ${joinColumns.join(', ')}`);
    }

    // WHERE clause indexes
    const whereColumns = spec.conditions.map(c => 
      c.table ? `${c.table}.${c.column}` : c.column
    );
    if (whereColumns.length > 0) {
      tips.push(`Consider adding indexes on WHERE clause columns: ${whereColumns.join(', ')}`);
    }

    // Limit recommendations
    if (!spec.limit && spec.joins.length > 1) {
      tips.push('Consider adding LIMIT clause to prevent excessive result sets.');
    }

    // Column selection
    if (!spec.columns || spec.columns.length === 0) {
      tips.push('Specify only needed columns instead of SELECT * for better performance.');
    }

    // Aggregation optimization
    if (spec.groupBy && spec.groupBy.length > 0) {
      tips.push('Consider covering indexes for GROUP BY operations.');
    }

    return tips;
  }

  /**
   * Find shortest path between tables for joins
   */
  private findShortestJoinPath(
    fromTable: string,
    toTable: string,
    relationships: RelationshipDefinition[]
  ): string[] {
    if (fromTable === toTable) return [fromTable];

    // Build graph
    const graph = new Map<string, string[]>();
    for (const rel of relationships) {
      if (!graph.has(rel.sourceTable)) graph.set(rel.sourceTable, []);
      if (!graph.has(rel.targetTable)) graph.set(rel.targetTable, []);
      
      graph.get(rel.sourceTable)!.push(rel.targetTable);
      graph.get(rel.targetTable)!.push(rel.sourceTable);
    }

    // BFS to find shortest path
    const queue: string[][] = [[fromTable]];
    const visited = new Set<string>([fromTable]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const currentTable = path[path.length - 1];
      const neighbors = graph.get(currentTable) || [];

      for (const neighbor of neighbors) {
        if (neighbor === toTable) {
          return [...path, neighbor];
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return []; // No path found
  }

  /**
   * Generate query from natural language description
   */
  public generateFromDescription(
    description: string,
    erdSchema: ParsedERD
  ): QuerySpecification {
    // This is a simplified version - in production, you'd use the LLM service
    // to parse the natural language and generate the specification
    
    const spec: QuerySpecification = {
      tables: [],
      joins: [],
      conditions: []
    };

    // Extract table names mentioned in description
    for (const table of erdSchema.tables) {
      if (description.toLowerCase().includes(table.name.toLowerCase())) {
        spec.tables.push(table.name);
      }
    }

    // If multiple tables, generate joins
    if (spec.tables.length > 1) {
      for (let i = 0; i < spec.tables.length - 1; i++) {
        const joins = this.generateJoinPath(
          spec.tables[i],
          spec.tables[i + 1],
          erdSchema.relationships
        );
        spec.joins.push(...joins);
      }
    }

    // Extract basic conditions from description
    // This is very simplified - real implementation would use NLP
    if (description.includes('where') || description.includes('with')) {
      // Add placeholder condition
      if (spec.tables.length > 0) {
        spec.conditions.push({
          column: 'id',
          operator: '>',
          value: '0',
          table: spec.tables[0]
        });
      }
    }

    return spec;
  }

  /**
   * Optimize existing query specification
   */
  public optimizeQuery(spec: QuerySpecification): QuerySpecification {
    const optimized: QuerySpecification = { ...spec };

    // Remove redundant joins
    optimized.joins = this.removeRedundantJoins(optimized.joins);

    // Optimize join order
    optimized.joins = this.optimizeJoinOrder(optimized.joins);

    // Add beneficial conditions
    optimized.conditions = this.optimizeConditions(optimized.conditions);

    return optimized;
  }

  /**
   * Remove redundant joins
   */
  private removeRedundantJoins(joins: QueryJoin[]): QueryJoin[] {
    const uniqueJoins = new Map<string, QueryJoin>();

    for (const join of joins) {
      const key = `${join.sourceTable}-${join.targetTable}-${join.sourceColumn}-${join.targetColumn}`;
      const reverseKey = `${join.targetTable}-${join.sourceTable}-${join.targetColumn}-${join.sourceColumn}`;
      
      if (!uniqueJoins.has(key) && !uniqueJoins.has(reverseKey)) {
        uniqueJoins.set(key, join);
      }
    }

    return Array.from(uniqueJoins.values());
  }

  /**
   * Optimize join order for performance
   */
  private optimizeJoinOrder(joins: QueryJoin[]): QueryJoin[] {
    // Simple optimization: put smaller/lookup tables first
    // In production, this would use table statistics
    return joins.sort((a, b) => {
      // Prioritize joins with common patterns
      if (a.sourceColumn.toLowerCase().includes('id') && !b.sourceColumn.toLowerCase().includes('id')) {
        return -1;
      }
      if (b.sourceColumn.toLowerCase().includes('id') && !a.sourceColumn.toLowerCase().includes('id')) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * Optimize conditions for performance
   */
  private optimizeConditions(conditions: QueryCondition[]): QueryCondition[] {
    // Sort conditions by selectivity (most selective first)
    return conditions.sort((a, b) => {
      // Put equality conditions first
      if (a.operator === '=' && b.operator !== '=') return -1;
      if (b.operator === '=' && a.operator !== '=') return 1;
      
      // Put LIKE conditions last
      if (a.operator === 'LIKE' && b.operator !== 'LIKE') return 1;
      if (b.operator === 'LIKE' && a.operator !== 'LIKE') return -1;
      
      return 0;
    });
  }
}

// Export singleton instance
export const queryGenerator = new QueryGenerator();