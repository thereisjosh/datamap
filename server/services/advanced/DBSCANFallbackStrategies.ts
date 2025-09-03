import { TableInfo } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { Logger } from '../../utils/logger';

const logger = new Logger('DBSCANFallbackStrategies');

/**
 * Fallback strategies for when DBSCAN fails or produces poor results
 * on database ERD structures. Provides alternative clustering methods.
 */

export interface FallbackResult {
  method: 'connected_components' | 'hierarchical_merge' | 'spectral_fallback' | 'force_directed' | 'constraint_based';
  clusters: FallbackCluster[];
  reason: string;
  metrics: {
    coverage: number;
    avgClusterSize: number;
    modularity: number;
    success: boolean;
  };
}

export interface FallbackCluster {
  id: string;
  tables: string[];
  method: string;
  confidence: number;
  metadata: {
    coreReason?: string;
    mergeHistory?: string[];
    constraints?: string[];
  };
}

export class DBSCANFallbackStrategies {
  /**
   * Main entry point for fallback clustering
   */
  async applyFallbackStrategy(
    tables: TableInfo[],
    edges: WeightedEdge[],
    failureReason: string
  ): Promise<FallbackResult> {
    logger.info('Applying fallback strategy', {
      tableCount: tables.length,
      edgeCount: edges.length,
      failureReason
    });

    // Analyze graph characteristics
    const graphMetrics = this.analyzeGraph(tables, edges);

    // Choose appropriate fallback based on graph characteristics and failure reason
    let result: FallbackResult;

    if (failureReason.includes('mega-domain') || failureReason.includes('single cluster')) {
      // Single mega-domain issue - use component-based splitting with aggressive clustering
      result = await this.componentBasedSplitting(tables, edges, graphMetrics);
    } else if (graphMetrics.componentCount > 1 && graphMetrics.largestComponentRatio < 0.8) {
      // Multiple significant components - use connected components first
      result = await this.connectedComponentsClustering(tables, edges, graphMetrics);
    } else if (graphMetrics.density < 0.001) {
      // Extremely sparse - use constraint-based clustering
      result = await this.constraintBasedClustering(tables, edges);
    } else if (graphMetrics.avgDegree < 1.5) {
      // Very low connectivity - use hierarchical merging
      result = await this.hierarchicalMergeClustering(tables, edges);
    } else if (edges.length > 0 && graphMetrics.weightVariance > 0.5) {
      // High weight variance - use force-directed clustering
      result = await this.forceDirectedClustering(tables, edges);
    } else {
      // Default to spectral clustering with aggressive parameters
      result = await this.spectralFallbackClustering(tables, edges);
    }

    logger.info('Fallback strategy complete', {
      method: result.method,
      clusterCount: result.clusters.length,
      coverage: result.metrics.coverage,
      success: result.metrics.success
    });

    return result;
  }

  /**
   * Analyze graph to determine best fallback strategy
   */
  private analyzeGraph(tables: TableInfo[], edges: WeightedEdge[]): {
    density: number;
    avgDegree: number;
    componentCount: number;
    largestComponentRatio: number;
    weightVariance: number;
    hubRatio: number;
  } {
    const n = tables.length;
    const m = edges.length;
    const possibleEdges = n * (n - 1) / 2;

    // Calculate basic metrics
    const density = possibleEdges > 0 ? m / possibleEdges : 0;
    const avgDegree = n > 0 ? (2 * m) / n : 0;

    // Find components
    const components = this.findComponents(tables, edges);
    const largestComponent = Math.max(...components.map(c => c.size), 0);
    const largestComponentRatio = n > 0 ? largestComponent / n : 0;

    // Calculate weight variance
    const weights = edges.map(e => e.components.finalWeight);
    const avgWeight = weights.reduce((sum, w) => sum + w, 0) / (weights.length || 1);
    const weightVariance = weights.reduce((sum, w) => 
      sum + Math.pow(w - avgWeight, 2), 0
    ) / (weights.length || 1);

    // Calculate hub ratio
    const degrees = new Map<string, number>();
    edges.forEach(edge => {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });
    const hubThreshold = avgDegree + 2 * Math.sqrt(weightVariance);
    const hubCount = Array.from(degrees.values()).filter(d => d > hubThreshold).length;
    const hubRatio = n > 0 ? hubCount / n : 0;

    return {
      density,
      avgDegree,
      componentCount: components.length,
      largestComponentRatio,
      weightVariance,
      hubRatio
    };
  }

