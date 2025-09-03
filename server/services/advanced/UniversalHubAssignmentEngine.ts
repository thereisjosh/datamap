import { TableInfo, Relationship } from '../../../shared/schema';
import { Logger } from '../../utils/logger';

const logger = new Logger('UniversalHubAssignmentEngine');

// Mathematical hub assignment engine without linguistic assumptions
export interface HubAssignmentResult {
  assignedHubs: HubAssignment[];
  isolatedHubs: string[];
  statistics: {
    totalHubs: number;
    assignedCount: number;
    isolatedCount: number;
    avgAffinityScore: number;
    assignmentDistribution: Map<number, number>; // clusterId -> hub count
  };
}

export interface HubAssignment {
  hubTable: string;
  assignedCluster: number;
  affinityScore: number;
  assignmentType: 'strong' | 'moderate' | 'weak';
  metrics: HubAffinityMetrics;
}

export interface HubAffinityMetrics {
  connectionDensity: number;       // Ratio of connections to cluster
  averageEdgeWeight: number;       // Average weight of connections
  structuralCompatibility: number; // Structural similarity to cluster
  topologicalFit: number;         // How well hub fits cluster topology
  centralityAlignment: number;     // Centrality alignment with cluster
  compositeScore: number;         // Final weighted score
}

export interface ClusterProfile {
  clusterId: number;
  tables: string[];
  averageConnectionDegree: number;
  structuralCharacteristics: StructuralProfile;
  topologicalProperties: TopologicalProfile;
}

export interface StructuralProfile {
  avgColumnCount: number;
  dataTypeDistribution: Map<string, number>;
  constraintDistribution: Map<string, number>;
  tableComplexity: number;
}

export interface TopologicalProfile {
  avgDegree: number;
  clusteringCoefficient: number;
  centerOfMass: number[];
  radius: number;
  density: number;
}

export class UniversalHubAssignmentEngine {
  // Assignment thresholds (mathematically derived)
  private readonly STRONG_ASSIGNMENT_THRESHOLD = 0.7;
  private readonly MODERATE_ASSIGNMENT_THRESHOLD = 0.4;
  private readonly WEAK_ASSIGNMENT_THRESHOLD = 0.2;
  private readonly MIN_ASSIGNMENT_THRESHOLD = 0.1;

  // Component weights for affinity calculation
  private readonly CONNECTION_DENSITY_WEIGHT = 0.35;
  private readonly EDGE_WEIGHT_FACTOR = 0.25;
  private readonly STRUCTURAL_COMPATIBILITY_WEIGHT = 0.15;
  private readonly TOPOLOGICAL_FIT_WEIGHT = 0.15;
  private readonly CENTRALITY_ALIGNMENT_WEIGHT = 0.1;

