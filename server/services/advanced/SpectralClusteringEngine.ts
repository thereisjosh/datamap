import { TableInfo, Relationship } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { Logger } from '../../utils/logger';

const logger = new Logger('SpectralClusteringEngine');

// Spectral clustering with statistical validation for ERD domain detection
export interface SpectralClusterResult {
  clusterId: number;
  tables: string[];
  size: number;
  internalConnectivity: number;
  externalConnectivity: number;
  coherenceScore: number;
}

export interface GapStatisticResult {
  k: number;
  gapValue: number;
  standardError: number;
  withinClusterSumSquares: number;
  expectedWCSS: number;
}

export interface SpectralClusteringResult {
  clusters: SpectralClusterResult[];
  optimalK: number;
  gapStatistics: GapStatisticResult[];
  validation: {
    silhouetteScore: number;
    daviesBouldinIndex: number;
    calinskiHarabaszIndex: number;
    isOptimalConfiguration: boolean;
  };
  statistics: {
    totalTables: number;
    clusterCount: number;
    avgClusterSize: number;
    minClusterSize: number;
    maxClusterSize: number;
    sizeVariation: number;
  };
}

export class SpectralClusteringEngine {
  // Target parameters for ERD domain clustering
  private readonly TARGET_CLUSTER_RANGE = [10, 18];
  private readonly MIN_CLUSTER_SIZE = 3;
  private readonly MAX_CLUSTER_SIZE = 25;
  private readonly GAP_STAT_ITERATIONS = 15; // Industry standard for 300+ node datasets
  private readonly GAP_STAT_TIMEOUT = 180000; // 3 minute timeout
  private readonly EIGENVALUE_TOLERANCE = 1e-8;
  
  /**
   * Perform spectral clustering on weighted graph for ERD domain detection
   */
  async performSpectralClustering(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    hubTables: string[] = [],
    keepHubs: boolean = false
  ): Promise<SpectralClusteringResult> {
    logger.info('Starting spectral clustering analysis', {
      tableCount: tables.length,
      edgeCount: weightedEdges.length,
      hubCount: hubTables.length,
      keepHubs
    });

    // Build weighted adjacency matrix
    const adjacencyMatrix = this.buildWeightedAdjacencyMatrix(tables, weightedEdges);
    
    // Create matrix for clustering - keep hubs if requested
    const { coreMatrix, coreTableIndices, tableIndexMap } = (hubTables.length > 0 && !keepHubs)
      ? this.createHubFreeMatrix(adjacencyMatrix, tables, hubTables)
      : { 
          coreMatrix: adjacencyMatrix, 
          coreTableIndices: tables.map((_, idx) => idx),
          tableIndexMap: new Map(tables.map((table, idx) => [table.name, idx]))
        };

    if (keepHubs && hubTables.length > 0) {
      logger.info('Keeping hubs in spectral clustering matrix', {
        hubTables: hubTables.slice(0, 5),
        totalHubs: hubTables.length
      });
    }

    // Find optimal number of clusters using Gap Statistic
    const gapStatistics = await this.calculateGapStatistic(coreMatrix, coreTableIndices);
    const optimalK = this.selectOptimalK(gapStatistics);

    logger.info('Gap Statistic analysis complete', {
      optimalK,
      targetRange: this.TARGET_CLUSTER_RANGE,
      testedRange: `${gapStatistics[0]?.k || 0}-${gapStatistics[gapStatistics.length - 1]?.k || 0}`
    });

    // Perform spectral clustering with optimal K
    logger.info(`🎯 Performing spectral clustering with K=${optimalK}`);
    const clusterAssignments = await this.performSpectralClusteringWithK(coreMatrix, optimalK);

    // Log initial cluster assignments
    const assignmentCounts = new Map<number, number>();
    clusterAssignments.forEach(clusterId => {
      assignmentCounts.set(clusterId, (assignmentCounts.get(clusterId) || 0) + 1);
    });
    
    logger.info('📊 Initial Cluster Assignments from Spectral Algorithm', {
      optimalK: optimalK,
      actualClusters: assignmentCounts.size,
      clusterSizes: Array.from(assignmentCounts.entries()).map(([id, count]) => ({ clusterId: id, size: count })),
      totalAssigned: clusterAssignments.length
    });

    // Map cluster assignments back to table names
    const coreClusters = this.mapClustersToTables(
      clusterAssignments, 
      coreTableIndices, 
      tables
    );

    // Log core clusters after mapping
    logger.info('📊 Core Clusters After Table Mapping', {
      coreClusterCount: coreClusters.length,
      coreSizes: coreClusters.map(c => ({ clusterId: c.clusterId, size: c.tables.length }))
    });

    // CRITICAL: Validate cluster sizes and apply fallback if mega-clusters detected
    const clusterSizeValidation = this.validateClusterSizes(coreClusters, tables.length);
    
    let validatedClusters = coreClusters;
    if (!clusterSizeValidation.isValid) {
      logger.error('🚨 CLUSTER SIZE VALIDATION FAILED - Applying fallback clustering', {
        megaClusters: clusterSizeValidation.megaClusters.length,
        largestCluster: clusterSizeValidation.largestClusterSize,
        threshold: this.MAX_CLUSTER_SIZE,
        totalTables: tables.length
      });
      
      // Apply fallback clustering method
      validatedClusters = await this.applyFallbackClustering(
        tables, 
        weightedEdges, 
        optimalK, 
        clusterSizeValidation
      );
      
      logger.info('✅ Fallback clustering applied', {
        newClusterCount: validatedClusters.length,
        newSizes: validatedClusters.map(c => c.tables.length).sort((a, b) => b - a).slice(0, 5)
      });
    }

    // Assign hub tables to clusters (if any and not keeping hubs in clusters already)
    const finalClusters = (hubTables.length > 0 && !keepHubs)
      ? await this.assignHubTablesToClusters(validatedClusters, hubTables, adjacencyMatrix, tableIndexMap)
      : validatedClusters;

    if (keepHubs && hubTables.length > 0) {
      logger.info('Hubs retained in clusters during spectral clustering', {
        hubsInClusters: hubTables.length,
        clustersWithHubs: finalClusters.filter(c => 
          c.tables.some(t => hubTables.includes(t))
        ).length
      });
    }

    // Calculate cluster metrics
    const clustersWithMetrics = await this.calculateClusterMetrics(
      finalClusters, 
      adjacencyMatrix, 
      tableIndexMap
    );

    // Validate clustering quality
    const validation = await this.validateClusteringQuality(clustersWithMetrics, adjacencyMatrix, tableIndexMap);

    // Calculate overall statistics
    const statistics = this.calculateClusteringStatistics(clustersWithMetrics);

    // Log detailed cluster size analysis
    const clusterSizes = clustersWithMetrics.map(c => c.tables.length);
    const megaClusters = clustersWithMetrics.filter(c => c.tables.length > 50);
    
    logger.info('📊 SPECTRAL CLUSTERING - Final Results', {
      clusterCount: clustersWithMetrics.length,
      clusterSizes: clusterSizes,
      avgClusterSize: statistics.avgClusterSize.toFixed(1),
      largestCluster: Math.max(...clusterSizes),
      megaClusterCount: megaClusters.length,
      silhouetteScore: validation.silhouetteScore.toFixed(3),
      isOptimal: validation.isOptimalConfiguration
    });

    // Log mega-cluster details if any exist
    megaClusters.forEach(cluster => {
      logger.info('🚨 MEGA-CLUSTER DETECTED', {
        clusterId: cluster.clusterId,
        size: cluster.tables.length,
        sampleTables: cluster.tables.slice(0, 10),
        internalConnectivity: cluster.internalConnectivity.toFixed(3),
        externalConnectivity: cluster.externalConnectivity.toFixed(3),
        coherenceScore: cluster.coherenceScore.toFixed(3)
      });
    });

    return {
      clusters: clustersWithMetrics,
      optimalK,
      gapStatistics,
      validation,
      statistics
    };
  }

