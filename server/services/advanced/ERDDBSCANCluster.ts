import { TableInfo, Relationship } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { Logger } from '../../utils/logger';
import { AdaptiveDBSCANCluster, AdaptiveDBSCANResult } from './AdaptiveDBSCANCluster';
import { MultiResolutionDBSCAN, MultiResolutionResult } from './MultiResolutionDBSCAN';
import { DatabaseGraphPreprocessor } from './DatabaseGraphPreprocessor';
import { DBSCANValidationPipeline } from './DBSCANValidationPipeline';
import { DBSCANFallbackStrategies } from './DBSCANFallbackStrategies';

const logger = new Logger('ERDDBSCANCluster');

// Legacy interfaces maintained for backward compatibility
export interface DBSCANClusterResult {
  clusterId: number;
  tables: string[];
  size: number;
  density: number;
  isCore: boolean;
  avgDistance: number;
}

export interface DBSCANParameters {
  epsilon: number;      // Maximum distance for neighborhood
  minPoints: number;    // Minimum points to form core cluster
  distanceMetric: string; // Distance metric used
}

export interface DBSCANResult {
  clusters: DBSCANClusterResult[];
  noise: string[];      // Outlier tables that don't belong to any cluster
  parameters: DBSCANParameters;
  statistics: {
    totalTables: number;
    clusterCount: number;
    noiseCount: number;
    avgClusterSize: number;
    avgDensity: number;
    corePointCount: number;
    borderPointCount: number;
  };
}

export interface DistanceMatrix {
  matrix: number[][];
  tableNames: string[];
  maxDistance: number;
  avgDistance: number;
}

/**
 * Enhanced ERD DBSCAN Cluster implementation that uses adaptive techniques
 * for database-specific clustering
 */
export class ERDDBSCANCluster {
  private adaptiveDBSCAN: AdaptiveDBSCANCluster;
  private multiResolutionDBSCAN: MultiResolutionDBSCAN;
  private graphPreprocessor: DatabaseGraphPreprocessor;
  private validationPipeline: DBSCANValidationPipeline;
  private fallbackStrategies: DBSCANFallbackStrategies;

  // Legacy parameter ranges (kept for backward compatibility)
  private readonly EPSILON_CANDIDATES = [0.2, 0.3, 0.4, 0.5];
  private readonly MIN_POINTS_CANDIDATES = [3, 4, 5];
  private readonly TARGET_CLUSTER_RANGE = [10, 20];
  private readonly MAX_NOISE_PERCENTAGE = 0.15;
  private readonly MIN_CLUSTERS_THRESHOLD = 3;

  constructor() {
    this.adaptiveDBSCAN = new AdaptiveDBSCANCluster();
    this.multiResolutionDBSCAN = new MultiResolutionDBSCAN();
    this.graphPreprocessor = new DatabaseGraphPreprocessor();
    this.validationPipeline = new DBSCANValidationPipeline();
    this.fallbackStrategies = new DBSCANFallbackStrategies();
  }

  /**
   * Perform DBSCAN clustering with optimized parameters for ERD domain detection
   * Now uses adaptive DBSCAN with multi-resolution and validation
   */
  async performDBSCANClustering(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    hubTables: string[] = []
  ): Promise<DBSCANResult> {
    logger.info('Starting enhanced DBSCAN clustering analysis', {
      tableCount: tables.length,
      edgeCount: weightedEdges.length,
      hubCount: hubTables.length
    });

    try {
      // Step 1: Preprocess graph
      const preprocessed = this.graphPreprocessor.preprocess(tables, weightedEdges, {
        removeHubs: hubTables.length > 0,
        normalizeWeights: true,
        mergeComponents: true
      });

      logger.info('Graph preprocessing complete', {
        originalEdges: weightedEdges.length,
        processedEdges: preprocessed.edges.length,
        hubsDetected: preprocessed.hubs.length,
        components: preprocessed.components.length
      });

      // Step 2: Try multi-resolution DBSCAN first
      const multiResResult = await this.multiResolutionDBSCAN.performMultiResolutionClustering(
        preprocessed.tables,
        preprocessed.edges
      );

      // Step 3: Validate results
      const validation = await this.validationPipeline.validate(
        multiResResult,
        tables,
        weightedEdges
      );

      logger.info('Multi-resolution DBSCAN validation', {
        isValid: validation.isValid,
        overallScore: validation.overallScore,
        issues: validation.issues.length
      });

      // Step 4: If validation fails, try adaptive single-resolution
      if (!validation.isValid || validation.overallScore < 0.6) {
        logger.warn('Multi-resolution failed validation, trying adaptive DBSCAN');
        
        const adaptiveResult = await this.adaptiveDBSCAN.performAdaptiveClustering(
          preprocessed.tables,
          preprocessed.edges,
          'meso' // Default to medium resolution
        );

        // Validate adaptive result
        const adaptiveValidation = await this.validationPipeline.validate(
          adaptiveResult,
          tables,
          weightedEdges
        );

        // Step 5: If still failing, apply fallback strategies
        if (!adaptiveValidation.isValid || adaptiveValidation.overallScore < 0.5) {
          logger.warn('Adaptive DBSCAN failed, applying fallback strategies');
          
          const fallbackResult = await this.fallbackStrategies.applyFallbackStrategy(
            tables,
            weightedEdges,
            'Low validation score'
          );

          // Convert fallback result to legacy format
          return this.convertFallbackToLegacy(fallbackResult, tables);
        }

        // Convert adaptive result to legacy format
        return this.convertAdaptiveToLegacy(adaptiveResult, preprocessed.hubs);
      }

      // Convert multi-resolution result to legacy format
      return this.convertMultiResolutionToLegacy(multiResResult, preprocessed.hubs);

    } catch (error) {
      logger.error('DBSCAN clustering failed, using legacy implementation', error);
      
      // Fall back to legacy implementation
      return this.performLegacyDBSCAN(tables, weightedEdges, hubTables);
    }
  }