  /**
   * Assign hub tables to clusters using mathematical affinity analysis
   */
  async assignHubsToClusters(
    hubTables: string[],
    clusters: Array<{ clusterId: number; tables: string[] }>,
    tables: TableInfo[],
    relationships: Relationship[],
    adjacencyMatrix?: number[][],
    tableIndexMap?: Map<string, number>
  ): Promise<HubAssignmentResult> {
    logger.info('Starting hub assignment analysis', {
      hubCount: hubTables.length,
      clusterCount: clusters.length,
      totalTables: tables.length
    });

    if (hubTables.length === 0) {
      return {
        assignedHubs: [],
        isolatedHubs: [],
        statistics: {
          totalHubs: 0,
          assignedCount: 0,
          isolatedCount: 0,
          avgAffinityScore: 0,
          assignmentDistribution: new Map()
        }
      };
    }

    // Build necessary data structures if not provided
    const { matrix, indexMap } = adjacencyMatrix && tableIndexMap 
      ? { matrix: adjacencyMatrix, indexMap: tableIndexMap }
      : this.buildAdjacencyMatrix(tables, relationships);

    // Build table lookup map
    const tableMap = new Map(tables.map(t => [t.name, t]));

    // Build cluster profiles for affinity calculation
    const clusterProfiles = await this.buildClusterProfiles(
      clusters, 
      tables, 
      relationships, 
      matrix, 
      indexMap
    );

    // Calculate hub-cluster affinities
    const hubAssignments: HubAssignment[] = [];
    const isolatedHubs: string[] = [];

    for (const hubTable of hubTables) {
      const hubTableInfo = tableMap.get(hubTable);
      if (!hubTableInfo) {
        logger.warn(`Hub table not found: ${hubTable}`);
        isolatedHubs.push(hubTable);
        continue;
      }

      // Calculate affinity to each cluster
      const affinityScores = await Promise.all(
        clusterProfiles.map(profile => 
          this.calculateHubClusterAffinity(
            hubTableInfo, 
            profile, 
            relationships, 
            matrix, 
            indexMap
          )
        )
      );

      // Find best assignment
      const bestAssignment = this.selectOptimalAssignment(
        hubTable, 
        affinityScores, 
        clusterProfiles
      );

      if (bestAssignment) {
        hubAssignments.push(bestAssignment);
      } else {
        isolatedHubs.push(hubTable);
      }
    }

    // Calculate statistics
    const statistics = this.calculateAssignmentStatistics(hubAssignments, isolatedHubs);

    logger.info('Hub assignment complete', {
      assignedHubs: hubAssignments.length,
      isolatedHubs: isolatedHubs.length,
      avgAffinityScore: statistics.avgAffinityScore.toFixed(3)
    });

    return {
      assignedHubs: hubAssignments,
      isolatedHubs,
      statistics
    };
  }