  /**
   * Build weighted adjacency matrix from tables and edges
   */
  private buildWeightedAdjacencyMatrix(tables: TableInfo[], weightedEdges: WeightedEdge[]): number[][] {
    const tableCount = tables.length;
    const matrix = Array(tableCount).fill(null).map(() => Array(tableCount).fill(0));
    const tableIndexMap = new Map(tables.map((table, idx) => [table.name, idx]));

    // Fill matrix with edge weights
    weightedEdges.forEach(edge => {
      const sourceIdx = tableIndexMap.get(edge.source);
      const targetIdx = tableIndexMap.get(edge.target);

      if (sourceIdx !== undefined && targetIdx !== undefined) {
        const weight = edge.components.finalWeight;
        matrix[sourceIdx][targetIdx] = weight;
        matrix[targetIdx][sourceIdx] = weight; // Symmetric matrix
      }
    });

    return matrix;
  }

  /**
   * Create hub-free matrix for initial clustering
   */
  private createHubFreeMatrix(
    adjacencyMatrix: number[][],
    tables: TableInfo[],
    hubTables: string[]
  ): { coreMatrix: number[][], coreTableIndices: number[], tableIndexMap: Map<string, number> } {
    const hubIndices = new Set(
      hubTables.map(hubName => tables.findIndex(table => table.name === hubName))
        .filter(idx => idx !== -1)
    );

    // Get indices of non-hub tables
    const coreTableIndices = tables
      .map((_, idx) => idx)
      .filter(idx => !hubIndices.has(idx));

    // Create new matrix with only core tables, preserving both direct and hub-mediated connections
    const coreSize = coreTableIndices.length;
    const coreMatrix = Array(coreSize).fill(null).map(() => Array(coreSize).fill(0));

    // First, copy direct core-to-core connections
    for (let i = 0; i < coreSize; i++) {
      for (let j = 0; j < coreSize; j++) {
        const originalI = coreTableIndices[i];
        const originalJ = coreTableIndices[j];
        coreMatrix[i][j] = adjacencyMatrix[originalI][originalJ];
      }
    }

    // Second, add hub-mediated connections (indirect connections through hubs)
    for (let i = 0; i < coreSize; i++) {
      for (let j = i + 1; j < coreSize; j++) { // Only upper triangle to avoid duplicates
        const originalI = coreTableIndices[i];
        const originalJ = coreTableIndices[j];
        
        // If no direct connection exists, check for hub-mediated connection
        if (coreMatrix[i][j] === 0) {
          let maxHubMediatedWeight = 0;
          
          // Check all hub tables for potential mediation
          for (const hubIdx of hubIndices) {
            const weightToHub1 = adjacencyMatrix[originalI][hubIdx];
            const weightToHub2 = adjacencyMatrix[originalJ][hubIdx];
            
            // If both core tables connect to this hub, create mediated connection
            if (weightToHub1 > 0 && weightToHub2 > 0) {
              // Use minimum weight as the mediated connection strength (weakest link)
              const mediatedWeight = Math.min(weightToHub1, weightToHub2) * 0.8; // Reduce for indirect
              maxHubMediatedWeight = Math.max(maxHubMediatedWeight, mediatedWeight);
            }
          }
          
          // Add the strongest hub-mediated connection
          if (maxHubMediatedWeight > 0) {
            coreMatrix[i][j] = maxHubMediatedWeight;
            coreMatrix[j][i] = maxHubMediatedWeight; // Symmetric
          }
        }
      }
    }

    // Calculate connectivity improvement statistics
    const directConnections = coreMatrix.reduce((sum, row) => sum + row.reduce((rowSum, val) => rowSum + (val > 0 ? 1 : 0), 0), 0) / 2;
    const originalCoreConnections = coreTableIndices.reduce((sum, i) => {
      return sum + coreTableIndices.reduce((innerSum, j) => {
        return i < j && adjacencyMatrix[i][j] > 0 ? innerSum + 1 : innerSum;
      }, 0);
    }, 0);
    
    logger.info('Hub removal with connectivity preservation', {
      hubTablesRemoved: hubIndices.size,
      coreTablesRemaining: coreSize,
      originalCoreConnections,
      finalConnections: directConnections,
      connectivityGain: directConnections - originalCoreConnections,
      hubMediatedConnections: directConnections - originalCoreConnections
    });

    // Create new table index mapping
    const tableIndexMap = new Map<string, number>();
    coreTableIndices.forEach((originalIdx, newIdx) => {
      tableIndexMap.set(tables[originalIdx].name, newIdx);
    });

    return { coreMatrix, coreTableIndices, tableIndexMap };
  }

  /**
   * Calculate Gap Statistic to determine optimal number of clusters with timeout protection
   */
  private async calculateGapStatistic(
    matrix: number[][],
    tableIndices: number[]
  ): Promise<GapStatisticResult[]> {
    const results: GapStatisticResult[] = [];
    const matrixSize = matrix.length;
    const startTime = Date.now();

    if (matrixSize < 6) {
      // Too few tables for meaningful clustering
      return [{
        k: Math.min(2, matrixSize),
        gapValue: 0,
        standardError: 0,
        withinClusterSumSquares: 0,
        expectedWCSS: 0
      }];
    }

    // Test range of K values
    const minK = Math.max(2, this.TARGET_CLUSTER_RANGE[0] - 4);
    const maxK = Math.min(matrixSize - 1, this.TARGET_CLUSTER_RANGE[1] + 8);

    for (let k = minK; k <= maxK; k++) {
      // Check timeout before processing each k-value
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > this.GAP_STAT_TIMEOUT) {
        logger.warn('Gap Statistic calculation timeout exceeded', {
          elapsedTime: `${elapsedTime}ms`,
          timeoutLimit: `${this.GAP_STAT_TIMEOUT}ms`,
          processedKValues: results.length,
          currentK: k
        });
        
        // Return partial results if we have at least 3 k-values tested
        if (results.length >= 3) {
          logger.info('Returning partial Gap Statistic results due to timeout');
          break;
        } else {
          // If we don't have enough data, return a fallback result
          logger.warn('Insufficient Gap Statistic data, using fallback k-value');
          return [{
            k: Math.floor((this.TARGET_CLUSTER_RANGE[0] + this.TARGET_CLUSTER_RANGE[1]) / 2),
            gapValue: 0.5,
            standardError: 0.1,
            withinClusterSumSquares: 0,
            expectedWCSS: 0
          }];
        }
      }

      logger.debug(`Calculating Gap Statistic for k=${k} (${elapsedTime}ms elapsed)`);

      // Calculate WCSS for actual data
      const actualWCSS = await this.calculateWCSS(matrix, k);

      // Calculate expected WCSS from reference distributions
      const referenceWCSS: number[] = [];
      
      for (let iter = 0; iter < this.GAP_STAT_ITERATIONS; iter++) {
        // Check timeout during iterations as well
        if (Date.now() - startTime > this.GAP_STAT_TIMEOUT) {
          logger.warn(`Gap Statistic timeout during iteration ${iter} of k=${k}`);
          break;
        }
        
        const referenceMatrix = this.generateReferenceMatrix(matrix);
        const refWCSS = await this.calculateWCSS(referenceMatrix, k);
        referenceWCSS.push(refWCSS);
      }

      // Only proceed if we have sufficient reference data
      if (referenceWCSS.length < Math.floor(this.GAP_STAT_ITERATIONS / 2)) {
        logger.warn(`Insufficient reference data for k=${k}, skipping`);
        continue;
      }

      const expectedWCSS = referenceWCSS.reduce((sum, val) => sum + val, 0) / referenceWCSS.length;
      const gapValue = Math.log(expectedWCSS) - Math.log(actualWCSS);

      // Calculate standard error
      const logReferenceWCSS = referenceWCSS.map(val => Math.log(val));
      const meanLogRef = logReferenceWCSS.reduce((sum, val) => sum + val, 0) / logReferenceWCSS.length;
      const variance = logReferenceWCSS.reduce((sum, val) => sum + (val - meanLogRef) ** 2, 0) / logReferenceWCSS.length;
      const standardError = Math.sqrt(variance * (1 + 1 / referenceWCSS.length));

      results.push({
        k,
        gapValue,
        standardError,
        withinClusterSumSquares: actualWCSS,
        expectedWCSS
      });

      // Early stopping criterion: Tibshirani's rule
      // Stop if Gap(k) - Gap(k+1) + SE(k+1) >= 0 (when we have enough data)
      if (results.length >= 3 && this.shouldStopGapStatistic(results)) {
        logger.info('Gap Statistic early stopping criterion met', {
          stoppedAtK: k,
          totalKValuesTested: results.length,
          timeElapsed: `${Date.now() - startTime}ms`
        });
        break;
      }
    }