  /**
   * Strategy 0: Component-Based Splitting for Mega-Domain Issues
   * Best for: Single mega-domains that need to be broken down
   */
  private async componentBasedSplitting(
    tables: TableInfo[],
    edges: WeightedEdge[],
    graphMetrics: any
  ): Promise<FallbackResult> {
    logger.info('Using component-based splitting for mega-domain fallback');

    const clusters: FallbackCluster[] = [];

    // Step 1: Find natural components first
    const components = this.findComponents(tables, edges);
    
    if (components.length > 1) {
      // If we have multiple components, use them as clusters
      components.forEach((component, idx) => {
        if (component.tables.length >= 2) {
          clusters.push({
            id: `natural_component_${idx}`,
            tables: component.tables,
            method: 'natural_component',
            confidence: 0.9,
            metadata: {
              coreReason: 'Natural disconnected component'
            }
          });
        }
      });
    } else {
      // Single component - need to split artificially
      logger.info('Single component detected, applying aggressive splitting');

      // Step 1: Hub-based splitting
      const hubClusters = this.createHubBasedClusters(tables, edges);
      clusters.push(...hubClusters);

      // Step 2: Size-based clustering for remaining tables
      const assignedTables = new Set(clusters.flatMap(c => c.tables));
      const remainingTables = tables.filter(t => !assignedTables.has(t.name));
      
      if (remainingTables.length > 0) {
        const sizeClusters = this.createSizeBasedClusters(remainingTables);
        clusters.push(...sizeClusters);
      }

      // Step 3: FK-pattern clustering for any remaining
      const stillUnassigned = tables.filter(t => 
        !clusters.some(c => c.tables.includes(t.name))
      );
      
      if (stillUnassigned.length > 0) {
        const fkClusters = this.createFKPatternClusters(stillUnassigned, edges);
        clusters.push(...fkClusters);
      }
    }

    // Ensure minimum cluster sizes
    const finalClusters = this.mergeTinyClustersByProximity(clusters, edges, tables);

    // Calculate metrics
    const totalTables = tables.length;
    const clusteredTables = finalClusters.reduce((sum, c) => sum + c.tables.length, 0);
    const coverage = totalTables > 0 ? clusteredTables / totalTables : 0;

    return {
      method: 'connected_components',
      clusters: finalClusters,
      reason: 'Breaking down mega-domain using component analysis',
      metrics: {
        coverage,
        avgClusterSize: finalClusters.length > 0 ? clusteredTables / finalClusters.length : 0,
        modularity: this.calculateSimpleModularity(finalClusters, edges),
        success: coverage > 0.8 && finalClusters.length >= 3
      }
    };
  }

  /**
   * Strategy 1: Connected Components Clustering
   * Best for: Disconnected graphs with natural boundaries
   */
  private async connectedComponentsClustering(
    tables: TableInfo[],
    edges: WeightedEdge[],
    graphMetrics: any
  ): Promise<FallbackResult> {
    logger.info('Using connected components fallback strategy');

    const components = this.findComponents(tables, edges);
    const clusters: FallbackCluster[] = [];

    // Convert each component to a cluster
    components.forEach((component, idx) => {
      if (component.tables.length >= 2) {
        // Valid cluster
        clusters.push({
          id: `component_${idx}`,
          tables: component.tables,
          method: 'connected_component',
          confidence: 0.8, // High confidence for natural boundaries
          metadata: {
            coreReason: 'Natural graph boundary'
          }
        });
      } else if (component.tables.length === 1) {
        // Try to merge singleton with nearest cluster
        const merged = this.mergeSingleton(
          component.tables[0],
          clusters,
          tables,
          edges
        );
        
        if (!merged) {
          // Create singleton cluster
          clusters.push({
            id: `component_${idx}`,
            tables: component.tables,
            method: 'singleton',
            confidence: 0.3,
            metadata: {
              coreReason: 'Isolated table'
            }
          });
        }
      }
    });

    // Calculate metrics
    const totalTables = tables.length;
    const clusteredTables = clusters.reduce((sum, c) => sum + c.tables.length, 0);
    const coverage = totalTables > 0 ? clusteredTables / totalTables : 0;

    return {
      method: 'connected_components',
      clusters,
      reason: 'Graph has multiple disconnected components',
      metrics: {
        coverage,
        avgClusterSize: clusters.length > 0 ? clusteredTables / clusters.length : 0,
        modularity: this.calculateSimpleModularity(clusters, edges),
        success: coverage > 0.8 && clusters.length > 0
      }
    };
  }

