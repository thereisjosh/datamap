import { TableInfo, Relationship } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { Logger } from '../../utils/logger';

const logger = new Logger('AdaptiveDBSCANCluster');

/**
 * Adaptive DBSCAN implementation specifically tuned for database ERD structures.
 * Uses graph topology metrics to automatically determine optimal parameters.
 */

export interface AdaptiveDBSCANResult {
  clusters: DBSCANCluster[];
  noise: string[];
  parameters: {
    epsilon: number;
    minPoints: number;
    resolution: 'macro' | 'meso' | 'micro';
    method: string;
  };
  metrics: {
    modularity: number;
    silhouetteScore: number;
    intraInterRatio: number;
    clusteringCoefficient: number;
  };
  statistics: DBSCANStatistics;
}

export interface DBSCANCluster {
  clusterId: number;
  tables: string[];
  corePoints: string[];
  borderPoints: string[];
  density: number;
  cohesion: number;
  separation: number;
}

export interface DBSCANStatistics {
  totalTables: number;
  clusterCount: number;
  noiseCount: number;
  avgClusterSize: number;
  sizeStdDev: number;
  coverageRatio: number;
  avgDensity: number;
}

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  avgDegree: number;
  degreeStdDev: number;
  diameter: number;
  avgPathLength: number;
  clusteringCoefficient: number;
  degreeDistribution: number[];
  isConnected: boolean;
  componentCount: number;
}

export interface DistanceMatrix {
  matrix: number[][];
  tableNames: string[];
  statistics: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    percentiles: { [key: number]: number };
  };
}

export class AdaptiveDBSCANCluster {
  // Resolution levels for multi-scale clustering
  private readonly RESOLUTION_LEVELS = {
    macro: { percentile: 75, minClusters: 3, maxClusters: 10 },
    meso: { percentile: 50, minClusters: 8, maxClusters: 20 },
    micro: { percentile: 25, minClusters: 15, maxClusters: 40 }
  };

  // Adaptive parameter bounds
  private readonly MIN_POINTS_BOUNDS = { min: 2, max: 6 };
  private readonly NOISE_TOLERANCE = 0.2; // Maximum 20% noise acceptable

  /**
   * Main entry point for adaptive DBSCAN clustering
   */
  async performAdaptiveClustering(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    preferredResolution?: 'macro' | 'meso' | 'micro'
  ): Promise<AdaptiveDBSCANResult> {
    logger.info('Starting adaptive DBSCAN clustering', {
      tableCount: tables.length,
      edgeCount: weightedEdges.length,
      preferredResolution
    });

    // Step 1: Analyze graph structure
    const graphMetrics = this.analyzeGraphStructure(tables, weightedEdges);
    logger.info('Graph metrics calculated', graphMetrics);

    // Step 2: Build composite distance matrix
    const distanceMatrix = this.buildCompositeDistanceMatrix(tables, weightedEdges, graphMetrics);
    
    // Step 3: Determine optimal parameters
    const optimalParams = await this.determineOptimalParameters(
      distanceMatrix, 
      graphMetrics,
      preferredResolution
    );
    
    logger.info('Optimal parameters determined', optimalParams);

    // Step 4: Perform DBSCAN with optimal parameters
    const clusteringResult = this.executeAdaptiveDBSCAN(
      distanceMatrix,
      optimalParams.epsilon,
      optimalParams.minPoints
    );

    // Step 5: Calculate quality metrics
    const metrics = this.calculateQualityMetrics(
      clusteringResult,
      distanceMatrix,
      weightedEdges,
      graphMetrics
    );

    // Step 6: Refine if necessary
    let finalResult = clusteringResult;
    if (metrics.modularity < 0.3 || metrics.silhouetteScore < 0.2) {
      logger.warn('Initial clustering quality below threshold, attempting refinement');
      finalResult = await this.refineClustering(
        clusteringResult,
        distanceMatrix,
        graphMetrics,
        optimalParams
      );
      // Recalculate metrics after refinement
      finalResult.metrics = this.calculateQualityMetrics(
        finalResult,
        distanceMatrix,
        weightedEdges,
        graphMetrics
      );
    }

    // Step 7: Calculate final statistics
    const statistics = this.calculateStatistics(finalResult);

    return {
      ...finalResult,
      parameters: {
        ...optimalParams,
        method: 'adaptive-dbscan'
      },
      statistics
    };
  }

