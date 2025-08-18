import { type TableData, type Relationship } from '@shared/schema';

export interface RelationshipWeight {
  source: string;
  target: string;
  weight: number;
  type: RelationshipType;
  strength: 'strong' | 'medium' | 'weak';
}

export type RelationshipType = 
  | 'composition'          // Parent-child relationship (User -> UserAuth)
  | 'strong_association'   // Business relationship (Campaign -> Donation)
  | 'weak_reference'       // Cross-domain reference (Giver -> User)
  | 'junction_table'       // Many-to-many (User_Role)
  | 'audit_reference'      // System reference (created_by, updated_by)
  | 'lookup_reference';    // Reference for display/lookup purposes

export interface RelationshipMetrics {
  totalRelationships: number;
  strongRelationships: number;
  weakRelationships: number;
  averageStrength: number;
}

export class RelationshipAnalyzer {
  
  /**
   * Analyze relationships and assign weights based on business logic
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
        type: 'weak_reference',
        strength: 'weak'
      };
    }
    
    // Analyze relationship type and calculate weight
    const relType = this.determineRelationshipType(rel, sourceTable, targetTable);
    const baseWeight = this.getBaseWeight(relType);
    const adjustedWeight = this.applyBusinessLogicAdjustments(baseWeight, rel, sourceTable, targetTable);
    
    return {
      source: rel.sourceTable,
      target: rel.targetTable,
      weight: adjustedWeight,
      type: relType,
      strength: this.categorizeStrength(adjustedWeight)
    };
  }
  
  /**
   * Determine the type of relationship based on table and column analysis
   */
  private determineRelationshipType(
    rel: Relationship, 
    sourceTable: TableData, 
    targetTable: TableData
  ): RelationshipType {
    
    const sourceCol = rel.sourceColumn.toLowerCase();
    const targetCol = rel.targetColumn.toLowerCase();
    const sourceName = sourceTable.name.toLowerCase();
    const targetName = targetTable.name.toLowerCase();
    
    // Junction table detection (User_Role, Campaign_Tag, etc.)
    if (this.isJunctionTable(sourceTable, targetTable)) {
      return 'junction_table';
    }
    
    // Audit field references (created_by, updated_by, deleted_by)
    if (this.isAuditRelationship(sourceCol, targetCol)) {
      return 'audit_reference';
    }
    
    // Composition relationships (User -> UserAuth, Campaign -> CampaignStatus)
    if (this.isCompositionRelationship(sourceName, targetName)) {
      return 'composition';
    }
    
    // Strong business associations within same domain
    if (this.isStrongBusinessAssociation(sourceName, targetName)) {
      return 'strong_association';
    }
    
    // Cross-domain references (Giver -> User, Campaign -> User for created_by)
    if (this.isCrossDomainReference(sourceName, targetName)) {
      return 'weak_reference';
    }
    
    // Lookup references (status, type, category tables)
    if (this.isLookupReference(targetName)) {
      return 'lookup_reference';
    }
    
    // Default to strong association for same-domain relationships
    return 'strong_association';
  }
  
  /**
   * Get base weight for relationship type
   */
  private getBaseWeight(type: RelationshipType): number {
    const weights: Record<RelationshipType, number> = {
      'composition': 0.9,
      'strong_association': 0.8,
      'junction_table': 0.7,
      'lookup_reference': 0.4,
      'weak_reference': 0.2,
      'audit_reference': 0.1
    };
    
    return weights[type];
  }
  
  /**
   * Apply business logic adjustments to base weight
   */
  private applyBusinessLogicAdjustments(
    baseWeight: number,
    rel: Relationship,
    sourceTable: TableData,
    targetTable: TableData
  ): number {
    let weight = baseWeight;
    
    // Boost weight for same business domain
    if (this.areInSameDomain(sourceTable.name, targetTable.name)) {
      weight *= 1.2;
    }
    
    // Reduce weight for cross-domain references
    if (this.isCrossDomainReference(sourceTable.name.toLowerCase(), targetTable.name.toLowerCase())) {
      weight *= 0.5;
    }
    
    // Boost weight for core business entities
    if (this.isCoreBusinessEntity(sourceTable.name) && this.isCoreBusinessEntity(targetTable.name)) {
      weight *= 1.1;
    }
    
    // Ensure weight stays within bounds
    return Math.max(0.05, Math.min(1.0, weight));
  }
  
