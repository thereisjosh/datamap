import { TableInfo } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { AdaptiveDBSCANResult, DBSCANCluster } from './AdaptiveDBSCANCluster';
import { MultiResolutionResult } from './MultiResolutionDBSCAN';
import { Logger } from '../../utils/logger';

const logger = new Logger('DBSCANValidationPipeline');

/**
 * Comprehensive validation pipeline for DBSCAN clustering results
 * specifically designed for database ERD structures.
 */

export interface ValidationResult {
  isValid: boolean;
  overallScore: number;
  metrics: {
    structuralValidity: StructuralValidation;
    semanticCoherence: SemanticValidation;
    graphQuality: GraphQualityMetrics;
    businessConstraints: BusinessValidation;
  };
  issues: ValidationIssue[];
  recommendations: string[];
}

export interface StructuralValidation {
  score: number;
  clusterSizeDistribution: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    outliers: number;
  };
  coverageRatio: number;
  noiseRatio: number;
  hubDistribution: {
    isolated: number;
    wellConnected: number;
    overConnected: number;
  };
}

export interface SemanticValidation {
  score: number;
  referentialIntegrity: number;
  foreignKeyPreservation: number;
  cardinalityConsistency: number;
  dataTypeHomogeneity: number;
}

export interface GraphQualityMetrics {
  score: number;
  modularity: number;
  conductance: number;
  coverage: number;
  performance: number;
  separability: number;
  compactness: number;
}

export interface BusinessValidation {
  score: number;
  crossDomainReferences: number;
  orphanedTables: number;
  circularDependencies: number;
  constraintViolations: number;
}

export interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  type: string;
  message: string;
  affectedClusters?: number[];
  affectedTables?: string[];
}

export class DBSCANValidationPipeline {
  // Validation thresholds
  private readonly MIN_CLUSTER_SIZE = 2;
  private readonly MAX_CLUSTER_SIZE = 50;
  private readonly MAX_NOISE_RATIO = 0.25;
  private readonly MIN_COVERAGE_RATIO = 0.75;
  private readonly MIN_MODULARITY = 0.3;
  private readonly MIN_SEMANTIC_SCORE = 0.6;

