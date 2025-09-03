import { TableInfo } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { AdaptiveDBSCANCluster, AdaptiveDBSCANResult } from './AdaptiveDBSCANCluster';
import { Logger } from '../../utils/logger';

const logger = new Logger('MultiResolutionDBSCAN');

/**
 * Multi-resolution DBSCAN implementation that applies clustering at different
 * granularities and combines results for optimal domain detection
 */

export interface MultiResolutionResult {
  finalClusters: EnhancedCluster[];
  resolutionResults: {
    macro: AdaptiveDBSCANResult;
    meso: AdaptiveDBSCANResult;
    micro: AdaptiveDBSCANResult;
  };
  consensusMetrics: {
    stability: number;          // How stable clusters are across resolutions
    agreement: number;          // Agreement between resolutions
    confidence: number;         // Overall confidence in clustering
    resolutionContribution: {
      macro: number;
      meso: number;
      micro: number;
    };
  };
  statistics: {
    totalTables: number;
    finalClusterCount: number;
    averageClusterSize: number;
    sizeDistribution: number[];
    hierarchicalDepth: number;
  };
}

export interface EnhancedCluster {
  id: string;
  name: string;
  tables: string[];
  coreTables: string[];      // Tables that appear in cluster across all resolutions
  stableTables: string[];    // Tables that mostly stay together
  peripheralTables: string[]; // Tables that move between clusters
  hierarchy: {
    parent?: string;
    children: string[];
    level: number;
  };
  confidence: number;
  characteristics: {
    density: number;
    cohesion: number;
    separation: number;
    stability: number;
  };
}

interface ClusterAssignment {
  table: string;
  macro: number;
  meso: number;
  micro: number;
}

export class MultiResolutionDBSCAN {
  private adaptiveDBSCAN: AdaptiveDBSCANCluster;
  
  constructor() {
    this.adaptiveDBSCAN = new AdaptiveDBSCANCluster();
  }

  /**
   * Perform multi-resolution DBSCAN clustering
   */
  async performMultiResolutionClustering(
    tables: TableInfo[],
    weightedEdges: WeightedEdge[]
  ): Promise<MultiResolutionResult> {
    logger.info('Starting multi-resolution DBSCAN clustering', {
      tableCount: tables.length,
      edgeCount: weightedEdges.length
    });

    // Step 1: Run DBSCAN at each resolution level
    const resolutionResults = await this.runAllResolutions(tables, weightedEdges);

    // Step 2: Build consensus assignment matrix
    const assignmentMatrix = this.buildAssignmentMatrix(
      tables,
      resolutionResults
    );

    // Step 3: Identify stable cluster cores
    const stableCores = this.identifyStableCores(assignmentMatrix);

    // Step 4: Build hierarchical structure
    const hierarchy = this.buildHierarchy(resolutionResults, assignmentMatrix);

    // Step 5: Generate final clusters using consensus
    const finalClusters = this.generateConsensusClusters(
      assignmentMatrix,
      stableCores,
      hierarchy,
      resolutionResults
    );

    // Step 6: Calculate consensus metrics
    const consensusMetrics = this.calculateConsensusMetrics(
      finalClusters,
      resolutionResults,
      assignmentMatrix
    );

    // Step 7: Calculate statistics
    const statistics = this.calculateStatistics(finalClusters, hierarchy);

    logger.info('Multi-resolution clustering complete', {
      finalClusterCount: finalClusters.length,
      consensusStability: consensusMetrics.stability,
      hierarchicalDepth: statistics.hierarchicalDepth
    });

    return {
      finalClusters,
      resolutionResults,
      consensusMetrics,
      statistics
    };
  }

