import { TableInfo, Relationship } from '../../../shared/schema';
import { Logger } from '../../utils/logger';

const logger = new Logger('ClusterValidationEngine');

// Comprehensive statistical validation engine for clustering quality assessment
export interface ClusterValidationResult {
  silhouetteScore: number;        // [-1, 1] Higher is better
  daviesBouldinIndex: number;     // [0, ∞) Lower is better  
  calinskiHarabaszIndex: number;  // [0, ∞) Higher is better
  dunnsIndex: number;             // [0, ∞) Higher is better
  adjustedRandIndex: number;      // [-1, 1] Higher is better (if ground truth available)
  internalValidation: {
    withinClusterSumSquares: number;
    betweenClusterSumSquares: number;
    totalSumSquares: number;
    explainedVariance: number;
  };
  clusterCoherence: ClusterCoherenceMetrics[];
  overallQuality: QualityAssessment;
}

export interface ClusterCoherenceMetrics {
  clusterId: number;
  internalConnectivity: number;   // How well connected tables are within cluster
  externalSeparation: number;     // How separated cluster is from others
  compactness: number;            // How compact the cluster is
  isolation: number;              // How isolated cluster is
  businessCoherence: number;      // Estimated business logic coherence
  sizeAppropriatenss: number;     // Whether cluster size is appropriate
}

export interface QualityAssessment {
  overallScore: number;           // [0, 1] Combined quality score
  isOptimal: boolean;             // Whether clustering is considered optimal
  recommendations: string[];      // Suggestions for improvement
  confidence: number;             // Confidence in assessment
  qualityGrade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Very Poor';
}

export interface ValidationInput {
  clusters: Array<{
    clusterId: number;
    tables: string[];
    size: number;
  }>;
  distanceMatrix?: number[][];
  tableNames?: string[];
  relationships?: Relationship[];
}

export class ClusterValidationEngine {
  private readonly EXCELLENT_THRESHOLD = 0.8;
  private readonly GOOD_THRESHOLD = 0.6;
  private readonly FAIR_THRESHOLD = 0.4;
  private readonly POOR_THRESHOLD = 0.2;

  private readonly TARGET_CLUSTER_RANGE = [8, 25];
  private readonly OPTIMAL_CLUSTER_SIZE_RANGE = [3, 20];

  /**
   * Perform comprehensive clustering validation using multiple statistical metrics
   */
  async validateClustering(
    tables: TableInfo[],
    relationships: Relationship[],
    input: ValidationInput
  ): Promise<ClusterValidationResult> {
    logger.info('Starting comprehensive cluster validation', {
      tableCount: tables.length,
      clusterCount: input.clusters.length,
      hasDistanceMatrix: !!input.distanceMatrix
    });

    // Build distance matrix if not provided
    const distanceMatrix = input.distanceMatrix || this.buildDistanceMatrix(tables, relationships);
    const tableNames = input.tableNames || tables.map(t => t.name);

    // Calculate core validation metrics
    const silhouetteScore = this.calculateSilhouetteScore(input.clusters, distanceMatrix, tableNames);
    const daviesBouldinIndex = this.calculateDaviesBouldinIndex(input.clusters, distanceMatrix, tableNames);
    const calinskiHarabaszIndex = this.calculateCalinskiHarabaszIndex(input.clusters, distanceMatrix, tableNames);
    const dunnsIndex = this.calculateDunnsIndex(input.clusters, distanceMatrix, tableNames);

    // Calculate internal validation metrics
    const internalValidation = this.calculateInternalValidation(input.clusters, distanceMatrix, tableNames);

    // Calculate cluster coherence metrics
    const clusterCoherence = await this.calculateClusterCoherence(
      input.clusters, 
      tables, 
      relationships, 
      distanceMatrix, 
      tableNames
    );

    // Overall quality assessment
    const overallQuality = this.assessOverallQuality(
      silhouetteScore,
      daviesBouldinIndex,
      calinskiHarabaszIndex,
      dunnsIndex,
      clusterCoherence,
      input.clusters.length
    );

    logger.info('Cluster validation complete', {
      silhouetteScore: silhouetteScore.toFixed(3),
      daviesBouldinIndex: daviesBouldinIndex.toFixed(3),
      calinskiHarabaszIndex: calinskiHarabaszIndex.toFixed(1),
      overallScore: overallQuality.overallScore.toFixed(3),
      qualityGrade: overallQuality.qualityGrade
    });

    return {
      silhouetteScore,
      daviesBouldinIndex,
      calinskiHarabaszIndex,
      dunnsIndex,
      adjustedRandIndex: -1, // Not calculated without ground truth
      internalValidation,
      clusterCoherence,
      overallQuality
    };
  }

