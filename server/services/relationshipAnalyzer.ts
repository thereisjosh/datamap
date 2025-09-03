import { type TableData, type Relationship } from '@shared/schema';

export interface RelationshipWeight {
  source: string;
  target: string;
  weight: number;
  type: RelationshipType;
  strength: 'strong' | 'medium' | 'weak';
}

export type RelationshipType = 
  | 'strong_fk'           // High connectivity, same module
  | 'weak_fk'             // Low connectivity, cross-module
  | 'multi_fk'            // Table has multiple FKs (junction)
  | 'single_fk'           // Table has single FK reference
  | 'cascade_fk'          // FK with cascade behavior
  | 'reference_fk';       // FK to low-connectivity table

export interface RelationshipMetrics {
  totalRelationships: number;
  strongRelationships: number;
  weakRelationships: number;
  averageStrength: number;
}

export class RelationshipAnalyzer {
  
  /**
   * Analyze relationships and assign weights based on pure structural analysis
   */
  public analyzeRelationships(tables: TableData[], relationships: Relationship[]): RelationshipWeight[] {
    console.log(`🔍 Analyzing ${relationships.length} relationships for weight calculation`);
    
    const tableMap = new Map(tables.map(table => [table.name, table]));
    const weights: RelationshipWeight[] = [];
    
    relationships.forEach(rel => {
      const weight = this.calculateRelationshipWeight(rel, tableMap);
      weights.push(weight);
    });
    
    // Log statistics
    const metrics = this.calculateMetrics(weights);
    console.log(`📊 Relationship Analysis Results:`);
    console.log(`   Strong relationships: ${metrics.strongRelationships} (${(metrics.strongRelationships/metrics.totalRelationships*100).toFixed(1)}%)`);
    console.log(`   Weak relationships: ${metrics.weakRelationships} (${(metrics.weakRelationships/metrics.totalRelationships*100).toFixed(1)}%)`);
    console.log(`   Average strength: ${metrics.averageStrength.toFixed(3)}`);
    
    return weights;
  }
  
  /**
   * Calculate weight for a single relationship
   */
  private calculateRelationshipWeight(rel: Relationship, tableMap: Map<string, TableData>): RelationshipWeight {
    const sourceTable = tableMap.get(rel.sourceTable);
    const targetTable = tableMap.get(rel.targetTable);
    
    if (!sourceTable || !targetTable) {
      return {
        source: rel.sourceTable,
        target: rel.targetTable,
        weight: 0.1,
        type: 'weak_fk',
        strength: 'weak'
      };
    }
    
    // Analyze relationship type and calculate weight
    const relType = this.determineRelationshipType(rel, sourceTable, targetTable);
    const baseWeight = this.getBaseWeight(relType);
    const adjustedWeight = this.applyStructuralAdjustments(baseWeight, rel, sourceTable, targetTable);
    
    return {
      source: rel.sourceTable,
      target: rel.targetTable,
      weight: adjustedWeight,
      type: relType,
      strength: this.categorizeStrength(adjustedWeight)
    };
  }
  
  /**
   * Determine the type of relationship based on pure structural analysis
   */
  private determineRelationshipType(
    rel: Relationship, 
    sourceTable: TableData, 
    targetTable: TableData
  ): RelationshipType {
    
    // Count foreign keys in source table
    const sourceFKCount = sourceTable.attributes.filter(col => col.isForeignKey).length;
    const targetFKCount = targetTable.attributes.filter(col => col.isForeignKey).length;
    
    // Junction table detection - table has multiple FKs
    if (sourceFKCount >= 2 && sourceTable.attributes.length <= sourceFKCount + 2) {
      return 'multi_fk';
    }
    
    // Check if this is a cascade relationship
    if (rel.deleteRule === 'CASCADE' || rel.updateRule === 'CASCADE') {
      return 'cascade_fk';
    }
    
    // Reference to low-connectivity table (likely lookup table)
    if (targetTable.attributes.length < 5 && targetFKCount === 0) {
      return 'reference_fk';
    }
    
    // Single FK relationship
    if (sourceFKCount === 1) {
      return 'single_fk';
    }
    
    // Strong FK if both tables have similar connectivity
    const connectivityDiff = Math.abs(sourceFKCount - targetFKCount);
    if (connectivityDiff <= 1) {
      return 'strong_fk';
    }
    
    // Default to weak FK for other cases
    return 'weak_fk';
  }
  
  /**
   * Get base weight for relationship type
   */
  private getBaseWeight(type: RelationshipType): number {
    const weights: Record<RelationshipType, number> = {
      'cascade_fk': 0.9,      // Cascade relationships are strongest
      'strong_fk': 0.8,       // Similar connectivity patterns
      'multi_fk': 0.7,        // Junction tables
      'single_fk': 0.5,       // Simple foreign keys
      'reference_fk': 0.3,    // Lookup references
      'weak_fk': 0.2          // Cross-module references
    };
    
    return weights[type];
  }
  
  /**
   * Apply structural adjustments to base weight
   */
  private applyStructuralAdjustments(
    baseWeight: number,
    rel: Relationship,
    sourceTable: TableData,
    targetTable: TableData
  ): number {
    let weight = baseWeight;
    
    // Boost weight for tables with similar column counts (likely same module)
    const columnRatio = Math.min(sourceTable.attributes.length, targetTable.attributes.length) / 
                       Math.max(sourceTable.attributes.length, targetTable.attributes.length);
    if (columnRatio > 0.7) {
      weight *= 1.2;
    }
    
    // Reduce weight for very different table sizes (likely cross-module)
    if (columnRatio < 0.3) {
      weight *= 0.5;
    }
    
    // Boost weight for tables with high constraint density
    const sourceConstraints = this.calculateConstraintDensity(sourceTable);
    const targetConstraints = this.calculateConstraintDensity(targetTable);
    if (sourceConstraints > 0.5 && targetConstraints > 0.5) {
      weight *= 1.1;
    }
    
    // Ensure weight stays within bounds
    return Math.max(0.05, Math.min(1.0, weight));
  }
  
  /**
   * Calculate constraint density (unique, not null, etc.)
   */
  private calculateConstraintDensity(table: TableData): number {
    const constrainedColumns = table.attributes.filter(col => 
      col.unique || !col.nullable || col.isPrimary
    ).length;
    return constrainedColumns / table.attributes.length;
  }
  
  /**
   * Categorize relationship strength
   */
  private categorizeStrength(weight: number): 'strong' | 'medium' | 'weak' {
    if (weight >= 0.7) return 'strong';
    if (weight >= 0.4) return 'medium';
    return 'weak';
  }
  
  /**
   * Calculate relationship metrics
   */
  private calculateMetrics(weights: RelationshipWeight[]): RelationshipMetrics {
    const total = weights.length;
    const strong = weights.filter(w => w.strength === 'strong').length;
    const weak = weights.filter(w => w.strength === 'weak').length;
    const avgWeight = weights.reduce((sum, w) => sum + w.weight, 0) / total;
    
    return {
      totalRelationships: total,
      strongRelationships: strong,
      weakRelationships: weak,
      averageStrength: avgWeight
    };
  }
}

// Export singleton instance
export const relationshipAnalyzer = new RelationshipAnalyzer();