  /**
   * Strategy 2: Hierarchical Merge Clustering
   * Best for: Sparse graphs with weak connections
   */
  private async hierarchicalMergeClustering(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<FallbackResult> {
    logger.info('Using hierarchical merge fallback strategy');

    // Start with each table as its own cluster
    let clusters: FallbackCluster[] = tables.map((table, idx) => ({
      id: `hier_${idx}`,
      tables: [table.name],
      method: 'hierarchical',
      confidence: 0.5,
      metadata: {
        mergeHistory: []
      }
    }));

    // Build merge candidates based on edges
    const mergeScores = this.calculateMergeScores(clusters, edges, tables);

    // Iteratively merge clusters
    let iteration = 0;
    const maxIterations = Math.ceil(Math.log2(tables.length));
    const targetClusters = Math.max(3, Math.floor(Math.sqrt(tables.length)));

    while (clusters.length > targetClusters && iteration < maxIterations) {
      const bestMerge = this.findBestMerge(clusters, mergeScores);
      
      if (!bestMerge || bestMerge.score < 0.1) break;

      // Perform merge
      const merged = this.mergeClusters(
        clusters[bestMerge.i],
        clusters[bestMerge.j],
        `hier_merged_${iteration}`
      );

      // Update clusters array
      clusters = clusters.filter((_, idx) => idx !== bestMerge.i && idx !== bestMerge.j);
      clusters.push(merged);

      // Update merge scores
      this.updateMergeScores(mergeScores, clusters, edges);
      
      iteration++;
    }

    // Calculate metrics
    const totalTables = tables.length;
    const clusteredTables = clusters.reduce((sum, c) => sum + c.tables.length, 0);

    return {
      method: 'hierarchical_merge',
      clusters,
      reason: 'Sparse graph requiring bottom-up clustering',
      metrics: {
        coverage: clusteredTables / totalTables,
        avgClusterSize: clusters.length > 0 ? clusteredTables / clusters.length : 0,
        modularity: this.calculateSimpleModularity(clusters, edges),
        success: clusters.length <= targetClusters * 1.5 && clusters.length >= 3
      }
    };
  }

  /**
   * Strategy 3: Constraint-Based Clustering
   * Best for: Extremely sparse graphs with business rules
   */
  private async constraintBasedClustering(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<FallbackResult> {
    logger.info('Using constraint-based fallback strategy');

    const clusters: FallbackCluster[] = [];
    const assigned = new Set<string>();

    // Step 1: Create clusters around tables with multiple FKs
    const fkHubs = tables.filter(table => 
      table.columns.filter(c => c.isForeignKey).length >= 2
    ).sort((a, b) => 
      b.columns.filter(c => c.isForeignKey).length - 
      a.columns.filter(c => c.isForeignKey).length
    );

    fkHubs.forEach((hub, idx) => {
      if (assigned.has(hub.name)) return;

      const cluster = this.buildConstraintCluster(hub, tables, assigned);
      if (cluster.tables.length >= 2) {
        clusters.push({
          id: `constraint_${idx}`,
          tables: cluster.tables,
          method: 'constraint_based',
          confidence: 0.7,
          metadata: {
            coreReason: 'FK hub table',
            constraints: cluster.constraints
          }
        });
        
        cluster.tables.forEach(t => assigned.add(t));
      }
    });

    // Step 2: Create clusters around high-column tables
    const largeTables = tables
      .filter(t => !assigned.has(t.name) && t.columns.length > 20)
      .sort((a, b) => b.columns.length - a.columns.length);

    largeTables.forEach((table, idx) => {
      if (assigned.has(table.name)) return;

      const relatedTables = this.findRelatedByStructure(table, tables, assigned);
      if (relatedTables.length >= 1) {
        const clusterTables = [table.name, ...relatedTables];
        clusters.push({
          id: `constraint_large_${idx}`,
          tables: clusterTables,
          method: 'constraint_based',
          confidence: 0.6,
          metadata: {
            coreReason: 'Large table with related structures',
            constraints: ['size_similarity', 'type_distribution']
          }
        });
        
        clusterTables.forEach(t => assigned.add(t));
      }
    });

    // Step 3: Group remaining tables by structural similarity
    const unassigned = tables.filter(t => !assigned.has(t.name));
    const similarityGroups = this.groupBySimilarity(unassigned);

    similarityGroups.forEach((group, idx) => {
      if (group.length >= 2) {
        clusters.push({
          id: `constraint_similar_${idx}`,
          tables: group.map(t => t.name),
          method: 'constraint_based',
          confidence: 0.5,
          metadata: {
            coreReason: 'Structural similarity',
            constraints: ['column_patterns', 'type_similarity']
          }
        });
      }
    });

    // Calculate metrics
    const totalTables = tables.length;
    const clusteredTables = clusters.reduce((sum, c) => sum + c.tables.length, 0);

    return {
      method: 'constraint_based',
      clusters,
      reason: 'Extremely sparse graph requiring constraint-based clustering',
      metrics: {
        coverage: clusteredTables / totalTables,
        avgClusterSize: clusters.length > 0 ? clusteredTables / clusters.length : 0,
        modularity: this.calculateSimpleModularity(clusters, edges),
        success: clusters.length > 0 && clusteredTables >= totalTables * 0.7
      }
    };
  }

  /**
   * Strategy 4: Force-Directed Clustering
   * Best for: Graphs with varied edge weights
   */
  private async forceDirectedClustering(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<FallbackResult> {
    logger.info('Using force-directed fallback strategy');

    // Initialize positions randomly
    const positions = this.initializePositions(tables);

    // Run force-directed layout
    const iterations = 50;
    for (let i = 0; i < iterations; i++) {
      this.applyForces(positions, edges, tables);
    }

    // Cluster based on spatial proximity
    const clusters = this.clusterByPosition(positions, tables);

    // Calculate metrics
    const totalTables = tables.length;
    const clusteredTables = clusters.reduce((sum, c) => sum + c.tables.length, 0);

    return {
      method: 'force_directed',
      clusters,
      reason: 'Using force-directed layout for clustering',
      metrics: {
        coverage: clusteredTables / totalTables,
        avgClusterSize: clusters.length > 0 ? clusteredTables / clusters.length : 0,
        modularity: this.calculateSimpleModularity(clusters, edges),
        success: clusters.length > 0 && clusteredTables >= totalTables * 0.8
      }
    };
  }

  /**
   * Strategy 5: Spectral Fallback with Aggressive Parameters
   * Best for: Last resort when other methods fail
   */
  private async spectralFallbackClustering(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): Promise<FallbackResult> {
    logger.info('Using spectral fallback strategy with aggressive parameters');

    // Build adjacency matrix
    const adjacencyMatrix = this.buildAdjacencyMatrix(tables, edges);

    // Use simple k-means on table features if spectral fails
    const targetK = Math.max(3, Math.min(15, Math.floor(Math.sqrt(tables.length))));
    const clusters = this.kmeansOnFeatures(tables, targetK);

    // Calculate metrics
    const totalTables = tables.length;
    const clusteredTables = clusters.reduce((sum, c) => sum + c.tables.length, 0);

    return {
      method: 'spectral_fallback',
      clusters,
      reason: 'Fallback to feature-based clustering',
      metrics: {
        coverage: clusteredTables / totalTables,
        avgClusterSize: clusters.length > 0 ? clusteredTables / clusters.length : 0,
        modularity: this.calculateSimpleModularity(clusters, edges),
        success: clusters.length >= 3 && clusteredTables === totalTables
      }
    };
  }

  /**
   * Helper: Find connected components
   */
  private findComponents(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): { tables: string[]; edges: WeightedEdge[]; size: number }[] {
    const adjacency = new Map<string, Set<string>>();
    const visited = new Set<string>();
    const components: { tables: string[]; edges: WeightedEdge[]; size: number }[] = [];

    // Build adjacency
    tables.forEach(t => adjacency.set(t.name, new Set()));
    edges.forEach(edge => {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    });

    // DFS to find components
    const dfs = (node: string, component: Set<string>) => {
      visited.add(node);
      component.add(node);

      const neighbors = adjacency.get(node) || new Set();
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, component);
        }
      });
    };

