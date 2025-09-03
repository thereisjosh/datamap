import { type TableData } from '@shared/schema';

// Interface for algorithmic domain classification (no hardcoded business types)
interface StructuralFeatures {
  hasHierarchy: boolean;
  hasTransactionality: boolean;
  hasTemporalPatterns: boolean;
  hasUserContext: boolean;
  centralityScore: number;
  relationshipDensity: number;
}

interface ConnectivityMetrics {
  score: number;
  hubTables: string[];
  leafTables: string[];
  bridgeTables: string[];
}

// Algorithmic structural domain types (no business assumptions)
export type StructuralDomainType = 
  | 'entity_aggregate'     // High-connectivity hub with related entities
  | 'transactional'        // Sequential processing patterns
  | 'hierarchical'         // Parent-child tree structures
  | 'relational'           // Many-to-many relationship patterns
  | 'temporal'             // Time-series or audit patterns
  | 'configuration'        // Low-connectivity system tables
  | 'unknown';

// Replace pattern-based approach with structural metrics
export interface StructuralPattern {
  name: string;
  structuralType: StructuralDomainType;
  connectivityThreshold: number;
  relationshipWeight: number;
  description: string;
}

export interface DomainClassificationResult {
  structuralType: StructuralDomainType;
  confidence: number;
  connectivityScore: number;
  semanticCohesion: number;
  industryAgnosticLabel: string;
  description: string;
  structuralFeatures: StructuralFeatures;
}

// Algorithmic Domain Classifier - Zero hardcoded business patterns
export class AlgorithmicDomainClassifier {
  
  // Structural thresholds for algorithmic classification
  private readonly CONNECTIVITY_THRESHOLDS = {
    HIGH_HUB: 0.7,        // Tables connected to >70% of domain
    MEDIUM_HUB: 0.4,      // Tables connected to 40-70% of domain
    LOW_CONNECTIVITY: 0.2  // Tables connected to <20% of domain
  };

  private readonly TRANSACTIONALITY_INDICATORS = [
    'created_at', 'updated_at', 'timestamp', 'date',
    'status', 'state', 'processed', 'completed'
  ];

  private readonly HIERARCHY_INDICATORS = [
    'parent_id', 'children', 'level', 'depth', 'tree'
  ];
  
  /**
   * Algorithmically classify domain using structural analysis only
   */
  public classifyDomain(tables: TableData[]): DomainClassificationResult {
    console.log(`🏗️ Algorithmically analyzing ${tables.length} tables: [${tables.map(t => t.name).join(', ')}]`);
    
    // Perform structural analysis
    const structuralFeatures = this.analyzeStructuralPatterns(tables);
    const connectivityMetrics = this.calculateConnectivityMetrics(tables);
    const semanticCohesion = this.calculateSemanticSimilarity(tables);
    
    // Classify based on structural characteristics
    const structuralType = this.inferStructuralType(structuralFeatures);
    const confidence = this.calculateStructuralConfidence(structuralFeatures, connectivityMetrics, semanticCohesion);
    const industryAgnosticLabel = this.generateAgnosticLabel(structuralFeatures, tables);
    
    console.log(`   ✅ Structural classification: ${structuralType} (confidence: ${confidence.toFixed(2)})`);
    
    return {
      structuralType,
      confidence,
      connectivityScore: connectivityMetrics.score,
      semanticCohesion,
      industryAgnosticLabel,
      description: this.getStructuralDescription(structuralType),
      structuralFeatures
    };
  }
  
  /**
   * Analyze structural patterns in table group using algorithms
   */
  private analyzeStructuralPatterns(tables: TableData[]): StructuralFeatures {
    const hasHierarchy = this.detectHierarchicalPatterns(tables);
    const hasTransactionality = this.detectTransactionalPatterns(tables);
    const hasTemporalPatterns = this.detectTemporalPatterns(tables);
    const hasUserContext = this.detectUserContextPatterns(tables);
    const centralityScore = this.calculateCentralityScore(tables);
    const relationshipDensity = this.calculateRelationshipDensity(tables);
    
    return {
      hasHierarchy,
      hasTransactionality,
      hasTemporalPatterns,
      hasUserContext,
      centralityScore,
      relationshipDensity
    };
  }
  