  /**
   * Calculate Silhouette Score - measures how similar objects are within clusters
   * vs objects in other clusters. Range: [-1, 1], higher is better
   */
  private calculateSilhouetteScore(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const tableToCluster = new Map<string, number>();
    const clusterSizes = new Map<number, number>();

    // Build lookup maps
    clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        tableToCluster.set(table, cluster.clusterId);
      });
      clusterSizes.set(cluster.clusterId, cluster.size);
    });

    let totalSilhouette = 0;
    let validPoints = 0;

    tableNames.forEach((tableName, tableIdx) => {
      const ownClusterId = tableToCluster.get(tableName);
      const ownClusterSize = clusterSizes.get(ownClusterId!) || 0;

      // Skip if cluster has only one element
      if (ownClusterSize <= 1) return;

      // Calculate average distance to own cluster (a_i)
      let ownClusterDistance = 0;
      let ownClusterCount = 0;

      tableNames.forEach((otherTable, otherIdx) => {
        if (tableIdx === otherIdx) return;
        
        const otherClusterId = tableToCluster.get(otherTable);
        if (otherClusterId === ownClusterId) {
          ownClusterDistance += distanceMatrix[tableIdx][otherIdx];
          ownClusterCount++;
        }
      });

      const avgOwnDistance = ownClusterCount > 0 ? ownClusterDistance / ownClusterCount : 0;

      // Calculate minimum average distance to other clusters (b_i)
      const otherClusterDistances = new Map<number, number>();
      const otherClusterCounts = new Map<number, number>();

      tableNames.forEach((otherTable, otherIdx) => {
        if (tableIdx === otherIdx) return;
        
        const otherClusterId = tableToCluster.get(otherTable);
        if (otherClusterId !== ownClusterId) {
          const currentDistance = otherClusterDistances.get(otherClusterId!) || 0;
          const currentCount = otherClusterCounts.get(otherClusterId!) || 0;
          
          otherClusterDistances.set(otherClusterId!, currentDistance + distanceMatrix[tableIdx][otherIdx]);
          otherClusterCounts.set(otherClusterId!, currentCount + 1);
        }
      });

      let minOtherDistance = Infinity;
      otherClusterDistances.forEach((totalDistance, clusterId) => {
        const count = otherClusterCounts.get(clusterId) || 1;
        const avgDistance = totalDistance / count;
        minOtherDistance = Math.min(minOtherDistance, avgDistance);
      });

      if (minOtherDistance !== Infinity) {
        const silhouette = (minOtherDistance - avgOwnDistance) / Math.max(minOtherDistance, avgOwnDistance);
        totalSilhouette += silhouette;
        validPoints++;
      }
    });

    return validPoints > 0 ? totalSilhouette / validPoints : 0;
  }

  /**
   * Calculate Davies-Bouldin Index - measures average similarity between each cluster
   * and its most similar cluster. Range: [0, ∞), lower is better
   */
  private calculateDaviesBouldinIndex(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    if (clusters.length <= 1) return 0;

    const clusterCentroids = this.calculateClusterCentroids(clusters, distanceMatrix, tableNames);
    const clusterScatters = this.calculateClusterScatters(clusters, distanceMatrix, tableNames, clusterCentroids);

    let totalDB = 0;

    clusters.forEach((clusterI, i) => {
      let maxRatio = 0;

      clusters.forEach((clusterJ, j) => {
        if (i === j) return;

        const scatterI = clusterScatters[i];
        const scatterJ = clusterScatters[j];
        const separation = this.calculateCentroidDistance(clusterCentroids[i], clusterCentroids[j]);

        if (separation > 0) {
          const ratio = (scatterI + scatterJ) / separation;
          maxRatio = Math.max(maxRatio, ratio);
        }
      });

      totalDB += maxRatio;
    });

    return clusters.length > 0 ? totalDB / clusters.length : 0;
  }

  /**
   * Calculate Calinski-Harabasz Index (Variance Ratio Criterion)
   * Range: [0, ∞), higher is better
   */
  private calculateCalinskiHarabaszIndex(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const numClusters = clusters.length;
    const totalPoints = tableNames.length;

    if (numClusters <= 1 || totalPoints <= numClusters) return 0;

    const betweenSS = this.calculateBetweenClusterSumSquares(clusters, distanceMatrix, tableNames);
    const withinSS = this.calculateWithinClusterSumSquares(clusters, distanceMatrix, tableNames);

    if (withinSS === 0) return 0;

    return (betweenSS / (numClusters - 1)) / (withinSS / (totalPoints - numClusters));
  }

  /**
   * Calculate Dunn's Index - ratio of minimum inter-cluster distance to maximum intra-cluster distance
   * Range: [0, ∞), higher is better
   */
  private calculateDunnsIndex(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    if (clusters.length <= 1) return 0;

    // Find minimum inter-cluster distance
    let minInterClusterDistance = Infinity;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const distance = this.calculateInterClusterDistance(
          clusters[i], 
          clusters[j], 
          distanceMatrix, 
          tableNames
        );
        minInterClusterDistance = Math.min(minInterClusterDistance, distance);
      }
    }

    // Find maximum intra-cluster distance
    let maxIntraClusterDistance = 0;

    clusters.forEach(cluster => {
      const distance = this.calculateIntraClusterDistance(cluster, distanceMatrix, tableNames);
      maxIntraClusterDistance = Math.max(maxIntraClusterDistance, distance);
    });

    if (maxIntraClusterDistance === 0 || minInterClusterDistance === Infinity) return 0;

    return minInterClusterDistance / maxIntraClusterDistance;
  }

  /**
   * Calculate internal validation metrics (WCSS, BCSS, TSS, Explained Variance)
   */
  private calculateInternalValidation(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): ClusterValidationResult['internalValidation'] {
    const withinClusterSumSquares = this.calculateWithinClusterSumSquares(clusters, distanceMatrix, tableNames);
    const betweenClusterSumSquares = this.calculateBetweenClusterSumSquares(clusters, distanceMatrix, tableNames);
    const totalSumSquares = withinClusterSumSquares + betweenClusterSumSquares;
    
    const explainedVariance = totalSumSquares > 0 ? betweenClusterSumSquares / totalSumSquares : 0;

    return {
      withinClusterSumSquares,
      betweenClusterSumSquares,
      totalSumSquares,
      explainedVariance
    };
  }

  /**
   * Calculate detailed coherence metrics for each cluster
   */
  private async calculateClusterCoherence(
    clusters: ValidationInput['clusters'],
    tables: TableInfo[],
    relationships: Relationship[],
    distanceMatrix: number[][],
    tableNames: string[]
  ): Promise<ClusterCoherenceMetrics[]> {
    const tableMap = new Map(tables.map(t => [t.name, t]));

    return clusters.map(cluster => {
      const clusterTables = cluster.tables.map(name => tableMap.get(name)!).filter(Boolean);
      
      // Internal connectivity - how well connected are tables within cluster
      const internalConnectivity = this.calculateInternalConnectivity(
        cluster, relationships, tableNames
      );

      // External separation - how separated is cluster from others
      const externalSeparation = this.calculateExternalSeparation(
        cluster, clusters, distanceMatrix, tableNames
      );

      // Compactness - how compact is the cluster in distance space
      const compactness = this.calculateCompactness(cluster, distanceMatrix, tableNames);

      // Isolation - how isolated is cluster from others
      const isolation = this.calculateIsolation(
        cluster, clusters, distanceMatrix, tableNames
      );

      // Business coherence - estimated coherence based on table characteristics
      const businessCoherence = this.calculateBusinessCoherence(clusterTables);

      // Size appropriateness - whether cluster size is in optimal range
      const sizeAppropriatenss = this.calculateSizeAppropriateness(cluster.size);

      return {
        clusterId: cluster.clusterId,
        internalConnectivity,
        externalSeparation,
        compactness,
        isolation,
        businessCoherence,
        sizeAppropriatenss
      };
    });
  }

  /**
   * Calculate internal connectivity of a cluster
   */
  private calculateInternalConnectivity(
    cluster: ValidationInput['clusters'][0],
    relationships: Relationship[],
    tableNames: string[]
  ): number {
    const clusterTableSet = new Set(cluster.tables);
    const clusterSize = cluster.tables.length;

    if (clusterSize <= 1) return 1.0;

    // Count internal relationships
    let internalConnections = 0;
    let possibleConnections = (clusterSize * (clusterSize - 1)) / 2;

    relationships.forEach(rel => {
      if (clusterTableSet.has(rel.sourceTable) && clusterTableSet.has(rel.targetTable)) {
        internalConnections++;
      }
    });

    return possibleConnections > 0 ? internalConnections / possibleConnections : 0;
  }

  /**
   * Calculate external separation of cluster
   */
  private calculateExternalSeparation(
    cluster: ValidationInput['clusters'][0],
    allClusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const clusterIndices = cluster.tables
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    const otherIndices = allClusters
      .filter(c => c.clusterId !== cluster.clusterId)
      .flatMap(c => c.tables)
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    if (clusterIndices.length === 0 || otherIndices.length === 0) return 1.0;

    // Calculate minimum distance to external points
    let totalMinDistance = 0;
    
    clusterIndices.forEach(clusterIdx => {
      let minDistance = Infinity;
      
      otherIndices.forEach(otherIdx => {
        const distance = distanceMatrix[clusterIdx][otherIdx];
        minDistance = Math.min(minDistance, distance);
      });
      
      if (minDistance !== Infinity) {
        totalMinDistance += minDistance;
      }
    });

    return clusterIndices.length > 0 ? totalMinDistance / clusterIndices.length : 0;
  }

  /**
   * Calculate cluster compactness
   */
  private calculateCompactness(
    cluster: ValidationInput['clusters'][0],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const clusterIndices = cluster.tables
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    if (clusterIndices.length <= 1) return 1.0;

    // Calculate average internal distance
    let totalDistance = 0;
    let pairCount = 0;

    for (let i = 0; i < clusterIndices.length; i++) {
      for (let j = i + 1; j < clusterIndices.length; j++) {
        totalDistance += distanceMatrix[clusterIndices[i]][clusterIndices[j]];
        pairCount++;
      }
    }

    const avgInternalDistance = pairCount > 0 ? totalDistance / pairCount : 0;
    
    // Convert to compactness score (lower distance = higher compactness)
    return Math.max(0, 1 - avgInternalDistance);
  }

  /**
   * Calculate cluster isolation
   */
  private calculateIsolation(
    cluster: ValidationInput['clusters'][0],
    allClusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    if (allClusters.length <= 1) return 1.0;

    const clusterIndices = cluster.tables
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    // Calculate average distance to all other clusters
    let totalDistance = 0;
    let clusterCount = 0;

    allClusters.forEach(otherCluster => {
      if (otherCluster.clusterId === cluster.clusterId) return;

      const otherIndices = otherCluster.tables
        .map(table => tableNames.indexOf(table))
        .filter(idx => idx !== -1);

      if (otherIndices.length === 0) return;

      // Calculate average distance between clusters
      let interClusterDistance = 0;
      let pairCount = 0;

      clusterIndices.forEach(clusterIdx => {
        otherIndices.forEach(otherIdx => {
          interClusterDistance += distanceMatrix[clusterIdx][otherIdx];
          pairCount++;
        });
      });

      if (pairCount > 0) {
        totalDistance += interClusterDistance / pairCount;
        clusterCount++;
      }
    });

    return clusterCount > 0 ? totalDistance / clusterCount : 0;
  }

  /**
   * Calculate business coherence based on table characteristics
   */
  private calculateBusinessCoherence(tables: TableInfo[]): number {
    if (tables.length === 0) return 0;

    // Analyze structural similarity
    const structuralScore = this.analyzeStructuralSimilarity(tables);
    
    // Analyze naming patterns (mathematical, not linguistic)
    const namingScore = this.analyzeNamingPatterns(tables);
    
    // Analyze data type consistency
    const dataTypeScore = this.analyzeDataTypeConsistency(tables);
    
    // Analyze constraint consistency
    const constraintScore = this.analyzeConstraintConsistency(tables);

    return (
      structuralScore * 0.3 +
      namingScore * 0.2 +
      dataTypeScore * 0.25 +
      constraintScore * 0.25
    );
  }

  /**
   * Analyze structural similarity between tables
   */
  private analyzeStructuralSimilarity(tables: TableInfo[]): number {
    if (tables.length <= 1) return 1.0;

    const columnCounts = tables.map(t => t.columns.length);
    const avgColumnCount = columnCounts.reduce((sum, count) => sum + count, 0) / tables.length;
    
    // Calculate coefficient of variation
    const variance = columnCounts.reduce((sum, count) => sum + (count - avgColumnCount) ** 2, 0) / tables.length;
    const stdDev = Math.sqrt(variance);
    const coeffVariation = avgColumnCount > 0 ? stdDev / avgColumnCount : 0;
    
    // Lower variation = higher similarity
    return Math.max(0, 1 - coeffVariation);
  }

  /**
   * Analyze naming patterns (mathematical approach)
   */
  private analyzeNamingPatterns(tables: TableInfo[]): number {
    if (tables.length <= 1) return 1.0;

    // Calculate average string length similarity
    const lengths = tables.map(t => t.name.length);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const lengthVariation = lengths.reduce((sum, len) => sum + Math.abs(len - avgLength), 0) / lengths.length;
    const lengthScore = Math.max(0, 1 - (lengthVariation / avgLength));

    // Calculate character set similarity
    const charSets = tables.map(t => new Set(t.name.toLowerCase().split('')));
    let totalOverlap = 0;
    let pairCount = 0;

    for (let i = 0; i < charSets.length; i++) {
      for (let j = i + 1; j < charSets.length; j++) {
        const intersection = new Set([...charSets[i]].filter(c => charSets[j].has(c)));
        const union = new Set([...charSets[i], ...charSets[j]]);
        const overlap = union.size > 0 ? intersection.size / union.size : 0;
        totalOverlap += overlap;
        pairCount++;
      }
    }

    const charScore = pairCount > 0 ? totalOverlap / pairCount : 0;

    return (lengthScore + charScore) / 2;
  }

  /**
   * Analyze data type consistency
   */
  private analyzeDataTypeConsistency(tables: TableInfo[]): number {
    if (tables.length === 0) return 0;

    // Get data type distributions for each table
    const distributions = tables.map(table => this.getDataTypeDistribution(table));
    
    // Calculate average pairwise similarity
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < distributions.length; i++) {
      for (let j = i + 1; j < distributions.length; j++) {
        const similarity = this.calculateDistributionSimilarity(distributions[i], distributions[j]);
        totalSimilarity += similarity;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
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
   * Calculate distribution similarity using cosine similarity
   */
  private calculateDistributionSimilarity(
    dist1: Map<string, number>, 
    dist2: Map<string, number>
  ): number {
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
   * Analyze constraint consistency
   */
  private analyzeConstraintConsistency(tables: TableInfo[]): number {
    if (tables.length === 0) return 0;

    // Calculate constraint patterns for each table
    const patterns = tables.map(table => this.getConstraintPattern(table));
    
    // Calculate average similarity
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const similarity = this.calculateDistributionSimilarity(patterns[i], patterns[j]);
        totalSimilarity += similarity;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
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

    pattern.set('primary_key', primaryKeyCount / totalColumns);
    pattern.set('foreign_key', foreignKeyCount / totalColumns);
    pattern.set('unique', uniqueCount / totalColumns);
    pattern.set('nullable', nullableCount / totalColumns);

    return pattern;
  }

  /**
   * Calculate size appropriateness score
   */
  private calculateSizeAppropriateness(clusterSize: number): number {
    if (clusterSize >= this.OPTIMAL_CLUSTER_SIZE_RANGE[0] && 
        clusterSize <= this.OPTIMAL_CLUSTER_SIZE_RANGE[1]) {
      return 1.0;
    }

    // Calculate distance from optimal range
    const distanceFromOptimal = Math.min(
      Math.abs(clusterSize - this.OPTIMAL_CLUSTER_SIZE_RANGE[0]),
      Math.abs(clusterSize - this.OPTIMAL_CLUSTER_SIZE_RANGE[1])
    );

    // Penalty decreases linearly with distance
    return Math.max(0, 1 - (distanceFromOptimal / 15));
  }

  /**
   * Assess overall clustering quality
   */
  private assessOverallQuality(
    silhouetteScore: number,
    daviesBouldinIndex: number,
    calinskiHarabaszIndex: number,
    dunnsIndex: number,
    clusterCoherence: ClusterCoherenceMetrics[],
    clusterCount: number
  ): QualityAssessment {
    // Normalize metrics to [0, 1] scale
    const normalizedSilhouette = (silhouetteScore + 1) / 2; // [-1, 1] -> [0, 1]
    const normalizedDB = Math.max(0, 1 - daviesBouldinIndex / 5); // Lower is better
    const normalizedCH = Math.min(1, calinskiHarabaszIndex / 1000); // Higher is better
    const normalizedDunn = Math.min(1, dunnsIndex); // Higher is better

    // Calculate average cluster coherence
    const avgCoherence = clusterCoherence.length > 0
      ? clusterCoherence.reduce((sum, c) => sum + (
          c.internalConnectivity * 0.3 +
          c.externalSeparation * 0.2 +
          c.compactness * 0.2 +
          c.businessCoherence * 0.2 +
          c.sizeAppropriatenss * 0.1
        ), 0) / clusterCoherence.length
      : 0;

    // Cluster count score
    const clusterCountScore = (clusterCount >= this.TARGET_CLUSTER_RANGE[0] && 
                             clusterCount <= this.TARGET_CLUSTER_RANGE[1]) 
      ? 1.0 
      : Math.max(0, 1 - Math.abs(clusterCount - 15) / 20);

    // Combined score
    const overallScore = (
      normalizedSilhouette * 0.25 +
      normalizedDB * 0.2 +
      normalizedCH * 0.15 +
      normalizedDunn * 0.1 +
      avgCoherence * 0.2 +
      clusterCountScore * 0.1
    );

    // Determine quality grade
    let qualityGrade: QualityAssessment['qualityGrade'];
    if (overallScore >= this.EXCELLENT_THRESHOLD) qualityGrade = 'Excellent';
    else if (overallScore >= this.GOOD_THRESHOLD) qualityGrade = 'Good';
    else if (overallScore >= this.FAIR_THRESHOLD) qualityGrade = 'Fair';
    else if (overallScore >= this.POOR_THRESHOLD) qualityGrade = 'Poor';
    else qualityGrade = 'Very Poor';

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      silhouetteScore,
      daviesBouldinIndex,
      calinskiHarabaszIndex,
      clusterCount,
      clusterCoherence
    );

    // Calculate confidence
    const confidence = this.calculateConfidence(overallScore, clusterCoherence);

    return {
      overallScore,
      isOptimal: overallScore >= this.GOOD_THRESHOLD,
      recommendations,
      confidence,
      qualityGrade
    };
  }

  /**
   * Generate specific recommendations for improvement
   */
  private generateRecommendations(
    silhouetteScore: number,
    daviesBouldinIndex: number,
    calinskiHarabaszIndex: number,
    clusterCount: number,
    clusterCoherence: ClusterCoherenceMetrics[]
  ): string[] {
    const recommendations: string[] = [];

    if (silhouetteScore < 0.3) {
      recommendations.push('Low silhouette score suggests overlapping clusters. Consider adjusting clustering parameters or using different distance metrics.');
    }

    if (daviesBouldinIndex > 2.0) {
      recommendations.push('High Davies-Bouldin index indicates poor cluster separation. Consider increasing number of clusters or improving feature selection.');
    }

    if (calinskiHarabaszIndex < 100) {
      recommendations.push('Low Calinski-Harabasz index suggests weak cluster structure. Consider reducing noise or improving data preprocessing.');
    }

    if (clusterCount < this.TARGET_CLUSTER_RANGE[0]) {
      recommendations.push(`Too few clusters (${clusterCount}). Consider decreasing clustering resolution or using more sensitive algorithms.`);
    } else if (clusterCount > this.TARGET_CLUSTER_RANGE[1]) {
      recommendations.push(`Too many clusters (${clusterCount}). Consider increasing clustering resolution or merging similar clusters.`);
    }

    // Analyze cluster-specific issues
    const smallClusters = clusterCoherence.filter(c => c.sizeAppropriatenss < 0.5);
    if (smallClusters.length > clusterCoherence.length * 0.3) {
      recommendations.push('Many clusters are too small or too large. Consider adjusting minimum cluster size parameters.');
    }

    const lowCoherence = clusterCoherence.filter(c => c.businessCoherence < 0.4);
    if (lowCoherence.length > clusterCoherence.length * 0.4) {
      recommendations.push('Multiple clusters have low business coherence. Consider incorporating domain knowledge or semantic features.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Clustering quality is good. Consider fine-tuning parameters for potential improvements.');
    }

    return recommendations;
  }

  /**
   * Calculate confidence in the quality assessment
   */
  private calculateConfidence(
    overallScore: number,
    clusterCoherence: ClusterCoherenceMetrics[]
  ): number {
    // Base confidence on score consistency and cluster uniformity
    const scoreConfidence = Math.min(1, overallScore * 1.2);
    
    // Calculate cluster consistency
    if (clusterCoherence.length === 0) return scoreConfidence;
    
    const coherenceScores = clusterCoherence.map(c => 
      (c.internalConnectivity + c.externalSeparation + c.compactness + c.businessCoherence) / 4
    );
    
    const avgCoherence = coherenceScores.reduce((sum, score) => sum + score, 0) / coherenceScores.length;
    const coherenceVariance = coherenceScores.reduce((sum, score) => sum + (score - avgCoherence) ** 2, 0) / coherenceScores.length;
    const coherenceConsistency = Math.max(0, 1 - Math.sqrt(coherenceVariance));
    
    return (scoreConfidence + coherenceConsistency) / 2;
  }

  // Utility methods for distance calculations
  private buildDistanceMatrix(tables: TableInfo[], relationships: Relationship[]): number[][] {
    const tableCount = tables.length;
    const matrix = Array(tableCount).fill(null).map(() => Array(tableCount).fill(1));
    const tableIndexMap = new Map(tables.map((table, idx) => [table.name, idx]));

    // Set distance based on relationships (closer = lower distance)
    relationships.forEach(rel => {
      const sourceIdx = tableIndexMap.get(rel.sourceTable);
      const targetIdx = tableIndexMap.get(rel.targetTable);

      if (sourceIdx !== undefined && targetIdx !== undefined) {
        const distance = 0.2; // Connected tables are close
        matrix[sourceIdx][targetIdx] = distance;
        matrix[targetIdx][sourceIdx] = distance;
      }
    });

    // Set diagonal to 0
    for (let i = 0; i < tableCount; i++) {
      matrix[i][i] = 0;
    }

    return matrix;
  }

  private calculateClusterCentroids(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number[][] {
    return clusters.map(cluster => {
      const clusterIndices = cluster.tables
        .map(table => tableNames.indexOf(table))
        .filter(idx => idx !== -1);

      if (clusterIndices.length === 0) return [];

      const centroid = new Array(distanceMatrix.length).fill(0);
      
      clusterIndices.forEach(idx => {
        for (let i = 0; i < distanceMatrix.length; i++) {
          centroid[i] += distanceMatrix[idx][i] / clusterIndices.length;
        }
      });

      return centroid;
    });
  }

  private calculateClusterScatters(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[],
    centroids: number[][]
  ): number[] {
    return clusters.map((cluster, clusterIdx) => {
      const clusterIndices = cluster.tables
        .map(table => tableNames.indexOf(table))
        .filter(idx => idx !== -1);

      if (clusterIndices.length === 0 || !centroids[clusterIdx]) return 0;

      const centroid = centroids[clusterIdx];
      
      return clusterIndices.reduce((sum, idx) => {
        const distance = this.calculateCentroidDistance(distanceMatrix[idx], centroid);
        return sum + distance;
      }, 0) / clusterIndices.length;
    });
  }

  private calculateCentroidDistance(point1: number[], point2: number[]): number {
    return Math.sqrt(
      point1.reduce((sum, val, idx) => sum + (val - point2[idx]) ** 2, 0)
    );
  }

  private calculateBetweenClusterSumSquares(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const allIndices = clusters.flatMap(cluster => 
      cluster.tables
        .map(table => tableNames.indexOf(table))
        .filter(idx => idx !== -1)
    );

    if (allIndices.length === 0) return 0;

    // Calculate overall centroid
    const overallCentroid = new Array(distanceMatrix.length).fill(0);
    allIndices.forEach(idx => {
      for (let i = 0; i < distanceMatrix.length; i++) {
        overallCentroid[i] += distanceMatrix[idx][i] / allIndices.length;
      }
    });

    // Calculate cluster centroids and sum squares
    return clusters.reduce((sum, cluster) => {
      const clusterIndices = cluster.tables
        .map(table => tableNames.indexOf(table))
        .filter(idx => idx !== -1);

      if (clusterIndices.length === 0) return sum;

      const clusterCentroid = new Array(distanceMatrix.length).fill(0);
      clusterIndices.forEach(idx => {
        for (let i = 0; i < distanceMatrix.length; i++) {
          clusterCentroid[i] += distanceMatrix[idx][i] / clusterIndices.length;
        }
      });

      const distance = this.calculateCentroidDistance(clusterCentroid, overallCentroid);
      return sum + cluster.size * (distance ** 2);
    }, 0);
  }

  private calculateWithinClusterSumSquares(
    clusters: ValidationInput['clusters'],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    return clusters.reduce((sum, cluster) => {
      const clusterIndices = cluster.tables
        .map(table => tableNames.indexOf(table))
        .filter(idx => idx !== -1);

      if (clusterIndices.length <= 1) return sum;

      // Calculate cluster centroid
      const centroid = new Array(distanceMatrix.length).fill(0);
      clusterIndices.forEach(idx => {
        for (let i = 0; i < distanceMatrix.length; i++) {
          centroid[i] += distanceMatrix[idx][i] / clusterIndices.length;
        }
      });

      // Sum squared distances to centroid
      return sum + clusterIndices.reduce((clusterSum, idx) => {
        const distance = this.calculateCentroidDistance(distanceMatrix[idx], centroid);
        return clusterSum + (distance ** 2);
      }, 0);
    }, 0);
  }

  private calculateInterClusterDistance(
    cluster1: ValidationInput['clusters'][0],
    cluster2: ValidationInput['clusters'][0],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const indices1 = cluster1.tables
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    const indices2 = cluster2.tables
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    if (indices1.length === 0 || indices2.length === 0) return Infinity;

    let minDistance = Infinity;

    indices1.forEach(idx1 => {
      indices2.forEach(idx2 => {
        const distance = distanceMatrix[idx1][idx2];
        minDistance = Math.min(minDistance, distance);
      });
    });

    return minDistance;
  }

  private calculateIntraClusterDistance(
    cluster: ValidationInput['clusters'][0],
    distanceMatrix: number[][],
    tableNames: string[]
  ): number {
    const clusterIndices = cluster.tables
      .map(table => tableNames.indexOf(table))
      .filter(idx => idx !== -1);

    if (clusterIndices.length <= 1) return 0;

    let maxDistance = 0;

    for (let i = 0; i < clusterIndices.length; i++) {
      for (let j = i + 1; j < clusterIndices.length; j++) {
        const distance = distanceMatrix[clusterIndices[i]][clusterIndices[j]];
        maxDistance = Math.max(maxDistance, distance);
      }
    }

    return maxDistance;
  }
}