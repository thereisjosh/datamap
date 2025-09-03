import { TableInfo, Relationship } from '../../../shared/schema';
import { Logger } from '../../utils/logger';
import type { TableVector, SemanticSimilarity } from '../semanticVectorService';

const logger = new Logger('UniversalEdgeWeighter');

// Enhanced edge weighting with semantic vectors and multiplicative scoring
export interface EdgeWeightComponents {
  structuralWeight: number;     // FK relationship strength (0-1)
  topologicalWeight: number;    // Graph position importance (0-1) 
  constraintWeight: number;     // Referential integrity strength (0-1)
  similarityWeight: number;     // Mathematical table similarity (0-1)
  semanticWeight: number;       // Semantic vector similarity (0-1)
  finalWeight: number;          // Combined multiplicative score (0-1)
  scoringMethod: 'additive' | 'multiplicative' | 'hybrid';
}

export interface WeightedEdge {
  source: string;
  target: string;
  relationship: Relationship;
  components: EdgeWeightComponents;
}

export interface EdgeWeightingOptions {
  scoringMethod: 'additive' | 'multiplicative' | 'hybrid';
  semanticWeight: number;          // Weight of semantic similarity (0-1)
  structuralWeight: number;        // Weight of structural relationships (0-1)  
  semanticThreshold: number;       // Min semantic similarity to consider (default: 0.3)
  conservativeMode: boolean;       // Require both structural AND semantic strength
  enableSemanticBoost: boolean;    // Boost edges with high semantic similarity
}

export interface EdgeWeightingResult {
  weightedEdges: WeightedEdge[];
  statistics: {
    totalEdges: number;
    avgWeight: number;
    minWeight: number;
    maxWeight: number;
    variance: number;     // Weight variance for distribution analysis
    weightDistribution: {
      veryLow: number;    // < 0.2
      low: number;        // 0.2 - 0.4
      medium: number;     // 0.4 - 0.6
      high: number;       // 0.6 - 0.8
      veryHigh: number;   // > 0.8
    };
    semanticCoverage: number;       // % of edges with semantic data
    multiplicativeBoost: number;    // Avg boost from multiplicative scoring
  };
}

export class UniversalEdgeWeighter {
  private semanticVectors: Map<string, TableVector> = new Map();
  private semanticSimilarities: Map<string, number> = new Map();
  
  // Default configuration for conservative clustering
  private readonly defaultOptions: EdgeWeightingOptions = {
    scoringMethod: 'multiplicative',    // Conservative multiplicative scoring
    semanticWeight: 0.4,               // Balanced semantic influence  
    structuralWeight: 0.6,             // Structure-first approach
    semanticThreshold: 0.3,            // Conservative semantic threshold
    conservativeMode: true,            // Require both structural AND semantic
    enableSemanticBoost: false         // Disable aggressive semantic boosting
  };

  // Legacy ratios for additive mode (maintaining backward compatibility)
  private readonly STRUCTURAL_RATIO = 0.4;
  private readonly TOPOLOGICAL_RATIO = 0.3;
  private readonly CONSTRAINT_RATIO = 0.2;
  private readonly SIMILARITY_RATIO = 0.1;