  /**
   * Calculate structural connectivity metrics
   */
  private calculateConnectivityMetrics(tables: TableData[]): ConnectivityMetrics {
    const hubTables: string[] = [];
    const leafTables: string[] = [];
    const bridgeTables: string[] = [];
    
    // Analyze each table's connectivity patterns
    tables.forEach(table => {
      const foreignKeys = table.columns.filter(col => col.foreignKey).length;
      const referencingTables = this.countReferencingTables(table, tables);
      const totalConnections = foreignKeys + referencingTables;
      const connectivityRatio = totalConnections / Math.max(tables.length - 1, 1);
      
      if (connectivityRatio >= this.CONNECTIVITY_THRESHOLDS.HIGH_HUB) {
        hubTables.push(table.name);
      } else if (connectivityRatio <= this.CONNECTIVITY_THRESHOLDS.LOW_CONNECTIVITY) {
        leafTables.push(table.name);
      } else if (foreignKeys > 0 && referencingTables > 0) {
        bridgeTables.push(table.name);
      }
    });
    
    const score = (hubTables.length * 3 + bridgeTables.length * 2 + leafTables.length) / (tables.length * 3);
    
    return { score, hubTables, leafTables, bridgeTables };
  }
  
  /**
   * Generate industry-agnostic domain label based on structural analysis
   */
  private generateAgnosticLabel(features: StructuralFeatures, tables: TableData[]): string {
    const concepts = this.extractStructuralConcepts(tables);
    const structuralRole = this.inferStructuralRole(features);
    
    if (concepts.length > 0) {
      const primaryConcept = concepts[0];
      return `${primaryConcept} ${structuralRole}`;
    }
    
    // Fallback to pure structural description
    return `${structuralRole} Domain`;
  }
  
  /**
   * Extract structural concepts from table names (no business assumptions)
   */
  private extractStructuralConcepts(tables: TableData[]): string[] {
    const conceptMap = new Map<string, number>();
    
    tables.forEach(table => {
      const tableName = table.name.toLowerCase();
      
      // Extract meaningful words (skip technical suffixes/prefixes)
      const words = tableName
        .split(/[_\s]+/)
        .filter(word => word.length > 2)
        .filter(word => !['log', 'type', 'status', 'history', 'audit', 'config', 'setting'].includes(word))
        .map(word => this.capitalizeFirst(word));
      
      words.forEach(word => {
        conceptMap.set(word, (conceptMap.get(word) || 0) + 1);
      });
    });
    
    // Return top 3 concepts by frequency
    return Array.from(conceptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([concept]) => concept)
      .slice(0, 3);
  }
  