  /**
   * Analyze graph structure to understand dataset characteristics
   */
  private analyzeGraphStructure(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): GraphMetrics {
    const nodeCount = tables.length;
    const edgeCount = edges.length;
    const possibleEdges = nodeCount * (nodeCount - 1) / 2;
    const density = edgeCount / possibleEdges;

    // Build adjacency list
    const adjacencyList = new Map<string, Set<string>>();
    tables.forEach(table => adjacencyList.set(table.name, new Set()));
    
    edges.forEach(edge => {
      adjacencyList.get(edge.source)?.add(edge.target);
      adjacencyList.get(edge.target)?.add(edge.source);
    });

    // Calculate degree statistics
    const degrees = Array.from(adjacencyList.values()).map(neighbors => neighbors.size);
    const avgDegree = degrees.reduce((sum, d) => sum + d, 0) / nodeCount;
    const degreeVariance = degrees.reduce((sum, d) => sum + Math.pow(d - avgDegree, 2), 0) / nodeCount;
    const degreeStdDev = Math.sqrt(degreeVariance);

    // Calculate degree distribution
    const maxDegree = Math.max(...degrees, 1);
    const degreeDistribution = new Array(maxDegree + 1).fill(0);
    degrees.forEach(d => degreeDistribution[d]++);

    // Calculate shortest paths (sampled for large graphs)
    const { diameter, avgPathLength } = this.calculatePathMetrics(adjacencyList, nodeCount);

    // Calculate clustering coefficient
    const clusteringCoefficient = this.calculateClusteringCoefficient(adjacencyList);

    // Check connectivity
    const { isConnected, componentCount } = this.checkConnectivity(adjacencyList);

    return {
      nodeCount,
      edgeCount,
      density,
      avgDegree,
      degreeStdDev,
      diameter,
      avgPathLength,
      clusteringCoefficient,
      degreeDistribution,
      isConnected,
      componentCount
    };
  }