  /**
   * Calculate edge weights with semantic enhancement and multiplicative scoring
   */
  calculateEdgeWeights(
    tables: TableInfo[], 
    relationships: Relationship[],
    semanticVectors?: TableVector[],
    options: Partial<EdgeWeightingOptions> = {}
  ): EdgeWeightingResult {
    const config = { ...this.defaultOptions, ...options };
    
    logger.info('Starting enhanced edge weight calculation', {
      tableCount: tables.length,
      relationshipCount: relationships.length,
      semanticVectorsProvided: !!semanticVectors,
      scoringMethod: config.scoringMethod,
      conservativeMode: config.conservativeMode
    });

    // Initialize semantic data if provided
    if (semanticVectors) {
      this.initializeSemanticData(semanticVectors);
    }

    // Build table lookup for efficient access
    const tableMap = new Map(tables.map(table => [table.name, table]));
    
    // Build graph representation for topological analysis
    const graphStructure = this.buildGraphStructure(tables, relationships);
    
    // Calculate weights for all relationships
    const weightedEdges = relationships.map(rel => 
      this.calculateSingleEdgeWeight(rel, tableMap, graphStructure, config)
    );

    // Calculate statistics
    const statistics = this.calculateWeightStatistics(weightedEdges);

    // Analyze edge weight distribution for debugging
    const weightRanges = {
      veryLow: weightedEdges.filter(e => e.components.finalWeight < 0.3).length,
      low: weightedEdges.filter(e => e.components.finalWeight >= 0.3 && e.components.finalWeight < 0.5).length,
      medium: weightedEdges.filter(e => e.components.finalWeight >= 0.5 && e.components.finalWeight < 0.7).length,
      high: weightedEdges.filter(e => e.components.finalWeight >= 0.7 && e.components.finalWeight < 0.9).length,
      veryHigh: weightedEdges.filter(e => e.components.finalWeight >= 0.9).length
    };

    logger.info('📊 STAGE 2 - Edge Weight Distribution Analysis', {
      totalEdges: weightedEdges.length,
      avgWeight: statistics.avgWeight.toFixed(4),
      weightRange: `${statistics.minWeight.toFixed(4)} - ${statistics.maxWeight.toFixed(4)}`,
      distribution: weightRanges,
      variance: statistics.variance.toFixed(4),
      stdDev: Math.sqrt(statistics.variance).toFixed(4)
    });

    // Log sample edges for analysis
    const sortedEdges = [...weightedEdges].sort((a, b) => b.components.finalWeight - a.components.finalWeight);
    const strongestEdges = sortedEdges.slice(0, 5);
    const weakestEdges = sortedEdges.slice(-5);

    logger.info('🔗 Strongest Connections (Top 5)', {
      edges: strongestEdges.map(e => ({
        from: e.source,
        to: e.target,
        weight: e.components.finalWeight.toFixed(4)
      }))
    });

    logger.info('🔗 Weakest Connections (Bottom 5)', {
      edges: weakestEdges.map(e => ({
        from: e.source,
        to: e.target,
        weight: e.components.finalWeight.toFixed(4)
      }))
    });

    return { weightedEdges, statistics };
  }