  /**
   * Algorithmically determine if domains should remain separate
   */
  public shouldKeepDomainsSeparate(
    domain1: DomainClassificationResult,
    domain2: DomainClassificationResult
  ): boolean {
    // Keep domains with different structural types separate
    if (domain1.structuralType !== domain2.structuralType) {
      return true;
    }
    
    // Keep high-confidence domains with low semantic similarity separate
    if (domain1.confidence > 0.7 && domain2.confidence > 0.7 && 
        Math.abs(domain1.semanticCohesion - domain2.semanticCohesion) > 0.3) {
      return true;
    }
    
    // Keep domains with very different connectivity patterns separate
    if (Math.abs(domain1.connectivityScore - domain2.connectivityScore) > 0.5) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get minimum domain size based on structural complexity
   */
  public getMinimumDomainSize(structuralType: StructuralDomainType): number {
    // Algorithmic sizing based on structural characteristics
    const algorithmicSizes: Record<StructuralDomainType, number> = {
      'entity_aggregate': 4,    // Requires multiple related entities
      'transactional': 3,       // Needs process flow tables
      'hierarchical': 3,        // Requires parent-child relationships
      'relational': 2,          // Basic many-to-many patterns
      'temporal': 2,            // Time-series or audit patterns
      'configuration': 1,       // Can be standalone
      'unknown': 1
    };
    
    return algorithmicSizes[structuralType];
  }

  // === ALGORITHMIC HELPER METHODS (NO HARDCODED PATTERNS) ===

  /**
   * Detect hierarchical patterns using structural analysis
   */
  private detectHierarchicalPatterns(tables: TableData[]): boolean {
    return tables.some(table => {
      const columnNames = table.columns.map(col => col.name.toLowerCase());
      return this.HIERARCHY_INDICATORS.some(indicator => 
        columnNames.some(name => name.includes(indicator))
      );
    });
  }

  /**
   * Detect transactional patterns using structural analysis
   */
  private detectTransactionalPatterns(tables: TableData[]): boolean {
    return tables.some(table => {
      const columnNames = table.columns.map(col => col.name.toLowerCase());
      const hasStatusField = columnNames.some(name => name.includes('status') || name.includes('state'));
      const hasTimestamp = columnNames.some(name => 
        this.TRANSACTIONALITY_INDICATORS.some(indicator => name.includes(indicator))
      );
      return hasStatusField && hasTimestamp;
    });
  }

  /**
   * Detect temporal patterns using column analysis
   */
  private detectTemporalPatterns(tables: TableData[]): boolean {
    const temporalKeywords = ['created_at', 'updated_at', 'timestamp', 'date', 'time'];
    return tables.some(table => {
      const columnNames = table.columns.map(col => col.name.toLowerCase());
      return temporalKeywords.some(keyword => 
        columnNames.some(name => name.includes(keyword))
      );
    });
  }

  /**
   * Detect user context patterns using structural analysis
   */
  private detectUserContextPatterns(tables: TableData[]): boolean {
    // Look for user_id, account_id, or similar identity patterns
    const identityPatterns = ['user_id', 'account_id', 'member_id', 'person_id', 'entity_id'];
    return tables.some(table => {
      const columnNames = table.columns.map(col => col.name.toLowerCase());
      return identityPatterns.some(pattern => 
        columnNames.some(name => name === pattern || name.endsWith('_' + pattern))
      );
    });
  }

  /**
   * Calculate centrality score based on relationship patterns
   */
  private calculateCentralityScore(tables: TableData[]): number {
    if (tables.length <= 1) return 0;
    
    let totalConnections = 0;
    let maxPossibleConnections = 0;
    
    tables.forEach(table => {
      const foreignKeys = table.columns.filter(col => col.foreignKey).length;
      const referencingTables = this.countReferencingTables(table, tables);
      totalConnections += (foreignKeys + referencingTables);
      maxPossibleConnections += (tables.length - 1) * 2; // max possible bidirectional connections
    });
    
    return maxPossibleConnections > 0 ? totalConnections / maxPossibleConnections : 0;
  }

  /**
   * Calculate relationship density in domain
   */
  private calculateRelationshipDensity(tables: TableData[]): number {
    if (tables.length <= 1) return 0;
    
    const totalRelationships = tables.reduce((sum, table) => {
      return sum + table.columns.filter(col => col.foreignKey).length;
    }, 0);
    
    const maxPossibleRelationships = tables.length * (tables.length - 1);
    return maxPossibleRelationships > 0 ? totalRelationships / maxPossibleRelationships : 0;
  }

  /**
   * Count tables that reference this table
   */
  private countReferencingTables(targetTable: TableData, allTables: TableData[]): number {
    return allTables.filter(table => 
      table.name !== targetTable.name && 
      table.columns.some(col => 
        col.foreignKey && col.foreignKey.table === targetTable.name
      )
    ).length;
  }

  /**
   * Calculate semantic similarity score using structural features
   */
  private calculateSemanticSimilarity(tables: TableData[]): number {
    if (tables.length <= 1) return 1.0;
    
    // Extract common word stems from table names
    const allWords = tables.flatMap(table => 
      table.name.toLowerCase().split(/[_\s]+/).filter(word => word.length > 2)
    );
    
    const wordFrequency = new Map<string, number>();
    allWords.forEach(word => {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    });
    
    // Calculate cohesion based on shared terminology
    const commonWords = Array.from(wordFrequency.entries())
      .filter(([_, count]) => count > 1)
      .length;
    
    const uniqueWords = wordFrequency.size;
    return uniqueWords > 0 ? commonWords / uniqueWords : 0;
  }

  /**
   * Infer structural type from features
   */
  private inferStructuralType(features: StructuralFeatures): StructuralDomainType {
    // Algorithmic classification based on structural characteristics
    if (features.hasHierarchy && features.centralityScore > 0.3) {
      return 'hierarchical';
    }
    
    if (features.hasTransactionality && features.hasTemporalPatterns) {
      return 'transactional';
    }
    
    if (features.centralityScore > 0.6 && features.relationshipDensity > 0.4) {
      return 'entity_aggregate';
    }
    
    if (features.relationshipDensity > 0.5) {
      return 'relational';
    }
    
    if (features.hasTemporalPatterns && features.centralityScore < 0.3) {
      return 'temporal';
    }
    
    if (features.centralityScore < 0.2 && features.relationshipDensity < 0.2) {
      return 'configuration';
    }
    
    return 'unknown';
  }

  /**
   * Calculate structural confidence score
   */
  private calculateStructuralConfidence(
    features: StructuralFeatures,
    connectivity: ConnectivityMetrics,
    semanticCohesion: number
  ): number {
    // Base confidence from structural clarity
    let baseConfidence = 0.3;
    
    // Bonus for clear structural patterns
    if (features.hasHierarchy || features.hasTransactionality) {
      baseConfidence += 0.2;
    }
    
    // Bonus for good connectivity patterns
    if (connectivity.score > 0.3) {
      baseConfidence += 0.2;
    }
    
    // Bonus for semantic cohesion
    if (semanticCohesion > 0.3) {
      baseConfidence += 0.2;
    }
    
    // Bonus for multiple structural indicators
    const structuralIndicators = [
      features.hasHierarchy,
      features.hasTransactionality,
      features.hasTemporalPatterns,
      features.hasUserContext
    ].filter(Boolean).length;
    
    if (structuralIndicators >= 2) {
      baseConfidence += 0.1;
    }
    
    return Math.min(baseConfidence, 1.0);
  }

  /**
   * Infer structural role from features
   */
  private inferStructuralRole(features: StructuralFeatures): string {
    if (features.hasHierarchy) return 'Hierarchy';
    if (features.hasTransactionality) return 'Processing';
    if (features.centralityScore > 0.6) return 'Hub';
    if (features.relationshipDensity > 0.5) return 'Network';
    if (features.hasTemporalPatterns) return 'Timeline';
    return 'Cluster';
  }

  /**
   * Get structural description for domain type
   */
  private getStructuralDescription(structuralType: StructuralDomainType): string {
    const descriptions: Record<StructuralDomainType, string> = {
      'entity_aggregate': 'High-connectivity entity cluster with central hub tables',
      'transactional': 'Sequential processing domain with state transitions',
      'hierarchical': 'Parent-child tree structure with nested relationships',
      'relational': 'Many-to-many relationship patterns with distributed connectivity',
      'temporal': 'Time-series or audit domain with temporal ordering',
      'configuration': 'Low-connectivity system configuration and settings',
      'unknown': 'Unstructured domain with unclear relationship patterns'
    };
    
    return descriptions[structuralType];
  }
  
  /**
   * Utility function to capitalize first letter
   */
  private capitalizeFirst(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
}

// Export singleton instance with new algorithmic classifier
export const algorithmicDomainClassifier = new AlgorithmicDomainClassifier();

// Backward compatibility alias
export const businessRuleEngine = algorithmicDomainClassifier;