  /**
   * Build comprehensive cluster profiles for affinity analysis
   */
  private async buildClusterProfiles(
    clusters: Array<{ clusterId: number; tables: string[] }>,
    allTables: TableInfo[],
    relationships: Relationship[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): Promise<ClusterProfile[]> {
    const tableMap = new Map(allTables.map(t => [t.name, t]));

    return clusters.map(cluster => {
      const clusterTables = cluster.tables
        .map(name => tableMap.get(name))
        .filter(Boolean) as TableInfo[];

      // Calculate structural characteristics
      const structuralCharacteristics = this.analyzeStructuralCharacteristics(clusterTables);

      // Calculate topological properties
      const topologicalProperties = this.analyzeTopologicalProperties(
        cluster.tables, 
        adjacencyMatrix, 
        tableIndexMap
      );

      // Calculate average connection degree
      const averageConnectionDegree = this.calculateAverageConnectionDegree(
        cluster.tables, 
        relationships
      );

      return {
        clusterId: cluster.clusterId,
        tables: cluster.tables,
        averageConnectionDegree,
        structuralCharacteristics,
        topologicalProperties
      };
    });
  }

  /**
   * Analyze structural characteristics of cluster tables
   */
  private analyzeStructuralCharacteristics(tables: TableInfo[]): StructuralProfile {
    if (tables.length === 0) {
      return {
        avgColumnCount: 0,
        dataTypeDistribution: new Map(),
        constraintDistribution: new Map(),
        tableComplexity: 0
      };
    }

    // Calculate average column count
    const columnCounts = tables.map(t => t.columns.length);
    const avgColumnCount = columnCounts.reduce((sum, count) => sum + count, 0) / columnCounts.length;

    // Aggregate data type distribution
    const allDataTypes = tables.flatMap(t => t.columns.map(c => this.normalizeDataType(c.type)));
    const dataTypeDistribution = this.calculateDistribution(allDataTypes);

    // Aggregate constraint distribution
    const allConstraints = tables.flatMap(t => t.columns.flatMap(c => this.getColumnConstraints(c)));
    const constraintDistribution = this.calculateDistribution(allConstraints);

    // Calculate table complexity (based on relationships and constraints)
    const complexityScores = tables.map(t => this.calculateTableComplexity(t));
    const tableComplexity = complexityScores.reduce((sum, score) => sum + score, 0) / complexityScores.length;

    return {
      avgColumnCount,
      dataTypeDistribution,
      constraintDistribution,
      tableComplexity
    };
  }

  /**
   * Analyze topological properties of cluster
   */
  private analyzeTopologicalProperties(
    clusterTables: string[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): TopologicalProfile {
    const clusterIndices = clusterTables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    if (clusterIndices.length === 0) {
      return {
        avgDegree: 0,
        clusteringCoefficient: 0,
        centerOfMass: [],
        radius: 0,
        density: 0
      };
    }

    // Calculate average degree
    const degrees = clusterIndices.map(idx => 
      adjacencyMatrix[idx].reduce((sum, weight) => sum + (weight > 0 ? 1 : 0), 0)
    );
    const avgDegree = degrees.reduce((sum, deg) => sum + deg, 0) / degrees.length;

    // Calculate clustering coefficient
    const clusteringCoefficient = this.calculateClusteringCoefficient(
      clusterIndices, 
      adjacencyMatrix
    );

    // Calculate center of mass in adjacency space
    const centerOfMass = this.calculateCenterOfMass(clusterIndices, adjacencyMatrix);

    // Calculate radius (maximum distance from center of mass)
    const radius = this.calculateRadius(clusterIndices, centerOfMass, adjacencyMatrix);

    // Calculate density (internal connectivity)
    const density = this.calculateInternalDensity(clusterIndices, adjacencyMatrix);

    return {
      avgDegree,
      clusteringCoefficient,
      centerOfMass,
      radius,
      density
    };
  }

  /**
   * Calculate hub-cluster affinity using multiple mathematical metrics
   */
  private async calculateHubClusterAffinity(
    hubTable: TableInfo,
    clusterProfile: ClusterProfile,
    relationships: Relationship[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): Promise<HubAffinityMetrics> {
    const hubIdx = tableIndexMap.get(hubTable.name);
    if (hubIdx === undefined) {
      return this.createZeroAffinityMetrics();
    }

    // 1. Calculate connection density
    const connectionDensity = this.calculateConnectionDensity(
      hubTable.name, 
      clusterProfile.tables, 
      relationships
    );

    // 2. Calculate average edge weight
    const averageEdgeWeight = this.calculateAverageEdgeWeight(
      hubIdx, 
      clusterProfile.tables, 
      adjacencyMatrix, 
      tableIndexMap
    );

    // 3. Calculate structural compatibility
    const structuralCompatibility = this.calculateStructuralCompatibility(
      hubTable, 
      clusterProfile.structuralCharacteristics
    );

    // 4. Calculate topological fit
    const topologicalFit = this.calculateTopologicalFit(
      hubIdx, 
      clusterProfile.topologicalProperties, 
      adjacencyMatrix
    );

    // 5. Calculate centrality alignment
    const centralityAlignment = this.calculateCentralityAlignment(
      hubIdx, 
      clusterProfile.tables, 
      adjacencyMatrix, 
      tableIndexMap
    );

    // 6. Calculate composite score
    const compositeScore = (
      connectionDensity * this.CONNECTION_DENSITY_WEIGHT +
      averageEdgeWeight * this.EDGE_WEIGHT_FACTOR +
      structuralCompatibility * this.STRUCTURAL_COMPATIBILITY_WEIGHT +
      topologicalFit * this.TOPOLOGICAL_FIT_WEIGHT +
      centralityAlignment * this.CENTRALITY_ALIGNMENT_WEIGHT
    );

    return {
      connectionDensity,
      averageEdgeWeight,
      structuralCompatibility,
      topologicalFit,
      centralityAlignment,
      compositeScore: Math.max(0, Math.min(1, compositeScore))
    };
  }

  /**
   * Calculate connection density between hub and cluster
   */
  private calculateConnectionDensity(
    hubTable: string, 
    clusterTables: string[], 
    relationships: Relationship[]
  ): number {
    if (clusterTables.length === 0) return 0;

    const clusterTableSet = new Set(clusterTables);
    let connectionCount = 0;

    relationships.forEach(rel => {
      if ((rel.sourceTable === hubTable && clusterTableSet.has(rel.targetTable)) ||
          (rel.targetTable === hubTable && clusterTableSet.has(rel.sourceTable))) {
        connectionCount++;
      }
    });

    return connectionCount / clusterTables.length;
  }

  /**
   * Calculate average edge weight between hub and cluster
   */
  private calculateAverageEdgeWeight(
    hubIdx: number,
    clusterTables: string[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    const clusterIndices = clusterTables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    if (clusterIndices.length === 0) return 0;

    let totalWeight = 0;
    let connectionCount = 0;

    clusterIndices.forEach(clusterIdx => {
      const weight = adjacencyMatrix[hubIdx][clusterIdx];
      if (weight > 0) {
        totalWeight += weight;
        connectionCount++;
      }
    });

    return connectionCount > 0 ? totalWeight / connectionCount : 0;
  }

  /**
   * Calculate structural compatibility between hub and cluster
   */
  private calculateStructuralCompatibility(
    hubTable: TableInfo,
    clusterStructural: StructuralProfile
  ): number {
    // Column count similarity
    const hubColumnCount = hubTable.columns.length;
    const columnCountSimilarity = clusterStructural.avgColumnCount > 0
      ? 1 - Math.abs(hubColumnCount - clusterStructural.avgColumnCount) / 
            Math.max(hubColumnCount, clusterStructural.avgColumnCount)
      : 0;

    // Data type distribution similarity
    const hubDataTypes = hubTable.columns.map(c => this.normalizeDataType(c.type));
    const hubDataTypeDistribution = this.calculateDistribution(hubDataTypes);
    const dataTypeSimilarity = this.calculateDistributionSimilarity(
      hubDataTypeDistribution, 
      clusterStructural.dataTypeDistribution
    );

    // Constraint distribution similarity
    const hubConstraints = hubTable.columns.flatMap(c => this.getColumnConstraints(c));
    const hubConstraintDistribution = this.calculateDistribution(hubConstraints);
    const constraintSimilarity = this.calculateDistributionSimilarity(
      hubConstraintDistribution, 
      clusterStructural.constraintDistribution
    );

    // Complexity similarity
    const hubComplexity = this.calculateTableComplexity(hubTable);
    const complexitySimilarity = clusterStructural.tableComplexity > 0
      ? 1 - Math.abs(hubComplexity - clusterStructural.tableComplexity) / 
            Math.max(hubComplexity, clusterStructural.tableComplexity)
      : 0;

    return (
      columnCountSimilarity * 0.3 +
      dataTypeSimilarity * 0.25 +
      constraintSimilarity * 0.25 +
      complexitySimilarity * 0.2
    );
  }

  /**
   * Calculate topological fit of hub within cluster
   */
  private calculateTopologicalFit(
    hubIdx: number,
    clusterTopological: TopologicalProfile,
    adjacencyMatrix: number[][]
  ): number {
    // Degree similarity
    const hubDegree = adjacencyMatrix[hubIdx].reduce((sum, weight) => sum + (weight > 0 ? 1 : 0), 0);
    const degreeSimilarity = clusterTopological.avgDegree > 0
      ? 1 - Math.abs(hubDegree - clusterTopological.avgDegree) / 
            Math.max(hubDegree, clusterTopological.avgDegree)
      : 0;

    // Distance to center of mass
    const hubVector = adjacencyMatrix[hubIdx];
    const distanceToCenter = this.calculateEuclideanDistance(hubVector, clusterTopological.centerOfMass);
    const centerFit = clusterTopological.radius > 0 
      ? Math.max(0, 1 - distanceToCenter / clusterTopological.radius)
      : 1;

    // Density contribution
    const densityContribution = this.calculateDensityContribution(
      hubIdx, 
      clusterTopological.density, 
      adjacencyMatrix
    );

    return (
      degreeSimilarity * 0.4 +
      centerFit * 0.4 +
      densityContribution * 0.2
    );
  }

  /**
   * Calculate centrality alignment between hub and cluster
   */
  private calculateCentralityAlignment(
    hubIdx: number,
    clusterTables: string[],
    adjacencyMatrix: number[][],
    tableIndexMap: Map<string, number>
  ): number {
    const clusterIndices = clusterTables
      .map(table => tableIndexMap.get(table))
      .filter(idx => idx !== undefined) as number[];

    if (clusterIndices.length === 0) return 0;

    // Calculate hub's centrality within cluster context
    const hubClusterCentrality = this.calculateWithinClusterCentrality(
      hubIdx, 
      clusterIndices, 
      adjacencyMatrix
    );

    // Calculate average centrality of cluster members
    const clusterCentralities = clusterIndices.map(idx => 
      this.calculateWithinClusterCentrality(idx, clusterIndices, adjacencyMatrix)
    );
    const avgClusterCentrality = clusterCentralities.reduce((sum, c) => sum + c, 0) / clusterCentralities.length;

    // Alignment score (how well hub centrality matches cluster pattern)
    return avgClusterCentrality > 0 
      ? Math.min(1, hubClusterCentrality / avgClusterCentrality)
      : hubClusterCentrality > 0 ? 1 : 0;
  }

  /**
   * Select optimal assignment for hub based on affinity scores
   */
  private selectOptimalAssignment(
    hubTable: string,
    affinityScores: HubAffinityMetrics[],
    clusterProfiles: ClusterProfile[]
  ): HubAssignment | null {
    if (affinityScores.length === 0) return null;

    // Find best affinity score
    let bestScore = 0;
    let bestIndex = -1;

    affinityScores.forEach((metrics, index) => {
      if (metrics.compositeScore > bestScore) {
        bestScore = metrics.compositeScore;
        bestIndex = index;
      }
    });

    // Check if score meets minimum threshold
    if (bestScore < this.MIN_ASSIGNMENT_THRESHOLD) {
      return null;
    }

    // Determine assignment type
    let assignmentType: HubAssignment['assignmentType'];
    if (bestScore >= this.STRONG_ASSIGNMENT_THRESHOLD) {
      assignmentType = 'strong';
    } else if (bestScore >= this.MODERATE_ASSIGNMENT_THRESHOLD) {
      assignmentType = 'moderate';
    } else {
      assignmentType = 'weak';
    }

    return {
      hubTable,
      assignedCluster: clusterProfiles[bestIndex].clusterId,
      affinityScore: bestScore,
      assignmentType,
      metrics: affinityScores[bestIndex]
    };
  }

  /**
   * Calculate assignment statistics
   */
  private calculateAssignmentStatistics(
    assignments: HubAssignment[],
    isolatedHubs: string[]
  ): HubAssignmentResult['statistics'] {
    const totalHubs = assignments.length + isolatedHubs.length;
    const assignedCount = assignments.length;
    const isolatedCount = isolatedHubs.length;

    const avgAffinityScore = assignments.length > 0
      ? assignments.reduce((sum, a) => sum + a.affinityScore, 0) / assignments.length
      : 0;

    // Calculate assignment distribution
    const assignmentDistribution = new Map<number, number>();
    assignments.forEach(assignment => {
      const currentCount = assignmentDistribution.get(assignment.assignedCluster) || 0;
      assignmentDistribution.set(assignment.assignedCluster, currentCount + 1);
    });

    return {
      totalHubs,
      assignedCount,
      isolatedCount,
      avgAffinityScore,
      assignmentDistribution
    };
  }

  // Utility methods

  /**
   * Build adjacency matrix if not provided
   */
  private buildAdjacencyMatrix(
    tables: TableInfo[], 
    relationships: Relationship[]
  ): { matrix: number[][], indexMap: Map<string, number> } {
    const indexMap = new Map(tables.map((table, idx) => [table.name, idx]));
    const matrix = Array(tables.length).fill(null).map(() => Array(tables.length).fill(0));

    relationships.forEach(rel => {
      const sourceIdx = indexMap.get(rel.sourceTable);
      const targetIdx = indexMap.get(rel.targetTable);

      if (sourceIdx !== undefined && targetIdx !== undefined) {
        matrix[sourceIdx][targetIdx] = 1; // Simple binary adjacency
        matrix[targetIdx][sourceIdx] = 1;
      }
    });

    return { matrix, indexMap };
  }

  /**
   * Calculate average connection degree for cluster
   */
  private calculateAverageConnectionDegree(
    clusterTables: string[],
    relationships: Relationship[]
  ): number {
    if (clusterTables.length === 0) return 0;

    const clusterTableSet = new Set(clusterTables);
    const degrees = new Map<string, number>();

    // Initialize degrees
    clusterTables.forEach(table => degrees.set(table, 0));

    // Count connections
    relationships.forEach(rel => {
      if (clusterTableSet.has(rel.sourceTable)) {
        degrees.set(rel.sourceTable, (degrees.get(rel.sourceTable) || 0) + 1);
      }
      if (clusterTableSet.has(rel.targetTable)) {
        degrees.set(rel.targetTable, (degrees.get(rel.targetTable) || 0) + 1);
      }
    });

    const totalDegree = Array.from(degrees.values()).reduce((sum, degree) => sum + degree, 0);
    return totalDegree / clusterTables.length;
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
   * Get column constraints as string array
   */
  private getColumnConstraints(column: any): string[] {
    const constraints: string[] = [];
    
    if (column.isPrimaryKey) constraints.push('primary_key');
    if (column.isForeignKey) constraints.push('foreign_key');
    if (column.unique) constraints.push('unique');
    if (column.nullable) constraints.push('nullable');
    
    return constraints;
  }

  /**
   * Calculate distribution from array of values
   */
  private calculateDistribution(values: string[]): Map<string, number> {
    const distribution = new Map<string, number>();
    const total = values.length;

    if (total === 0) return distribution;

    values.forEach(value => {
      const count = distribution.get(value) || 0;
      distribution.set(value, count + 1);
    });

    // Convert to proportions
    distribution.forEach((count, value) => {
      distribution.set(value, count / total);
    });

    return distribution;
  }

  /**
   * Calculate table complexity score
   */
  private calculateTableComplexity(table: TableInfo): number {
    const columnCount = table.columns.length;
    const pkCount = table.columns.filter(c => c.isPrimaryKey).length;
    const fkCount = table.columns.filter(c => c.isForeignKey).length;
    const uniqueCount = table.columns.filter(c => c.unique).length;

    // Complexity based on structure
    return (
      Math.log(columnCount + 1) * 0.4 +
      pkCount * 0.2 +
      fkCount * 0.25 +
      uniqueCount * 0.15
    );
  }

  /**
   * Calculate clustering coefficient for cluster
   */
  private calculateClusteringCoefficient(
    clusterIndices: number[],
    adjacencyMatrix: number[][]
  ): number {
    if (clusterIndices.length < 3) return 0;

    let totalTriangles = 0;
    let totalTriplets = 0;

    for (let i = 0; i < clusterIndices.length; i++) {
      const nodeI = clusterIndices[i];
      const neighborsI: number[] = [];

      // Find neighbors of node i within cluster
      for (let j = 0; j < clusterIndices.length; j++) {
        if (i !== j && adjacencyMatrix[nodeI][clusterIndices[j]] > 0) {
          neighborsI.push(clusterIndices[j]);
        }
      }

      // Count triangles involving node i
      for (let j = 0; j < neighborsI.length; j++) {
        for (let k = j + 1; k < neighborsI.length; k++) {
          totalTriplets++;
          if (adjacencyMatrix[neighborsI[j]][neighborsI[k]] > 0) {
            totalTriangles++;
          }
        }
      }
    }

    return totalTriplets > 0 ? totalTriangles / totalTriplets : 0;
  }

  /**
   * Calculate center of mass in adjacency space
   */
  private calculateCenterOfMass(
    clusterIndices: number[],
    adjacencyMatrix: number[][]
  ): number[] {
    if (clusterIndices.length === 0) return [];

    const dimension = adjacencyMatrix.length;
    const centerOfMass = new Array(dimension).fill(0);

    clusterIndices.forEach(idx => {
      for (let i = 0; i < dimension; i++) {
        centerOfMass[i] += adjacencyMatrix[idx][i] / clusterIndices.length;
      }
    });

    return centerOfMass;
  }

  /**
   * Calculate radius (maximum distance from center of mass)
   */
  private calculateRadius(
    clusterIndices: number[],
    centerOfMass: number[],
    adjacencyMatrix: number[][]
  ): number {
    if (clusterIndices.length === 0 || centerOfMass.length === 0) return 0;

    let maxDistance = 0;

    clusterIndices.forEach(idx => {
      const distance = this.calculateEuclideanDistance(adjacencyMatrix[idx], centerOfMass);
      maxDistance = Math.max(maxDistance, distance);
    });

    return maxDistance;
  }

  /**
   * Calculate internal density of cluster
   */
  private calculateInternalDensity(
    clusterIndices: number[],
    adjacencyMatrix: number[][]
  ): number {
    if (clusterIndices.length <= 1) return 1;

    let internalEdges = 0;
    let possibleEdges = (clusterIndices.length * (clusterIndices.length - 1)) / 2;

    for (let i = 0; i < clusterIndices.length; i++) {
      for (let j = i + 1; j < clusterIndices.length; j++) {
        if (adjacencyMatrix[clusterIndices[i]][clusterIndices[j]] > 0) {
          internalEdges++;
        }
      }
    }

    return possibleEdges > 0 ? internalEdges / possibleEdges : 0;
  }

  /**
   * Calculate distribution similarity using cosine similarity
   */
  private calculateDistributionSimilarity(
    dist1: Map<string, number>,
    dist2: Map<string, number>
  ): number {
    const allKeys = new Set([...dist1.keys(), ...dist2.keys()]);
    
    if (allKeys.size === 0) return 1;

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
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  private calculateEuclideanDistance(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) return Infinity;

    return Math.sqrt(
      vector1.reduce((sum, val, idx) => sum + (val - vector2[idx]) ** 2, 0)
    );
  }

  /**
   * Calculate density contribution of adding a node
   */
  private calculateDensityContribution(
    nodeIdx: number,
    currentDensity: number,
    adjacencyMatrix: number[][]
  ): number {
    // Estimate how much the node would contribute to cluster density
    const nodeDegree = adjacencyMatrix[nodeIdx].reduce((sum, weight) => sum + (weight > 0 ? 1 : 0), 0);
    const maxPossibleDegree = adjacencyMatrix.length - 1;
    
    const nodeConnectivity = maxPossibleDegree > 0 ? nodeDegree / maxPossibleDegree : 0;
    
    // Higher connectivity nodes contribute more to density
    return nodeConnectivity;
  }

  /**
   * Calculate within-cluster centrality
   */
  private calculateWithinClusterCentrality(
    nodeIdx: number,
    clusterIndices: number[],
    adjacencyMatrix: number[][]
  ): number {
    let connectionsWithinCluster = 0;
    const clusterIndexSet = new Set(clusterIndices);

    adjacencyMatrix[nodeIdx].forEach((weight, targetIdx) => {
      if (weight > 0 && clusterIndexSet.has(targetIdx)) {
        connectionsWithinCluster++;
      }
    });

    return clusterIndices.length > 1 ? connectionsWithinCluster / (clusterIndices.length - 1) : 0;
  }

  /**
   * Create zero affinity metrics for error cases
   */
  private createZeroAffinityMetrics(): HubAffinityMetrics {
    return {
      connectionDensity: 0,
      averageEdgeWeight: 0,
      structuralCompatibility: 0,
      topologicalFit: 0,
      centralityAlignment: 0,
      compositeScore: 0
    };
  }
}