  /**
   * Convert multi-resolution result to legacy format
   */
  private convertMultiResolutionToLegacy(
    result: MultiResolutionResult,
    hubs: any[]
  ): DBSCANResult {
    const clusters: DBSCANClusterResult[] = result.finalClusters.map((cluster, idx) => ({
      clusterId: idx,
      tables: cluster.tables,
      size: cluster.tables.length,
      density: cluster.characteristics.density,
      isCore: cluster.coreTables.length > cluster.tables.length * 0.5,
      avgDistance: 1 - cluster.characteristics.cohesion // Convert cohesion to distance
    }));

    // Collect noise (unclustered tables)
    const allClustered = new Set(result.finalClusters.flatMap(c => c.tables));
    const noise: string[] = [];

    // Calculate statistics
    const totalTables = clusters.reduce((sum, c) => sum + c.size, 0) + noise.length;
    const avgClusterSize = clusters.length > 0 
      ? clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length 
      : 0;
    const avgDensity = clusters.length > 0
      ? clusters.reduce((sum, c) => sum + c.density, 0) / clusters.length
      : 0;

    return {
      clusters,
      noise,
      parameters: {
        epsilon: 0.5, // Approximate from multi-resolution
        minPoints: 4,
        distanceMetric: 'Adaptive-MultiRes'
      },
      statistics: {
        totalTables,
        clusterCount: clusters.length,
        noiseCount: noise.length,
        avgClusterSize,
        avgDensity,
        corePointCount: result.finalClusters.reduce((sum, c) => sum + c.coreTables.length, 0),
        borderPointCount: result.finalClusters.reduce((sum, c) => sum + c.peripheralTables.length, 0)
      }
    };
  }