  /**
   * Main validation entry point
   */
  async validate(
    clusteringResult: AdaptiveDBSCANResult | MultiResolutionResult,
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<ValidationResult> {
    logger.info('Starting clustering validation', {
      clusterCount: this.getClusterCount(clusteringResult),
      tableCount: tables.length,
      edgeCount: edges.length
    });

    // Extract clusters based on result type
    const clusters = this.extractClusters(clusteringResult);
    const noise = this.extractNoise(clusteringResult);

    // Perform validations
    const structuralValidation = this.validateStructure(clusters, noise, tables);
    const semanticValidation = await this.validateSemantics(clusters, tables, edges);
    const graphQuality = this.calculateGraphQuality(clusters, edges, tables);
    const businessValidation = this.validateBusinessConstraints(clusters, tables, edges);

    // Calculate overall score
    const overallScore = this.calculateOverallScore({
      structuralValidity: structuralValidation,
      semanticCoherence: semanticValidation,
      graphQuality,
      businessConstraints: businessValidation
    });

    // Identify issues
    const issues = this.identifyIssues(
      structuralValidation,
      semanticValidation,
      graphQuality,
      businessValidation,
      clusters
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      issues,
      structuralValidation,
      semanticValidation,
      graphQuality
    );

    const isValid = overallScore >= 0.6 && 
                   !issues.some(issue => issue.severity === 'critical');

    logger.info('Validation complete', {
      isValid,
      overallScore: overallScore.toFixed(3),
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      warnings: issues.filter(i => i.severity === 'warning').length
    });

    return {
      isValid,
      overallScore,
      metrics: {
        structuralValidity: structuralValidation,
        semanticCoherence: semanticValidation,
        graphQuality,
        businessConstraints: businessValidation
      },
      issues,
      recommendations
    };
  }

  /**
   * Validate structural properties of clustering
   */
  private validateStructure(
    clusters: any[],
    noise: string[],
    tables: TableInfo[]
  ): StructuralValidation {
    const clusterSizes = clusters.map(c => c.tables?.length || c.size || 0);
    const totalTables = tables.length;
    const clusteredTables = clusterSizes.reduce((sum, size) => sum + size, 0);

    // Calculate size distribution
    const sizeDistribution = this.calculateSizeDistribution(clusterSizes);

    // Calculate coverage and noise ratios
    const coverageRatio = clusteredTables / totalTables;
    const noiseRatio = noise.length / totalTables;

    // Analyze hub distribution
    const hubDistribution = this.analyzeHubDistribution(clusters, tables, clusterSizes);

    // Calculate structural score
    let score = 1.0;

    // Penalize for poor size distribution
    if (sizeDistribution.min < this.MIN_CLUSTER_SIZE) score -= 0.2;
    if (sizeDistribution.max > this.MAX_CLUSTER_SIZE) score -= 0.1;
    if (sizeDistribution.outliers > clusters.length * 0.2) score -= 0.15;

    // Penalize for poor coverage
    if (coverageRatio < this.MIN_COVERAGE_RATIO) {
      score -= (this.MIN_COVERAGE_RATIO - coverageRatio) * 0.5;
    }

    // Penalize for excessive noise
    if (noiseRatio > this.MAX_NOISE_RATIO) {
      score -= (noiseRatio - this.MAX_NOISE_RATIO) * 0.5;
    }

    // Penalize for poor hub distribution
    if (hubDistribution.isolated > hubDistribution.wellConnected) score -= 0.1;
    if (hubDistribution.overConnected > clusters.length * 0.3) score -= 0.1;

    return {
      score: Math.max(0, score),
      clusterSizeDistribution: sizeDistribution,
      coverageRatio,
      noiseRatio,
      hubDistribution
    };
  }

  /**
   * Calculate size distribution statistics
   */
  private calculateSizeDistribution(sizes: number[]): StructuralValidation['clusterSizeDistribution'] {
    if (sizes.length === 0) {
      return { min: 0, max: 0, mean: 0, stdDev: 0, outliers: 0 };
    }

    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    const mean = sizes.reduce((sum, s) => sum + s, 0) / sizes.length;
    
    const variance = sizes.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sizes.length;
    const stdDev = Math.sqrt(variance);

    // Count outliers (beyond 2 standard deviations)
    const outliers = sizes.filter(s => 
      Math.abs(s - mean) > 2 * stdDev
    ).length;

    return { min, max, mean, stdDev, outliers };
  }

  /**
   * Analyze hub table distribution across clusters
   */
  private analyzeHubDistribution(
    clusters: any[],
    tables: TableInfo[],
    clusterSizes: number[]
  ): StructuralValidation['hubDistribution'] {
    // Simple heuristic: tables with high FK count are potential hubs
    const hubTables = tables.filter(table => {
      const fkCount = table.columns.filter(c => c.isForeignKey).length;
      return fkCount >= 3 || (fkCount >= 2 && table.columns.length <= 5);
    });

    let isolated = 0;
    let wellConnected = 0;
    let overConnected = 0;

    hubTables.forEach(hub => {
      const containingClusters = clusters.filter(cluster => 
        (cluster.tables || []).includes(hub.name)
      ).length;

      if (containingClusters === 0) isolated++;
      else if (containingClusters === 1) wellConnected++;
      else overConnected++;
    });

    return { isolated, wellConnected, overConnected };
  }

  /**
   * Validate semantic coherence of clusters
   */
  private async validateSemantics(
    clusters: any[],
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<SemanticValidation> {
    // Build lookup structures
    const tableMap = new Map(tables.map(t => [t.name, t]));
    const clusterMap = new Map<string, number>();
    
    clusters.forEach((cluster, idx) => {
      (cluster.tables || []).forEach((tableName: string) => {
        clusterMap.set(tableName, idx);
      });
    });

    // Validate referential integrity
    const referentialIntegrity = this.validateReferentialIntegrity(
      edges,
      clusterMap
    );

    // Validate foreign key preservation
    const foreignKeyPreservation = this.validateForeignKeyPreservation(
      tables,
      clusterMap
    );

    // Validate cardinality consistency
    const cardinalityConsistency = this.validateCardinalityConsistency(
      clusters,
      tableMap,
      edges
    );

    // Validate data type homogeneity
    const dataTypeHomogeneity = this.validateDataTypeHomogeneity(
      clusters,
      tableMap
    );

    // Calculate overall semantic score
    const score = (
      referentialIntegrity * 0.4 +
      foreignKeyPreservation * 0.3 +
      cardinalityConsistency * 0.2 +
      dataTypeHomogeneity * 0.1
    );

    return {
      score,
      referentialIntegrity,
      foreignKeyPreservation,
      cardinalityConsistency,
      dataTypeHomogeneity
    };
  }

  /**
   * Validate that FK relationships are preserved within clusters
   */
  private validateReferentialIntegrity(
    edges: WeightedEdge[],
    clusterMap: Map<string, number>
  ): number {
    if (edges.length === 0) return 1;

    let preservedRelationships = 0;
    let totalRelationships = 0;

    edges.forEach(edge => {
      const sourceCluster = clusterMap.get(edge.source);
      const targetCluster = clusterMap.get(edge.target);

      if (sourceCluster !== undefined && targetCluster !== undefined) {
        totalRelationships++;
        if (sourceCluster === targetCluster) {
          preservedRelationships++;
        }
      }
    });

    return totalRelationships > 0 ? preservedRelationships / totalRelationships : 1;
  }

  /**
   * Validate that tables with FKs are clustered with their references
   */
  private validateForeignKeyPreservation(
    tables: TableInfo[],
    clusterMap: Map<string, number>
  ): number {
    let wellPlacedTables = 0;
    let tablesWithFKs = 0;

    tables.forEach(table => {
      const fkColumns = table.columns.filter(c => c.isForeignKey);
      if (fkColumns.length === 0) return;

      tablesWithFKs++;
      const tableCluster = clusterMap.get(table.name);

      if (tableCluster !== undefined) {
        // Check if referenced tables are in the same cluster
        const referencedClusters = new Set<number>();
        
        fkColumns.forEach(fk => {
          if (fk.references) {
            const refCluster = clusterMap.get(fk.references.table);
            if (refCluster !== undefined) {
              referencedClusters.add(refCluster);
            }
          }
        });

        // Table is well-placed if all references are in same cluster
        if (referencedClusters.size <= 1 && 
            (referencedClusters.size === 0 || referencedClusters.has(tableCluster))) {
          wellPlacedTables++;
        }
      }
    });

    return tablesWithFKs > 0 ? wellPlacedTables / tablesWithFKs : 1;
  }

  /**
   * Validate cardinality patterns within clusters
   */
  private validateCardinalityConsistency(
    clusters: any[],
    tableMap: Map<string, TableInfo>,
    edges: WeightedEdge[]
  ): number {
    let totalScore = 0;
    let clusterCount = 0;

    clusters.forEach(cluster => {
      const clusterTables = cluster.tables || [];
      if (clusterTables.length < 2) return;

      clusterCount++;
      
      // Analyze table size variations within cluster
      const tableSizes = clusterTables
        .map((name: string) => tableMap.get(name)?.columns.length || 0)
        .filter((size: number) => size > 0);

      if (tableSizes.length === 0) {
        totalScore += 0.5;
        return;
      }

      const avgSize = tableSizes.reduce((sum: number, s: number) => sum + s, 0) / tableSizes.length;
      const sizeVariance = tableSizes.reduce((sum: number, s: number) => 
        sum + Math.pow(s - avgSize, 2), 0
      ) / tableSizes.length;
      const sizeCV = Math.sqrt(sizeVariance) / avgSize; // Coefficient of variation

      // Lower CV indicates more consistent cardinality
      const consistencyScore = 1 / (1 + sizeCV);
      totalScore += consistencyScore;
    });

    return clusterCount > 0 ? totalScore / clusterCount : 1;
  }

  /**
   * Validate data type homogeneity within clusters
   */
  private validateDataTypeHomogeneity(
    clusters: any[],
    tableMap: Map<string, TableInfo>
  ): number {
    let totalScore = 0;
    let clusterCount = 0;

    clusters.forEach(cluster => {
      const clusterTables = cluster.tables || [];
      if (clusterTables.length < 2) return;

      clusterCount++;

      // Collect all data types in cluster
      const typeDistributions: Map<string, number>[] = [];

      clusterTables.forEach((tableName: string) => {
        const table = tableMap.get(tableName);
        if (!table) return;

        const typeDist = new Map<string, number>();
        table.columns.forEach(col => {
          const normalizedType = this.normalizeDataType(col.type);
          typeDist.set(normalizedType, (typeDist.get(normalizedType) || 0) + 1);
        });

        // Convert to proportions
        const total = table.columns.length;
        typeDist.forEach((count, type) => {
          typeDist.set(type, count / total);
        });

        typeDistributions.push(typeDist);
      });

      // Calculate average similarity between type distributions
      const homogeneityScore = this.calculateDistributionSimilarity(typeDistributions);
      totalScore += homogeneityScore;
    });

    return clusterCount > 0 ? totalScore / clusterCount : 1;
  }

  /**
   * Calculate similarity between multiple distributions
   */
  private calculateDistributionSimilarity(distributions: Map<string, number>[]): number {
    if (distributions.length < 2) return 1;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < distributions.length; i++) {
      for (let j = i + 1; j < distributions.length; j++) {
        const similarity = this.cosineSimilarity(distributions[i], distributions[j]);
        totalSimilarity += similarity;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  /**
   * Calculate cosine similarity between two distributions
   */
  private cosineSimilarity(dist1: Map<string, number>, dist2: Map<string, number>): number {
    const allKeys = new Set([...dist1.keys(), ...dist2.keys()]);
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    allKeys.forEach(key => {
      const val1 = dist1.get(key) || 0;
      const val2 = dist2.get(key) || 0;
      
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    });

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Calculate graph-based quality metrics
   */
  private calculateGraphQuality(
    clusters: any[],
    edges: WeightedEdge[],
    tables: TableInfo[]
  ): GraphQualityMetrics {
    // Build cluster membership
    const membership = new Map<string, number>();
    clusters.forEach((cluster, idx) => {
      (cluster.tables || []).forEach((table: string) => {
        membership.set(table, idx);
      });
    });

    // Calculate metrics
    const modularity = this.calculateModularity(membership, edges);
    const conductance = this.calculateConductance(clusters, edges, membership);
    const coverage = this.calculateCoverage(membership, edges);
    const performance = this.calculatePerformance(membership, edges, tables.length);
    const separability = this.calculateSeparability(clusters, edges, membership);
    const compactness = this.calculateCompactness(clusters, edges, membership);

    // Calculate overall score
    const score = (
      modularity * 0.3 +
      (1 - conductance) * 0.2 +
      coverage * 0.2 +
      performance * 0.1 +
      separability * 0.1 +
      compactness * 0.1
    );

    return {
      score,
      modularity,
      conductance,
      coverage,
      performance,
      separability,
      compactness
    };
  }

  /**
   * Calculate modularity (measures quality of division into clusters)
   */
  private calculateModularity(
    membership: Map<string, number>,
    edges: WeightedEdge[]
  ): number {
    if (edges.length === 0) return 0;

    const m = edges.length;
    const degrees = new Map<string, number>();

    // Calculate degrees
    edges.forEach(edge => {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });

    // Calculate modularity
    let modularity = 0;
    edges.forEach(edge => {
      const ci = membership.get(edge.source);
      const cj = membership.get(edge.target);

      if (ci !== undefined && cj !== undefined && ci === cj) {
        const ki = degrees.get(edge.source) || 0;
        const kj = degrees.get(edge.target) || 0;
        modularity += 1 - (ki * kj) / (2 * m);
      }
    });

    return modularity / (2 * m);
  }

  /**
   * Calculate conductance (measures inter-cluster connectivity)
   */
  private calculateConductance(
    clusters: any[],
    edges: WeightedEdge[],
    membership: Map<string, number>
  ): number {
    if (clusters.length === 0) return 1;

    let totalConductance = 0;
    let validClusters = 0;

    clusters.forEach((cluster, idx) => {
      const clusterTables = new Set(cluster.tables || []);
      if (clusterTables.size === 0) return;

      let internalEdges = 0;
      let externalEdges = 0;

      edges.forEach(edge => {
        const sourceInCluster = clusterTables.has(edge.source);
        const targetInCluster = clusterTables.has(edge.target);

        if (sourceInCluster && targetInCluster) {
          internalEdges++;
        } else if (sourceInCluster || targetInCluster) {
          externalEdges++;
        }
      });

      const totalEdges = internalEdges + externalEdges;
      if (totalEdges > 0) {
        totalConductance += externalEdges / totalEdges;
        validClusters++;
      }
    });

    return validClusters > 0 ? totalConductance / validClusters : 0;
  }

  /**
   * Calculate coverage (fraction of edges within clusters)
   */
  private calculateCoverage(
    membership: Map<string, number>,
    edges: WeightedEdge[]
  ): number {
    if (edges.length === 0) return 1;

    let coveredEdges = 0;
    edges.forEach(edge => {
      const ci = membership.get(edge.source);
      const cj = membership.get(edge.target);

      if (ci !== undefined && cj !== undefined && ci === cj) {
        coveredEdges++;
      }
    });

    return coveredEdges / edges.length;
  }

  /**
   * Calculate performance (correct vs incorrect edge classifications)
   */
  private calculatePerformance(
    membership: Map<string, number>,
    edges: WeightedEdge[],
    totalNodes: number
  ): number {
    const totalPossibleEdges = totalNodes * (totalNodes - 1) / 2;
    if (totalPossibleEdges === 0) return 1;

    let correctClassifications = 0;

    // Count intra-cluster edges (should exist)
    edges.forEach(edge => {
      const ci = membership.get(edge.source);
      const cj = membership.get(edge.target);
      if (ci !== undefined && cj !== undefined && ci === cj) {
        correctClassifications++;
      }
    });

    // Estimate inter-cluster non-edges (should not exist)
    const clusteredNodes = membership.size;
    const avgClusterSize = clusteredNodes / Math.max(1, new Set(membership.values()).size);
    const intraClusterPairs = avgClusterSize * (avgClusterSize - 1) / 2 * membership.size;
    const interClusterNonEdges = totalPossibleEdges - intraClusterPairs - edges.length;

    correctClassifications += Math.max(0, interClusterNonEdges);

    return correctClassifications / totalPossibleEdges;
  }

  /**
   * Calculate separability (how well clusters are separated)
   */
  private calculateSeparability(
    clusters: any[],
    edges: WeightedEdge[],
    membership: Map<string, number>
  ): number {
    if (clusters.length < 2) return 1;

    // Calculate average inter-cluster vs intra-cluster edge weights
    let intraWeights: number[] = [];
    let interWeights: number[] = [];

    edges.forEach(edge => {
      const ci = membership.get(edge.source);
      const cj = membership.get(edge.target);

      if (ci !== undefined && cj !== undefined) {
        if (ci === cj) {
          intraWeights.push(edge.components.finalWeight);
        } else {
          interWeights.push(edge.components.finalWeight);
        }
      }
    });

    if (intraWeights.length === 0 || interWeights.length === 0) return 0.5;

    const avgIntra = intraWeights.reduce((sum, w) => sum + w, 0) / intraWeights.length;
    const avgInter = interWeights.reduce((sum, w) => sum + w, 0) / interWeights.length;

    // Higher intra-cluster weights and lower inter-cluster weights = better separability
    return avgIntra / (avgIntra + avgInter);
  }

  /**
   * Calculate compactness (how tightly connected clusters are)
   */
  private calculateCompactness(
    clusters: any[],
    edges: WeightedEdge[],
    membership: Map<string, number>
  ): number {
    let totalCompactness = 0;
    let validClusters = 0;

    clusters.forEach((cluster, idx) => {
      const clusterTables = cluster.tables || [];
      if (clusterTables.length < 2) return;

      const clusterEdges = edges.filter(edge =>
        membership.get(edge.source) === idx && membership.get(edge.target) === idx
      );

      const possibleEdges = clusterTables.length * (clusterTables.length - 1) / 2;
      const actualEdges = clusterEdges.length;

      if (possibleEdges > 0) {
        totalCompactness += actualEdges / possibleEdges;
        validClusters++;
      }
    });

    return validClusters > 0 ? totalCompactness / validClusters : 0;
  }

  /**
   * Validate business constraints
   */
  private validateBusinessConstraints(
    clusters: any[],
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): BusinessValidation {
    const membership = new Map<string, number>();
    clusters.forEach((cluster, idx) => {
      (cluster.tables || []).forEach((table: string) => {
        membership.set(table, idx);
      });
    });

    // Check cross-domain references
    const crossDomainReferences = this.checkCrossDomainReferences(edges, membership);

    // Check orphaned tables
    const orphanedTables = this.checkOrphanedTables(tables, membership, edges);

    // Check circular dependencies
    const circularDependencies = this.checkCircularDependencies(clusters, edges);

    // Check constraint violations
    const constraintViolations = this.checkConstraintViolations(tables, membership);

    // Calculate score
    const score = 1.0 - (
      crossDomainReferences * 0.3 +
      orphanedTables * 0.3 +
      circularDependencies * 0.2 +
      constraintViolations * 0.2
    );

    return {
      score: Math.max(0, score),
      crossDomainReferences,
      orphanedTables,
      circularDependencies,
      constraintViolations
    };
  }

  /**
   * Check for excessive cross-domain references
   */
  private checkCrossDomainReferences(
    edges: WeightedEdge[],
    membership: Map<string, number>
  ): number {
    if (edges.length === 0) return 0;

    let crossDomainCount = 0;
    edges.forEach(edge => {
      const sourceCluster = membership.get(edge.source);
      const targetCluster = membership.get(edge.target);

      if (sourceCluster !== undefined && targetCluster !== undefined &&
          sourceCluster !== targetCluster) {
        crossDomainCount++;
      }
    });

    return crossDomainCount / edges.length;
  }

  /**
   * Check for orphaned tables (tables with no relationships in their cluster)
   */
  private checkOrphanedTables(
    tables: TableInfo[],
    membership: Map<string, number>,
    edges: WeightedEdge[]
  ): number {
    let orphanedCount = 0;
    const tableConnections = new Map<string, Set<string>>();

    // Build connection map
    edges.forEach(edge => {
      if (!tableConnections.has(edge.source)) {
        tableConnections.set(edge.source, new Set());
      }
      if (!tableConnections.has(edge.target)) {
        tableConnections.set(edge.target, new Set());
      }
      tableConnections.get(edge.source)!.add(edge.target);
      tableConnections.get(edge.target)!.add(edge.source);
    });

    // Check each clustered table
    membership.forEach((clusterIdx, tableName) => {
      const connections = tableConnections.get(tableName) || new Set();
      const clusterConnections = Array.from(connections).filter(conn =>
        membership.get(conn) === clusterIdx
      );

      if (clusterConnections.length === 0) {
        orphanedCount++;
      }
    });

    return membership.size > 0 ? orphanedCount / membership.size : 0;
  }

  /**
   * Check for circular dependencies within clusters
   */
  private checkCircularDependencies(
    clusters: any[],
    edges: WeightedEdge[]
  ): number {
    let circularCount = 0;
    let totalClusters = 0;

    clusters.forEach(cluster => {
      const clusterTables = new Set(cluster.tables || []);
      if (clusterTables.size < 3) return; // Need at least 3 tables for circular

      totalClusters++;
      
      // Build directed graph for cluster
      const adjacency = new Map<string, Set<string>>();
      clusterTables.forEach(table => adjacency.set(table, new Set()));

      edges.forEach(edge => {
        if (clusterTables.has(edge.source) && clusterTables.has(edge.target)) {
          adjacency.get(edge.source)?.add(edge.target);
        }
      });

      // Simple cycle detection using DFS
      const visited = new Set<string>();
      const recursionStack = new Set<string>();
      let hasCycle = false;

      const dfs = (node: string): boolean => {
        visited.add(node);
        recursionStack.add(node);

        const neighbors = adjacency.get(node) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor)) return true;
          } else if (recursionStack.has(neighbor)) {
            return true;
          }
        }

        recursionStack.delete(node);
        return false;
      };

      for (const table of clusterTables) {
        if (!visited.has(table)) {
          if (dfs(table)) {
            hasCycle = true;
            break;
          }
        }
      }

      if (hasCycle) circularCount++;
    });

    return totalClusters > 0 ? circularCount / totalClusters : 0;
  }

  /**
   * Check for constraint violations
   */
  private checkConstraintViolations(
    tables: TableInfo[],
    membership: Map<string, number>
  ): number {
    let violations = 0;
    let totalChecks = 0;

    tables.forEach(table => {
      const tableCluster = membership.get(table.name);
      if (tableCluster === undefined) return;

      // Check foreign key constraints
      table.columns.forEach(column => {
        if (column.isForeignKey && column.references) {
          totalChecks++;
          const refCluster = membership.get(column.references.table);
          
          // Violation if referenced table is not clustered or in different cluster
          if (refCluster === undefined || refCluster !== tableCluster) {
            violations++;
          }
        }
      });
    });

    return totalChecks > 0 ? violations / totalChecks : 0;
  }

  /**
   * Calculate overall validation score
   */
  private calculateOverallScore(metrics: ValidationResult['metrics']): number {
    return (
      metrics.structuralValidity.score * 0.25 +
      metrics.semanticCoherence.score * 0.35 +
      metrics.graphQuality.score * 0.25 +
      metrics.businessConstraints.score * 0.15
    );
  }

  /**
   * Identify specific issues based on validation metrics
   */
  private identifyIssues(
    structural: StructuralValidation,
    semantic: SemanticValidation,
    graphQuality: GraphQualityMetrics,
    business: BusinessValidation,
    clusters: any[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Structural issues
    if (structural.noiseRatio > this.MAX_NOISE_RATIO) {
      issues.push({
        severity: 'warning',
        type: 'excessive_noise',
        message: `${(structural.noiseRatio * 100).toFixed(1)}% of tables are unclustered (noise). Consider adjusting DBSCAN parameters.`
      });
    }

    if (structural.clusterSizeDistribution.max > this.MAX_CLUSTER_SIZE) {
      const largeClusters = clusters
        .map((c, idx) => ({ idx, size: c.tables?.length || 0 }))
        .filter(c => c.size > this.MAX_CLUSTER_SIZE);

      issues.push({
        severity: 'warning',
        type: 'oversized_clusters',
        message: `${largeClusters.length} cluster(s) exceed maximum size of ${this.MAX_CLUSTER_SIZE} tables.`,
        affectedClusters: largeClusters.map(c => c.idx)
      });
    }

    // Semantic issues
    if (semantic.referentialIntegrity < 0.7) {
      issues.push({
        severity: 'critical',
        type: 'poor_referential_integrity',
        message: `Only ${(semantic.referentialIntegrity * 100).toFixed(1)}% of relationships are preserved within clusters.`
      });
    }

    if (semantic.foreignKeyPreservation < 0.6) {
      issues.push({
        severity: 'warning',
        type: 'fk_separation',
        message: `${((1 - semantic.foreignKeyPreservation) * 100).toFixed(1)}% of tables with foreign keys are separated from their referenced tables.`
      });
    }

    // Graph quality issues
    if (graphQuality.modularity < this.MIN_MODULARITY) {
      issues.push({
        severity: 'warning',
        type: 'low_modularity',
        message: `Modularity score of ${graphQuality.modularity.toFixed(3)} indicates poor cluster separation.`
      });
    }

    if (graphQuality.conductance > 0.5) {
      issues.push({
        severity: 'info',
        type: 'high_conductance',
        message: `High conductance (${graphQuality.conductance.toFixed(3)}) suggests significant inter-cluster connectivity.`
      });
    }

    // Business constraint issues
    if (business.orphanedTables > 0.1) {
      issues.push({
        severity: 'warning',
        type: 'orphaned_tables',
        message: `${(business.orphanedTables * 100).toFixed(1)}% of clustered tables have no connections within their cluster.`
      });
    }

    if (business.circularDependencies > 0.2) {
      issues.push({
        severity: 'info',
        type: 'circular_dependencies',
        message: `Circular dependencies detected in ${(business.circularDependencies * 100).toFixed(1)}% of clusters.`
      });
    }

    return issues;
  }

  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(
    issues: ValidationIssue[],
    structural: StructuralValidation,
    semantic: SemanticValidation,
    graphQuality: GraphQualityMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Parameter tuning recommendations
    if (issues.some(i => i.type === 'excessive_noise')) {
      recommendations.push('Increase epsilon parameter or decrease minPoints to reduce noise ratio.');
    }

    if (issues.some(i => i.type === 'oversized_clusters')) {
      recommendations.push('Decrease epsilon parameter or increase minPoints to create smaller, more focused clusters.');
    }

    // Structural recommendations
    if (structural.clusterSizeDistribution.stdDev > structural.clusterSizeDistribution.mean * 0.5) {
      recommendations.push('Consider using multi-resolution clustering to handle varied cluster sizes.');
    }

    // Semantic recommendations
    if (semantic.referentialIntegrity < 0.7 && semantic.foreignKeyPreservation < 0.7) {
      recommendations.push('Pre-process graph to strengthen FK-based connections before clustering.');
    }

    // Graph quality recommendations
    if (graphQuality.modularity < 0.3 && graphQuality.conductance > 0.5) {
      recommendations.push('Graph structure may not be suitable for DBSCAN. Consider spectral clustering or hierarchical methods.');
    }

    // General recommendations
    if (structural.hubDistribution.isolated > 0) {
      recommendations.push(`${structural.hubDistribution.isolated} hub table(s) are isolated. Consider hub-aware preprocessing.`);
    }

    if (issues.filter(i => i.severity === 'critical').length > 0) {
      recommendations.push('Critical issues detected. Review clustering parameters and consider alternative algorithms.');
    }

    return recommendations;
  }

  /**
   * Helper methods for different result types
   */
  private getClusterCount(result: AdaptiveDBSCANResult | MultiResolutionResult): number {
    if ('finalClusters' in result) {
      return result.finalClusters.length;
    }
    return result.clusters.length;
  }

  private extractClusters(result: AdaptiveDBSCANResult | MultiResolutionResult): any[] {
    if ('finalClusters' in result) {
      return result.finalClusters;
    }
    return result.clusters;
  }

  private extractNoise(result: AdaptiveDBSCANResult | MultiResolutionResult): string[] {
    if ('finalClusters' in result) {
      // Multi-resolution result - collect unclustered tables
      const clusteredTables = new Set(
        result.finalClusters.flatMap(c => c.tables)
      );
      // This is approximate - real noise would need to be tracked
      return [];
    }
    return result.noise;
  }

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
    
    return 'other';
  }
}

export const dbscanValidationPipeline = new DBSCANValidationPipeline();