  /**
   * Build composite distance matrix using multiple distance components
   */
  private buildCompositeDistanceMatrix(
    tables: TableInfo[],
    edges: WeightedEdge[],
    graphMetrics: GraphMetrics
  ): DistanceMatrix {
    const n = tables.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    const tableIndexMap = new Map(tables.map((table, idx) => [table.name, idx]));

    // Build edge weight lookup
    const edgeWeights = new Map<string, number>();
    edges.forEach(edge => {
      const key1 = `${edge.source}-${edge.target}`;
      const key2 = `${edge.target}-${edge.source}`;
      edgeWeights.set(key1, edge.components.finalWeight);
      edgeWeights.set(key2, edge.components.finalWeight);
    });

    // Build component membership map if graph has multiple components
    let componentMap: Map<string, number> | undefined;
    if (graphMetrics.componentCount > 1) {
      componentMap = this.buildComponentMap(tables, edges);
    }

    // Calculate adaptive weights based on graph characteristics
    const weights = this.calculateAdaptiveWeights(graphMetrics);

    // Calculate distances
    const distances: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const distance = this.calculateCompositeDistance(
          tables[i],
          tables[j],
          edgeWeights,
          graphMetrics,
          weights,
          componentMap
        );
        matrix[i][j] = distance;
        matrix[j][i] = distance;
        distances.push(distance);
      }
    }

    // Calculate statistics
    distances.sort((a, b) => a - b);
    const statistics = {
      min: distances[0] || 0,
      max: distances[distances.length - 1] || 1,
      mean: distances.reduce((sum, d) => sum + d, 0) / distances.length,
      median: distances[Math.floor(distances.length / 2)],
      stdDev: 0,
      percentiles: {} as { [key: number]: number }
    };

    // Calculate standard deviation
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - statistics.mean, 2), 0) / distances.length;
    statistics.stdDev = Math.sqrt(variance);

    // Calculate percentiles
    [10, 25, 50, 75, 90].forEach(p => {
      const idx = Math.floor(distances.length * p / 100);
      statistics.percentiles[p] = distances[idx] || 0;
    });

    return {
      matrix,
      tableNames: tables.map(t => t.name),
      statistics
    };
  }

  /**
   * Calculate adaptive weights based on graph characteristics
   */
  private calculateAdaptiveWeights(metrics: GraphMetrics): {
    structural: number;
    connectivity: number;
    cardinality: number;
    constraint: number;
  } {
    // Adjust weights based on graph density
    let weights = {
      structural: 0.3,
      connectivity: 0.4,
      cardinality: 0.2,
      constraint: 0.1
    };

    // Sparse graphs: emphasize connectivity
    if (metrics.density < 0.01) {
      weights.connectivity = 0.5;
      weights.structural = 0.3;
      weights.cardinality = 0.15;
      weights.constraint = 0.05;
    }
    // Dense graphs: balance all factors
    else if (metrics.density > 0.1) {
      weights.structural = 0.35;
      weights.connectivity = 0.25;
      weights.cardinality = 0.25;
      weights.constraint = 0.15;
    }

    // High degree variance: emphasize structural differences
    if (metrics.degreeStdDev > metrics.avgDegree) {
      weights.structural += 0.1;
      weights.connectivity -= 0.1;
    }

    // Normalize weights
    const sum = Object.values(weights).reduce((s, w) => s + w, 0);
    Object.keys(weights).forEach(key => {
      weights[key as keyof typeof weights] /= sum;
    });

    return weights;
  }

  /**
   * Build component membership map using DFS to identify disconnected components
   */
  private buildComponentMap(tables: TableInfo[], edges: WeightedEdge[]): Map<string, number> {
    const componentMap = new Map<string, number>();
    const visited = new Set<string>();
    const adjacencyList = new Map<string, Set<string>>();
    
    // Build adjacency list
    tables.forEach(table => adjacencyList.set(table.name, new Set()));
    edges.forEach(edge => {
      adjacencyList.get(edge.source)?.add(edge.target);
      adjacencyList.get(edge.target)?.add(edge.source);
    });

    let componentId = 0;
    
    // DFS to find connected components
    const dfs = (tableName: string, currentComponentId: number) => {
      if (visited.has(tableName)) return;
      
      visited.add(tableName);
      componentMap.set(tableName, currentComponentId);
      
      const neighbors = adjacencyList.get(tableName) || new Set();
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, currentComponentId);
        }
      });
    };
    
    // Find all components
    tables.forEach(table => {
      if (!visited.has(table.name)) {
        dfs(table.name, componentId++);
      }
    });
    
    return componentMap;
  }

  /**
   * Calculate composite distance between two tables
   */
  private calculateCompositeDistance(
    table1: TableInfo,
    table2: TableInfo,
    edgeWeights: Map<string, number>,
    graphMetrics: GraphMetrics,
    weights: ReturnType<typeof this.calculateAdaptiveWeights>,
    components?: Map<string, number>
  ): number {
    // Component 1: Structural distance
    const structuralDist = this.calculateStructuralDistance(table1, table2);

    // Component 2: Connectivity distance
    const connectivityDist = this.calculateConnectivityDistance(
      table1.name,
      table2.name,
      edgeWeights
    );

    // Component 3: Cardinality distance
    const cardinalityDist = this.calculateCardinalityDistance(table1, table2);

    // Component 4: Constraint distance
    const constraintDist = this.calculateConstraintDistance(table1, table2);

    // Component 5: Component membership penalty
    let componentPenalty = 0;
    if (components && graphMetrics.componentCount > 1) {
      const comp1 = components.get(table1.name);
      const comp2 = components.get(table2.name);
      if (comp1 !== undefined && comp2 !== undefined && comp1 !== comp2) {
        // Heavy penalty for tables in different components
        componentPenalty = 0.8;
      }
    }

    // Combine with adaptive weights
    const compositeDistance = 
      weights.structural * structuralDist +
      weights.connectivity * connectivityDist +
      weights.cardinality * cardinalityDist +
      weights.constraint * constraintDist +
      componentPenalty; // Add penalty as fixed addition

    return Math.max(0, Math.min(1, compositeDistance));
  }

  /**
   * Calculate structural distance based on table properties
   */
  private calculateStructuralDistance(table1: TableInfo, table2: TableInfo): number {
    // Column count difference
    const count1 = table1.columns.length;
    const count2 = table2.columns.length;
    const countDiff = Math.abs(count1 - count2) / Math.max(count1, count2);

    // Data type distribution difference (Jensen-Shannon divergence)
    const typeDist1 = this.getDataTypeDistribution(table1);
    const typeDist2 = this.getDataTypeDistribution(table2);
    const typeDistance = this.jensenShannonDivergence(typeDist1, typeDist2);

    // Column property similarity
    const propSimilarity = this.calculatePropertySimilarity(table1, table2);

    return countDiff * 0.3 + typeDistance * 0.5 + (1 - propSimilarity) * 0.2;
  }

  /**
   * Calculate connectivity distance (inverse of edge weight)
   */
  private calculateConnectivityDistance(
    table1: string,
    table2: string,
    edgeWeights: Map<string, number>
  ): number {
    const key = `${table1}-${table2}`;
    const weight = edgeWeights.get(key) || 0;
    return 1 - weight; // Convert weight to distance
  }

  /**
   * Calculate cardinality distance based on table sizes and FK patterns
   */
  private calculateCardinalityDistance(table1: TableInfo, table2: TableInfo): number {
    const size1 = table1.columns.length;
    const size2 = table2.columns.length;
    
    // Size ratio (log scale for better discrimination)
    const sizeRatio = Math.log(Math.max(size1, size2) / Math.min(size1, size2) + 1);
    const normalizedRatio = sizeRatio / Math.log(100); // Normalize assuming max 100x difference

    // FK density difference
    const fkDensity1 = table1.columns.filter(c => c.isForeignKey).length / size1;
    const fkDensity2 = table2.columns.filter(c => c.isForeignKey).length / size2;
    const fkDiff = Math.abs(fkDensity1 - fkDensity2);

    return normalizedRatio * 0.6 + fkDiff * 0.4;
  }

  /**
   * Calculate constraint distance based on referential integrity patterns
   */
  private calculateConstraintDistance(table1: TableInfo, table2: TableInfo): number {
    const constraints1 = this.getConstraintVector(table1);
    const constraints2 = this.getConstraintVector(table2);

    // Euclidean distance between constraint vectors
    let sumSquaredDiff = 0;
    for (let i = 0; i < constraints1.length; i++) {
      sumSquaredDiff += Math.pow(constraints1[i] - constraints2[i], 2);
    }

    return Math.sqrt(sumSquaredDiff) / Math.sqrt(constraints1.length);
  }

  /**
   * Get normalized constraint vector for a table
   */
  private getConstraintVector(table: TableInfo): number[] {
    const total = table.columns.length;
    if (total === 0) return [0, 0, 0, 0];

    return [
      table.columns.filter(c => c.isPrimaryKey).length / total,
      table.columns.filter(c => c.isForeignKey).length / total,
      table.columns.filter(c => c.unique).length / total,
      table.columns.filter(c => c.nullable).length / total
    ];
  }

  /**
   * Get data type distribution for Jensen-Shannon divergence
   */
  private getDataTypeDistribution(table: TableInfo): Map<string, number> {
    const distribution = new Map<string, number>();
    const total = table.columns.length;

    if (total === 0) return distribution;

    // Count occurrences
    table.columns.forEach(column => {
      const normalizedType = this.normalizeDataType(column.type);
      distribution.set(normalizedType, (distribution.get(normalizedType) || 0) + 1);
    });

    // Convert to probabilities
    distribution.forEach((count, type) => {
      distribution.set(type, count / total);
    });

    return distribution;
  }

  /**
   * Normalize data type to standard categories
   */
  private normalizeDataType(type: string): string {
    const lowerType = type.toLowerCase();
    
    if (/int|integer|bigint|smallint|tinyint|serial/.test(lowerType)) return 'integer';
    if (/decimal|numeric|float|double|real|money/.test(lowerType)) return 'numeric';
    if (/char|varchar|text|string|clob/.test(lowerType)) return 'string';
    if (/date|time|timestamp|datetime/.test(lowerType)) return 'datetime';
    if (/bool|boolean|bit/.test(lowerType)) return 'boolean';
    if (/blob|binary|varbinary|bytea/.test(lowerType)) return 'binary';
    if (/json|jsonb|xml/.test(lowerType)) return 'structured';
    if (/uuid|guid|uniqueidentifier/.test(lowerType)) return 'identifier';
    if (/array|enum|set/.test(lowerType)) return 'collection';
    
    return 'other';
  }

  /**
   * Calculate Jensen-Shannon divergence between two distributions
   */
  private jensenShannonDivergence(
    dist1: Map<string, number>,
    dist2: Map<string, number>
  ): number {
    // Get all types
    const allTypes = new Set([...dist1.keys(), ...dist2.keys()]);
    
    // Calculate average distribution
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

      if (p > 0 && m > 0) klDiv1 += p * Math.log(p / m);
      if (q > 0 && m > 0) klDiv2 += q * Math.log(q / m);
    });

    // JS divergence (normalized to [0,1])
    return Math.sqrt((klDiv1 + klDiv2) / (2 * Math.log(2)));
  }

  /**
   * Calculate property similarity between tables
   */
  private calculatePropertySimilarity(table1: TableInfo, table2: TableInfo): number {
    const props1 = new Set(table1.columns.map(c => `${c.isPrimaryKey}-${c.isForeignKey}-${c.unique}-${c.nullable}`));
    const props2 = new Set(table2.columns.map(c => `${c.isPrimaryKey}-${c.isForeignKey}-${c.unique}-${c.nullable}`));

    const intersection = new Set([...props1].filter(x => props2.has(x)));
    const union = new Set([...props1, ...props2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Determine optimal DBSCAN parameters using adaptive methods
   */
  private async determineOptimalParameters(
    distanceMatrix: DistanceMatrix,
    graphMetrics: GraphMetrics,
    preferredResolution?: 'macro' | 'meso' | 'micro'
  ): Promise<{ epsilon: number; minPoints: number; resolution: 'macro' | 'meso' | 'micro' }> {
    // Step 1: Determine resolution level
    const resolution = preferredResolution || this.selectResolution(graphMetrics);

    // Step 2: Calculate optimal minPoints based on graph characteristics AND resolution
    const optimalMinPoints = this.calculateOptimalMinPoints(graphMetrics, resolution);

    // Step 3: Calculate epsilon using resolution-specific percentiles
    const epsilon = await this.calculateOptimalEpsilon(
      distanceMatrix,
      optimalMinPoints,
      resolution
    );

    logger.info('Optimal parameters calculated', {
      epsilon,
      minPoints: optimalMinPoints,
      resolution,
      graphDensity: graphMetrics.density,
      avgDegree: graphMetrics.avgDegree
    });

    return { epsilon, minPoints: optimalMinPoints, resolution };
  }

  /**
   * Calculate optimal minPoints based on graph topology and resolution
   */
  private calculateOptimalMinPoints(metrics: GraphMetrics, resolution: 'macro' | 'meso' | 'micro'): number {
    // Base calculation on average degree
    let baseMinPoints = Math.max(2, Math.floor(metrics.avgDegree * 0.5));

    // Adjust for resolution
    let minPoints: number;
    switch (resolution) {
      case 'macro':
        // Macro: smaller minPoints for larger clusters
        minPoints = Math.max(2, Math.min(baseMinPoints, 3));
        break;
      case 'meso':
        // Meso: medium minPoints
        minPoints = Math.max(3, Math.min(baseMinPoints + 1, 4));
        break;
      case 'micro':
        // Micro: larger minPoints for smaller, tighter clusters
        minPoints = Math.max(4, Math.min(baseMinPoints + 2, 5));
        break;
      default:
        minPoints = baseMinPoints;
    }

    // Adjust for graph size
    if (metrics.nodeCount < 50 && minPoints > 3) {
      minPoints = 3; // Small graphs don't need large minPoints
    }

    // Adjust for degree distribution
    if (metrics.degreeStdDev > metrics.avgDegree && minPoints > 2) {
      // High variance: be more conservative
      minPoints = Math.max(minPoints - 1, 2);
    }

    // Ensure within bounds
    return Math.max(
      this.MIN_POINTS_BOUNDS.min,
      Math.min(this.MIN_POINTS_BOUNDS.max, minPoints)
    );
  }

  /**
   * Select appropriate resolution based on graph size and structure
   */
  private selectResolution(metrics: GraphMetrics): 'macro' | 'meso' | 'micro' {
    // Small graphs: use macro level
    if (metrics.nodeCount < 50) return 'macro';
    
    // Large graphs with low density: use macro level
    if (metrics.nodeCount > 200 && metrics.density < 0.01) return 'macro';
    
    // Medium graphs or higher density: use meso level
    if (metrics.nodeCount < 200 || metrics.density > 0.05) return 'meso';
    
    // Default to meso
    return 'meso';
  }

  /**
   * Calculate optimal epsilon using k-distance graph analysis
   */
  private async calculateOptimalEpsilon(
    distanceMatrix: DistanceMatrix,
    k: number,
    resolution: 'macro' | 'meso' | 'micro'
  ): Promise<number> {
    const n = distanceMatrix.tableNames.length;
    const stats = distanceMatrix.statistics;
    
    // Use resolution-specific percentiles directly from distance matrix
    let epsilon: number;
    
    switch (resolution) {
      case 'macro':
        // Use 75th percentile of distances for macro (larger neighborhoods)
        epsilon = stats.percentiles[75] || stats.max * 0.75;
        break;
      case 'meso':
        // Use 50th percentile (median) for meso
        epsilon = stats.percentiles[50] || stats.median;
        break;
      case 'micro':
        // Use 25th percentile for micro (smaller neighborhoods)
        epsilon = stats.percentiles[25] || stats.max * 0.25;
        break;
      default:
        epsilon = stats.median;
    }

    // Apply bounds to ensure reasonable values
    const minEpsilon = stats.min + (stats.max - stats.min) * 0.1; // At least 10% of range
    const maxEpsilon = stats.max * 0.9; // At most 90% of max

    epsilon = Math.max(minEpsilon, Math.min(maxEpsilon, epsilon));

    // Fine-tune based on expected cluster count
    const expectedClusters = this.estimateClusterCount(distanceMatrix, epsilon, k);
    const targetRange = this.RESOLUTION_LEVELS[resolution];
    
    if (expectedClusters < targetRange.minClusters) {
      // Too few clusters, decrease epsilon
      epsilon *= 0.8;
    } else if (expectedClusters > targetRange.maxClusters) {
      // Too many clusters, increase epsilon
      epsilon *= 1.2;
    }

    return epsilon;
  }

  /**
   * Estimate number of clusters for given parameters
   */
  private estimateClusterCount(
    distanceMatrix: DistanceMatrix,
    epsilon: number,
    minPoints: number
  ): number {
    const n = distanceMatrix.tableNames.length;
    const neighborhoods: number[] = [];

    // Count neighborhood sizes
    for (let i = 0; i < n; i++) {
      let count = 0;
      for (let j = 0; j < n; j++) {
        if (i !== j && distanceMatrix.matrix[i][j] <= epsilon) {
          count++;
        }
      }
      neighborhoods.push(count);
    }

    // Estimate core points
    const corePoints = neighborhoods.filter(size => size >= minPoints).length;
    
    // Rough estimate: core points / average cluster size
    const avgClusterSize = Math.max(minPoints * 2, 5);
    return Math.max(1, Math.floor(corePoints / avgClusterSize));
  }

  /**
   * Execute DBSCAN with adaptive enhancements
   */
  private executeAdaptiveDBSCAN(
    distanceMatrix: DistanceMatrix,
    epsilon: number,
    minPoints: number
  ): Omit<AdaptiveDBSCANResult, 'parameters' | 'statistics'> {
    const n = distanceMatrix.tableNames.length;
    const visited = new Array(n).fill(false);
    const clustered = new Array(n).fill(-1);
    const clusters: DBSCANCluster[] = [];
    const noise: string[] = [];
    let clusterId = 0;

    // Main DBSCAN loop
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      
      visited[i] = true;
      const neighbors = this.getNeighbors(i, distanceMatrix, epsilon);

      if (neighbors.length < minPoints) {
        // Mark as noise (for now)
        clustered[i] = -1;
      } else {
        // Start new cluster
        const cluster: DBSCANCluster = {
          clusterId: clusterId++,
          tables: [],
          corePoints: [distanceMatrix.tableNames[i]],
          borderPoints: [],
          density: 0,
          cohesion: 0,
          separation: 0
        };

        this.expandCluster(
          i,
          neighbors,
          cluster,
          distanceMatrix,
          epsilon,
          minPoints,
          visited,
          clustered
        );

        clusters.push(cluster);
      }
    }

    // Collect noise points
    for (let i = 0; i < n; i++) {
      if (clustered[i] === -1) {
        noise.push(distanceMatrix.tableNames[i]);
      }
    }

    // Calculate cluster metrics
    clusters.forEach(cluster => {
      this.calculateClusterMetrics(cluster, distanceMatrix);
    });

    // Placeholder metrics (will be calculated later)
    const metrics = {
      modularity: 0,
      silhouetteScore: 0,
      intraInterRatio: 0,
      clusteringCoefficient: 0
    };

    return { clusters, noise, metrics };
  }

  /**
   * Get neighbors within epsilon distance
   */
  private getNeighbors(
    pointIdx: number,
    distanceMatrix: DistanceMatrix,
    epsilon: number
  ): number[] {
    const neighbors: number[] = [];
    const n = distanceMatrix.tableNames.length;

    for (let i = 0; i < n; i++) {
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
    cluster: DBSCANCluster,
    distanceMatrix: DistanceMatrix,
    epsilon: number,
    minPoints: number,
    visited: boolean[],
    clustered: number[]
  ): void {
    // Add point to cluster
    cluster.tables.push(distanceMatrix.tableNames[pointIdx]);
    clustered[pointIdx] = cluster.clusterId;

    // Process neighbors
    let i = 0;
    while (i < neighbors.length) {
      const neighborIdx = neighbors[i];

      if (!visited[neighborIdx]) {
        visited[neighborIdx] = true;
        const newNeighbors = this.getNeighbors(neighborIdx, distanceMatrix, epsilon);

        if (newNeighbors.length >= minPoints) {
          // Core point
          cluster.corePoints.push(distanceMatrix.tableNames[neighborIdx]);
          // Add new neighbors to process
          newNeighbors.forEach(idx => {
            if (!neighbors.includes(idx)) {
              neighbors.push(idx);
            }
          });
        }
      }

      // Add to cluster if not already clustered
      if (clustered[neighborIdx] === -1) {
        cluster.tables.push(distanceMatrix.tableNames[neighborIdx]);
        clustered[neighborIdx] = cluster.clusterId;
        
        // Determine if border or core point
        const neighborCount = this.getNeighbors(neighborIdx, distanceMatrix, epsilon).length;
        if (neighborCount < minPoints && !cluster.corePoints.includes(distanceMatrix.tableNames[neighborIdx])) {
          cluster.borderPoints.push(distanceMatrix.tableNames[neighborIdx]);
        }
      }

      i++;
    }
  }

  /**
   * Calculate metrics for a single cluster
   */
  private calculateClusterMetrics(
    cluster: DBSCANCluster,
    distanceMatrix: DistanceMatrix
  ): void {
    const clusterIndices = cluster.tables.map(name => 
      distanceMatrix.tableNames.indexOf(name)
    );

    if (clusterIndices.length <= 1) {
      cluster.density = 1;
      cluster.cohesion = 1;
      cluster.separation = 0;
      return;
    }

    // Calculate internal distances (cohesion)
    let internalSum = 0;
    let internalCount = 0;

    for (let i = 0; i < clusterIndices.length; i++) {
      for (let j = i + 1; j < clusterIndices.length; j++) {
        internalSum += distanceMatrix.matrix[clusterIndices[i]][clusterIndices[j]];
        internalCount++;
      }
    }

    cluster.cohesion = internalCount > 0 ? 1 - (internalSum / internalCount) : 1;

    // Calculate density (ratio of core points)
    cluster.density = cluster.corePoints.length / cluster.tables.length;

    // Separation will be calculated when comparing to other clusters
    cluster.separation = 0;
  }

  /**
   * Calculate quality metrics for the clustering result
   */
  private calculateQualityMetrics(
    result: Omit<AdaptiveDBSCANResult, 'parameters' | 'statistics'>,
    distanceMatrix: DistanceMatrix,
    edges: WeightedEdge[],
    graphMetrics: GraphMetrics
  ): AdaptiveDBSCANResult['metrics'] {
    // Calculate modularity
    const modularity = this.calculateModularity(result.clusters, edges, graphMetrics);

    // Calculate silhouette score
    const silhouetteScore = this.calculateSilhouetteScore(result.clusters, distanceMatrix);

    // Calculate intra-cluster vs inter-cluster edge ratio
    const intraInterRatio = this.calculateIntraInterRatio(result.clusters, edges);

    // Calculate average clustering coefficient
    const clusteringCoefficient = this.calculateAvgClusteringCoefficient(
      result.clusters,
      edges
    );

    return {
      modularity,
      silhouetteScore,
      intraInterRatio,
      clusteringCoefficient
    };
  }

  /**
   * Calculate modularity score for clustering quality
   */
  private calculateModularity(
    clusters: DBSCANCluster[],
    edges: WeightedEdge[],
    graphMetrics: GraphMetrics
  ): number {
    if (clusters.length === 0) return 0;

    const m = edges.length;
    if (m === 0) return 0;

    // Build cluster membership map
    const clusterMap = new Map<string, number>();
    clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        clusterMap.set(table, cluster.clusterId);
      });
    });

    // Calculate modularity
    let modularity = 0;
    const degreeMap = new Map<string, number>();

    // Calculate degrees
    edges.forEach(edge => {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    });

    // Sum over edges
    edges.forEach(edge => {
      const ci = clusterMap.get(edge.source);
      const cj = clusterMap.get(edge.target);

      if (ci !== undefined && cj !== undefined && ci === cj) {
        const ki = degreeMap.get(edge.source) || 0;
        const kj = degreeMap.get(edge.target) || 0;
        modularity += 1 - (ki * kj) / (2 * m);
      }
    });

    return modularity / (2 * m);
  }

  /**
   * Calculate silhouette score
   */
  private calculateSilhouetteScore(
    clusters: DBSCANCluster[],
    distanceMatrix: DistanceMatrix
  ): number {
    if (clusters.length <= 1) return 0;

    const tableToCluster = new Map<string, number>();
    clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        tableToCluster.set(table, cluster.clusterId);
      });
    });

    let totalSilhouette = 0;
    let count = 0;

    // Calculate silhouette for each point
    tableToCluster.forEach((clusterId, table) => {
      const tableIdx = distanceMatrix.tableNames.indexOf(table);
      if (tableIdx === -1) return;

      // Calculate a(i) - average distance to same cluster
      const sameCluster = clusters.find(c => c.clusterId === clusterId);
      if (!sameCluster || sameCluster.tables.length <= 1) return;

      let sameClusterSum = 0;
      let sameClusterCount = 0;

      sameCluster.tables.forEach(otherTable => {
        if (otherTable !== table) {
          const otherIdx = distanceMatrix.tableNames.indexOf(otherTable);
          if (otherIdx !== -1) {
            sameClusterSum += distanceMatrix.matrix[tableIdx][otherIdx];
            sameClusterCount++;
          }
        }
      });

      const a = sameClusterCount > 0 ? sameClusterSum / sameClusterCount : 0;

      // Calculate b(i) - minimum average distance to other clusters
      let b = Infinity;

      clusters.forEach(otherCluster => {
        if (otherCluster.clusterId === clusterId) return;

        let otherClusterSum = 0;
        let otherClusterCount = 0;

        otherCluster.tables.forEach(otherTable => {
          const otherIdx = distanceMatrix.tableNames.indexOf(otherTable);
          if (otherIdx !== -1) {
            otherClusterSum += distanceMatrix.matrix[tableIdx][otherIdx];
            otherClusterCount++;
          }
        });

        if (otherClusterCount > 0) {
          const avgDist = otherClusterSum / otherClusterCount;
          b = Math.min(b, avgDist);
        }
      });

      // Calculate silhouette coefficient
      if (b !== Infinity) {
        const s = (b - a) / Math.max(a, b);
        totalSilhouette += s;
        count++;
      }
    });

    return count > 0 ? totalSilhouette / count : 0;
  }

  /**
   * Calculate intra-cluster vs inter-cluster edge ratio
   */
  private calculateIntraInterRatio(
    clusters: DBSCANCluster[],
    edges: WeightedEdge[]
  ): number {
    const clusterMap = new Map<string, number>();
    clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        clusterMap.set(table, cluster.clusterId);
      });
    });

    let intraEdges = 0;
    let interEdges = 0;

    edges.forEach(edge => {
      const sourceCluster = clusterMap.get(edge.source);
      const targetCluster = clusterMap.get(edge.target);

      if (sourceCluster !== undefined && targetCluster !== undefined) {
        if (sourceCluster === targetCluster) {
          intraEdges++;
        } else {
          interEdges++;
        }
      }
    });

    return interEdges > 0 ? intraEdges / interEdges : intraEdges;
  }

  /**
   * Calculate average clustering coefficient for clusters
   */
  private calculateAvgClusteringCoefficient(
    clusters: DBSCANCluster[],
    edges: WeightedEdge[]
  ): number {
    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    edges.forEach(edge => {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    });

    let totalCoeff = 0;
    let count = 0;

    clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        const neighbors = adjacency.get(table) || new Set();
        const clusterNeighbors = Array.from(neighbors).filter(n => 
          cluster.tables.includes(n)
        );

        if (clusterNeighbors.length >= 2) {
          // Count triangles
          let triangles = 0;
          for (let i = 0; i < clusterNeighbors.length; i++) {
            for (let j = i + 1; j < clusterNeighbors.length; j++) {
              const n1 = clusterNeighbors[i];
              const n2 = clusterNeighbors[j];
              if (adjacency.get(n1)?.has(n2)) {
                triangles++;
              }
            }
          }

          const possibleTriangles = clusterNeighbors.length * (clusterNeighbors.length - 1) / 2;
          const coeff = possibleTriangles > 0 ? triangles / possibleTriangles : 0;
          totalCoeff += coeff;
          count++;
        }
      });
    });

    return count > 0 ? totalCoeff / count : 0;
  }

  /**
   * Refine clustering if quality is below threshold
   */
  private async refineClustering(
    initialResult: Omit<AdaptiveDBSCANResult, 'parameters' | 'statistics'>,
    distanceMatrix: DistanceMatrix,
    graphMetrics: GraphMetrics,
    originalParams: { epsilon: number; minPoints: number; resolution: 'macro' | 'meso' | 'micro' }
  ): Promise<Omit<AdaptiveDBSCANResult, 'parameters' | 'statistics'>> {
    logger.info('Refining clustering due to low quality metrics');

    // Try different resolution
    const alternativeResolutions: Array<'macro' | 'meso' | 'micro'> = ['macro', 'meso', 'micro']
      .filter(r => r !== originalParams.resolution) as Array<'macro' | 'meso' | 'micro'>;

    let bestResult = initialResult;
    let bestScore = initialResult.metrics.modularity + initialResult.metrics.silhouetteScore;

    for (const resolution of alternativeResolutions) {
      const newParams = await this.determineOptimalParameters(
        distanceMatrix,
        graphMetrics,
        resolution
      );

      const newResult = this.executeAdaptiveDBSCAN(
        distanceMatrix,
        newParams.epsilon,
        newParams.minPoints
      );

      const newMetrics = this.calculateQualityMetrics(
        newResult,
        distanceMatrix,
        [],
        graphMetrics
      );

      const newScore = newMetrics.modularity + newMetrics.silhouetteScore;

      if (newScore > bestScore) {
        bestResult = { ...newResult, metrics: newMetrics };
        bestScore = newScore;
      }
    }

    return bestResult;
  }

  /**
   * Calculate final statistics
   */
  private calculateStatistics(
    result: Omit<AdaptiveDBSCANResult, 'parameters' | 'statistics'>
  ): DBSCANStatistics {
    const clusterSizes = result.clusters.map(c => c.tables.length);
    const totalTables = clusterSizes.reduce((sum, size) => sum + size, 0) + result.noise.length;
    const avgClusterSize = result.clusters.length > 0 
      ? clusterSizes.reduce((sum, size) => sum + size, 0) / result.clusters.length 
      : 0;

    // Calculate standard deviation
    const variance = result.clusters.length > 0
      ? clusterSizes.reduce((sum, size) => sum + Math.pow(size - avgClusterSize, 2), 0) / result.clusters.length
      : 0;
    const sizeStdDev = Math.sqrt(variance);

    // Calculate average density
    const avgDensity = result.clusters.length > 0
      ? result.clusters.reduce((sum, c) => sum + c.density, 0) / result.clusters.length
      : 0;

    return {
      totalTables,
      clusterCount: result.clusters.length,
      noiseCount: result.noise.length,
      avgClusterSize,
      sizeStdDev,
      coverageRatio: totalTables > 0 ? (totalTables - result.noise.length) / totalTables : 0,
      avgDensity
    };
  }

  /**
   * Calculate shortest path metrics for the graph
   */
  private calculatePathMetrics(
    adjacencyList: Map<string, Set<string>>,
    nodeCount: number
  ): { diameter: number; avgPathLength: number } {
    // Sample nodes for large graphs
    const sampleSize = Math.min(nodeCount, 100);
    const nodes = Array.from(adjacencyList.keys());
    const sampledNodes = this.sampleNodes(nodes, sampleSize);

    let totalDistance = 0;
    let pathCount = 0;
    let maxDistance = 0;

    // Calculate shortest paths between sampled nodes
    for (const source of sampledNodes) {
      const distances = this.bfs(source, adjacencyList);
      
      distances.forEach((dist, target) => {
        if (dist > 0 && dist < Infinity) {
          totalDistance += dist;
          pathCount++;
          maxDistance = Math.max(maxDistance, dist);
        }
      });
    }

    return {
      diameter: maxDistance,
      avgPathLength: pathCount > 0 ? totalDistance / pathCount : 0
    };
  }

  /**
   * BFS to calculate shortest paths from a source node
   */
  private bfs(source: string, adjacencyList: Map<string, Set<string>>): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: string[] = [source];
    distances.set(source, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current)!;
      const neighbors = adjacencyList.get(current) || new Set();

      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDist + 1);
          queue.push(neighbor);
        }
      }
    }

    return distances;
  }

  /**
   * Sample nodes uniformly for large graphs
   */
  private sampleNodes(nodes: string[], sampleSize: number): string[] {
    if (nodes.length <= sampleSize) return nodes;

    const sampled: string[] = [];
    const step = Math.floor(nodes.length / sampleSize);

    for (let i = 0; i < nodes.length && sampled.length < sampleSize; i += step) {
      sampled.push(nodes[i]);
    }

    return sampled;
  }

  /**
   * Calculate clustering coefficient for the graph
   */
  private calculateClusteringCoefficient(adjacencyList: Map<string, Set<string>>): number {
    let totalCoeff = 0;
    let count = 0;

    adjacencyList.forEach((neighbors, node) => {
      if (neighbors.size >= 2) {
        // Count triangles
        let triangles = 0;
        const neighborArray = Array.from(neighbors);

        for (let i = 0; i < neighborArray.length; i++) {
          for (let j = i + 1; j < neighborArray.length; j++) {
            const n1 = neighborArray[i];
            const n2 = neighborArray[j];
            if (adjacencyList.get(n1)?.has(n2)) {
              triangles++;
            }
          }
        }

        const possibleTriangles = neighbors.size * (neighbors.size - 1) / 2;
        const coeff = triangles / possibleTriangles;
        totalCoeff += coeff;
        count++;
      }
    });

    return count > 0 ? totalCoeff / count : 0;
  }

  /**
   * Check graph connectivity
   */
  private checkConnectivity(
    adjacencyList: Map<string, Set<string>>
  ): { isConnected: boolean; componentCount: number } {
    const visited = new Set<string>();
    const nodes = Array.from(adjacencyList.keys());
    let componentCount = 0;

    for (const node of nodes) {
      if (!visited.has(node)) {
        componentCount++;
        this.dfs(node, adjacencyList, visited);
      }
    }

    return {
      isConnected: componentCount === 1,
      componentCount
    };
  }

  /**
   * DFS traversal for connectivity check
   */
  private dfs(
    node: string,
    adjacencyList: Map<string, Set<string>>,
    visited: Set<string>
  ): void {
    visited.add(node);
    const neighbors = adjacencyList.get(node) || new Set();

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.dfs(neighbor, adjacencyList, visited);
      }
    }
  }
}

export const adaptiveDBSCANCluster = new AdaptiveDBSCANCluster();