    // Find all components
    tables.forEach(table => {
      if (!visited.has(table.name)) {
        const component = new Set<string>();
        dfs(table.name, component);

        const componentTables = Array.from(component);
        const componentEdges = edges.filter(e =>
          component.has(e.source) && component.has(e.target)
        );

        components.push({
          tables: componentTables,
          edges: componentEdges,
          size: componentTables.length
        });
      }
    });

    return components.sort((a, b) => b.size - a.size);
  }

  /**
   * Helper: Merge singleton table with nearest cluster
   */
  private mergeSingleton(
    singleton: string,
    clusters: FallbackCluster[],
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): boolean {
    // Find edges connected to singleton
    const connectedEdges = edges.filter(e =>
      e.source === singleton || e.target === singleton
    );

    if (connectedEdges.length === 0) return false;

    // Find best cluster to merge with
    let bestCluster: FallbackCluster | null = null;
    let bestWeight = 0;

    clusters.forEach(cluster => {
      const clusterSet = new Set(cluster.tables);
      const connectionWeight = connectedEdges
        .filter(e => {
          const other = e.source === singleton ? e.target : e.source;
          return clusterSet.has(other);
        })
        .reduce((sum, e) => sum + e.components.finalWeight, 0);

      if (connectionWeight > bestWeight) {
        bestWeight = connectionWeight;
        bestCluster = cluster;
      }
    });

    if (bestCluster && bestWeight > 0) {
      bestCluster.tables.push(singleton);
      bestCluster.metadata.mergeHistory = bestCluster.metadata.mergeHistory || [];
      bestCluster.metadata.mergeHistory.push(`Merged singleton ${singleton}`);
      return true;
    }

    return false;
  }

  /**
   * Helper: Calculate merge scores for hierarchical clustering
   */
  private calculateMergeScores(
    clusters: FallbackCluster[],
    edges: WeightedEdge[],
    tables: TableInfo[]
  ): Map<string, number> {
    const scores = new Map<string, number>();

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const score = this.calculateClusterSimilarity(
          clusters[i],
          clusters[j],
          edges,
          tables
        );
        scores.set(`${i}-${j}`, score);
      }
    }

    return scores;
  }

  /**
   * Helper: Calculate similarity between two clusters
   */
  private calculateClusterSimilarity(
    cluster1: FallbackCluster,
    cluster2: FallbackCluster,
    edges: WeightedEdge[],
    tables: TableInfo[]
  ): number {
    // Edge-based similarity
    const set1 = new Set(cluster1.tables);
    const set2 = new Set(cluster2.tables);
    
    let edgeWeight = 0;
    edges.forEach(edge => {
      if ((set1.has(edge.source) && set2.has(edge.target)) ||
          (set2.has(edge.source) && set1.has(edge.target))) {
        edgeWeight += edge.components.finalWeight;
      }
    });

    // Structure-based similarity
    const tableMap = new Map(tables.map(t => [t.name, t]));
    let structuralSimilarity = 0;
    let comparisons = 0;

    cluster1.tables.forEach(t1 => {
      cluster2.tables.forEach(t2 => {
        const table1 = tableMap.get(t1);
        const table2 = tableMap.get(t2);
        if (table1 && table2) {
          structuralSimilarity += this.calculateTableSimilarity(table1, table2);
          comparisons++;
        }
      });
    });

    const avgStructural = comparisons > 0 ? structuralSimilarity / comparisons : 0;

    return edgeWeight * 0.7 + avgStructural * 0.3;
  }

  /**
   * Helper: Calculate table similarity
   */
  private calculateTableSimilarity(table1: TableInfo, table2: TableInfo): number {
    // Size similarity
    const sizeDiff = Math.abs(table1.columns.length - table2.columns.length);
    const sizeSimilarity = 1 / (1 + sizeDiff / 10);

    // Type distribution similarity
    const types1 = this.getTypeDistribution(table1);
    const types2 = this.getTypeDistribution(table2);
    const typeSimilarity = this.cosineSimilarity(types1, types2);

    // FK pattern similarity
    const fkRatio1 = table1.columns.filter(c => c.isForeignKey).length / table1.columns.length;
    const fkRatio2 = table2.columns.filter(c => c.isForeignKey).length / table2.columns.length;
    const fkSimilarity = 1 - Math.abs(fkRatio1 - fkRatio2);

    return sizeSimilarity * 0.3 + typeSimilarity * 0.5 + fkSimilarity * 0.2;
  }

  /**
   * Helper: Get type distribution for a table
   */
  private getTypeDistribution(table: TableInfo): Map<string, number> {
    const distribution = new Map<string, number>();
    
    table.columns.forEach(col => {
      const type = this.normalizeType(col.type);
      distribution.set(type, (distribution.get(type) || 0) + 1);
    });

    // Normalize to proportions
    const total = table.columns.length;
    distribution.forEach((count, type) => {
      distribution.set(type, count / total);
    });

    return distribution;
  }

  /**
   * Helper: Normalize data type
   */
  private normalizeType(type: string): string {
    const lower = type.toLowerCase();
    if (/int|integer|bigint|smallint|tinyint/.test(lower)) return 'integer';
    if (/decimal|numeric|float|double|real|money/.test(lower)) return 'numeric';
    if (/char|varchar|text|string/.test(lower)) return 'string';
    if (/date|time|timestamp/.test(lower)) return 'datetime';
    if (/bool|boolean|bit/.test(lower)) return 'boolean';
    return 'other';
  }

  /**
   * Helper: Cosine similarity between distributions
   */
  private cosineSimilarity(dist1: Map<string, number>, dist2: Map<string, number>): number {
    const keys = new Set([...dist1.keys(), ...dist2.keys()]);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    keys.forEach(key => {
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
   * Helper: Find best merge for hierarchical clustering
   */
  private findBestMerge(
    clusters: FallbackCluster[],
    scores: Map<string, number>
  ): { i: number; j: number; score: number } | null {
    let best: { i: number; j: number; score: number } | null = null;

    scores.forEach((score, key) => {
      const [i, j] = key.split('-').map(Number);
      
      // Check if clusters still exist
      if (i < clusters.length && j < clusters.length) {
        if (!best || score > best.score) {
          best = { i, j, score };
        }
      }
    });

    return best;
  }

  /**
   * Helper: Merge two clusters
   */
  private mergeClusters(
    cluster1: FallbackCluster,
    cluster2: FallbackCluster,
    newId: string
  ): FallbackCluster {
    const mergeHistory = [
      ...(cluster1.metadata.mergeHistory || []),
      ...(cluster2.metadata.mergeHistory || []),
      `Merged ${cluster1.id} + ${cluster2.id}`
    ];

    return {
      id: newId,
      tables: [...cluster1.tables, ...cluster2.tables],
      method: 'hierarchical',
      confidence: (cluster1.confidence + cluster2.confidence) / 2,
      metadata: {
        mergeHistory
      }
    };
  }

  /**
   * Helper: Update merge scores after a merge
   */
  private updateMergeScores(
    scores: Map<string, number>,
    clusters: FallbackCluster[],
    edges: WeightedEdge[]
  ): void {
    // This is a simplified update - in practice, you'd recalculate affected scores
    scores.clear();
    
    // Recalculate all scores (can be optimized)
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const score = this.calculateClusterSimilarity(
          clusters[i],
          clusters[j],
          edges,
          []
        );
        scores.set(`${i}-${j}`, score);
      }
    }
  }

  /**
   * Helper: Build constraint-based cluster
   */
  private buildConstraintCluster(
    hub: TableInfo,
    tables: TableInfo[],
    assigned: Set<string>
  ): { tables: string[]; constraints: string[] } {
    const clusterTables = [hub.name];
    const constraints = [`FK hub with ${hub.columns.filter(c => c.isForeignKey).length} FKs`];

    // Find referenced tables
    hub.columns.forEach(col => {
      if (col.isForeignKey && col.references && !assigned.has(col.references.table)) {
        const refTable = tables.find(t => t.name === col.references!.table);
        if (refTable) {
          clusterTables.push(refTable.name);
          constraints.push(`FK reference to ${refTable.name}`);
        }
      }
    });

    // Find tables referencing this hub
    tables.forEach(table => {
      if (assigned.has(table.name) || clusterTables.includes(table.name)) return;

      const referencesHub = table.columns.some(col =>
        col.isForeignKey && col.references?.table === hub.name
      );

      if (referencesHub) {
        clusterTables.push(table.name);
        constraints.push(`Referenced by ${table.name}`);
      }
    });

    return { tables: clusterTables, constraints };
  }

  /**
   * Helper: Find related tables by structure
   */
  private findRelatedByStructure(
    table: TableInfo,
    allTables: TableInfo[],
    assigned: Set<string>
  ): string[] {
    const related: string[] = [];
    const similarity_threshold = 0.7;

    allTables.forEach(other => {
      if (other.name === table.name || assigned.has(other.name)) return;

      const similarity = this.calculateTableSimilarity(table, other);
      if (similarity > similarity_threshold) {
        related.push(other.name);
      }
    });

    return related.sort((a, b) => {
      const tableA = allTables.find(t => t.name === a)!;
      const tableB = allTables.find(t => t.name === b)!;
      return this.calculateTableSimilarity(table, tableB) - 
             this.calculateTableSimilarity(table, tableA);
    }).slice(0, 5); // Limit to top 5
  }

  /**
   * Helper: Group tables by similarity
   */
  private groupBySimilarity(tables: TableInfo[]): TableInfo[][] {
    const groups: TableInfo[][] = [];
    const assigned = new Set<string>();

    tables.forEach(table => {
      if (assigned.has(table.name)) return;

      const group = [table];
      assigned.add(table.name);

      // Find similar tables
      tables.forEach(other => {
        if (assigned.has(other.name)) return;

        const similarity = this.calculateTableSimilarity(table, other);
        if (similarity > 0.8) {
          group.push(other);
          assigned.add(other.name);
        }
      });

      if (group.length >= 2) {
        groups.push(group);
      }
    });

    return groups;
  }

  /**
   * Helper: Initialize positions for force-directed layout
   */
  private initializePositions(tables: TableInfo[]): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const radius = Math.sqrt(tables.length) * 10;

    tables.forEach((table, i) => {
      const angle = (2 * Math.PI * i) / tables.length;
      positions.set(table.name, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      });
    });

    return positions;
  }

  /**
   * Helper: Apply forces for one iteration
   */
  private applyForces(
    positions: Map<string, { x: number; y: number }>,
    edges: WeightedEdge[],
    tables: TableInfo[]
  ): void {
    const forces = new Map<string, { fx: number; fy: number }>();
    
    // Initialize forces
    tables.forEach(table => {
      forces.set(table.name, { fx: 0, fy: 0 });
    });

    // Repulsive forces between all nodes
    const k_repulse = 100;
    tables.forEach(t1 => {
      tables.forEach(t2 => {
        if (t1.name === t2.name) return;

        const pos1 = positions.get(t1.name)!;
        const pos2 = positions.get(t2.name)!;
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;

        const force = k_repulse / (dist * dist);
        const fx = -force * dx / dist;
        const fy = -force * dy / dist;

        const f1 = forces.get(t1.name)!;
        f1.fx += fx;
        f1.fy += fy;
      });
    });

    // Attractive forces along edges
    const k_attract = 10;
    edges.forEach(edge => {
      const pos1 = positions.get(edge.source);
      const pos2 = positions.get(edge.target);
      
      if (!pos1 || !pos2) return;

      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const force = k_attract * edge.components.finalWeight * dist;
      const fx = force * dx / dist;
      const fy = force * dy / dist;

      const f1 = forces.get(edge.source)!;
      const f2 = forces.get(edge.target)!;
      
      f1.fx += fx;
      f1.fy += fy;
      f2.fx -= fx;
      f2.fy -= fy;
    });

    // Apply forces with damping
    const damping = 0.85;
    positions.forEach((pos, table) => {
      const force = forces.get(table)!;
      pos.x += force.fx * damping;
      pos.y += force.fy * damping;
    });
  }

  /**
   * Helper: Cluster based on spatial positions
   */
  private clusterByPosition(
    positions: Map<string, { x: number; y: number }>,
    tables: TableInfo[]
  ): FallbackCluster[] {
    // Simple grid-based clustering
    const gridSize = Math.sqrt(tables.length) * 5;
    const grid = new Map<string, string[]>();

    positions.forEach((pos, table) => {
      const gridX = Math.floor(pos.x / gridSize);
      const gridY = Math.floor(pos.y / gridSize);
      const key = `${gridX},${gridY}`;
      
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(table);
    });

    // Convert grid cells to clusters
    const clusters: FallbackCluster[] = [];
    let clusterId = 0;

    grid.forEach((tables, gridKey) => {
      if (tables.length >= 2) {
        clusters.push({
          id: `force_${clusterId++}`,
          tables,
          method: 'force_directed',
          confidence: 0.6,
          metadata: {
            coreReason: `Spatial proximity in grid ${gridKey}`
          }
        });
      }
    });

    // Handle singletons
    grid.forEach((tables, gridKey) => {
      if (tables.length === 1) {
        // Try to merge with nearest cluster
        const merged = this.mergeSingleton(tables[0], clusters, [], []);
        if (!merged) {
          clusters.push({
            id: `force_single_${clusterId++}`,
            tables,
            method: 'force_directed',
            confidence: 0.3,
            metadata: {
              coreReason: 'Isolated in force-directed layout'
            }
          });
        }
      }
    });

    return clusters;
  }

  /**
   * Helper: K-means on table features
   */
  private kmeansOnFeatures(tables: TableInfo[], k: number): FallbackCluster[] {
    // Extract features for each table
    const features = tables.map(table => this.extractTableFeatures(table));
    
    // Initialize centroids
    const centroids = this.initializeCentroids(features, k);
    
    // Run k-means
    const maxIterations = 20;
    let assignments = new Array(tables.length).fill(-1);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const newAssignments = this.assignToCentroids(features, centroids);
      
      if (this.arraysEqual(assignments, newAssignments)) break;
      
      assignments = newAssignments;
      this.updateCentroids(features, assignments, centroids);
    }

    // Convert assignments to clusters
    const clusters: FallbackCluster[] = [];
    for (let i = 0; i < k; i++) {
      const clusterTables = tables
        .filter((_, idx) => assignments[idx] === i)
        .map(t => t.name);
      
      if (clusterTables.length > 0) {
        clusters.push({
          id: `kmeans_${i}`,
          tables: clusterTables,
          method: 'feature_kmeans',
          confidence: 0.5,
          metadata: {
            coreReason: 'Feature-based clustering'
          }
        });
      }
    }

    return clusters;
  }

  /**
   * Helper: Extract numerical features from table
   */
  private extractTableFeatures(table: TableInfo): number[] {
    const columnCount = table.columns.length;
    const pkCount = table.columns.filter(c => c.isPrimaryKey).length;
    const fkCount = table.columns.filter(c => c.isForeignKey).length;
    const uniqueCount = table.columns.filter(c => c.unique).length;
    const nullableCount = table.columns.filter(c => c.nullable).length;

    // Type distribution
    const types = this.getTypeDistribution(table);
    const integerRatio = types.get('integer') || 0;
    const stringRatio = types.get('string') || 0;
    const datetimeRatio = types.get('datetime') || 0;

    return [
      columnCount / 50,          // Normalized by typical max
      pkCount,
      fkCount / 10,              // Normalized
      uniqueCount / columnCount,
      nullableCount / columnCount,
      integerRatio,
      stringRatio,
      datetimeRatio
    ];
  }

  /**
   * Helper: Initialize k-means centroids
   */
  private initializeCentroids(features: number[][], k: number): number[][] {
    // K-means++ initialization
    const centroids: number[][] = [];
    const indices = new Set<number>();

    // First centroid: random
    const firstIdx = Math.floor(Math.random() * features.length);
    centroids.push([...features[firstIdx]]);
    indices.add(firstIdx);

    // Remaining centroids: probabilistic based on distance
    for (let i = 1; i < k; i++) {
      const distances = features.map((feature, idx) => {
        if (indices.has(idx)) return 0;
        
        const minDist = centroids.reduce((min, centroid) => {
          const dist = this.euclideanDistance(feature, centroid);
          return Math.min(min, dist);
        }, Infinity);
        
        return minDist * minDist;
      });

      const totalDist = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalDist;
      
      for (let idx = 0; idx < features.length; idx++) {
        random -= distances[idx];
        if (random <= 0 && !indices.has(idx)) {
          centroids.push([...features[idx]]);
          indices.add(idx);
          break;
        }
      }
    }

    return centroids;
  }

  /**
   * Helper: Assign points to nearest centroid
   */
  private assignToCentroids(features: number[][], centroids: number[][]): number[] {
    return features.map(feature => {
      let bestIdx = 0;
      let bestDist = Infinity;

      centroids.forEach((centroid, idx) => {
        const dist = this.euclideanDistance(feature, centroid);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      return bestIdx;
    });
  }

  /**
   * Helper: Update centroids based on assignments
   */
  private updateCentroids(
    features: number[][],
    assignments: number[],
    centroids: number[][]
  ): void {
    const k = centroids.length;
    const featureDim = features[0].length;

    for (let i = 0; i < k; i++) {
      const clusterFeatures = features.filter((_, idx) => assignments[idx] === i);
      
      if (clusterFeatures.length > 0) {
        // Calculate mean
        const newCentroid = new Array(featureDim).fill(0);
        
        clusterFeatures.forEach(feature => {
          feature.forEach((val, dim) => {
            newCentroid[dim] += val;
          });
        });

        newCentroid.forEach((val, dim) => {
          centroids[i][dim] = val / clusterFeatures.length;
        });
      }
    }
  }

  /**
   * Helper: Euclidean distance
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * Helper: Check if arrays are equal
   */
  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Helper: Build adjacency matrix
   */
  private buildAdjacencyMatrix(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): number[][] {
    const n = tables.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
    const tableIndex = new Map(tables.map((t, i) => [t.name, i]));

    edges.forEach(edge => {
      const i = tableIndex.get(edge.source);
      const j = tableIndex.get(edge.target);
      
      if (i !== undefined && j !== undefined) {
        matrix[i][j] = edge.components.finalWeight;
        matrix[j][i] = edge.components.finalWeight;
      }
    });

    return matrix;
  }

  /**
   * Helper: Calculate simple modularity
   */
  private calculateSimpleModularity(
    clusters: FallbackCluster[],
    edges: WeightedEdge[]
  ): number {
    if (edges.length === 0) return 0;

    const membership = new Map<string, number>();
    clusters.forEach((cluster, idx) => {
      cluster.tables.forEach(table => {
        membership.set(table, idx);
      });
    });

    let intraEdges = 0;
    edges.forEach(edge => {
      const c1 = membership.get(edge.source);
      const c2 = membership.get(edge.target);
      
      if (c1 !== undefined && c2 !== undefined && c1 === c2) {
        intraEdges++;
      }
    });

    return intraEdges / edges.length;
  }

  /**
   * Helper: Create hub-based clusters for mega-domain splitting
   */
  private createHubBasedClusters(tables: TableInfo[], edges: WeightedEdge[]): FallbackCluster[] {
    const clusters: FallbackCluster[] = [];
    const degreeMap = new Map<string, number>();
    
    // Calculate degrees
    tables.forEach(table => degreeMap.set(table.name, 0));
    edges.forEach(edge => {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    });

    // Find hub tables (high degree)
    const avgDegree = Array.from(degreeMap.values()).reduce((sum, d) => sum + d, 0) / tables.length;
    const hubs = Array.from(degreeMap.entries())
      .filter(([_, degree]) => degree > avgDegree * 2 && degree >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Top 5 hubs
      .map(([name, _]) => name);

    // Create clusters around each hub
    hubs.forEach((hubName, idx) => {
      const connectedTables = [hubName];
      edges.forEach(edge => {
        if (edge.source === hubName && !connectedTables.includes(edge.target)) {
          connectedTables.push(edge.target);
        } else if (edge.target === hubName && !connectedTables.includes(edge.source)) {
          connectedTables.push(edge.source);
        }
      });

      if (connectedTables.length >= 3) {
        clusters.push({
          id: `hub_${idx}`,
          tables: connectedTables.slice(0, 15), // Limit cluster size
          method: 'hub_based',
          confidence: 0.7,
          metadata: {
            coreReason: `Hub table: ${hubName}`
          }
        });
      }
    });

    return clusters;
  }

  /**
   * Helper: Create size-based clusters
   */
  private createSizeBasedClusters(tables: TableInfo[]): FallbackCluster[] {
    const clusters: FallbackCluster[] = [];
    
    // Group tables by size ranges
    const sizeBuckets = {
      small: tables.filter(t => t.columns.length <= 5),
      medium: tables.filter(t => t.columns.length > 5 && t.columns.length <= 15),
      large: tables.filter(t => t.columns.length > 15 && t.columns.length <= 30),
      huge: tables.filter(t => t.columns.length > 30)
    };

    Object.entries(sizeBuckets).forEach(([sizeType, tablesInBucket], idx) => {
      if (tablesInBucket.length >= 3) {
        // Further split by structure similarity
        const similarityGroups = this.groupBySimilarity(tablesInBucket);
        
        similarityGroups.forEach((group, groupIdx) => {
          if (group.length >= 2) {
            clusters.push({
              id: `size_${sizeType}_${groupIdx}`,
              tables: group.map(t => t.name),
              method: 'size_based',
              confidence: 0.6,
              metadata: {
                coreReason: `${sizeType} tables with similar structure`
              }
            });
          }
        });

        // Handle ungrouped tables
        const grouped = new Set(similarityGroups.flat().map(t => t.name));
        const ungrouped = tablesInBucket.filter(t => !grouped.has(t.name));
        
        if (ungrouped.length >= 3) {
          clusters.push({
            id: `size_${sizeType}_misc`,
            tables: ungrouped.map(t => t.name),
            method: 'size_based',
            confidence: 0.4,
            metadata: {
              coreReason: `${sizeType} tables (mixed structure)`
            }
          });
        }
      }
    });

    return clusters;
  }

  /**
   * Helper: Create FK pattern-based clusters
   */
  private createFKPatternClusters(tables: TableInfo[], edges: WeightedEdge[]): FallbackCluster[] {
    const clusters: FallbackCluster[] = [];
    const fkPatterns = new Map<string, TableInfo[]>();

    // Group by FK patterns
    tables.forEach(table => {
      const fkCount = table.columns.filter(c => c.isForeignKey).length;
      const totalCols = table.columns.length;
      const fkRatio = totalCols > 0 ? fkCount / totalCols : 0;

      let pattern = 'no_fk';
      if (fkRatio > 0.5) pattern = 'fk_heavy';
      else if (fkRatio > 0.2) pattern = 'fk_medium';
      else if (fkCount > 0) pattern = 'fk_light';

      if (!fkPatterns.has(pattern)) {
        fkPatterns.set(pattern, []);
      }
      fkPatterns.get(pattern)!.push(table);
    });

    // Create clusters from patterns
    fkPatterns.forEach((patternTables, pattern) => {
      if (patternTables.length >= 3) {
        clusters.push({
          id: `fk_pattern_${pattern}`,
          tables: patternTables.map(t => t.name),
          method: 'fk_pattern',
          confidence: 0.5,
          metadata: {
            coreReason: `FK pattern: ${pattern}`
          }
        });
      }
    });

    return clusters;
  }

  /**
   * Helper: Merge tiny clusters by proximity
   */
  private mergeTinyClustersByProximity(
    clusters: FallbackCluster[], 
    edges: WeightedEdge[], 
    tables: TableInfo[]
  ): FallbackCluster[] {
    const finalClusters: FallbackCluster[] = [];
    const tinyClusters: FallbackCluster[] = [];

    // Separate normal and tiny clusters
    clusters.forEach(cluster => {
      if (cluster.tables.length >= 3) {
        finalClusters.push(cluster);
      } else {
        tinyClusters.push(cluster);
      }
    });

    // Try to merge tiny clusters with nearby normal clusters
    tinyClusters.forEach(tinyCluster => {
      let merged = false;
      
      // Find best normal cluster to merge with
      let bestCluster: FallbackCluster | null = null;
      let bestConnectionScore = 0;

      finalClusters.forEach(normalCluster => {
        const connectionScore = this.calculateClusterConnectionScore(
          tinyCluster.tables, 
          normalCluster.tables, 
          edges
        );
        
        if (connectionScore > bestConnectionScore && connectionScore > 0.1) {
          bestConnectionScore = connectionScore;
          bestCluster = normalCluster;
        }
      });

      if (bestCluster && bestCluster.tables.length < 20) { // Don't make clusters too large
        bestCluster.tables.push(...tinyCluster.tables);
        bestCluster.confidence = Math.min(bestCluster.confidence, 0.6);
        merged = true;
      }

      if (!merged) {
        // Create a miscellaneous cluster from all unmerged tiny clusters
        if (!finalClusters.find(c => c.id === 'misc_small')) {
          finalClusters.push({
            id: 'misc_small',
            tables: [],
            method: 'miscellaneous',
            confidence: 0.3,
            metadata: {
              coreReason: 'Small unconnected tables'
            }
          });
        }
        
        const miscCluster = finalClusters.find(c => c.id === 'misc_small')!;
        miscCluster.tables.push(...tinyCluster.tables);
      }
    });

    return finalClusters;
  }

  /**
   * Helper: Calculate connection score between two clusters
   */
  private calculateClusterConnectionScore(
    cluster1Tables: string[], 
    cluster2Tables: string[], 
    edges: WeightedEdge[]
  ): number {
    let connectionCount = 0;
    let totalWeight = 0;

    edges.forEach(edge => {
      const inCluster1 = cluster1Tables.includes(edge.source) || cluster1Tables.includes(edge.target);
      const inCluster2 = cluster2Tables.includes(edge.source) || cluster2Tables.includes(edge.target);
      
      if (inCluster1 && inCluster2) {
        connectionCount++;
        totalWeight += edge.components.finalWeight;
      }
    });

    // Normalize by cluster sizes
    const maxPossibleConnections = cluster1Tables.length * cluster2Tables.length;
    const connectionRatio = maxPossibleConnections > 0 ? connectionCount / maxPossibleConnections : 0;
    const avgWeight = connectionCount > 0 ? totalWeight / connectionCount : 0;

    return connectionRatio * 0.6 + avgWeight * 0.4;
  }
}

export const dbscanFallbackStrategies = new DBSCANFallbackStrategies();