  /**
   * Convert adaptive result to legacy format
   */
  private convertAdaptiveToLegacy(
    result: AdaptiveDBSCANResult,
    hubs: any[]
  ): DBSCANResult {
    const clusters: DBSCANClusterResult[] = result.clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      tables: cluster.tables,
      size: cluster.tables.length,
      density: cluster.density,
      isCore: cluster.corePoints.length > 0,
      avgDistance: 1 - cluster.cohesion
    }));

    return {
      clusters,
      noise: result.noise,
      parameters: result.parameters,
      statistics: result.statistics
    };
  }

  /**
   * Convert fallback result to legacy format
   */
  private convertFallbackToLegacy(
    result: any,
    tables: TableInfo[]
  ): DBSCANResult {
    const clusters: DBSCANClusterResult[] = result.clusters.map((cluster: any, idx: number) => ({
      clusterId: idx,
      tables: cluster.tables,
      size: cluster.tables.length,
      density: 0.5, // Default for fallback
      isCore: true,
      avgDistance: 0.5
    }));

    const allClustered = new Set(result.clusters.flatMap((c: any) => c.tables));
    const noise = tables.map(t => t.name).filter(name => !allClustered.has(name));

    return {
      clusters,
      noise,
      parameters: {
        epsilon: 0.5,
        minPoints: 3,
        distanceMetric: `Fallback-${result.method}`
      },
      statistics: {
        totalTables: tables.length,
        clusterCount: clusters.length,
        noiseCount: noise.length,
        avgClusterSize: result.metrics.avgClusterSize,
        avgDensity: 0.5,
        corePointCount: clusters.length,
        borderPointCount: 0
      }
    };
  }

  /**
   * Legacy DBSCAN implementation (kept as final fallback)
   */
  private async performLegacyDBSCAN(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    hubTables: string[]
  ): Promise<DBSCANResult> {
    // Pre-validate graph suitability for DBSCAN
    const graphValidation = this.validateGraphForDBSCAN(tables, weightedEdges);
    
    if (!graphValidation.suitable) {
      // Return early failure result
      return {
        clusters: [],
        noise: tables.map(t => t.name),
        parameters: { epsilon: 0.5, minPoints: 3, distanceMetric: 'ERD-Custom' },
        statistics: {
          totalTables: tables.length,
          clusterCount: 0,
          noiseCount: tables.length,
          avgClusterSize: 0,
          avgDensity: 0,
          corePointCount: 0,
          borderPointCount: 0
        }
      };
    }

    // Build distance matrix using ERD-specific metrics
    const distanceMatrix = this.buildERDDistanceMatrix(tables, weightedEdges);

    // Find optimal DBSCAN parameters
    const optimalParams = await this.optimizeDBSCANParameters(
      distanceMatrix, 
      tables.length
    );

    // Perform DBSCAN with optimal parameters
    const clusteringResult = this.executeDBSCAN(
      distanceMatrix, 
      optimalParams.epsilon, 
      optimalParams.minPoints
    );

    // Calculate cluster metrics
    const clustersWithMetrics = this.calculateDBSCANClusterMetrics(
      clusteringResult, 
      distanceMatrix
    );

    // Assign hub tables to clusters (if any)
    const finalResult = hubTables.length > 0
      ? await this.assignHubTablesToDBSCANClusters(
          clustersWithMetrics, 
          hubTables, 
          distanceMatrix
        )
      : clustersWithMetrics;

    // Calculate statistics
    const statistics = this.calculateDBSCANStatistics(finalResult);

    return {
      ...finalResult,
      parameters: {
        ...optimalParams,
        distanceMetric: 'ERD-Custom-Legacy'
      },
      statistics
    };
  }

  /**
   * Build distance matrix using ERD-specific distance metrics
   * Pure mathematical approach without linguistic assumptions
   */
  private buildERDDistanceMatrix(
    tables: TableInfo[], 
    weightedEdges: WeightedEdge[]
  ): DistanceMatrix {
    const tableCount = tables.length;
    const matrix = Array(tableCount).fill(null).map(() => Array(tableCount).fill(0));
    const tableIndexMap = new Map(tables.map((table, idx) => [table.name, idx]));

    // Build adjacency weights for direct distance calculation
    const adjacencyWeights = new Map<string, number>();
    weightedEdges.forEach(edge => {
      const key1 = `${edge.source}-${edge.target}`;
      const key2 = `${edge.target}-${edge.source}`;
      adjacencyWeights.set(key1, edge.components.finalWeight);
      adjacencyWeights.set(key2, edge.components.finalWeight);
    });

    // Build graph for shortest path calculations
    const graph = this.buildGraphForPathCalculation(tables, weightedEdges);

    let totalDistance = 0;
    let distanceCount = 0;
    let maxDistance = 0;

    // Calculate distance for each pair of tables
    for (let i = 0; i < tableCount; i++) {
      for (let j = i + 1; j < tableCount; j++) {
        const table1 = tables[i];
        const table2 = tables[j];

        const distance = this.calculateERDDistance(
          table1, 
          table2, 
          adjacencyWeights, 
          graph
        );

        matrix[i][j] = distance;
        matrix[j][i] = distance; // Symmetric matrix

        totalDistance += distance;
        distanceCount++;
        maxDistance = Math.max(maxDistance, distance);
      }
    }

    const avgDistance = distanceCount > 0 ? totalDistance / distanceCount : 0;

    return {
      matrix,
      tableNames: tables.map(t => t.name),
      maxDistance,
      avgDistance
    };
  }

  /**
   * Calculate ERD-specific distance between two tables
   * Combines multiple mathematical distance components
   */
  private calculateERDDistance(
    table1: TableInfo,
    table2: TableInfo,
    adjacencyWeights: Map<string, number>,
    graph: Map<string, Set<string>>
  ): number {
    // Component 1: Direct connection distance (inverse of edge weight)
    const directKey = `${table1.name}-${table2.name}`;
    const directWeight = adjacencyWeights.get(directKey) || 0;
    const directDistance = directWeight > 0 ? (1 - directWeight) : 1.0;

    // Component 2: Shortest path distance in graph
    const pathDistance = this.calculateShortestPathDistance(
      table1.name, 
      table2.name, 
      graph
    );

    // Component 3: Structural similarity distance
    const structuralDistance = this.calculateStructuralDistance(table1, table2);

    // Component 4: Topological distance (neighborhood similarity)
    const topologicalDistance = this.calculateTopologicalDistance(
      table1.name, 
      table2.name, 
      graph
    );

    // Component 5: Degree similarity distance
    const degreeDistance = this.calculateDegreeDistance(
      table1.name, 
      table2.name, 
      graph
    );

    // Combine distances with weights (closer = lower distance)
    const combinedDistance = (
      directDistance * 0.3 +          // Direct connection most important
      pathDistance * 0.25 +           // Graph proximity
      structuralDistance * 0.2 +      // Table structure similarity
      topologicalDistance * 0.15 +    // Neighborhood similarity
      degreeDistance * 0.1            // Degree similarity
    );

    return Math.max(0, Math.min(2, combinedDistance)); // Clamp to reasonable range
  }

  /**
   * Calculate shortest path distance between two nodes
   */
  private calculateShortestPathDistance(
    source: string,
    target: string,
    graph: Map<string, Set<string>>
  ): number {
    if (source === target) return 0;

    const maxPathLength = 6; // Limit search depth
    const visited = new Set<string>();
    const queue: Array<{ node: string; distance: number }> = [{ node: source, distance: 0 }];
    visited.add(source);

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.distance >= maxPathLength) {
        break; // Avoid very long paths
      }

      const neighbors = graph.get(current.node) || new Set();
      
      for (const neighbor of neighbors) {
        if (neighbor === target) {
          // Found target, normalize distance
          return Math.min(1.0, (current.distance + 1) / maxPathLength);
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, distance: current.distance + 1 });
        }
      }
    }

    return 1.0; // No path found or very long path
  }

  /**
   * Calculate structural distance based on table characteristics
   */
  private calculateStructuralDistance(table1: TableInfo, table2: TableInfo): number {
    // Column count similarity
    const count1 = table1.columns.length;
    const count2 = table2.columns.length;
    const maxCount = Math.max(count1, count2);
    const columnCountDistance = maxCount > 0 ? Math.abs(count1 - count2) / maxCount : 0;

    // Data type distribution similarity
    const typeDistance = this.calculateDataTypeDistributionDistance(table1, table2);

    // Constraint pattern similarity
    const constraintDistance = this.calculateConstraintPatternDistance(table1, table2);

    // Column name overlap (mathematical, not linguistic)
    const nameOverlapDistance = this.calculateColumnNameOverlapDistance(table1, table2);

    // Combine structural components
    return (
      columnCountDistance * 0.3 +
      typeDistance * 0.3 +
      constraintDistance * 0.25 +
      nameOverlapDistance * 0.15
    );
  }

  /**
   * Calculate topological distance based on neighborhood similarity
   */
  private calculateTopologicalDistance(
    table1: string,
    table2: string,
    graph: Map<string, Set<string>>
  ): number {
    const neighbors1 = graph.get(table1) || new Set();
    const neighbors2 = graph.get(table2) || new Set();

    // Calculate Jaccard distance (1 - Jaccard similarity)
    const intersection = new Set([...neighbors1].filter(n => neighbors2.has(n)));
    const union = new Set([...neighbors1, ...neighbors2]);

    if (union.size === 0) return 0.5; // Default for isolated nodes

    const jaccardSimilarity = intersection.size / union.size;
    return 1 - jaccardSimilarity;
  }

  /**
   * Calculate degree similarity distance
   */
  private calculateDegreeDistance(
    table1: string,
    table2: string,
    graph: Map<string, Set<string>>
  ): number {
    const degree1 = (graph.get(table1) || new Set()).size;
    const degree2 = (graph.get(table2) || new Set()).size;

    const maxDegree = Math.max(degree1, degree2, 1);
    return Math.abs(degree1 - degree2) / maxDegree;
  }

  /**
   * Calculate data type distribution distance
   */
  private calculateDataTypeDistributionDistance(table1: TableInfo, table2: TableInfo): number {
    const dist1 = this.getDataTypeDistribution(table1);
    const dist2 = this.getDataTypeDistribution(table2);

    // Calculate Jensen-Shannon divergence as distance
    return this.calculateJensenShannonDivergence(dist1, dist2);
  }

  /**
   * Get normalized data type distribution
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
   * Normalize data type to standard categories (same as in UniversalEdgeWeighter)
   */
  private normalizeDataType(type: string): string {
    const lowerType = type.toLowerCase();
    
    if (/int|integer|bigint|smallint|tinyint/.test(lowerType)) return 'integer';
    if (/decimal|numeric|float|double|real/.test(lowerType)) return 'numeric';
    if (/char|varchar|text|string/.test(lowerType)) return 'string';
    if (/date|time|timestamp/.test(lowerType)) return 'datetime';
    if (/bool|boolean/.test(lowerType)) return 'boolean';
    if (/blob|binary|varbinary/.test(lowerType)) return 'binary';
    if (/json|jsonb/.test(lowerType)) return 'json';
    if (/uuid|guid/.test(lowerType)) return 'uuid';
    
    return 'other';
  }

  /**
   * Calculate Jensen-Shannon divergence between two probability distributions
   */
  private calculateJensenShannonDivergence(
    dist1: Map<string, number>, 
    dist2: Map<string, number>
  ): number {
    // Get all unique types
    const allTypes = new Set([...dist1.keys(), ...dist2.keys()]);
    
    if (allTypes.size === 0) return 0;

    // Calculate average distribution M = (P + Q) / 2
    const avgDist = new Map<string, number>();
    allTypes.forEach(type => {
      const p = dist1.get(type) || 0;
      const q = dist2.get(type) || 0;
      avgDist.set(type, (p + q) / 2);
    });

    // Calculate KL divergences
    let klDiv1 = 0;
    let klDiv2 = 0;

    allTypes.forEach(type => {
      const p = dist1.get(type) || 0;
      const q = dist2.get(type) || 0;
      const m = avgDist.get(type) || 0;

      if (p > 0 && m > 0) {
        klDiv1 += p * Math.log(p / m);
      }
      if (q > 0 && m > 0) {
        klDiv2 += q * Math.log(q / m);
      }
    });

    // Jensen-Shannon divergence
    const jsDiv = (klDiv1 + klDiv2) / 2;
    
    // Convert to distance (normalized to [0, 1])
    return Math.sqrt(jsDiv / Math.log(2));
  }

  /**
   * Calculate constraint pattern distance
   */
  private calculateConstraintPatternDistance(table1: TableInfo, table2: TableInfo): number {
    const pattern1 = this.getConstraintPattern(table1);
    const pattern2 = this.getConstraintPattern(table2);

    // Calculate Euclidean distance between constraint vectors
    const constraintTypes = new Set([...pattern1.keys(), ...pattern2.keys()]);
    
    let sumSquaredDiffs = 0;
    constraintTypes.forEach(type => {
      const val1 = pattern1.get(type) || 0;
      const val2 = pattern2.get(type) || 0;
      sumSquaredDiffs += (val1 - val2) ** 2;
    });

    return Math.sqrt(sumSquaredDiffs);
  }

  /**
   * Get constraint pattern as proportions
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

    pattern.set('primary_key', primaryKeyCount / totalColumns);
    pattern.set('foreign_key', foreignKeyCount / totalColumns);
    pattern.set('unique', uniqueCount / totalColumns);
    pattern.set('nullable', nullableCount / totalColumns);

    return pattern;
  }

  /**
   * Calculate column name overlap distance (mathematical, not linguistic)
   */
  private calculateColumnNameOverlapDistance(table1: TableInfo, table2: TableInfo): number {
    const names1 = new Set(table1.columns.map(col => col.name.toLowerCase()));
    const names2 = new Set(table2.columns.map(col => col.name.toLowerCase()));

    // Calculate Jaccard distance
    const intersection = new Set([...names1].filter(name => names2.has(name)));
    const union = new Set([...names1, ...names2]);

    if (union.size === 0) return 0;
    
    const jaccardSimilarity = intersection.size / union.size;
    return 1 - jaccardSimilarity;
  }

  /**
   * Build graph representation for path calculation
   */
  private buildGraphForPathCalculation(
    tables: TableInfo[], 
    weightedEdges: WeightedEdge[]
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize all tables
    tables.forEach(table => {
      graph.set(table.name, new Set());
    });

    // Add edges (undirected graph)
    weightedEdges.forEach(edge => {
      const sourceNeighbors = graph.get(edge.source);
      const targetNeighbors = graph.get(edge.target);

      if (sourceNeighbors && targetNeighbors) {
        sourceNeighbors.add(edge.target);
        targetNeighbors.add(edge.source);
      }
    });

    return graph;
  }

  /**
   * Optimize DBSCAN parameters using validation metrics
   */
  private async optimizeDBSCANParameters(
    distanceMatrix: DistanceMatrix,
    tableCount: number
  ): Promise<DBSCANParameters> {
    // Intelligent parameter prediction based on dataset characteristics
    const predictedParams = this.predictOptimalParameters(distanceMatrix, tableCount);
    
    let bestParams: DBSCANParameters = predictedParams;
    let bestScore = -1;

    logger.debug('Optimizing DBSCAN parameters with intelligent prediction', {
      predictedParams,
      originalCandidates: {
        epsilon: this.EPSILON_CANDIDATES,
        minPoints: this.MIN_POINTS_CANDIDATES
      }
    });

    // Test predicted parameters first
    try {
      const predictedResult = this.executeDBSCAN(distanceMatrix, predictedParams.epsilon, predictedParams.minPoints);
      bestScore = this.evaluateDBSCANResult(predictedResult, tableCount);
      
      logger.debug('Predicted parameters score', { 
        params: predictedParams, 
        score: bestScore.toFixed(3) 
      });
      
      // Early exit if predicted parameters are very good (score > 0.7)
      if (bestScore > 0.7) {
        logger.info('Predicted parameters perform excellently, skipping exhaustive search', {
          predictedParams,
          score: bestScore.toFixed(3)
        });
        return bestParams;
      }
    } catch (error) {
      logger.debug('Predicted parameters failed, falling back to search', { error });
      bestScore = -1;
    }

    // If predicted parameters aren't excellent, test a focused subset around the prediction
    const focusedCandidates = this.getFocusedParameterCandidates(predictedParams, distanceMatrix);
    
    for (const params of focusedCandidates) {
      // Skip if minPoints is too large for dataset
      if (params.minPoints >= tableCount / 2) continue;

      try {
        const result = this.executeDBSCAN(distanceMatrix, params.epsilon, params.minPoints);
        const score = this.evaluateDBSCANResult(result, tableCount);

        if (score > bestScore) {
          bestScore = score;
          bestParams = { epsilon: params.epsilon, minPoints: params.minPoints, distanceMetric: 'ERD-Custom' };
        }
        
        // Early exit if we find an excellent score
        if (score > 0.8) {
          logger.debug('Found excellent parameters early, stopping search', {
            params: bestParams,
            score: score.toFixed(3)
          });
          break;
        }
      } catch (error) {
        logger.debug(`DBSCAN failed with eps=${params.epsilon}, minPts=${params.minPoints}`, error);
      }
    }

    logger.debug('DBSCAN parameter optimization complete', {
      bestParams,
      bestScore: bestScore.toFixed(3),
      testedCombinations: focusedCandidates.length + 1 // +1 for predicted params
    });

    return bestParams;
  }

  /**
   * Execute DBSCAN algorithm with given parameters
   */
  private executeDBSCAN(
    distanceMatrix: DistanceMatrix,
    epsilon: number,
    minPoints: number
  ): { clusters: Array<{ clusterId: number; tables: string[] }>, noise: string[] } {
    const tableCount = distanceMatrix.tableNames.length;
    const visited = new Array(tableCount).fill(false);
    const clustered = new Array(tableCount).fill(false);
    const clusters: Array<{ clusterId: number; tables: string[] }> = [];
    const noise: string[] = [];

    let clusterId = 0;

    // For each unvisited point
    for (let pointIdx = 0; pointIdx < tableCount; pointIdx++) {
      if (visited[pointIdx]) continue;

      visited[pointIdx] = true;

      // Find neighbors within epsilon
      const neighbors = this.findNeighbors(pointIdx, distanceMatrix, epsilon);

      // Check if point is core point
      if (neighbors.length >= minPoints) {
        // Start new cluster
        const cluster = { clusterId: clusterId++, tables: [] };
        clusters.push(cluster);

        // Expand cluster
        this.expandCluster(
          pointIdx,
          neighbors,
          cluster,
          distanceMatrix,
          epsilon,
          minPoints,
          visited,
          clustered
        );
      }
    }

    // Assign non-clustered points to noise
    for (let i = 0; i < tableCount; i++) {
      if (!clustered[i]) {
        noise.push(distanceMatrix.tableNames[i]);
      }
    }

    return { clusters, noise };
  }

  /**
   * Find neighbors within epsilon distance
   */
  private findNeighbors(
    pointIdx: number,
    distanceMatrix: DistanceMatrix,
    epsilon: number
  ): number[] {
    const neighbors: number[] = [];
    const tableCount = distanceMatrix.tableNames.length;

    for (let i = 0; i < tableCount; i++) {
      if (i !== pointIdx && distanceMatrix.matrix[pointIdx][i] <= epsilon) {
        neighbors.push(i);
      }
    }

    return neighbors;
  }

  /**
   * Expand cluster using DBSCAN algorithm
   */
  private expandCluster(
    pointIdx: number,
    neighbors: number[],
    cluster: { clusterId: number; tables: string[] },
    distanceMatrix: DistanceMatrix,
    epsilon: number,
    minPoints: number,
    visited: boolean[],
    clustered: boolean[]
  ): void {
    // Add point to cluster
    cluster.tables.push(distanceMatrix.tableNames[pointIdx]);
    clustered[pointIdx] = true;

    // Process each neighbor
    let i = 0;
    while (i < neighbors.length) {
      const neighborIdx = neighbors[i];

      // Mark as visited if not already
      if (!visited[neighborIdx]) {
        visited[neighborIdx] = true;

        // Find new neighbors
        const newNeighbors = this.findNeighbors(neighborIdx, distanceMatrix, epsilon);

        // If core point, merge neighbors
        if (newNeighbors.length >= minPoints) {
          neighbors.push(...newNeighbors.filter(n => !neighbors.includes(n)));
        }
      }

      // Add to cluster if not already clustered
      if (!clustered[neighborIdx]) {
        cluster.tables.push(distanceMatrix.tableNames[neighborIdx]);
        clustered[neighborIdx] = true;
      }

      i++;
    }
  }

  /**
   * Evaluate DBSCAN result quality
   */
  private evaluateDBSCANResult(
    result: { clusters: Array<{ clusterId: number; tables: string[] }>, noise: string[] },
    totalTables: number
  ): number {
    const clusterCount = result.clusters.length;
    const noiseCount = result.noise.length;
    const clusteredTables = totalTables - noiseCount;

    // Penalize if no clusters found or too many noise points
    if (clusterCount === 0 || noiseCount > totalTables * this.MAX_NOISE_PERCENTAGE) {
      return 0;
    }

    // Calculate cluster size statistics
    const clusterSizes = result.clusters.map(c => c.tables.length);
    const avgClusterSize = clusterSizes.reduce((sum, size) => sum + size, 0) / clusterCount;
    const minClusterSize = Math.min(...clusterSizes);
    const maxClusterSize = Math.max(...clusterSizes);

    // Score components
    let score = 0;

    // 1. Cluster count score (prefer target range)
    if (clusterCount >= this.TARGET_CLUSTER_RANGE[0] && clusterCount <= this.TARGET_CLUSTER_RANGE[1]) {
      score += 0.4;
    } else {
      const distFromTarget = Math.min(
        Math.abs(clusterCount - this.TARGET_CLUSTER_RANGE[0]),
        Math.abs(clusterCount - this.TARGET_CLUSTER_RANGE[1])
      );
      score += Math.max(0, 0.4 - (distFromTarget / 10));
    }

    // 2. Size balance score (prefer balanced cluster sizes)
    const sizeVariation = maxClusterSize > 0 ? (maxClusterSize - minClusterSize) / maxClusterSize : 0;
    score += (1 - sizeVariation) * 0.2;

    // 3. Coverage score (minimize noise)
    score += (clusteredTables / totalTables) * 0.2;

    // 4. Average size score (prefer reasonable sizes)
    const sizeScore = avgClusterSize >= 3 && avgClusterSize <= 20 
      ? 1.0 
      : Math.max(0, 1.0 - Math.abs(avgClusterSize - 8) / 15);
    score += sizeScore * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate detailed metrics for DBSCAN clusters
   */
  private calculateDBSCANClusterMetrics(
    result: { clusters: Array<{ clusterId: number; tables: string[] }>, noise: string[] },
    distanceMatrix: DistanceMatrix
  ): { clusters: DBSCANClusterResult[], noise: string[] } {
    const clustersWithMetrics = result.clusters.map(cluster => {
      const { density, avgDistance } = this.calculateClusterDensity(cluster.tables, distanceMatrix);
      
      return {
        clusterId: cluster.clusterId,
        tables: cluster.tables,
        size: cluster.tables.length,
        density,
        isCore: cluster.tables.length >= 3, // Clusters with 3+ members are considered core
        avgDistance
      };
    });

    return {
      clusters: clustersWithMetrics,
      noise: result.noise
    };
  }

  /**
   * Calculate cluster density and average internal distance
   */
  private calculateClusterDensity(
    clusterTables: string[],
    distanceMatrix: DistanceMatrix
  ): { density: number, avgDistance: number } {
    const clusterSize = clusterTables.length;
    
    if (clusterSize <= 1) {
      return { density: 1.0, avgDistance: 0 };
    }

    // Get table indices
    const tableIndices = clusterTables
      .map(tableName => distanceMatrix.tableNames.indexOf(tableName))
      .filter(idx => idx !== -1);

    if (tableIndices.length <= 1) {
      return { density: 0, avgDistance: 0 };
    }

    // Calculate internal distances
    let totalDistance = 0;
    let edgeCount = 0;
    let connectedEdges = 0;

    for (let i = 0; i < tableIndices.length; i++) {
      for (let j = i + 1; j < tableIndices.length; j++) {
        const distance = distanceMatrix.matrix[tableIndices[i]][tableIndices[j]];
        totalDistance += distance;
        edgeCount++;

        // Consider connected if distance is less than average
        if (distance < distanceMatrix.avgDistance) {
          connectedEdges++;
        }
      }
    }

    const density = edgeCount > 0 ? connectedEdges / edgeCount : 0;
    const avgDistance = edgeCount > 0 ? totalDistance / edgeCount : 0;

    return { density, avgDistance };
  }

  /**
   * Assign hub tables to DBSCAN clusters
   */
  private async assignHubTablesToDBSCANClusters(
    result: { clusters: DBSCANClusterResult[], noise: string[] },
    hubTables: string[],
    distanceMatrix: DistanceMatrix
  ): Promise<{ clusters: DBSCANClusterResult[], noise: string[] }> {
    const updatedClusters = result.clusters.map(c => ({ 
      ...c, 
      tables: [...c.tables] 
    }));

    for (const hubTable of hubTables) {
      const hubIdx = distanceMatrix.tableNames.indexOf(hubTable);
      if (hubIdx === -1) continue;

      // Find closest cluster
      let bestCluster = -1;
      let minAvgDistance = Infinity;

      updatedClusters.forEach((cluster, clusterIdx) => {
        const clusterIndices = cluster.tables
          .map(table => distanceMatrix.tableNames.indexOf(table))
          .filter(idx => idx !== -1);

        if (clusterIndices.length === 0) return;

        // Calculate average distance to cluster
        const avgDistance = clusterIndices.reduce((sum, tableIdx) => 
          sum + distanceMatrix.matrix[hubIdx][tableIdx], 0
        ) / clusterIndices.length;

        if (avgDistance < minAvgDistance) {
          minAvgDistance = avgDistance;
          bestCluster = clusterIdx;
        }
      });

      // Assign to closest cluster if distance is reasonable
      if (bestCluster !== -1 && minAvgDistance < distanceMatrix.avgDistance * 1.5) {
        updatedClusters[bestCluster].tables.push(hubTable);
        updatedClusters[bestCluster].size++;
        
        // Recalculate metrics
        const metrics = this.calculateClusterDensity(
          updatedClusters[bestCluster].tables, 
          distanceMatrix
        );
        updatedClusters[bestCluster].density = metrics.density;
        updatedClusters[bestCluster].avgDistance = metrics.avgDistance;
      } else {
        // Add to noise if can't assign to any cluster
        result.noise.push(hubTable);
      }
    }

    return {
      clusters: updatedClusters,
      noise: result.noise
    };
  }

  /**
   * Calculate overall DBSCAN statistics
   */
  private calculateDBSCANStatistics(
    result: { clusters: DBSCANClusterResult[], noise: string[] }
  ): DBSCANResult['statistics'] {
    const clusters = result.clusters;
    const totalTables = clusters.reduce((sum, c) => sum + c.size, 0) + result.noise.length;

    if (clusters.length === 0) {
      return {
        totalTables,
        clusterCount: 0,
        noiseCount: result.noise.length,
        avgClusterSize: 0,
        avgDensity: 0,
        corePointCount: 0,
        borderPointCount: 0
      };
    }

    const clusterSizes = clusters.map(c => c.size);
    const avgClusterSize = clusterSizes.reduce((sum, size) => sum + size, 0) / clusters.length;
    const avgDensity = clusters.reduce((sum, c) => sum + c.density, 0) / clusters.length;
    
    const corePointCount = clusters.filter(c => c.isCore).length;
    const borderPointCount = clusters.length - corePointCount;

    return {
      totalTables,
      clusterCount: clusters.length,
      noiseCount: result.noise.length,
      avgClusterSize,
      avgDensity,
      corePointCount,
      borderPointCount
    };
  }

  /**
   * Validate DBSCAN clustering results to reject poor clustering
   */
  private validateDBSCANResults(
    result: { clusters: DBSCANClusterResult[], noise: string[] },
    statistics: DBSCANResult['statistics'],
    totalTables: number
  ): { isValid: boolean; reason?: string } {
    // Check 1: Must have minimum number of clusters
    if (result.clusters.length < this.MIN_CLUSTERS_THRESHOLD) {
      return {
        isValid: false,
        reason: `Too few clusters (${result.clusters.length}), minimum required: ${this.MIN_CLUSTERS_THRESHOLD}`
      };
    }

    // Check 2: Noise percentage should not exceed threshold
    const noisePercentage = statistics.noiseCount / totalTables;
    if (noisePercentage > this.MAX_NOISE_PERCENTAGE) {
      return {
        isValid: false,
        reason: `Excessive noise (${(noisePercentage * 100).toFixed(1)}%), maximum allowed: ${(this.MAX_NOISE_PERCENTAGE * 100)}%`
      };
    }

    // Check 3: No single mega-cluster (>60% of tables)
    const maxClusterSize = Math.max(...result.clusters.map(c => c.size));
    const megaClusterThreshold = totalTables * 0.6;
    if (maxClusterSize > megaClusterThreshold) {
      return {
        isValid: false,
        reason: `Mega-cluster detected (${maxClusterSize} tables), exceeds 60% threshold`
      };
    }

    // Check 4: Average cluster size should be reasonable
    if (statistics.avgClusterSize < 2 || statistics.avgClusterSize > 50) {
      return {
        isValid: false,
        reason: `Poor cluster size distribution (avg: ${statistics.avgClusterSize.toFixed(1)})`
      };
    }

    // Check 5: Must have meaningful cluster count for this dataset size
    const expectedClusterRange = this.TARGET_CLUSTER_RANGE;
    if (result.clusters.length < expectedClusterRange[0] * 0.5 || 
        result.clusters.length > expectedClusterRange[1] * 2) {
      return {
        isValid: false,
        reason: `Cluster count (${result.clusters.length}) outside reasonable range for ${totalTables} tables`
      };
    }

    return { isValid: true };
  }

  /**
   * Validate if graph is suitable for DBSCAN clustering
   */
  private validateGraphForDBSCAN(
    tables: TableInfo[], 
    weightedEdges: WeightedEdge[]
  ): {
    suitable: boolean;
    reason?: string;
    density?: number;
    connectivity?: number;
  } {
    const totalTables = tables.length;
    const totalPossibleEdges = (totalTables * (totalTables - 1)) / 2;
    const mathematicalDensity = weightedEdges.length / totalPossibleEdges;
    
    // Calculate weighted density (considers edge strength, not just count)
    const totalWeight = weightedEdges.reduce((sum, edge) => sum + edge.components.finalWeight, 0);
    const avgWeight = weightedEdges.length > 0 ? totalWeight / weightedEdges.length : 0;
    const weightedDensity = weightedEdges.length > 0 ? (weightedEdges.length * avgWeight) / totalPossibleEdges : 0;
    
    // Debug logging
    logger.debug('DBSCAN graph density calculation', {
      totalTables,
      totalPossibleEdges,
      actualEdges: weightedEdges.length,
      mathematicalDensity: mathematicalDensity.toFixed(6),
      totalWeight: totalWeight.toFixed(2),
      avgWeight: avgWeight.toFixed(3),
      weightedDensity: weightedDensity.toFixed(6)
    });
    
    // Calculate connectivity metrics
    const edgeToNodeRatio = weightedEdges.length / totalTables;
    const minEdgeRatio = Math.max(1.0, Math.log(totalTables) * 0.5); // Scales with table count
    
    // For ERD graphs, use more realistic thresholds
    // Real databases are naturally sparse - typical ERD density is 0.001-0.02
    const minDensityThreshold = 0.001; // Much more realistic for database schemas
    const minWeightedDensity = 0.005; // Considers edge strength
    
    // Check 1: Graph too sparse (consider both mathematical and weighted density)
    if (mathematicalDensity < minDensityThreshold && weightedDensity < minWeightedDensity) {
      return {
        suitable: false,
        reason: `Graph too sparse for DBSCAN (density: ${mathematicalDensity.toFixed(4)}, weighted: ${weightedDensity.toFixed(4)})`,
        density: mathematicalDensity,
        connectivity: edgeToNodeRatio
      };
    }
    
    // Check 2: Edge-to-node ratio (more realistic for database schemas)
    
    logger.debug('DBSCAN connectivity calculation', {
      edgeToNodeRatio: edgeToNodeRatio.toFixed(3),
      minEdgeRatio: minEdgeRatio.toFixed(3),
      tableCount: totalTables,
      willPass: edgeToNodeRatio >= minEdgeRatio
    });
    
    if (edgeToNodeRatio < minEdgeRatio) {
      return {
        suitable: false,
        reason: `Insufficient connectivity ratio (${edgeToNodeRatio.toFixed(2)} < ${minEdgeRatio.toFixed(2)})`,
        density: mathematicalDensity,
        connectivity: edgeToNodeRatio
      };
    }
    
    // Check 3: Validate edge weight distribution
    const weights = weightedEdges.map(e => e.components.finalWeight);
    const avgWeightForVariance = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const weightVariance = weights.reduce((sum, w) => sum + (w - avgWeightForVariance) ** 2, 0) / weights.length;
    
    if (avgWeightForVariance < 0.3 || weightVariance < 0.01) {
      return {
        suitable: false,
        reason: 'Edge weights too weak or uniform - insufficient relationship strength variation for DBSCAN',
        density: mathematicalDensity,
        connectivity: edgeToNodeRatio
      };
    }
    
    return {
      suitable: true,
      density: mathematicalDensity,
      connectivity: edgeToNodeRatio
    };
  }

  /**
   * Predict optimal DBSCAN parameters based on dataset characteristics
   */
  private predictOptimalParameters(
    distanceMatrix: DistanceMatrix,
    tableCount: number
  ): DBSCANParameters {
    // Analyze distance distribution to predict good epsilon
    const distances = distanceMatrix.matrix
      .flat()
      .filter(d => d > 0 && d !== Infinity)
      .sort((a, b) => a - b);
    
    if (distances.length === 0) {
      // No connections, return default
      return { epsilon: 0.5, minPoints: 3, distanceMetric: 'ERD-Custom' };
    }
    
    // Use 15th percentile as epsilon - captures local neighborhoods
    const epsilonPercentile = 0.15;
    const epsilonIndex = Math.floor(distances.length * epsilonPercentile);
    const predictedEpsilon = distances[epsilonIndex];
    
    // Predict minPoints based on table count and connectivity
    let predictedMinPoints: number;
    if (tableCount < 50) {
      predictedMinPoints = 3; // Small datasets need small clusters
    } else if (tableCount < 200) {
      predictedMinPoints = 4; // Medium datasets
    } else {
      predictedMinPoints = 5; // Large datasets need more points for significance
    }
    
    // Clamp epsilon to reasonable bounds
    const clampedEpsilon = Math.max(0.1, Math.min(1.0, predictedEpsilon));
    
    return {
      epsilon: clampedEpsilon,
      minPoints: predictedMinPoints,
      distanceMetric: 'ERD-Custom'
    };
  }

  /**
   * Get focused parameter candidates around predicted values
   */
  private getFocusedParameterCandidates(
    predictedParams: DBSCANParameters,
    distanceMatrix: DistanceMatrix
  ): Array<{ epsilon: number; minPoints: number }> {
    const candidates: Array<{ epsilon: number; minPoints: number }> = [];
    
    // Generate epsilon candidates around predicted value
    const baseEpsilon = predictedParams.epsilon;
    const epsilonVariations = [
      baseEpsilon * 0.8,  // Tighter clustering
      baseEpsilon,        // Predicted value (already tested)
      baseEpsilon * 1.2   // Looser clustering
    ].filter(eps => eps >= 0.1 && eps <= 1.0);
    
    // Generate minPoints candidates around predicted value
    const baseMinPoints = predictedParams.minPoints;
    const minPointsVariations = [
      Math.max(2, baseMinPoints - 1),
      baseMinPoints,      // Predicted value (already tested)
      baseMinPoints + 1
    ].filter(mp => mp >= 2 && mp <= 6);
    
    // Combine variations but skip the already-tested predicted combination
    for (const epsilon of epsilonVariations) {
      for (const minPoints of minPointsVariations) {
        // Skip the exact predicted combination (already tested)
        if (epsilon === predictedParams.epsilon && minPoints === predictedParams.minPoints) {
          continue;
        }
        
        candidates.push({ epsilon, minPoints });
      }
    }
    
    // Sort by proximity to predicted values (test closest variations first)
    candidates.sort((a, b) => {
      const distA = Math.abs(a.epsilon - baseEpsilon) + Math.abs(a.minPoints - baseMinPoints);
      const distB = Math.abs(b.epsilon - baseEpsilon) + Math.abs(b.minPoints - baseMinPoints);
      return distA - distB;
    });
    
    // Limit to top 6 candidates to avoid excessive testing
    return candidates.slice(0, 6);
  }
}