  /**
   * Check if tables form a junction (many-to-many) relationship
   */
  private isJunctionTable(sourceTable: TableData, targetTable: TableData): boolean {
    const sourceName = sourceTable.name.toLowerCase();
    const targetName = targetTable.name.toLowerCase();
    
    // Common junction table patterns
    const junctionPatterns = [
      /.*_.*/, // Contains underscore (User_Role, Campaign_Tag)
      /.*role.*/,
      /.*permission.*/,
      /.*tag.*/,
      /.*category.*/
    ];
    
    return junctionPatterns.some(pattern => 
      pattern.test(sourceName) || pattern.test(targetName)
    );
  }
  
  /**
   * Check if this is an audit field relationship
   */
  private isAuditRelationship(sourceCol: string, targetCol: string): boolean {
    const auditPatterns = [
      /created_by/,
      /updated_by/,
      /deleted_by/,
      /modified_by/,
      /approved_by/,
      /assigned_to/
    ];
    
    return auditPatterns.some(pattern => 
      pattern.test(sourceCol) || pattern.test(targetCol)
    );
  }
  
  /**
   * Check if this is a composition relationship (parent owns child)
   */
  private isCompositionRelationship(sourceName: string, targetName: string): boolean {
    // Parent-child patterns where child contains parent name
    if (targetName.includes(sourceName) && targetName !== sourceName) {
      return true;
    }
    
    // Status/log relationships
    if (targetName.includes('status') || targetName.includes('log') || 
        targetName.includes('history') || targetName.includes('audit')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if tables have strong business association
   */
  private isStrongBusinessAssociation(sourceName: string, targetName: string): boolean {
    const businessDomains = [
      ['campaign', 'donation', 'giver', 'pledge', 'fund'],
      ['user', 'auth', 'role', 'permission', 'group'],
      ['payment', 'transaction', 'checkout', 'billing', 'invoice'],
      ['opportunity', 'volunteer', 'registration', 'skill'],
      ['organization', 'entity', 'charity', 'profile']
    ];
    
    return businessDomains.some(domain => 
      domain.some(term => sourceName.includes(term)) &&
      domain.some(term => targetName.includes(term))
    );
  }
  
  /**
   * Check if this is a cross-domain reference
   */
  private isCrossDomainReference(sourceName: string, targetName: string): boolean {
    // User is referenced from many domains but shouldn't merge them
    if (targetName.includes('user') && !sourceName.includes('user')) {
      return true;
    }
    
    // EntityGroup/Organization references
    if (targetName.includes('entity') || targetName.includes('organization')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if this is a lookup/reference table
   */
  private isLookupReference(tableName: string): boolean {
    const lookupPatterns = [
      /.*status$/,
      /.*type$/,
      /.*category$/,
      /.*priority$/,
      /.*source$/,
      /language$/,
      /country$/
    ];
    
    return lookupPatterns.some(pattern => pattern.test(tableName));
  }
  
  /**
   * Check if tables are in the same business domain
   */
  private areInSameDomain(table1: string, table2: string): boolean {
    return this.isStrongBusinessAssociation(table1.toLowerCase(), table2.toLowerCase());
  }
  
  /**
   * Check if table is a core business entity
   */
  private isCoreBusinessEntity(tableName: string): boolean {
    const coreEntities = [
      'user', 'campaign', 'donation', 'giver', 'opportunity', 
      'payment', 'transaction', 'checkout', 'organization'
    ];
    
    const name = tableName.toLowerCase();
    return coreEntities.some(entity => name.includes(entity));
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