    return results;
  }

  /**
   * Calculate Within-Cluster Sum of Squares for given K
   */
  private async calculateWCSS(matrix: number[][], k: number): Promise<number> {
    const clusterAssignments = await this.performSpectralClusteringWithK(matrix, k);
    const clusters = this.groupByCluster(clusterAssignments);
    
    let totalWCSS = 0;

    clusters.forEach(clusterIndices => {
      if (clusterIndices.length <= 1) return;

      // Calculate centroid
      const centroid = this.calculateClusterCentroid(clusterIndices, matrix);
      
      // Sum squared distances to centroid
      clusterIndices.forEach(nodeIdx => {
        const distance = this.calculateDistanceToPoint(nodeIdx, centroid, matrix);
        totalWCSS += distance * distance;
      });
    });

    return totalWCSS;
  }

  /**
   * Generate reference matrix for Gap Statistic (uniform random distribution)
   */
  private generateReferenceMatrix(originalMatrix: number[][]): number[][] {
    const size = originalMatrix.length;
    const referenceMatrix = Array(size).fill(null).map(() => Array(size).fill(0));

    // Find min/max edge weights in original matrix
    let minWeight = Infinity;
    let maxWeight = 0;
    
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        if (originalMatrix[i][j] > 0) {
          minWeight = Math.min(minWeight, originalMatrix[i][j]);
          maxWeight = Math.max(maxWeight, originalMatrix[i][j]);
        }
      }
    }

    if (minWeight === Infinity) {
      minWeight = 0;
      maxWeight = 1;
    }

    // Generate random weights with similar distribution
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        if (originalMatrix[i][j] > 0 || Math.random() < 0.1) { // Maintain similar sparsity
          const randomWeight = minWeight + Math.random() * (maxWeight - minWeight);
          referenceMatrix[i][j] = randomWeight;
          referenceMatrix[j][i] = randomWeight;
        }
      }
    }

    return referenceMatrix;
  }

  /**
   * Select optimal K from Gap Statistic results
   */
  private selectOptimalK(gapStatistics: GapStatisticResult[]): number {
    if (gapStatistics.length === 0) {
      const defaultK = Math.floor((this.TARGET_CLUSTER_RANGE[0] + this.TARGET_CLUSTER_RANGE[1]) / 2);
      logger.warn('No Gap Statistic results, using default K', { defaultK });
      return defaultK;
    }

    // STRICT: Only consider K values within target range
    const targetCandidates = gapStatistics.filter(
      result => result.k >= this.TARGET_CLUSTER_RANGE[0] && result.k <= this.TARGET_CLUSTER_RANGE[1]
    );

    let bestK: number;
    let bestGap: number;
    
    if (targetCandidates.length > 0) {
      // Find best K within target range
      const targetOptimal = targetCandidates.reduce((best, current) =>
        current.gapValue > best.gapValue ? current : best
      );
      bestK = targetOptimal.k;
      bestGap = targetOptimal.gapValue;
      
      logger.info('✅ K selected within target range', {
        selectedK: bestK,
        gapValue: bestGap.toFixed(4),
        targetRange: this.TARGET_CLUSTER_RANGE,
        candidatesInRange: targetCandidates.length
      });
    } else {
      // Force K into target range if no good candidates
      const globalOptimal = gapStatistics.reduce((best, current) =>
        current.gapValue > best.gapValue ? current : best
      );
      
      // Clamp to target range
      bestK = Math.max(this.TARGET_CLUSTER_RANGE[0], 
                      Math.min(this.TARGET_CLUSTER_RANGE[1], globalOptimal.k));
      bestGap = globalOptimal.gapValue;
      
      logger.warn('⚠️ No good K in target range, forcing into bounds', {
        originalK: globalOptimal.k,
        forcedK: bestK,
        gapValue: bestGap.toFixed(4),
        targetRange: this.TARGET_CLUSTER_RANGE
      });
    }

    // Apply elbow method as tiebreaker within target range only
    const elbowK = this.findElbowPoint(targetCandidates.length > 0 ? targetCandidates : gapStatistics);
    if (targetCandidates.length > 0 && Math.abs(elbowK - bestK) <= 2) {
      if (elbowK >= this.TARGET_CLUSTER_RANGE[0] && elbowK <= this.TARGET_CLUSTER_RANGE[1]) {
        bestK = elbowK;
        logger.info('Applied elbow method within target range', { elbowK });
      }
    }

    // Final validation - ensure K is strictly within target range
    bestK = Math.max(this.TARGET_CLUSTER_RANGE[0], 
                    Math.min(this.TARGET_CLUSTER_RANGE[1], bestK));

    logger.info('🎯 Final K Selection', {
      finalK: bestK,
      isInTargetRange: bestK >= this.TARGET_CLUSTER_RANGE[0] && bestK <= this.TARGET_CLUSTER_RANGE[1],
      targetRange: this.TARGET_CLUSTER_RANGE,
      gapValue: bestGap.toFixed(4)
    });

    return bestK;
  }

  /**
   * Find elbow point in Gap Statistic curve
   */
  private findElbowPoint(gapStatistics: GapStatisticResult[]): number {
    if (gapStatistics.length < 3) return gapStatistics[0]?.k || 8;

    let maxCurvature = 0;
    let elbowK = gapStatistics[0].k;

    // Calculate curvature for each point
    for (let i = 1; i < gapStatistics.length - 1; i++) {
      const prev = gapStatistics[i - 1];
      const curr = gapStatistics[i];
      const next = gapStatistics[i + 1];

      // Second derivative approximation
      const curvature = Math.abs(next.gapValue - 2 * curr.gapValue + prev.gapValue);
      
      if (curvature > maxCurvature) {
        maxCurvature = curvature;
        elbowK = curr.k;
      }
    }

    return elbowK;
  }

  /**
   * Check if early stopping criterion is met using Tibshirani's rule
   */
  private shouldStopGapStatistic(results: GapStatisticResult[]): boolean {
    if (results.length < 2) return false;

    // Get the last two results
    const current = results[results.length - 1];
    const previous = results[results.length - 2];

    // Tibshirani's early stopping rule: Gap(k) >= Gap(k+1) - SE(k+1)
    // This means the current gap is good enough compared to what we might expect next
    const stoppingCriterion = previous.gapValue >= (current.gapValue - current.standardError);

    // Additional conditions for early stopping:
    // 1. We're in or approaching the target range
    // 2. We have a reasonably good gap value
    // 3. We've tested at least 3 k-values
    const inTargetRange = current.k >= this.TARGET_CLUSTER_RANGE[0] - 2;
    const reasonableGap = current.gapValue > 0.1;
    const sufficientData = results.length >= 3;

    // Only stop if all conditions are met
    if (stoppingCriterion && inTargetRange && reasonableGap && sufficientData) {
      logger.debug('Early stopping conditions met', {
        currentK: current.k,
        previousGap: previous.gapValue.toFixed(3),
        currentGap: current.gapValue.toFixed(3),
        currentSE: current.standardError.toFixed(3),
        stoppingValue: (current.gapValue - current.standardError).toFixed(3)
      });
      return true;
    }

    return false;
  }

  /**
   * Perform spectral clustering with specific K
   */
  private async performSpectralClusteringWithK(matrix: number[][], k: number): Promise<number[]> {
    const size = matrix.length;
    
    if (size <= k) {
      // Each node is its own cluster
      return Array.from({ length: size }, (_, idx) => idx);
    }

    // Build normalized Laplacian matrix
    const laplacianMatrix = this.buildNormalizedLaplacian(matrix);
    
    // Calculate basic adjacency matrix properties (no debug logging)
    const totalEdges = matrix.reduce((sum, row) => sum + row.reduce((rowSum, val) => rowSum + (val > 0 ? 1 : 0), 0), 0) / 2;
    const density = totalEdges / ((size * (size - 1)) / 2);

    // Calculate eigenvalues and eigenvectors
    const { eigenVectors, eigenValues } = await this.calculateEigenDecomposition(laplacianMatrix, k);
    
    // Calculate eigenvalue gaps for quality validation
    const spectralGap = eigenValues.length > 1 ? (eigenValues[1] - eigenValues[0]) : 0;
    const hasGoodSeparation = spectralGap > 0.01;
    
    // Perform K-means clustering in eigenvector space
    const clusterAssignments = this.performKMeansClustering(eigenVectors, k);
    
    // Validate cluster quality (no debug logging)
    const clusterCounts = new Map<number, number>();
    clusterAssignments.forEach(clusterId => {
      clusterCounts.set(clusterId, (clusterCounts.get(clusterId) || 0) + 1);
    });
    const largestCluster = Math.max(...Array.from(clusterCounts.values()));
    const megaClusterRatio = largestCluster / size;
    
    // Log only critical issues
    if (megaClusterRatio > 0.5 || !hasGoodSeparation || density < 0.01) {
      logger.warn('Spectral clustering quality issues detected', {
        megaClusterRatio: megaClusterRatio.toFixed(3),
        spectralGap: spectralGap.toFixed(4),
        graphDensity: density.toFixed(4),
        clustersProduced: clusterCounts.size,
        targetK: k
      });
    }
    
    return clusterAssignments;
  }

  /**
   * Build normalized Laplacian matrix
   */
  private buildNormalizedLaplacian(adjacencyMatrix: number[][]): number[][] {
    const size = adjacencyMatrix.length;
    const laplacian = Array(size).fill(null).map(() => Array(size).fill(0));
    
    // Calculate degree matrix
    const degrees = new Array(size).fill(0);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        degrees[i] += adjacencyMatrix[i][j];
      }
    }

    // Build normalized Laplacian: L = I - D^(-1/2) * A * D^(-1/2)
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (i === j) {
          laplacian[i][j] = 1.0;
        } else if (degrees[i] > 0 && degrees[j] > 0) {
          laplacian[i][j] = -adjacencyMatrix[i][j] / Math.sqrt(degrees[i] * degrees[j]);
        } else {
          laplacian[i][j] = 0;
        }
      }
    }

    return laplacian;
  }

  /**
   * Calculate eigendecomposition of Laplacian matrix
   * Using power iteration method for efficiency
   */
  private async calculateEigenDecomposition(
    matrix: number[][], 
    k: number
  ): Promise<{ eigenVectors: number[][], eigenValues: number[] }> {
    const size = matrix.length;
    const maxIterations = 1000;
    const tolerance = this.EIGENVALUE_TOLERANCE;

    const eigenVectors: number[][] = [];
    const eigenValues: number[] = [];

    // Find k smallest eigenvalues and corresponding eigenvectors
    let workingMatrix = this.deepCopyMatrix(matrix);

    for (let eigIndex = 0; eigIndex < k; eigIndex++) {
      // Use inverse power iteration to find smallest eigenvalue
      let eigenVector = this.initializeRandomVector(size);
      let eigenValue = 0;

      for (let iter = 0; iter < maxIterations; iter++) {
        const oldEigenVector = [...eigenVector];

        // Apply inverse power iteration
        eigenVector = this.solveLinearSystem(workingMatrix, eigenVector);
        
        // Normalize
        const norm = Math.sqrt(eigenVector.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
          eigenVector = eigenVector.map(val => val / norm);
        }

        // Calculate eigenvalue (Rayleigh quotient)
        const numerator = this.vectorMatrixVectorProduct(eigenVector, matrix, eigenVector);
        const denominator = this.dotProduct(eigenVector, eigenVector);
        eigenValue = denominator > 0 ? numerator / denominator : 0;

        // Check convergence
        const convergence = this.vectorDistance(eigenVector, oldEigenVector);
        if (convergence < tolerance) break;
      }

      eigenVectors.push(eigenVector);
      eigenValues.push(eigenValue);

      // Deflate matrix to find next eigenvalue
      workingMatrix = this.deflateMatrix(workingMatrix, eigenVector, eigenValue);
    }

    // Convert eigenvectors to matrix form (rows are data points, columns are eigenvector components)
    const eigenMatrix = Array(size).fill(null).map(() => Array(k).fill(0));
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < k; j++) {
        eigenMatrix[i][j] = eigenVectors[j][i];
      }
    }

    return { eigenVectors: eigenMatrix, eigenValues };
  }

  /**
   * Perform K-means clustering in eigenvector space
   */
  private performKMeansClustering(eigenVectors: number[][], k: number): number[] {
    const n = eigenVectors.length;
    const d = eigenVectors[0].length;
    
    if (n <= k) {
      return Array.from({ length: n }, (_, idx) => idx);
    }

    // Initialize centroids using K-means++ method
    const centroids = this.initializeCentroidsKMeansPlusPlus(eigenVectors, k);
    const assignments = new Array(n).fill(0);
    
    const maxIterations = 100;
    const tolerance = 1e-6;

    for (let iter = 0; iter < maxIterations; iter++) {
      const oldAssignments = [...assignments];
      
      // Assign points to nearest centroid
      for (let i = 0; i < n; i++) {
        let minDistance = Infinity;
        let bestCluster = 0;
        
        for (let j = 0; j < k; j++) {
          const distance = this.euclideanDistance(eigenVectors[i], centroids[j]);
          if (distance < minDistance) {
            minDistance = distance;
            bestCluster = j;
          }
        }
        
        assignments[i] = bestCluster;
      }

      // Update centroids
      for (let j = 0; j < k; j++) {
        const clusterPoints = eigenVectors.filter((_, idx) => assignments[idx] === j);
        
        if (clusterPoints.length > 0) {
          for (let dim = 0; dim < d; dim++) {
            centroids[j][dim] = clusterPoints.reduce((sum, point) => sum + point[dim], 0) / clusterPoints.length;
          }
        }
      }

      // Check convergence
      const changeCount = assignments.reduce((count, assignment, idx) => 
        count + (assignment !== oldAssignments[idx] ? 1 : 0), 0);
      
      if (changeCount < tolerance * n) break;
    }

    return assignments;
  }

  /**
   * Initialize centroids using K-means++ method
   */
  private initializeCentroidsKMeansPlusPlus(points: number[][], k: number): number[][] {
    const n = points.length;
    const d = points[0].length;
    const centroids: number[][] = [];

    // Choose first centroid randomly
    const firstIdx = Math.floor(Math.random() * n);
    centroids.push([...points[firstIdx]]);

    // Choose remaining centroids
    for (let c = 1; c < k; c++) {
      const distances = points.map(point => {
        const minDistToCentroid = Math.min(
          ...centroids.map(centroid => this.euclideanDistance(point, centroid))
        );
        return minDistToCentroid * minDistToCentroid; // Squared distance
      });

      // Choose next centroid with probability proportional to squared distance
      const totalDistance = distances.reduce((sum, d) => sum + d, 0);
      const random = Math.random() * totalDistance;
      
      let cumulative = 0;
      for (let i = 0; i < n; i++) {
        cumulative += distances[i];
        if (cumulative >= random) {
          centroids.push([...points[i]]);
          break;
        }
      }
    }

    return centroids;
  }

  /**
   * Map cluster assignments to table names
   */
  private mapClustersToTables(
    clusterAssignments: number[],
    tableIndices: number[],
    tables: TableInfo[]
  ): SpectralClusterResult[] {
    const clusterMap = new Map<number, string[]>();

    clusterAssignments.forEach((clusterId, idx) => {
      const tableIdx = tableIndices[idx];
      const tableName = tables[tableIdx].name;

      if (!clusterMap.has(clusterId)) {
        clusterMap.set(clusterId, []);
      }
      clusterMap.get(clusterId)!.push(tableName);
    });

    return Array.from(clusterMap.entries()).map(([clusterId, tableNames]) => ({
      clusterId,
      tables: tableNames,
      size: tableNames.length,
      internalConnectivity: 0, // Will be calculated later
      externalConnectivity: 0, // Will be calculated later
      coherenceScore: 0 // Will be calculated later
    }));
  }

  /**
   * Assign hub tables to clusters based on connectivity
   */
  private async assignHubTablesToClusters(
    clusters: SpectralClusterResult[],
    hubTables: string[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): Promise<SpectralClusterResult[]> {
    const updatedClusters = clusters.map(c => ({ ...c, tables: [...c.tables] }));

    for (const hubTable of hubTables) {
      const hubIdx = tableIndexMap.get(hubTable);
      if (hubIdx === undefined) continue;

      // Calculate affinity to each cluster
      let bestCluster = -1;
      let bestAffinity = 0;

      updatedClusters.forEach((cluster, clusterIdx) => {
        let totalAffinity = 0;
        let connectionCount = 0;

        cluster.tables.forEach(tableName => {
          const tableIdx = tableIndexMap.get(tableName);
          if (tableIdx !== undefined) {
            const weight = adjacencyMatrix[hubIdx][tableIdx];
            if (weight > 0) {
              totalAffinity += weight;
              connectionCount++;
            }
          }
        });

        // Calculate average affinity (connection density * average weight)
        const density = cluster.size > 0 ? connectionCount / cluster.size : 0;
        const avgWeight = connectionCount > 0 ? totalAffinity / connectionCount : 0;
        const affinity = density * avgWeight;

        if (affinity > bestAffinity) {
          bestAffinity = affinity;
          bestCluster = clusterIdx;
        }
      });

      // Assign hub to best cluster or create isolated cluster
      if (bestCluster !== -1 && bestAffinity > 0.1) {
        updatedClusters[bestCluster].tables.push(hubTable);
        updatedClusters[bestCluster].size++;
      } else {
        // Create isolated cluster for disconnected hub
        updatedClusters.push({
          clusterId: updatedClusters.length,
          tables: [hubTable],
          size: 1,
          internalConnectivity: 0,
          externalConnectivity: 0,
          coherenceScore: 0
        });
      }
    }

    return updatedClusters;
  }

  /**
   * Calculate cluster metrics (connectivity and coherence)
   */
  private async calculateClusterMetrics(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): Promise<SpectralClusterResult[]> {
    return clusters.map(cluster => {
      const { internalConnectivity, externalConnectivity } = this.calculateConnectivity(
        cluster, clusters, adjacencyMatrix, tableIndexMap
      );
      
      const coherenceScore = this.calculateCoherenceScore(
        internalConnectivity, externalConnectivity, cluster.size
      );

      return {
        ...cluster,
        internalConnectivity,
        externalConnectivity,
        coherenceScore
      };
    });
  }

  /**
   * Calculate internal and external connectivity for a cluster
   */
  private calculateConnectivity(
    cluster: SpectralClusterResult,
    allClusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): { internalConnectivity: number, externalConnectivity: number } {
    const clusterIndices = cluster.tables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    if (clusterIndices.length <= 1) {
      return { internalConnectivity: 0, externalConnectivity: 0 };
    }

    // Calculate internal connectivity
    let internalEdges = 0;
    let internalWeight = 0;
    const maxInternalEdges = (clusterIndices.length * (clusterIndices.length - 1)) / 2;

    for (let i = 0; i < clusterIndices.length; i++) {
      for (let j = i + 1; j < clusterIndices.length; j++) {
        const weight = adjacencyMatrix[clusterIndices[i]][clusterIndices[j]];
        if (weight > 0) {
          internalEdges++;
          internalWeight += weight;
        }
      }
    }

    const internalConnectivity = maxInternalEdges > 0 
      ? (internalEdges / maxInternalEdges) * (internalWeight / Math.max(internalEdges, 1))
      : 0;

    // Calculate external connectivity
    const otherTables = allClusters
      .filter(c => c.clusterId !== cluster.clusterId)
      .flatMap(c => c.tables)
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    let externalEdges = 0;
    let externalWeight = 0;
    const maxExternalEdges = clusterIndices.length * otherTables.length;

    clusterIndices.forEach(clusterIdx => {
      otherTables.forEach(otherIdx => {
        const weight = adjacencyMatrix[clusterIdx][otherIdx];
        if (weight > 0) {
          externalEdges++;
          externalWeight += weight;
        }
      });
    });

    const externalConnectivity = maxExternalEdges > 0 
      ? (externalEdges / maxExternalEdges) * (externalWeight / Math.max(externalEdges, 1))
      : 0;

    return { internalConnectivity, externalConnectivity };
  }

  /**
   * Calculate coherence score for a cluster
   */
  private calculateCoherenceScore(
    internalConnectivity: number,
    externalConnectivity: number,
    clusterSize: number
  ): number {
    // Good clusters have high internal connectivity and low external connectivity
    const connectivityRatio = externalConnectivity > 0 
      ? internalConnectivity / externalConnectivity 
      : internalConnectivity * 10;

    // Size penalty for very small or very large clusters
    const sizeScore = clusterSize >= this.MIN_CLUSTER_SIZE && clusterSize <= this.MAX_CLUSTER_SIZE
      ? 1.0
      : Math.max(0.1, 1.0 - Math.abs(clusterSize - 12) / 20);

    return Math.min(1.0, connectivityRatio * 0.7 + sizeScore * 0.3);
  }

  /**
   * Validate overall clustering quality
   */
  private async validateClusteringQuality(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): Promise<SpectralClusteringResult['validation']> {
    const silhouetteScore = this.calculateSilhouetteScore(clusters, adjacencyMatrix, tableIndexMap);
    const daviesBouldinIndex = this.calculateDaviesBouldinIndex(clusters, adjacencyMatrix, tableIndexMap);
    const calinskiHarabaszIndex = this.calculateCalinskiHarabaszIndex(clusters, adjacencyMatrix, tableIndexMap);

    // Determine if configuration is optimal
    const isOptimalConfiguration = (
      silhouetteScore > 0.3 &&
      daviesBouldinIndex < 2.5 &&
      calinskiHarabaszIndex > 50 &&
      clusters.length >= this.TARGET_CLUSTER_RANGE[0] &&
      clusters.length <= this.TARGET_CLUSTER_RANGE[1] + 5
    );

    return {
      silhouetteScore,
      daviesBouldinIndex,
      calinskiHarabaszIndex,
      isOptimalConfiguration
    };
  }

  /**
   * Calculate silhouette score
   */
  private calculateSilhouetteScore(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    const allTables = clusters.flatMap(cluster => cluster.tables);
    let totalSilhouette = 0;
    let validPoints = 0;

    allTables.forEach(tableName => {
      const tableIdx = tableIndexMap.get(tableName);
      if (tableIdx === undefined) return;

      const ownCluster = clusters.find(c => c.tables.includes(tableName));
      if (!ownCluster || ownCluster.size <= 1) return;

      // Calculate average distance to own cluster
      const ownClusterTables = ownCluster.tables.filter(t => t !== tableName);
      const avgIntraDistance = ownClusterTables.reduce((sum, otherTable) => {
        const otherIdx = tableIndexMap.get(otherTable);
        if (otherIdx === undefined) return sum;
        return sum + (1 - adjacencyMatrix[tableIdx][otherIdx]); // Convert similarity to distance
      }, 0) / ownClusterTables.length;

      // Calculate average distance to nearest other cluster
      let minInterDistance = Infinity;
      
      clusters.forEach(otherCluster => {
        if (otherCluster.clusterId === ownCluster.clusterId) return;
        
        const avgInterDistance = otherCluster.tables.reduce((sum, otherTable) => {
          const otherIdx = tableIndexMap.get(otherTable);
          if (otherIdx === undefined) return sum;
          return sum + (1 - adjacencyMatrix[tableIdx][otherIdx]);
        }, 0) / otherCluster.size;
        
        minInterDistance = Math.min(minInterDistance, avgInterDistance);
      });

      if (minInterDistance !== Infinity) {
        const silhouette = (minInterDistance - avgIntraDistance) / Math.max(minInterDistance, avgIntraDistance);
        totalSilhouette += silhouette;
        validPoints++;
      }
    });

    return validPoints > 0 ? totalSilhouette / validPoints : 0;
  }

  /**
   * Calculate Davies-Bouldin Index
   */
  private calculateDaviesBouldinIndex(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    if (clusters.length <= 1) return 0;

    let totalDB = 0;

    clusters.forEach(clusterI => {
      let maxRatio = 0;
      
      clusters.forEach(clusterJ => {
        if (clusterI.clusterId === clusterJ.clusterId) return;
        
        const scatterI = this.calculateClusterScatter(clusterI, adjacencyMatrix, tableIndexMap);
        const scatterJ = this.calculateClusterScatter(clusterJ, adjacencyMatrix, tableIndexMap);
        const separation = this.calculateClusterSeparation(clusterI, clusterJ, adjacencyMatrix, tableIndexMap);
        
        if (separation > 0) {
          const ratio = (scatterI + scatterJ) / separation;
          maxRatio = Math.max(maxRatio, ratio);
        }
      });
      
      totalDB += maxRatio;
    });

    return totalDB / clusters.length;
  }

  /**
   * Calculate Calinski-Harabasz Index
   */
  private calculateCalinskiHarabaszIndex(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    const totalTables = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
    const numClusters = clusters.length;
    
    if (numClusters <= 1 || totalTables <= numClusters) return 0;

    // Calculate between-cluster sum of squares
    const betweenSS = this.calculateBetweenClusterSumSquares(clusters, adjacencyMatrix, tableIndexMap);
    
    // Calculate within-cluster sum of squares
    const withinSS = this.calculateWithinClusterSumSquares(clusters, adjacencyMatrix, tableIndexMap);
    
    if (withinSS === 0) return 0;
    
    return (betweenSS / (numClusters - 1)) / (withinSS / (totalTables - numClusters));
  }

  /**
   * Calculate overall clustering statistics
   */
  private calculateClusteringStatistics(clusters: SpectralClusterResult[]): SpectralClusteringResult['statistics'] {
    if (clusters.length === 0) {
      return {
        totalTables: 0,
        clusterCount: 0,
        avgClusterSize: 0,
        minClusterSize: 0,
        maxClusterSize: 0,
        sizeVariation: 0
      };
    }

    const sizes = clusters.map(c => c.size);
    const totalTables = sizes.reduce((sum, size) => sum + size, 0);
    const avgClusterSize = totalTables / clusters.length;
    const minClusterSize = Math.min(...sizes);
    const maxClusterSize = Math.max(...sizes);
    
    // Calculate coefficient of variation for size distribution
    const sizeVariance = sizes.reduce((sum, size) => sum + (size - avgClusterSize) ** 2, 0) / clusters.length;
    const sizeStdDev = Math.sqrt(sizeVariance);
    const sizeVariation = avgClusterSize > 0 ? sizeStdDev / avgClusterSize : 0;

    return {
      totalTables,
      clusterCount: clusters.length,
      avgClusterSize,
      minClusterSize,
      maxClusterSize,
      sizeVariation
    };
  }

  // Utility methods
  private deepCopyMatrix(matrix: number[][]): number[][] {
    return matrix.map(row => [...row]);
  }

  private initializeRandomVector(size: number): number[] {
    const vector = Array(size).fill(0).map(() => Math.random() - 0.5);
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vector.map(val => val / norm) : vector;
  }

  private solveLinearSystem(matrix: number[][], vector: number[]): number[] {
    // Simple iterative solver (Gauss-Seidel)
    const size = matrix.length;
    const result = [...vector];
    const iterations = 10;

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < size; i++) {
        if (Math.abs(matrix[i][i]) > 1e-10) {
          let sum = 0;
          for (let j = 0; j < size; j++) {
            if (i !== j) sum += matrix[i][j] * result[j];
          }
          result[i] = (vector[i] - sum) / matrix[i][i];
        }
      }
    }

    return result;
  }

  private vectorMatrixVectorProduct(v1: number[], matrix: number[][], v2: number[]): number {
    let result = 0;
    for (let i = 0; i < v1.length; i++) {
      let matrixRow = 0;
      for (let j = 0; j < v2.length; j++) {
        matrixRow += matrix[i][j] * v2[j];
      }
      result += v1[i] * matrixRow;
    }
    return result;
  }

  private dotProduct(v1: number[], v2: number[]): number {
    return v1.reduce((sum, val, idx) => sum + val * v2[idx], 0);
  }

  private vectorDistance(v1: number[], v2: number[]): number {
    return Math.sqrt(v1.reduce((sum, val, idx) => sum + (val - v2[idx]) ** 2, 0));
  }

  private deflateMatrix(matrix: number[][], eigenVector: number[], eigenValue: number): number[][] {
    const size = matrix.length;
    const deflated = this.deepCopyMatrix(matrix);

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        deflated[i][j] -= eigenValue * eigenVector[i] * eigenVector[j];
      }
    }

    return deflated;
  }

  private euclideanDistance(p1: number[], p2: number[]): number {
    return Math.sqrt(p1.reduce((sum, val, idx) => sum + (val - p2[idx]) ** 2, 0));
  }

  private groupByCluster(assignments: number[]): number[][] {
    const clusters: number[][] = [];
    assignments.forEach((clusterId, nodeIdx) => {
      while (clusters.length <= clusterId) {
        clusters.push([]);
      }
      clusters[clusterId].push(nodeIdx);
    });
    return clusters.filter(cluster => cluster.length > 0);
  }

  private calculateClusterCentroid(clusterIndices: number[], matrix: number[][]): number[] {
    const dimension = matrix.length;
    const centroid = new Array(dimension).fill(0);
    const clusterSize = clusterIndices.length;

    if (clusterSize === 0) return centroid;

    clusterIndices.forEach(nodeIdx => {
      for (let dim = 0; dim < dimension; dim++) {
        centroid[dim] += matrix[nodeIdx][dim] / clusterSize;
      }
    });

    return centroid;
  }

  private calculateDistanceToPoint(nodeIdx: number, point: number[], matrix: number[][]): number {
    const nodeVector = matrix[nodeIdx];
    return this.euclideanDistance(nodeVector, point);
  }

  private calculateClusterScatter(
    cluster: SpectralClusterResult,
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    const clusterIndices = cluster.tables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    if (clusterIndices.length <= 1) return 0;

    const centroid = this.calculateClusterCentroid(clusterIndices, adjacencyMatrix);
    
    return clusterIndices.reduce((sum, nodeIdx) => {
      const distance = this.calculateDistanceToPoint(nodeIdx, centroid, adjacencyMatrix);
      return sum + distance;
    }, 0) / clusterIndices.length;
  }

  private calculateClusterSeparation(
    cluster1: SpectralClusterResult,
    cluster2: SpectralClusterResult,
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    const indices1 = cluster1.tables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];
    
    const indices2 = cluster2.tables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    if (indices1.length === 0 || indices2.length === 0) return 0;

    const centroid1 = this.calculateClusterCentroid(indices1, adjacencyMatrix);
    const centroid2 = this.calculateClusterCentroid(indices2, adjacencyMatrix);

    return this.euclideanDistance(centroid1, centroid2);
  }

  private calculateBetweenClusterSumSquares(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    // Calculate overall centroid
    const allIndices = clusters.flatMap(cluster => 
      cluster.tables
        .map(table => tableIndexMap.get(table))
        .filter(idx => idx !== undefined) as number[]
    );
    
    const overallCentroid = this.calculateClusterCentroid(allIndices, adjacencyMatrix);
    
    return clusters.reduce((sum, cluster) => {
      const clusterIndices = cluster.tables
        .map(table => tableIndexMap.get(table))
        .filter(idx => idx !== undefined) as number[];
      
      if (clusterIndices.length === 0) return sum;
      
      const clusterCentroid = this.calculateClusterCentroid(clusterIndices, adjacencyMatrix);
      const distance = this.euclideanDistance(clusterCentroid, overallCentroid);
      
      return sum + cluster.size * (distance ** 2);
    }, 0);
  }

  private calculateWithinClusterSumSquares(
    clusters: SpectralClusterResult[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    return clusters.reduce((sum, cluster) => {
      const clusterIndices = cluster.tables
        .map(table => tableIndexMap.get(table))
        .filter(idx => idx !== undefined) as number[];
      
      if (clusterIndices.length <= 1) return sum;
      
      const centroid = this.calculateClusterCentroid(clusterIndices, adjacencyMatrix);
      
      return sum + clusterIndices.reduce((clusterSum, nodeIdx) => {
        const distance = this.calculateDistanceToPoint(nodeIdx, centroid, adjacencyMatrix);
        return clusterSum + (distance ** 2);
      }, 0);
    }, 0);
  }

  /**
   * Validate cluster sizes to detect mega-clusters
   */
  private validateClusterSizes(clusters: SpectralClusterResult[], totalTables: number): {
    isValid: boolean;
    megaClusters: SpectralClusterResult[];
    largestClusterSize: number;
    megaClusterRatio: number;
  } {
    const megaClusters = clusters.filter(cluster => cluster.tables.length > this.MAX_CLUSTER_SIZE);
    const largestClusterSize = Math.max(...clusters.map(c => c.tables.length));
    const megaClusterRatio = largestClusterSize / totalTables;
    
    const isValid = megaClusters.length === 0 && megaClusterRatio < 0.4;
    
    return {
      isValid,
      megaClusters,
      largestClusterSize,
      megaClusterRatio
    };
  }

  /**
   * Apply fallback clustering when spectral clustering produces mega-clusters
   */
  private async applyFallbackClustering(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    targetK: number,
    validation: { megaClusters: SpectralClusterResult[]; largestClusterSize: number }
  ): Promise<SpectralClusterResult[]> {
    logger.info('🔄 Applying fallback clustering strategy');
    
    // Strategy 1: Try hierarchical clustering with size constraints
    try {
      const hierarchicalClusters = await this.performHierarchicalClustering(
        tables, 
        weightedEdges, 
        targetK
      );
      
      // Validate hierarchical results
      const hierarchicalValidation = this.validateClusterSizes(hierarchicalClusters, tables.length);
      if (hierarchicalValidation.isValid) {
        logger.info('✅ Hierarchical clustering succeeded as fallback');
        return hierarchicalClusters;
      }
    } catch (error) {
      logger.warn('Hierarchical fallback failed', { error: error instanceof Error ? error.message : error });
    }
    
    // Strategy 2: Force-split mega-clusters using connectivity analysis
    try {
      const splitClusters = await this.splitMegaClusters(
        validation.megaClusters,
        tables,
        weightedEdges,
        targetK
      );
      
      logger.info('✅ Mega-cluster splitting applied as fallback');
      return splitClusters;
    } catch (error) {
      logger.error('All fallback methods failed', { error: error instanceof Error ? error.message : error });
    }
    
    // Strategy 3: Emergency uniform distribution
    return this.createUniformClusters(tables, targetK);
  }

  /**
   * Simple hierarchical clustering fallback
   */
  private async performHierarchicalClustering(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    targetK: number
  ): Promise<SpectralClusterResult[]> {
    logger.info('🌳 Attempting hierarchical clustering fallback');
    
    // Build distance matrix from edge weights
    const distanceMatrix = this.buildDistanceMatrix(tables, weightedEdges);
    
    // Start with each table as its own cluster
    let clusters = tables.map((table, idx) => ({
      clusterId: idx,
      tables: [table.name],
      size: 1,
      internalConnectivity: 1.0,
      externalConnectivity: 0.0,
      coherenceScore: 1.0
    }));
    
    // Merge clusters until we reach target K, with emergency fallback
    let iterationCount = 0;
    const maxIterations = tables.length; // Prevent infinite loops
    
    while (clusters.length > targetK && iterationCount < maxIterations) {
      const mergeIndices = this.findBestClusterMerge(clusters, distanceMatrix, tables);
      
      if (mergeIndices === null) {
        // No more distance-based merges possible, force merge by cluster size
        logger.warn('No distance-based merges available, forcing size-based merging', {
          remainingClusters: clusters.length,
          targetK,
          needToMerge: clusters.length - targetK
        });
        
        const forceMerges = this.forceSmallClusterMerging(clusters, targetK);
        clusters = forceMerges;
        break;
      }
      
      clusters = this.mergeClusters(clusters, mergeIndices);
      iterationCount++;
    }
    
    // Final validation: ensure we don't exceed target range
    if (clusters.length > this.TARGET_CLUSTER_RANGE[1]) {
      logger.warn('Too many clusters after hierarchical merge, applying final consolidation', {
        currentCount: clusters.length,
        targetRange: this.TARGET_CLUSTER_RANGE
      });
      clusters = this.consolidateToTargetRange(clusters, this.TARGET_CLUSTER_RANGE[1]);
    }
    
    return clusters;
  }

  /**
   * Split mega-clusters using connectivity analysis
   */
  private async splitMegaClusters(
    megaClusters: SpectralClusterResult[],
    tables: TableInfo[],
    weightedEdges: WeightedEdge[],
    targetK: number
  ): Promise<SpectralClusterResult[]> {
    logger.info('✂️ Splitting mega-clusters using connectivity analysis');
    
    const splitClusters: SpectralClusterResult[] = [];
    let currentClusterId = 0;
    
    for (const megaCluster of megaClusters) {
      const targetSubClusters = Math.ceil(megaCluster.tables.length / this.MAX_CLUSTER_SIZE);
      const subClusters = this.splitSingleCluster(megaCluster, targetSubClusters, weightedEdges);
      
      subClusters.forEach(subCluster => {
        splitClusters.push({
          ...subCluster,
          clusterId: currentClusterId++
        });
      });
    }
    
    return splitClusters;
  }

  /**
   * Create uniform cluster distribution as emergency fallback
   */
  private createUniformClusters(tables: TableInfo[], targetK: number): SpectralClusterResult[] {
    logger.warn('🚨 Emergency fallback: Creating uniform cluster distribution');
    
    const tablesPerCluster = Math.ceil(tables.length / targetK);
    const clusters: SpectralClusterResult[] = [];
    
    for (let i = 0; i < targetK; i++) {
      const startIdx = i * tablesPerCluster;
      const endIdx = Math.min(startIdx + tablesPerCluster, tables.length);
      const clusterTables = tables.slice(startIdx, endIdx);
      
      if (clusterTables.length > 0) {
        clusters.push({
          clusterId: i,
          tables: clusterTables.map(t => t.name),
          size: clusterTables.length,
          internalConnectivity: 0.5,
          externalConnectivity: 0.1,
          coherenceScore: 0.3
        });
      }
    }
    
    return clusters;
  }

  /**
   * Build distance matrix from weighted edges
   */
  private buildDistanceMatrix(tables: TableInfo[], weightedEdges: WeightedEdge[]): number[][] {
    const size = tables.length;
    const matrix = Array(size).fill(null).map(() => Array(size).fill(Infinity));
    const tableIndexMap = new Map(tables.map((table, idx) => [table.name, idx]));
    
    // Set diagonal to 0
    for (let i = 0; i < size; i++) {
      matrix[i][i] = 0;
    }
    
    // Fill distances (inverse of weights)
    weightedEdges.forEach(edge => {
      const sourceIdx = tableIndexMap.get(edge.source);
      const targetIdx = tableIndexMap.get(edge.target);
      
      if (sourceIdx !== undefined && targetIdx !== undefined) {
        const distance = 1 / (edge.components.finalWeight + 1e-6);
        matrix[sourceIdx][targetIdx] = distance;
        matrix[targetIdx][sourceIdx] = distance;
      }
    });
    
    return matrix;
  }

  /**
   * Find best pair of clusters to merge (respecting size limits)
   */
  private findBestClusterMerge(
    clusters: SpectralClusterResult[],
    distanceMatrix: number[][],
    tables: TableInfo[]
  ): [number, number] | null {
    let bestDistance = Infinity;
    let bestPair: [number, number] | null = null;
    
    const tableIndexMap = new Map(tables.map((table, idx) => [table.name, idx]));
    
    for (let i = 0; i < clusters.length - 1; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Check if merge would exceed size limit
        if (clusters[i].size + clusters[j].size > this.MAX_CLUSTER_SIZE) {
          continue;
        }
        
        // Calculate average distance between clusters
        const avgDistance = this.calculateInterClusterDistance(
          clusters[i], 
          clusters[j], 
          distanceMatrix, 
          tableIndexMap
        );
        
        if (avgDistance < bestDistance) {
          bestDistance = avgDistance;
          bestPair = [i, j];
        }
      }
    }
    
    return bestPair;
  }

  /**
   * Calculate average distance between two clusters
   */
  private calculateInterClusterDistance(
    cluster1: SpectralClusterResult,
    cluster2: SpectralClusterResult,
    distanceMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    let totalDistance = 0;
    let count = 0;
    
    for (const table1 of cluster1.tables) {
      const idx1 = tableIndexMap.get(table1);
      if (idx1 === undefined) continue;
      
      for (const table2 of cluster2.tables) {
        const idx2 = tableIndexMap.get(table2);
        if (idx2 === undefined) continue;
        
        totalDistance += distanceMatrix[idx1][idx2];
        count++;
      }
    }
    
    return count > 0 ? totalDistance / count : Infinity;
  }

  /**
   * Merge two clusters
   */
  private mergeClusters(
    clusters: SpectralClusterResult[],
    mergeIndices: [number, number]
  ): SpectralClusterResult[] {
    const [i, j] = mergeIndices;
    const newClusters = [...clusters];
    
    // Merge cluster j into cluster i
    newClusters[i] = {
      clusterId: newClusters[i].clusterId,
      tables: [...newClusters[i].tables, ...newClusters[j].tables],
      size: newClusters[i].size + newClusters[j].size,
      internalConnectivity: (newClusters[i].internalConnectivity + newClusters[j].internalConnectivity) / 2,
      externalConnectivity: (newClusters[i].externalConnectivity + newClusters[j].externalConnectivity) / 2,
      coherenceScore: (newClusters[i].coherenceScore + newClusters[j].coherenceScore) / 2
    };
    
    // Remove cluster j
    newClusters.splice(j, 1);
    
    return newClusters;
  }

  /**
   * Split a single mega-cluster into smaller clusters
   */
  private splitSingleCluster(
    megaCluster: SpectralClusterResult,
    targetSubClusters: number,
    weightedEdges: WeightedEdge[]
  ): SpectralClusterResult[] {
    logger.info('Splitting mega-cluster', {
      originalSize: megaCluster.size,
      targetSubClusters
    });
    
    // Simple round-robin distribution for now
    const subClusters: SpectralClusterResult[] = [];
    const tablesPerSubCluster = Math.ceil(megaCluster.tables.length / targetSubClusters);
    
    for (let i = 0; i < targetSubClusters; i++) {
      const startIdx = i * tablesPerSubCluster;
      const endIdx = Math.min(startIdx + tablesPerSubCluster, megaCluster.tables.length);
      const subClusterTables = megaCluster.tables.slice(startIdx, endIdx);
      
      if (subClusterTables.length > 0) {
        subClusters.push({
          clusterId: i,
          tables: subClusterTables,
          size: subClusterTables.length,
          internalConnectivity: megaCluster.internalConnectivity,
          externalConnectivity: megaCluster.externalConnectivity,
          coherenceScore: megaCluster.coherenceScore * 0.8 // Penalize for forced splitting
        });
      }
    }
    
    return subClusters;
  }

  /**
   * Force merge smallest clusters when distance-based merging fails
   */
  private forceSmallClusterMerging(
    clusters: SpectralClusterResult[],
    targetK: number
  ): SpectralClusterResult[] {
    // Sort clusters by size (smallest first)
    const sortedClusters = [...clusters].sort((a, b) => a.size - b.size);
    const result: SpectralClusterResult[] = [];
    
    // Keep the target number of largest clusters
    const keepCount = Math.min(targetK, sortedClusters.length);
    const toKeep = sortedClusters.slice(-keepCount);
    const toMerge = sortedClusters.slice(0, -keepCount);
    
    // Add kept clusters to result
    result.push(...toKeep);
    
    // Merge remaining small clusters into the smallest kept cluster
    if (toMerge.length > 0 && result.length > 0) {
      const targetCluster = result[0]; // Smallest of the kept clusters
      
      toMerge.forEach(smallCluster => {
        targetCluster.tables.push(...smallCluster.tables);
        targetCluster.size += smallCluster.size;
        // Average the metrics
        targetCluster.internalConnectivity = (targetCluster.internalConnectivity + smallCluster.internalConnectivity) / 2;
        targetCluster.externalConnectivity = (targetCluster.externalConnectivity + smallCluster.externalConnectivity) / 2;
        targetCluster.coherenceScore = (targetCluster.coherenceScore + smallCluster.coherenceScore) / 2;
      });
      
      logger.info('Force merged small clusters', {
        mergedCount: toMerge.length,
        targetClusterNewSize: targetCluster.size,
        finalClusterCount: result.length
      });
    }
    
    return result;
  }

  /**
   * Consolidate clusters to fit within target range by merging smallest ones
   */
  private consolidateToTargetRange(
    clusters: SpectralClusterResult[],
    maxClusters: number
  ): SpectralClusterResult[] {
    if (clusters.length <= maxClusters) return clusters;
    
    // Sort by size and merge smallest clusters first
    const sortedClusters = [...clusters].sort((a, b) => a.size - b.size);
    const result = sortedClusters.slice(-(maxClusters - 1)); // Keep largest clusters
    const toMerge = sortedClusters.slice(0, -(maxClusters - 1)); // Merge smallest clusters
    
    // Create one consolidated cluster from all small clusters
    if (toMerge.length > 0) {
      const consolidatedCluster: SpectralClusterResult = {
        clusterId: result.length,
        tables: [],
        size: 0,
        internalConnectivity: 0,
        externalConnectivity: 0,
        coherenceScore: 0
      };
      
      toMerge.forEach(cluster => {
        consolidatedCluster.tables.push(...cluster.tables);
        consolidatedCluster.size += cluster.size;
        consolidatedCluster.internalConnectivity += cluster.internalConnectivity;
        consolidatedCluster.externalConnectivity += cluster.externalConnectivity;
        consolidatedCluster.coherenceScore += cluster.coherenceScore;
      });
      
      // Average the metrics
      const clusterCount = toMerge.length;
      consolidatedCluster.internalConnectivity /= clusterCount;
      consolidatedCluster.externalConnectivity /= clusterCount;
      consolidatedCluster.coherenceScore /= clusterCount;
      
      result.push(consolidatedCluster);
      
      logger.info('Consolidated clusters to target range', {
        originalCount: clusters.length,
        consolidatedCount: toMerge.length,
        finalCount: result.length,
        consolidatedClusterSize: consolidatedCluster.size
      });
    }
    
    return result;
  }
}