  /**
   * Initialize semantic vector data and precompute similarities
   */
  private initializeSemanticData(semanticVectors: TableVector[]): void {
    this.semanticVectors.clear();
    this.semanticSimilarities.clear();
    
    // Build vector lookup map
    semanticVectors.forEach(vector => {
      this.semanticVectors.set(vector.tableName, vector);
    });
    
    // Precompute pairwise semantic similarities
    const vectors = Array.from(this.semanticVectors.values());
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const similarity = this.calculateCosineSimilarity(
          vectors[i].embedding, 
          vectors[j].embedding
        );
        
        // Store both directions for easy lookup
        const key1 = `${vectors[i].tableName}-${vectors[j].tableName}`;
        const key2 = `${vectors[j].tableName}-${vectors[i].tableName}`;
        this.semanticSimilarities.set(key1, similarity);
        this.semanticSimilarities.set(key2, similarity);
      }
    }
    
    logger.info('Semantic data initialized', {
      vectorCount: this.semanticVectors.size,
      similarityPairs: this.semanticSimilarities.size / 2,
      avgEmbeddingDim: vectors.length > 0 ? vectors[0].embedding.length : 0
    });
  }

  /**
   * Calculate weight for a single edge using enhanced components
   */
  private calculateSingleEdgeWeight(
    relationship: Relationship,
    tableMap: Map<string, TableInfo>,
    graphStructure: GraphStructure,
    config: EdgeWeightingOptions
  ): WeightedEdge {
    const sourceTable = tableMap.get(relationship.sourceTable);
    const targetTable = tableMap.get(relationship.targetTable);

    if (!sourceTable || !targetTable) {
      throw new Error(`Tables not found: ${relationship.sourceTable} -> ${relationship.targetTable}`);
    }

    // Calculate each weight component
    const structuralWeight = this.calculateStructuralWeight(relationship, sourceTable, targetTable);
    const topologicalWeight = this.calculateTopologicalWeight(relationship, graphStructure);
    const constraintWeight = this.calculateConstraintWeight(relationship, sourceTable, targetTable);
    const similarityWeight = this.calculateSimilarityWeight(sourceTable, targetTable);
    const semanticWeight = this.calculateSemanticWeight(relationship.sourceTable, relationship.targetTable, config);

    // Calculate final weight based on scoring method
    const finalWeight = this.calculateFinalWeight({
      structuralWeight,
      topologicalWeight,
      constraintWeight,
      similarityWeight,
      semanticWeight
    }, config);

    // Apply relationship type multiplier for better discrimination
    const relationshipMultiplier = this.getRelationshipTypeMultiplier(relationship, sourceTable, targetTable);
    const adjustedFinalWeight = finalWeight * relationshipMultiplier;

    // Debug logging for first few edges to understand component values
    if (Math.random() < 0.02) { // Log ~2% of edges for debugging
      logger.debug('🔍 Enhanced Edge Weight Component Breakdown', {
        from: relationship.sourceTable,
        to: relationship.targetTable,
        components: {
          structural: structuralWeight.toFixed(4),
          topological: topologicalWeight.toFixed(4),
          constraint: constraintWeight.toFixed(4),
          similarity: similarityWeight.toFixed(4),
          semantic: semanticWeight.toFixed(4),
          final: finalWeight.toFixed(4),
          multiplier: relationshipMultiplier.toFixed(4),
          adjusted: adjustedFinalWeight.toFixed(4)
        },
        config: {
          scoringMethod: config.scoringMethod,
          semanticWeight: config.semanticWeight,
          structuralWeight: config.structuralWeight,
          conservativeMode: config.conservativeMode
        }
      });
    }

    const components: EdgeWeightComponents = {
      structuralWeight,
      topologicalWeight,
      constraintWeight,
      similarityWeight,
      semanticWeight,
      finalWeight: Math.max(0.1, Math.min(1, adjustedFinalWeight)), // Clamp to [0.1, 1] for better separation
      scoringMethod: config.scoringMethod
    };

    return {
      source: relationship.sourceTable,
      target: relationship.targetTable,
      relationship,
      components
    };
  }

  /**
   * Calculate structural weight based on FK relationship characteristics
   */
  private calculateStructuralWeight(
    relationship: Relationship,
    sourceTable: TableInfo,
    targetTable: TableInfo
  ): number {
    let weight = 0.2; // Lower base weight for more discrimination

    // Relationship nullability (required relationships are MUCH stronger)
    if (relationship.nullable === false) {
      weight += 0.6; // Strong boost for required relationships
    } else {
      weight += 0.1; // Weak relationships get minimal boost
    }

    // Primary key involvement (stronger relationships)
    const sourceColumn = sourceTable.columns.find(col => col.name === relationship.sourceColumn);
    const targetColumn = targetTable.columns.find(col => col.name === relationship.targetColumn);

    if (targetColumn?.isPrimaryKey) {
      weight += 0.3; // Strong boost for FK to PK relationship
    }

    if (sourceColumn?.isPrimaryKey) {
      weight += 0.2; // PK to PK relationship (rare but strong)
    }

    // Add table size relationship factor (larger tables connecting to smaller is stronger)
    const sourceSize = sourceTable.columns.length;
    const targetSize = targetTable.columns.length;
    const sizeRatio = Math.min(sourceSize, targetSize) / Math.max(sourceSize, targetSize);
    
    // Tables of different sizes connecting suggest strong semantic relationship
    if (sizeRatio < 0.5) {
      weight += 0.2; // Strong boost for size difference
    } else if (sizeRatio < 0.8) {
      weight += 0.1; // Medium boost for moderate difference
    }

    // Unique constraint involvement
    if (sourceColumn?.unique || targetColumn?.unique) {
      weight += 0.15;
    }

    // Cardinality implications (inferred from column names and constraints)
    const cardinalityWeight = this.inferCardinalityWeight(relationship, sourceTable, targetTable);
    weight += cardinalityWeight;

    return Math.max(0, Math.min(1, weight));
  }

  /**
   * Calculate topological weight based on graph position
   */
  private calculateTopologicalWeight(
    relationship: Relationship,
    graphStructure: GraphStructure
  ): number {
    const sourceNode = graphStructure.nodes.get(relationship.sourceTable);
    const targetNode = graphStructure.nodes.get(relationship.targetTable);

    if (!sourceNode || !targetNode) return 0.5;

    // Node degree impact (highly connected nodes have lower individual edge weights)
    const sourceDegree = sourceNode.inDegree + sourceNode.outDegree;
    const targetDegree = targetNode.inDegree + targetNode.outDegree;
    const avgDegree = (sourceDegree + targetDegree) / 2;

    // Inverse relationship: higher degree = lower individual edge weight
    const degreeWeight = Math.max(0.1, 1.0 - (avgDegree / graphStructure.maxDegree));

    // Shortest path analysis (closer nodes have stronger relationships)
    const pathLength = this.calculateShortestPath(
      relationship.sourceTable, 
      relationship.targetTable, 
      graphStructure
    );
    
    const pathWeight = pathLength <= 2 ? 1.0 : 1.0 / pathLength;

    // Combine topological factors
    return (degreeWeight * 0.6 + pathWeight * 0.4);
  }

  /**
   * Calculate constraint weight based on referential integrity
   */
  private calculateConstraintWeight(
    relationship: Relationship,
    sourceTable: TableInfo,
    targetTable: TableInfo
  ): number {
    let weight = 0.5; // Base weight

    // Check for cascade constraints (stronger relationships)
    const hasCascadeDelete = this.inferCascadeDelete(relationship, sourceTable, targetTable);
    const hasCascadeUpdate = this.inferCascadeUpdate(relationship, sourceTable, targetTable);

    if (hasCascadeDelete) weight += 0.25;
    if (hasCascadeUpdate) weight += 0.15;

    // Check constraint implications from column properties
    const sourceColumn = sourceTable.columns.find(col => col.name === relationship.sourceColumn);
    const targetColumn = targetTable.columns.find(col => col.name === relationship.targetColumn);

    // Data type compatibility (same types = stronger relationship)
    if (sourceColumn && targetColumn && sourceColumn.type === targetColumn.type) {
      weight += 0.1;
    }

    // Index implications (indexed FKs indicate important relationships)
    const isLikelyIndexed = this.inferIndexPresence(relationship, sourceTable);
    if (isLikelyIndexed) {
      weight += 0.1;
    }

    return Math.max(0, Math.min(1, weight));
  }

  /**
   * Calculate semantic weight using vector embeddings
   */
  private calculateSemanticWeight(sourceTable: string, targetTable: string, config: EdgeWeightingOptions): number {
    const similarityKey = `${sourceTable}-${targetTable}`;
    const semanticSimilarity = this.semanticSimilarities.get(similarityKey);
    
    // Return 0.5 (neutral) if no semantic data available
    if (semanticSimilarity === undefined) {
      return 0.5;
    }
    
    // Apply semantic threshold
    if (semanticSimilarity < config.semanticThreshold) {
      return 0.1; // Very low weight for below-threshold similarity
    }
    
    // Normalize similarity to 0-1 range with threshold as minimum
    const normalizedSimilarity = (semanticSimilarity - config.semanticThreshold) / (1.0 - config.semanticThreshold);
    
    return Math.max(0.1, Math.min(1.0, normalizedSimilarity));
  }

  /**
   * Calculate final weight using different scoring methods
   */
  private calculateFinalWeight(weights: {
    structuralWeight: number;
    topologicalWeight: number;
    constraintWeight: number;
    similarityWeight: number;
    semanticWeight: number;
  }, config: EdgeWeightingOptions): number {
    const { structuralWeight, topologicalWeight, constraintWeight, similarityWeight, semanticWeight } = weights;
    
    switch (config.scoringMethod) {
      case 'multiplicative':
        return this.calculateMultiplicativeWeight(weights, config);
      
      case 'hybrid':
        return this.calculateHybridWeight(weights, config);
      
      case 'additive':
      default:
        // Legacy additive scoring for backward compatibility
        return (
          structuralWeight * this.STRUCTURAL_RATIO +
          topologicalWeight * this.TOPOLOGICAL_RATIO +
          constraintWeight * this.CONSTRAINT_RATIO +
          similarityWeight * this.SIMILARITY_RATIO
        );
    }
  }

  /**
   * Conservative multiplicative scoring: combinedScore = structuralSimilarity × semanticSimilarity
   */
  private calculateMultiplicativeWeight(weights: {
    structuralWeight: number;
    topologicalWeight: number;
    constraintWeight: number;
    similarityWeight: number;
    semanticWeight: number;
  }, config: EdgeWeightingOptions): number {
    const { structuralWeight, topologicalWeight, constraintWeight, similarityWeight, semanticWeight } = weights;
    
    // Calculate composite structural score
    const structuralComposite = (
      structuralWeight * 0.5 +          // FK relationship strength
      topologicalWeight * 0.25 +        // Graph position
      constraintWeight * 0.15 +         // Referential integrity
      similarityWeight * 0.1            // Table characteristics
    );
    
    // Conservative multiplicative approach: BOTH structural AND semantic must be strong
    if (config.conservativeMode) {
      const structuralThreshold = 0.4;
      const semanticThreshold = config.semanticThreshold;
      
      // If either structural or semantic is too weak, heavily penalize
      if (structuralComposite < structuralThreshold || semanticWeight < semanticThreshold) {
        return Math.min(structuralComposite, semanticWeight) * 0.5; // Heavy penalty
      }
    }
    
    // Core multiplicative formula: structural × semantic
    const multiplicativeScore = structuralComposite * semanticWeight;
    
    // Apply weighting based on configuration
    const weightedScore = (
      multiplicativeScore * (config.structuralWeight + config.semanticWeight) +
      structuralComposite * (1 - config.structuralWeight - config.semanticWeight)
    );
    
    return Math.max(0.1, Math.min(1.0, weightedScore));
  }

  /**
   * Hybrid scoring: Multiplicative for strong pairs, additive for weak pairs
   */
  private calculateHybridWeight(weights: {
    structuralWeight: number;
    topologicalWeight: number;
    constraintWeight: number;
    similarityWeight: number;
    semanticWeight: number;
  }, config: EdgeWeightingOptions): number {
    const { structuralWeight, semanticWeight } = weights;
    
    const structuralComposite = (
      structuralWeight * 0.5 +
      weights.topologicalWeight * 0.25 +
      weights.constraintWeight * 0.15 +
      weights.similarityWeight * 0.1
    );
    
    // Use multiplicative for strong pairs, additive for weak pairs
    const strongThreshold = 0.6;
    
    if (structuralComposite >= strongThreshold && semanticWeight >= strongThreshold) {
      // Both are strong - use multiplicative
      return this.calculateMultiplicativeWeight(weights, config);
    } else {
      // At least one is weak - use additive with penalty
      const additiveScore = structuralComposite * config.structuralWeight + semanticWeight * config.semanticWeight;
      return additiveScore * 0.8; // Penalty for weak relationships
    }
  }

  /**
   * Calculate similarity weight based on mathematical table characteristics
   */
  private calculateSimilarityWeight(sourceTable: TableInfo, targetTable: TableInfo): number {
    // Column count similarity
    const columnCountSim = this.calculateColumnCountSimilarity(sourceTable, targetTable);
    
    // Data type distribution similarity
    const dataTypeSim = this.calculateDataTypeDistributionSimilarity(sourceTable, targetTable);
    
    // Constraint pattern similarity
    const constraintSim = this.calculateConstraintPatternSimilarity(sourceTable, targetTable);
    
    // Column name overlap (mathematical, not linguistic)
    const nameOverlapSim = this.calculateColumnNameOverlap(sourceTable, targetTable);

    return (
      columnCountSim * 0.3 +
      dataTypeSim * 0.3 +
      constraintSim * 0.2 +
      nameOverlapSim * 0.2
    );
  }

  /**
   * Build graph structure for topological analysis
   */
  private buildGraphStructure(tables: TableInfo[], relationships: Relationship[]): GraphStructure {
    const nodes = new Map<string, GraphNode>();
    let maxDegree = 0;

    // Initialize nodes
    tables.forEach(table => {
      nodes.set(table.name, {
        name: table.name,
        inDegree: 0,
        outDegree: 0,
        neighbors: new Set()
      });
    });

    // Calculate degrees and neighbors
    relationships.forEach(rel => {
      const sourceNode = nodes.get(rel.sourceTable);
      const targetNode = nodes.get(rel.targetTable);

      if (sourceNode && targetNode) {
        sourceNode.outDegree++;
        targetNode.inDegree++;
        sourceNode.neighbors.add(rel.targetTable);
        targetNode.neighbors.add(rel.sourceTable);

        // Update max degree
        const sourceTotalDegree = sourceNode.inDegree + sourceNode.outDegree;
        const targetTotalDegree = targetNode.inDegree + targetNode.outDegree;
        maxDegree = Math.max(maxDegree, sourceTotalDegree, targetTotalDegree);
      }
    });

    return { nodes, maxDegree };
  }

  /**
   * Calculate shortest path between two nodes (BFS)
   */
  private calculateShortestPath(
    source: string, 
    target: string, 
    graph: GraphStructure
  ): number {
    if (source === target) return 0;

    const visited = new Set<string>();
    const queue: Array<{ node: string; distance: number }> = [{ node: source, distance: 0 }];
    visited.add(source);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentNode = graph.nodes.get(current.node);

      if (!currentNode) continue;

      for (const neighbor of currentNode.neighbors) {
        if (neighbor === target) {
          return current.distance + 1;
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, distance: current.distance + 1 });
        }
      }
    }

    return Infinity; // No path found
  }

  /**
   * Calculate column count similarity
   */
  private calculateColumnCountSimilarity(table1: TableInfo, table2: TableInfo): number {
    const count1 = table1.columns.length;
    const count2 = table2.columns.length;
    
    if (count1 === 0 && count2 === 0) return 1.0;
    
    const maxCount = Math.max(count1, count2);
    const minCount = Math.min(count1, count2);
    
    return minCount / maxCount;
  }

  /**
   * Calculate data type distribution similarity
   */
  private calculateDataTypeDistributionSimilarity(table1: TableInfo, table2: TableInfo): number {
    // Create type distributions
    const types1 = this.getDataTypeDistribution(table1);
    const types2 = this.getDataTypeDistribution(table2);

    // Calculate cosine similarity between distributions
    return this.calculateDistributionSimilarity(types1, types2);
  }

  /**
   * Get data type distribution for a table
   */
  private getDataTypeDistribution(table: TableInfo): Map<string, number> {
    const distribution = new Map<string, number>();
    const totalColumns = table.columns.length;

    if (totalColumns === 0) return distribution;

    table.columns.forEach(column => {
      const normalizedType = this.normalizeDataType(column.type);
      const count = distribution.get(normalizedType) || 0;
      distribution.set(normalizedType, count + 1);
    });

    // Convert to proportions
    distribution.forEach((count, type) => {
      distribution.set(type, count / totalColumns);
    });

    return distribution;
  }

  /**
   * Normalize data type to standard categories
   */
  private normalizeDataType(type: string): string {
    const lowerType = type.toLowerCase();
    
    // Integer types
    if (/int|integer|bigint|smallint|tinyint/.test(lowerType)) return 'integer';
    
    // Numeric types
    if (/decimal|numeric|float|double|real/.test(lowerType)) return 'numeric';
    
    // String types
    if (/char|varchar|text|string/.test(lowerType)) return 'string';
    
    // Date/time types
    if (/date|time|timestamp/.test(lowerType)) return 'datetime';
    
    // Boolean types
    if (/bool|boolean/.test(lowerType)) return 'boolean';
    
    // Binary types
    if (/blob|binary|varbinary/.test(lowerType)) return 'binary';
    
    // JSON types
    if (/json|jsonb/.test(lowerType)) return 'json';
    
    // UUID types
    if (/uuid|guid/.test(lowerType)) return 'uuid';
    
    return 'other';
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error('Vector dimensions must match for cosine similarity');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Calculate cosine similarity between two distributions
   */
  private calculateDistributionSimilarity(dist1: Map<string, number>, dist2: Map<string, number>): number {
    // Get all unique types
    const allTypes = new Set([...dist1.keys(), ...dist2.keys()]);
    
    if (allTypes.size === 0) return 1.0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    allTypes.forEach(type => {
      const val1 = dist1.get(type) || 0;
      const val2 = dist2.get(type) || 0;

      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    });

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate constraint pattern similarity
   */
  private calculateConstraintPatternSimilarity(table1: TableInfo, table2: TableInfo): number {
    const pattern1 = this.getConstraintPattern(table1);
    const pattern2 = this.getConstraintPattern(table2);

    return this.calculateDistributionSimilarity(pattern1, pattern2);
  }

  /**
   * Get constraint pattern for a table
   */
  private getConstraintPattern(table: TableInfo): Map<string, number> {
    const pattern = new Map<string, number>();
    const totalColumns = table.columns.length;

    if (totalColumns === 0) return pattern;

    let primaryKeyCount = 0;
    let foreignKeyCount = 0;
    let uniqueCount = 0;
    let nullableCount = 0;

    table.columns.forEach(column => {
      if (column.isPrimaryKey) primaryKeyCount++;
      if (column.isForeignKey) foreignKeyCount++;
      if (column.unique) uniqueCount++;
      if (column.nullable) nullableCount++;
    });

    // Convert to proportions
    pattern.set('primary_key', primaryKeyCount / totalColumns);
    pattern.set('foreign_key', foreignKeyCount / totalColumns);
    pattern.set('unique', uniqueCount / totalColumns);
    pattern.set('nullable', nullableCount / totalColumns);

    return pattern;
  }

  /**
   * Calculate column name overlap (mathematical, not linguistic)
   */
  private calculateColumnNameOverlap(table1: TableInfo, table2: TableInfo): number {
    const names1 = new Set(table1.columns.map(col => col.name.toLowerCase()));
    const names2 = new Set(table2.columns.map(col => col.name.toLowerCase()));

    // Calculate Jaccard similarity
    const intersection = new Set([...names1].filter(name => names2.has(name)));
    const union = new Set([...names1, ...names2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Infer cardinality weight from relationship characteristics
   */
  private inferCardinalityWeight(
    relationship: Relationship,
    sourceTable: TableInfo,
    targetTable: TableInfo
  ): number {
    // This is mathematical inference, not pattern matching
    const sourceColumn = sourceTable.columns.find(col => col.name === relationship.sourceColumn);
    const targetColumn = targetTable.columns.find(col => col.name === relationship.targetColumn);

    let weight = 0.0;

    // One-to-one (unique FK)
    if (sourceColumn?.unique && targetColumn?.isPrimaryKey) {
      weight = 0.2; // Strong relationship
    }
    // One-to-many (FK to PK, not unique)
    else if (targetColumn?.isPrimaryKey && !sourceColumn?.unique) {
      weight = 0.15; // Standard relationship
    }
    // Many-to-many (neither unique nor PK)
    else if (!sourceColumn?.unique && !targetColumn?.isPrimaryKey) {
      weight = 0.1; // Weaker relationship
    }

    return weight;
  }

  /**
   * Infer cascade delete from column characteristics
   */
  private inferCascadeDelete(
    relationship: Relationship,
    sourceTable: TableInfo,
    targetTable: TableInfo
  ): boolean {
    // Mathematical inference: required FK likely has cascade delete
    const sourceColumn = sourceTable.columns.find(col => col.name === relationship.sourceColumn);
    return sourceColumn ? !sourceColumn.nullable : false;
  }

  /**
   * Infer cascade update from column characteristics
   */
  private inferCascadeUpdate(
    relationship: Relationship,
    sourceTable: TableInfo,
    targetTable: TableInfo
  ): boolean {
    // Mathematical inference: PK-FK relationships likely have cascade update
    const targetColumn = targetTable.columns.find(col => col.name === relationship.targetColumn);
    return targetColumn ? targetColumn.isPrimaryKey : false;
  }

  /**
   * Infer index presence from relationship characteristics
   */
  private inferIndexPresence(relationship: Relationship, sourceTable: TableInfo): boolean {
    const sourceColumn = sourceTable.columns.find(col => col.name === relationship.sourceColumn);
    
    // FKs are typically indexed, especially if unique or part of composite key
    return sourceColumn ? (sourceColumn.isForeignKey || sourceColumn.unique || sourceColumn.isPrimaryKey) : false;
  }

  /**
   * Calculate weight distribution statistics with semantic metrics
   */
  private calculateWeightStatistics(weightedEdges: WeightedEdge[]): EdgeWeightingResult['statistics'] {
    if (weightedEdges.length === 0) {
      return {
        totalEdges: 0,
        avgWeight: 0,
        minWeight: 0,
        maxWeight: 0,
        variance: 0,
        weightDistribution: { veryLow: 0, low: 0, medium: 0, high: 0, veryHigh: 0 },
        semanticCoverage: 0,
        multiplicativeBoost: 0
      };
    }

    const weights = weightedEdges.map(edge => edge.components.finalWeight);
    const totalEdges = weights.length;
    const avgWeight = weights.reduce((sum, w) => sum + w, 0) / totalEdges;
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);

    // Calculate variance
    const variance = weights.reduce((sum, weight) => sum + (weight - avgWeight) ** 2, 0) / totalEdges;

    // Calculate weight distribution
    const distribution = { veryLow: 0, low: 0, medium: 0, high: 0, veryHigh: 0 };
    
    weights.forEach(weight => {
      if (weight < 0.2) distribution.veryLow++;
      else if (weight < 0.4) distribution.low++;
      else if (weight < 0.6) distribution.medium++;
      else if (weight < 0.8) distribution.high++;
      else distribution.veryHigh++;
    });

    // Calculate semantic coverage
    const edgesWithSemantic = weightedEdges.filter(edge => edge.components.semanticWeight !== 0.5);
    const semanticCoverage = totalEdges > 0 ? edgesWithSemantic.length / totalEdges : 0;

    // Calculate multiplicative boost (difference between multiplicative and additive scoring)
    const multiplicativeEdges = weightedEdges.filter(edge => edge.components.scoringMethod === 'multiplicative');
    let multiplicativeBoost = 0;
    
    if (multiplicativeEdges.length > 0) {
      const boostSum = multiplicativeEdges.reduce((sum, edge) => {
        const { structuralWeight, semanticWeight } = edge.components;
        const additiveScore = (structuralWeight * 0.7) + (semanticWeight * 0.3);
        const multiplicativeScore = structuralWeight * semanticWeight;
        return sum + (multiplicativeScore - additiveScore);
      }, 0);
      
      multiplicativeBoost = boostSum / multiplicativeEdges.length;
    }

    return {
      totalEdges,
      avgWeight,
      minWeight,
      maxWeight,
      variance,
      weightDistribution: distribution,
      semanticCoverage,
      multiplicativeBoost
    };
  }

  /**
   * Apply relationship type-based multipliers for better weight discrimination
   */
  private getRelationshipTypeMultiplier(
    relationship: Relationship,
    sourceTable: TableInfo,
    targetTable: TableInfo
  ): number {
    let multiplier = 1.0; // Base multiplier

    // Detect relationship patterns based on table and column naming patterns (language-agnostic)
    const sourceName = sourceTable.name.toLowerCase();
    const targetName = targetTable.name.toLowerCase();
    const sourceColumn = relationship.sourceColumn.toLowerCase();
    const targetColumn = relationship.targetColumn.toLowerCase();

    // Identity/Authentication relationships (very strong)
    if (sourceName.includes('user') || sourceName.includes('auth') || 
        targetName.includes('user') || targetName.includes('auth') ||
        sourceColumn.includes('user') || targetColumn.includes('user')) {
      multiplier *= 1.4; // Strong boost for user-related relationships
    }

    // Status/Reference table relationships (strong)
    if (sourceName.includes('status') || sourceName.includes('type') ||
        targetName.includes('status') || targetName.includes('type')) {
      multiplier *= 1.3; // Status relationships are semantically strong
    }

    // Logging/Audit table relationships (weaker)
    if (sourceName.includes('log') || sourceName.includes('audit') ||
        targetName.includes('log') || targetName.includes('audit')) {
      multiplier *= 0.8; // Audit relationships are weaker semantically
    }

    // Transaction/Financial relationships (very strong)
    if (sourceName.includes('payment') || sourceName.includes('transaction') ||
        targetName.includes('payment') || targetName.includes('transaction') ||
        sourceName.includes('donation') || targetName.includes('donation')) {
      multiplier *= 1.5; // Financial relationships are very strong
    }

    // Configuration/Settings relationships (medium-weak)
    if (sourceName.includes('config') || sourceName.includes('setting') ||
        targetName.includes('config') || targetName.includes('setting')) {
      multiplier *= 0.9; // Config relationships are less critical
    }

    // Junction/Mapping table relationships (medium strength)
    const isJunctionTable = sourceName.includes('_') || targetName.includes('_') ||
                           sourceName.includes('mapping') || targetName.includes('mapping');
    if (isJunctionTable) {
      multiplier *= 1.1; // Junction tables create semantic bridges
    }

    return Math.max(0.5, Math.min(2.0, multiplier)); // Clamp to reasonable range
  }
}

// Supporting interfaces
interface GraphStructure {
  nodes: Map<string, GraphNode>;
  maxDegree: number;
}

interface GraphNode {
  name: string;
  inDegree: number;
  outDegree: number;
  neighbors: Set<string>;
}