  /**
   * Run DBSCAN at all resolution levels
   */
  private async runAllResolutions(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<MultiResolutionResult['resolutionResults']> {
    logger.info('Running DBSCAN at multiple resolutions');

    // Run in parallel for efficiency
    const [macroResult, mesoResult, microResult] = await Promise.all([
      this.adaptiveDBSCAN.performAdaptiveClustering(tables, edges, 'macro'),
      this.adaptiveDBSCAN.performAdaptiveClustering(tables, edges, 'meso'),
      this.adaptiveDBSCAN.performAdaptiveClustering(tables, edges, 'micro')
    ]);

    logger.info('Resolution results', {
      macro: {
        clusters: macroResult.clusters.length,
        noise: macroResult.noise.length,
        epsilon: macroResult.parameters.epsilon
      },
      meso: {
        clusters: mesoResult.clusters.length,
        noise: mesoResult.noise.length,
        epsilon: mesoResult.parameters.epsilon
      },
      micro: {
        clusters: microResult.clusters.length,
        noise: microResult.noise.length,
        epsilon: microResult.parameters.epsilon
      }
    });

    return { macro: macroResult, meso: mesoResult, micro: microResult };
  }

  /**
   * Build assignment matrix tracking cluster assignments across resolutions
   */
  private buildAssignmentMatrix(
    tables: TableInfo[],
    results: MultiResolutionResult['resolutionResults']
  ): ClusterAssignment[] {
    const assignments: ClusterAssignment[] = [];

    // Initialize assignments for all tables
    tables.forEach(table => {
      assignments.push({
        table: table.name,
        macro: -1,  // -1 indicates noise
        meso: -1,
        micro: -1
      });
    });

    // Map table names to assignment indices
    const tableIndexMap = new Map(
      assignments.map((assignment, idx) => [assignment.table, idx])
    );

    // Assign macro clusters
    results.macro.clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        const idx = tableIndexMap.get(table);
        if (idx !== undefined) {
          assignments[idx].macro = cluster.clusterId;
        }
      });
    });

    // Assign meso clusters
    results.meso.clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        const idx = tableIndexMap.get(table);
        if (idx !== undefined) {
          assignments[idx].meso = cluster.clusterId;
        }
      });
    });

    // Assign micro clusters
    results.micro.clusters.forEach(cluster => {
      cluster.tables.forEach(table => {
        const idx = tableIndexMap.get(table);
        if (idx !== undefined) {
          assignments[idx].micro = cluster.clusterId;
        }
      });
    });

    return assignments;
  }

  /**
   * Identify stable cores - tables that cluster together across resolutions
   */
  private identifyStableCores(
    assignments: ClusterAssignment[]
  ): Map<string, Set<string>> {
    const stableCores = new Map<string, Set<string>>();

    // Group tables by their assignment patterns
    const patternGroups = new Map<string, string[]>();

    assignments.forEach(assignment => {
      // Create pattern key from assignments (skip noise)
      const pattern = [
        assignment.macro >= 0 ? `M${assignment.macro}` : '',
        assignment.meso >= 0 ? `m${assignment.meso}` : '',
        assignment.micro >= 0 ? `μ${assignment.micro}` : ''
      ].filter(p => p).join('-');

      if (!patternGroups.has(pattern)) {
        patternGroups.set(pattern, []);
      }
      patternGroups.get(pattern)!.push(assignment.table);
    });

    // Find groups that stay together across at least 2 resolutions
    let coreId = 0;
    patternGroups.forEach((tables, pattern) => {
      const resolutionCount = pattern.split('-').length;
      
      if (resolutionCount >= 2 && tables.length >= 2) {
        // This is a stable core
        stableCores.set(`core_${coreId++}`, new Set(tables));
      }
    });

    logger.info('Stable cores identified', {
      coreCount: stableCores.size,
      avgCoreSize: Array.from(stableCores.values())
        .reduce((sum, core) => sum + core.size, 0) / (stableCores.size || 1)
    });

    return stableCores;
  }

  /**
   * Build hierarchical structure from multi-resolution results
   */
  private buildHierarchy(
    results: MultiResolutionResult['resolutionResults'],
    assignments: ClusterAssignment[]
  ): Map<string, EnhancedCluster['hierarchy']> {
    const hierarchy = new Map<string, EnhancedCluster['hierarchy']>();

    // Create hierarchy entries for each resolution level
    const allClusterIds = new Set<string>();

    // Macro level (top)
    results.macro.clusters.forEach(cluster => {
      const id = `macro_${cluster.clusterId}`;
      allClusterIds.add(id);
      hierarchy.set(id, {
        parent: undefined,
        children: [],
        level: 0
      });
    });

    // Meso level (middle)
    results.meso.clusters.forEach(cluster => {
      const id = `meso_${cluster.clusterId}`;
      allClusterIds.add(id);
      
      // Find parent macro cluster
      const parent = this.findParentCluster(
        cluster.tables,
        results.macro.clusters,
        'macro'
      );

      hierarchy.set(id, {
        parent,
        children: [],
        level: 1
      });

      // Update parent's children
      if (parent && hierarchy.has(parent)) {
        hierarchy.get(parent)!.children.push(id);
      }
    });

    // Micro level (bottom)
    results.micro.clusters.forEach(cluster => {
      const id = `micro_${cluster.clusterId}`;
      allClusterIds.add(id);
      
      // Find parent meso cluster
      const parent = this.findParentCluster(
        cluster.tables,
        results.meso.clusters,
        'meso'
      );

      hierarchy.set(id, {
        parent,
        children: [],
        level: 2
      });

      // Update parent's children
      if (parent && hierarchy.has(parent)) {
        hierarchy.get(parent)!.children.push(id);
      }
    });

    return hierarchy;
  }

  /**
   * Find parent cluster based on table overlap
   */
  private findParentCluster(
    childTables: string[],
    parentClusters: any[],
    parentPrefix: string
  ): string | undefined {
    let bestParent: string | undefined;
    let maxOverlap = 0;

    parentClusters.forEach(parentCluster => {
      const overlap = childTables.filter(table => 
        parentCluster.tables.includes(table)
      ).length;

      const overlapRatio = overlap / childTables.length;

      if (overlapRatio > 0.5 && overlap > maxOverlap) {
        maxOverlap = overlap;
        bestParent = `${parentPrefix}_${parentCluster.clusterId}`;
      }
    });

    return bestParent;
  }

  /**
   * Generate consensus clusters from multi-resolution results
   */
  private generateConsensusClusters(
    assignments: ClusterAssignment[],
    stableCores: Map<string, Set<string>>,
    hierarchy: Map<string, EnhancedCluster['hierarchy']>,
    results: MultiResolutionResult['resolutionResults']
  ): EnhancedCluster[] {
    const consensusClusters: EnhancedCluster[] = [];
    const assignedTables = new Set<string>();

    // Step 1: Create clusters from stable cores
    let clusterId = 0;
    stableCores.forEach((coreTables, coreId) => {
      const cluster = this.createEnhancedCluster(
        `consensus_${clusterId++}`,
        Array.from(coreTables),
        assignments,
        results
      );

      // Mark tables as assigned
      coreTables.forEach(table => assignedTables.add(table));
      
      consensusClusters.push(cluster);
    });

    // Step 2: Handle unassigned tables using meso-level clusters as base
    results.meso.clusters.forEach(mesoCluster => {
      const unassignedInCluster = mesoCluster.tables.filter(
        table => !assignedTables.has(table)
      );

      if (unassignedInCluster.length >= 3) {
        // Create new consensus cluster
        const cluster = this.createEnhancedCluster(
          `consensus_${clusterId++}`,
          unassignedInCluster,
          assignments,
          results
        );

        unassignedInCluster.forEach(table => assignedTables.add(table));
        consensusClusters.push(cluster);
      }
    });

    // Step 3: Merge small clusters and assign remaining tables
    this.mergeSmallClusters(consensusClusters, assignedTables, assignments);

    // Step 4: Calculate final characteristics
    consensusClusters.forEach(cluster => {
      this.calculateClusterCharacteristics(cluster, results);
    });

    return consensusClusters;
  }

  /**
   * Create enhanced cluster with metadata
   */
  private createEnhancedCluster(
    id: string,
    tables: string[],
    assignments: ClusterAssignment[],
    results: MultiResolutionResult['resolutionResults']
  ): EnhancedCluster {
    // Determine core vs peripheral tables
    const tableStability = this.calculateTableStability(tables, assignments);
    
    const coreTables = tables.filter(table => 
      tableStability.get(table)! >= 0.8
    );
    
    const stableTables = tables.filter(table => 
      tableStability.get(table)! >= 0.6
    );
    
    const peripheralTables = tables.filter(table => 
      tableStability.get(table)! < 0.6
    );

    // Calculate initial confidence
    const confidence = this.calculateClusterConfidence(
      tables,
      assignments,
      results
    );

    return {
      id,
      name: `Domain_${id.split('_')[1]}`,
      tables,
      coreTables,
      stableTables,
      peripheralTables,
      hierarchy: {
        parent: undefined,
        children: [],
        level: 1
      },
      confidence,
      characteristics: {
        density: 0,
        cohesion: 0,
        separation: 0,
        stability: 0
      }
    };
  }

  /**
   * Calculate stability score for tables
   */
  private calculateTableStability(
    tables: string[],
    assignments: ClusterAssignment[]
  ): Map<string, number> {
    const stability = new Map<string, number>();
    const tableSet = new Set(tables);

    tables.forEach(table => {
      const assignment = assignments.find(a => a.table === table);
      if (!assignment) {
        stability.set(table, 0);
        return;
      }

      // Count how many other tables from this cluster it stays with
      let stableConnections = 0;
      let totalConnections = 0;

      tables.forEach(otherTable => {
        if (otherTable === table) return;

        const otherAssignment = assignments.find(a => a.table === otherTable);
        if (!otherAssignment) return;

        totalConnections++;

        // Check if they're together at each resolution
        if (assignment.macro >= 0 && assignment.macro === otherAssignment.macro) {
          stableConnections += 0.33;
        }
        if (assignment.meso >= 0 && assignment.meso === otherAssignment.meso) {
          stableConnections += 0.33;
        }
        if (assignment.micro >= 0 && assignment.micro === otherAssignment.micro) {
          stableConnections += 0.34;
        }
      });

      const tableStability = totalConnections > 0 
        ? stableConnections / totalConnections 
        : 0;

      stability.set(table, tableStability);
    });

    return stability;
  }

  /**
   * Calculate confidence score for a cluster
   */
  private calculateClusterConfidence(
    tables: string[],
    assignments: ClusterAssignment[],
    results: MultiResolutionResult['resolutionResults']
  ): number {
    // Factor 1: Consistency across resolutions
    const consistencyScore = this.calculateConsistencyScore(tables, assignments);

    // Factor 2: Average quality metrics from source clusters
    const qualityScore = this.calculateAverageQualityScore(tables, results);

    // Factor 3: Size appropriateness
    const sizeScore = this.calculateSizeScore(tables.length);

    return consistencyScore * 0.5 + qualityScore * 0.3 + sizeScore * 0.2;
  }

  /**
   * Calculate consistency score for tables clustering together
   */
  private calculateConsistencyScore(
    tables: string[],
    assignments: ClusterAssignment[]
  ): number {
    if (tables.length <= 1) return 1;

    let totalPairs = 0;
    let consistentPairs = 0;

    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const assign1 = assignments.find(a => a.table === tables[i]);
        const assign2 = assignments.find(a => a.table === tables[j]);

        if (!assign1 || !assign2) continue;

        totalPairs++;

        // Count resolutions where they're in the same cluster
        let togetherCount = 0;
        if (assign1.macro >= 0 && assign1.macro === assign2.macro) togetherCount++;
        if (assign1.meso >= 0 && assign1.meso === assign2.meso) togetherCount++;
        if (assign1.micro >= 0 && assign1.micro === assign2.micro) togetherCount++;

        if (togetherCount >= 2) consistentPairs++;
      }
    }

    return totalPairs > 0 ? consistentPairs / totalPairs : 0;
  }

  /**
   * Calculate average quality score from source clusters
   */
  private calculateAverageQualityScore(
    tables: string[],
    results: MultiResolutionResult['resolutionResults']
  ): number {
    const scores: number[] = [];

    // Find relevant clusters in each resolution
    ['macro', 'meso', 'micro'].forEach(resolution => {
      const resolutionResults = results[resolution as keyof typeof results];
      
      resolutionResults.clusters.forEach(cluster => {
        const overlap = tables.filter(t => cluster.tables.includes(t)).length;
        const overlapRatio = overlap / tables.length;

        if (overlapRatio > 0.5) {
          // This cluster is relevant
          const clusterScore = (cluster.density + cluster.cohesion) / 2;
          scores.push(clusterScore * overlapRatio);
        }
      });
    });

    return scores.length > 0 
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0.5;
  }

  /**
   * Calculate size appropriateness score
   */
  private calculateSizeScore(size: number): number {
    // Ideal size range: 5-20 tables
    if (size >= 5 && size <= 20) return 1;
    if (size < 3 || size > 50) return 0.2;
    if (size < 5) return 0.5 + (size - 3) * 0.25;
    if (size > 20) return 1 - (size - 20) / 60;
    return 0.5;
  }

  /**
   * Merge small clusters and handle remaining tables
   */
  private mergeSmallClusters(
    clusters: EnhancedCluster[],
    assignedTables: Set<string>,
    assignments: ClusterAssignment[]
  ): void {
    // Find small clusters (< 3 tables)
    const smallClusters = clusters.filter(c => c.tables.length < 3);
    const normalClusters = clusters.filter(c => c.tables.length >= 3);

    // Remove small clusters from main list
    clusters.length = 0;
    clusters.push(...normalClusters);

    // Try to merge small clusters with nearest normal clusters
    smallClusters.forEach(smallCluster => {
      const bestTarget = this.findBestMergeTarget(
        smallCluster,
        normalClusters,
        assignments
      );

      if (bestTarget) {
        // Merge into target
        bestTarget.tables.push(...smallCluster.tables);
        bestTarget.peripheralTables.push(...smallCluster.tables);
      } else {
        // Keep as separate cluster if no good merge target
        if (smallCluster.tables.length >= 2) {
          clusters.push(smallCluster);
        }
      }
    });

    // Handle any remaining unassigned tables
    const allClusteredTables = new Set(
      clusters.flatMap(c => c.tables)
    );

    assignments.forEach(assignment => {
      if (!allClusteredTables.has(assignment.table)) {
        // Find best cluster to assign to
        const bestCluster = this.findBestClusterForTable(
          assignment,
          clusters,
          assignments
        );

        if (bestCluster) {
          bestCluster.tables.push(assignment.table);
          bestCluster.peripheralTables.push(assignment.table);
        }
      }
    });
  }

  /**
   * Find best merge target for a small cluster
   */
  private findBestMergeTarget(
    smallCluster: EnhancedCluster,
    targetClusters: EnhancedCluster[],
    assignments: ClusterAssignment[]
  ): EnhancedCluster | null {
    let bestTarget: EnhancedCluster | null = null;
    let bestScore = 0;

    targetClusters.forEach(target => {
      const score = this.calculateMergeScore(
        smallCluster.tables,
        target.tables,
        assignments
      );

      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestTarget = target;
      }
    });

    return bestTarget;
  }

  /**
   * Calculate merge compatibility score
   */
  private calculateMergeScore(
    sourceTables: string[],
    targetTables: string[],
    assignments: ClusterAssignment[]
  ): number {
    // Check how often source tables clustered with target tables
    let coClusterCount = 0;
    let totalComparisons = 0;

    sourceTables.forEach(sourceTable => {
      const sourceAssign = assignments.find(a => a.table === sourceTable);
      if (!sourceAssign) return;

      targetTables.forEach(targetTable => {
        const targetAssign = assignments.find(a => a.table === targetTable);
        if (!targetAssign) return;

        totalComparisons += 3; // 3 resolutions

        if (sourceAssign.macro >= 0 && sourceAssign.macro === targetAssign.macro) {
          coClusterCount++;
        }
        if (sourceAssign.meso >= 0 && sourceAssign.meso === targetAssign.meso) {
          coClusterCount++;
        }
        if (sourceAssign.micro >= 0 && sourceAssign.micro === targetAssign.micro) {
          coClusterCount++;
        }
      });
    });

    return totalComparisons > 0 ? coClusterCount / totalComparisons : 0;
  }

  /**
   * Find best cluster for an unassigned table
   */
  private findBestClusterForTable(
    tableAssignment: ClusterAssignment,
    clusters: EnhancedCluster[],
    assignments: ClusterAssignment[]
  ): EnhancedCluster | null {
    let bestCluster: EnhancedCluster | null = null;
    let bestScore = 0;

    clusters.forEach(cluster => {
      const score = this.calculateMergeScore(
        [tableAssignment.table],
        cluster.tables,
        assignments
      );

      if (score > bestScore && score > 0.2) {
        bestScore = score;
        bestCluster = cluster;
      }
    });

    return bestCluster;
  }

  /**
   * Calculate final cluster characteristics
   */
  private calculateClusterCharacteristics(
    cluster: EnhancedCluster,
    results: MultiResolutionResult['resolutionResults']
  ): void {
    // Aggregate metrics from all resolutions
    const metrics = {
      density: [] as number[],
      cohesion: [] as number[],
      separation: [] as number[]
    };

    // Collect metrics from each resolution
    ['macro', 'meso', 'micro'].forEach(resolution => {
      const resResults = results[resolution as keyof typeof results];
      
      resResults.clusters.forEach(sourceCluster => {
        const overlap = cluster.tables.filter(t => 
          sourceCluster.tables.includes(t)
        ).length;

        const overlapRatio = overlap / cluster.tables.length;

        if (overlapRatio > 0.5) {
          metrics.density.push(sourceCluster.density);
          metrics.cohesion.push(sourceCluster.cohesion);
          metrics.separation.push(sourceCluster.separation);
        }
      });
    });

    // Calculate averages
    cluster.characteristics.density = metrics.density.length > 0
      ? metrics.density.reduce((sum, d) => sum + d, 0) / metrics.density.length
      : 0.5;

    cluster.characteristics.cohesion = metrics.cohesion.length > 0
      ? metrics.cohesion.reduce((sum, c) => sum + c, 0) / metrics.cohesion.length
      : 0.5;

    cluster.characteristics.separation = metrics.separation.length > 0
      ? metrics.separation.reduce((sum, s) => sum + s, 0) / metrics.separation.length
      : 0.5;

    // Stability is based on core table ratio
    cluster.characteristics.stability = cluster.coreTables.length / cluster.tables.length;
  }

  /**
   * Calculate consensus metrics
   */
  private calculateConsensusMetrics(
    finalClusters: EnhancedCluster[],
    resolutionResults: MultiResolutionResult['resolutionResults'],
    assignments: ClusterAssignment[]
  ): MultiResolutionResult['consensusMetrics'] {
    // Calculate stability
    const stability = this.calculateOverallStability(finalClusters);

    // Calculate agreement between resolutions
    const agreement = this.calculateResolutionAgreement(assignments);

    // Calculate overall confidence
    const confidence = finalClusters.reduce((sum, c) => sum + c.confidence, 0) / 
                      (finalClusters.length || 1);

    // Calculate resolution contributions
    const contributions = this.calculateResolutionContributions(
      finalClusters,
      resolutionResults,
      assignments
    );

    return {
      stability,
      agreement,
      confidence,
      resolutionContribution: contributions
    };
  }

  /**
   * Calculate overall stability of clustering
   */
  private calculateOverallStability(clusters: EnhancedCluster[]): number {
    const totalTables = clusters.reduce((sum, c) => sum + c.tables.length, 0);
    const stableTables = clusters.reduce((sum, c) => sum + c.stableTables.length, 0);

    return totalTables > 0 ? stableTables / totalTables : 0;
  }

  /**
   * Calculate agreement between resolutions
   */
  private calculateResolutionAgreement(assignments: ClusterAssignment[]): number {
    let totalAgreement = 0;
    let comparisonCount = 0;

    // Compare each pair of resolutions
    const resolutions: Array<'macro' | 'meso' | 'micro'> = ['macro', 'meso', 'micro'];
    
    for (let i = 0; i < resolutions.length; i++) {
      for (let j = i + 1; j < resolutions.length; j++) {
        const res1 = resolutions[i];
        const res2 = resolutions[j];

        const ari = this.adjustedRandIndex(assignments, res1, res2);
        totalAgreement += ari;
        comparisonCount++;
      }
    }

    return comparisonCount > 0 ? totalAgreement / comparisonCount : 0;
  }

  /**
   * Calculate Adjusted Rand Index between two clusterings
   */
  private adjustedRandIndex(
    assignments: ClusterAssignment[],
    res1: 'macro' | 'meso' | 'micro',
    res2: 'macro' | 'meso' | 'micro'
  ): number {
    const n = assignments.length;
    if (n <= 1) return 1;

    // Build contingency table
    const contingency = new Map<string, number>();
    const marginal1 = new Map<number, number>();
    const marginal2 = new Map<number, number>();

    assignments.forEach(assignment => {
      const cluster1 = assignment[res1];
      const cluster2 = assignment[res2];
      
      const key = `${cluster1},${cluster2}`;
      contingency.set(key, (contingency.get(key) || 0) + 1);
      
      marginal1.set(cluster1, (marginal1.get(cluster1) || 0) + 1);
      marginal2.set(cluster2, (marginal2.get(cluster2) || 0) + 1);
    });

    // Calculate index
    let index = 0;
    let expectedIndex = 0;
    let maxIndex = 0;

    contingency.forEach((count, key) => {
      if (count >= 2) {
        index += count * (count - 1) / 2;
      }
    });

    marginal1.forEach(count => {
      if (count >= 2) {
        maxIndex += count * (count - 1) / 2;
      }
    });

    marginal2.forEach(count => {
      if (count >= 2) {
        maxIndex += count * (count - 1) / 2;
      }
    });

    marginal1.forEach((count1, cluster1) => {
      marginal2.forEach((count2, cluster2) => {
        expectedIndex += (count1 * count2 * (count1 - 1) * (count2 - 1)) / 
                        (n * (n - 1));
      });
    });

    maxIndex = maxIndex / 2;

    if (maxIndex === expectedIndex) return 0;

    return (index - expectedIndex) / (maxIndex - expectedIndex);
  }

  /**
   * Calculate how much each resolution contributed to final clustering
   */
  private calculateResolutionContributions(
    finalClusters: EnhancedCluster[],
    resolutionResults: MultiResolutionResult['resolutionResults'],
    assignments: ClusterAssignment[]
  ): { macro: number; meso: number; micro: number } {
    const contributions = { macro: 0, meso: 0, micro: 0 };

    // Calculate normalized mutual information with each resolution
    const finalAssignments = this.createFinalAssignments(finalClusters, assignments);

    contributions.macro = this.normalizedMutualInformation(
      finalAssignments,
      assignments,
      'macro'
    );

    contributions.meso = this.normalizedMutualInformation(
      finalAssignments,
      assignments,
      'meso'
    );

    contributions.micro = this.normalizedMutualInformation(
      finalAssignments,
      assignments,
      'micro'
    );

    // Normalize so they sum to 1
    const total = contributions.macro + contributions.meso + contributions.micro;
    if (total > 0) {
      contributions.macro /= total;
      contributions.meso /= total;
      contributions.micro /= total;
    }

    return contributions;
  }

  /**
   * Create assignment array for final clusters
   */
  private createFinalAssignments(
    finalClusters: EnhancedCluster[],
    originalAssignments: ClusterAssignment[]
  ): number[] {
    const tableToCluster = new Map<string, number>();
    
    finalClusters.forEach((cluster, idx) => {
      cluster.tables.forEach(table => {
        tableToCluster.set(table, idx);
      });
    });

    return originalAssignments.map(assignment => 
      tableToCluster.get(assignment.table) ?? -1
    );
  }

  /**
   * Calculate normalized mutual information
   */
  private normalizedMutualInformation(
    clustering1: number[],
    assignments: ClusterAssignment[],
    resolution: 'macro' | 'meso' | 'micro'
  ): number {
    const clustering2 = assignments.map(a => a[resolution]);
    const n = clustering1.length;

    if (n === 0) return 0;

    // Calculate mutual information
    const joint = new Map<string, number>();
    const marginal1 = new Map<number, number>();
    const marginal2 = new Map<number, number>();

    for (let i = 0; i < n; i++) {
      const c1 = clustering1[i];
      const c2 = clustering2[i];
      
      const key = `${c1},${c2}`;
      joint.set(key, (joint.get(key) || 0) + 1);
      marginal1.set(c1, (marginal1.get(c1) || 0) + 1);
      marginal2.set(c2, (marginal2.get(c2) || 0) + 1);
    }

    let mi = 0;
    joint.forEach((count, key) => {
      const [c1, c2] = key.split(',').map(Number);
      const p_joint = count / n;
      const p1 = (marginal1.get(c1) || 0) / n;
      const p2 = (marginal2.get(c2) || 0) / n;
      
      if (p_joint > 0 && p1 > 0 && p2 > 0) {
        mi += p_joint * Math.log(p_joint / (p1 * p2));
      }
    });

    // Calculate entropies for normalization
    let h1 = 0;
    let h2 = 0;

    marginal1.forEach(count => {
      const p = count / n;
      if (p > 0) h1 -= p * Math.log(p);
    });

    marginal2.forEach(count => {
      const p = count / n;
      if (p > 0) h2 -= p * Math.log(p);
    });

    const denominator = Math.sqrt(h1 * h2);
    return denominator > 0 ? mi / denominator : 0;
  }

  /**
   * Calculate final statistics
   */
  private calculateStatistics(
    finalClusters: EnhancedCluster[],
    hierarchy: Map<string, EnhancedCluster['hierarchy']>
  ): MultiResolutionResult['statistics'] {
    const clusterSizes = finalClusters.map(c => c.tables.length);
    const totalTables = clusterSizes.reduce((sum, size) => sum + size, 0);

    // Calculate hierarchical depth
    let maxDepth = 0;
    hierarchy.forEach(node => {
      maxDepth = Math.max(maxDepth, node.level);
    });

    return {
      totalTables,
      finalClusterCount: finalClusters.length,
      averageClusterSize: finalClusters.length > 0 
        ? totalTables / finalClusters.length 
        : 0,
      sizeDistribution: clusterSizes.sort((a, b) => b - a),
      hierarchicalDepth: maxDepth + 1
    };
  }
}

export const multiResolutionDBSCAN = new MultiResolutionDBSCAN();