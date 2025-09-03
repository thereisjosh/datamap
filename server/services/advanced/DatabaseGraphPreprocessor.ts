import { TableInfo } from '../../../shared/schema';
import { WeightedEdge } from './UniversalEdgeWeighter';
import { Logger } from '../../utils/logger';

const logger = new Logger('DatabaseGraphPreprocessor');

/**
 * Graph preprocessing specifically designed for database ERD structures.
 * Handles hub tables, disconnected components, and graph normalization.
 */

export interface PreprocessedGraph {
  tables: TableInfo[];
  edges: WeightedEdge[];
  hubs: HubInfo[];
  components: GraphComponent[];
  normalizedEdges: WeightedEdge[];
  preprocessing: {
    hubsRemoved: boolean;
    edgesPreserved: number;
    normalizationMethod: string;
    componentsMerged: number;
  };
  metrics: GraphMetrics;
}

export interface HubInfo {
  tableName: string;
  degree: number;
  hubScore: number;
  hubType: 'lookup' | 'junction' | 'master' | 'audit';
  connections: HubConnection[];
  preservedEdges: PreservedEdge[];
}

export interface HubConnection {
  targetTable: string;
  weight: number;
  relationshipType: 'one-to-many' | 'many-to-one' | 'many-to-many';
}

export interface PreservedEdge {
  source: string;
  target: string;
  originalWeight: number;
  mediatedWeight: number;
  hubPath: string[];
}

export interface GraphComponent {
  id: number;
  tables: string[];
  edges: WeightedEdge[];
  size: number;
  density: number;
  isMainComponent: boolean;
}

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  avgDegree: number;
  degreeStdDev: number;
  hubCount: number;
  componentCount: number;
  largestComponentSize: number;
  edgeWeightDistribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
  };
}

export class DatabaseGraphPreprocessor {
  // Hub detection thresholds
  private readonly HUB_DEGREE_THRESHOLD = 2.5; // Standard deviations above mean
  private readonly MIN_HUB_DEGREE = 5;         // Minimum connections to be considered hub
  private readonly HUB_PRESERVATION_WEIGHT = 0.8; // Weight multiplier for preserved edges

  /**
   * Main preprocessing pipeline
   */
  preprocess(
    tables: TableInfo[],
    edges: WeightedEdge[],
    options: {
      removeHubs?: boolean;
      reduceHubConnections?: boolean;
      normalizeWeights?: boolean;
      mergeComponents?: boolean;
    } = {}
  ): PreprocessedGraph {
    logger.info('Starting graph preprocessing', {
      tableCount: tables.length,
      edgeCount: edges.length,
      options
    });

    // Step 1: Analyze graph structure
    const initialMetrics = this.calculateGraphMetrics(tables, edges);
    
    // Step 2: Detect hub tables
    const hubs = this.detectHubTables(tables, edges, initialMetrics);
    
    // Step 3: Identify connected components
    const components = this.identifyComponents(tables, edges);
    
    // Step 4: Process based on options
    let processedEdges = [...edges];
    let preprocessing = {
      hubsRemoved: false,
      edgesPreserved: 0,
      normalizationMethod: 'none',
      componentsMerged: 0
    };

    // Remove hubs if requested
    if (options.removeHubs && hubs.length > 0) {
      const hubResult = this.removeHubsWithPreservation(
        tables,
        processedEdges,
        hubs
      );
      processedEdges = hubResult.edges;
      preprocessing.hubsRemoved = true;
      preprocessing.edgesPreserved = hubResult.preservedCount;
      
      // Update hub info with preserved edges
      hubResult.preservedEdges.forEach(preserved => {
        const hub = hubs.find(h => preserved.hubPath.includes(h.tableName));
        if (hub) {
          hub.preservedEdges.push(preserved);
        }
      });
    }
    // Reduce hub connections if requested (alternative to removing hubs)
    else if (options.reduceHubConnections && hubs.length > 0) {
      processedEdges = this.reduceHubConnections(processedEdges, hubs);
      preprocessing.hubsRemoved = false;
      preprocessing.edgesPreserved = processedEdges.length;
    }

    // Normalize weights if requested
    if (options.normalizeWeights) {
      const normResult = this.normalizeEdgeWeights(processedEdges, components);
      processedEdges = normResult.edges;
      preprocessing.normalizationMethod = normResult.method;
    }

    // Merge small components if requested
    if (options.mergeComponents && components.length > 1) {
      const mergeResult = this.mergeSmallComponents(
        tables,
        processedEdges,
        components
      );
      processedEdges = mergeResult.edges;
      preprocessing.componentsMerged = mergeResult.mergedCount;
    }

    // Step 5: Calculate final metrics
    const finalMetrics = this.calculateGraphMetrics(
      tables.filter(t => !options.removeHubs || !hubs.some(h => h.tableName === t.name)),
      processedEdges
    );

    logger.info('Preprocessing complete', {
      initialEdges: edges.length,
      finalEdges: processedEdges.length,
      hubsDetected: hubs.length,
      componentsFound: components.length,
      preprocessing
    });

    return {
      tables: options.removeHubs 
        ? tables.filter(t => !hubs.some(h => h.tableName === t.name))
        : tables,
      edges: processedEdges,
      hubs,
      components,
      normalizedEdges: processedEdges,
      preprocessing,
      metrics: finalMetrics
    };
  }

  /**
   * Calculate comprehensive graph metrics
   */
  private calculateGraphMetrics(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): GraphMetrics {
    const nodeCount = tables.length;
    const edgeCount = edges.length;
    const possibleEdges = nodeCount * (nodeCount - 1) / 2;
    const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

    // Calculate degree distribution
    const degreeMap = new Map<string, number>();
    tables.forEach(table => degreeMap.set(table.name, 0));
    
    edges.forEach(edge => {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    });

    const degrees = Array.from(degreeMap.values());
    const avgDegree = degrees.reduce((sum, d) => sum + d, 0) / (nodeCount || 1);
    const variance = degrees.reduce((sum, d) => sum + Math.pow(d - avgDegree, 2), 0) / (nodeCount || 1);
    const degreeStdDev = Math.sqrt(variance);

    // Calculate edge weight distribution
    const weights = edges.map(e => e.components.finalWeight).sort((a, b) => a - b);
    const weightStats = this.calculateWeightStatistics(weights);

    // Count hubs (will be properly calculated in detectHubTables)
    const hubThreshold = avgDegree + this.HUB_DEGREE_THRESHOLD * degreeStdDev;
    const hubCount = degrees.filter(d => d >= Math.max(hubThreshold, this.MIN_HUB_DEGREE)).length;

    return {
      nodeCount,
      edgeCount,
      density,
      avgDegree,
      degreeStdDev,
      hubCount,
      componentCount: 0, // Will be updated later
      largestComponentSize: 0, // Will be updated later
      edgeWeightDistribution: weightStats
    };
  }

  /**
   * Calculate weight statistics
   */
  private calculateWeightStatistics(weights: number[]): GraphMetrics['edgeWeightDistribution'] {
    if (weights.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
    }

    const min = weights[0];
    const max = weights[weights.length - 1];
    const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const median = weights[Math.floor(weights.length / 2)];
    
    const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
    const stdDev = Math.sqrt(variance);

    return { min, max, mean, median, stdDev };
  }

  /**
   * Detect hub tables using multiple criteria
   */
  private detectHubTables(
    tables: TableInfo[],
    edges: WeightedEdge[],
    metrics: GraphMetrics
  ): HubInfo[] {
    const hubs: HubInfo[] = [];
    const hubThreshold = metrics.avgDegree + this.HUB_DEGREE_THRESHOLD * metrics.degreeStdDev;

    // Build adjacency information
    const adjacency = new Map<string, Map<string, WeightedEdge>>();
    tables.forEach(table => adjacency.set(table.name, new Map()));

    edges.forEach(edge => {
      adjacency.get(edge.source)?.set(edge.target, edge);
      adjacency.get(edge.target)?.set(edge.source, edge);
    });

    // Analyze each table
    tables.forEach(table => {
      const connections = adjacency.get(table.name) || new Map();
      const degree = connections.size;

      if (degree >= Math.max(hubThreshold, this.MIN_HUB_DEGREE)) {
        // This is a potential hub
        const hubInfo = this.analyzeHub(table, connections, edges);
        
        if (hubInfo.hubScore > 0.5) {
          hubs.push(hubInfo);
        }
      }
    });

    logger.info('Hub detection complete', {
      hubsFound: hubs.length,
      hubThreshold: hubThreshold.toFixed(2),
      hubTypes: hubs.reduce((acc, hub) => {
        acc[hub.hubType] = (acc[hub.hubType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });

    return hubs;
  }

  /**
   * Analyze a potential hub table
   */
  private analyzeHub(
    table: TableInfo,
    connections: Map<string, WeightedEdge>,
    allEdges: WeightedEdge[]
  ): HubInfo {
    const degree = connections.size;
    const hubConnections: HubConnection[] = [];

    // Analyze connection patterns
    connections.forEach((edge, targetTable) => {
      const relationshipType = this.inferRelationshipType(table, edge);
      hubConnections.push({
        targetTable,
        weight: edge.components.finalWeight,
        relationshipType
      });
    });

    // Determine hub type and score
    const { hubType, hubScore } = this.classifyHub(table, hubConnections, degree);

    return {
      tableName: table.name,
      degree,
      hubScore,
      hubType,
      connections: hubConnections,
      preservedEdges: []
    };
  }

  /**
   * Infer relationship type from table and edge information
   */
  private inferRelationshipType(
    table: TableInfo,
    edge: WeightedEdge
  ): 'one-to-many' | 'many-to-one' | 'many-to-many' {
    // Check if this is likely a junction table
    const fkCount = table.columns.filter(c => c.isForeignKey).length;
    const totalColumns = table.columns.length;
    
    if (fkCount >= 2 && fkCount / totalColumns > 0.6) {
      return 'many-to-many';
    }

    // Check cardinality based on which side has the foreign key
    const sourceIsFK = edge.relationship.sourceColumn && 
      table.columns.find(c => c.name === edge.relationship.sourceColumn)?.isForeignKey;

    return sourceIsFK ? 'many-to-one' : 'one-to-many';
  }

  /**
   * Classify hub type based on patterns
   */
  private classifyHub(
    table: TableInfo,
    connections: HubConnection[],
    degree: number
  ): { hubType: HubInfo['hubType'], hubScore: number } {
    const columnCount = table.columns.length;
    const fkCount = table.columns.filter(c => c.isForeignKey).length;
    const pkCount = table.columns.filter(c => c.isPrimaryKey).length;

    // Scoring factors
    let lookupScore = 0;
    let junctionScore = 0;
    let masterScore = 0;
    let auditScore = 0;

    // Lookup table indicators
    if (columnCount < 10 && degree > 10) lookupScore += 0.4;
    if (connections.filter(c => c.relationshipType === 'one-to-many').length > degree * 0.8) lookupScore += 0.3;
    if (fkCount === 0 || fkCount === 1) lookupScore += 0.3;

    // Junction table indicators
    if (fkCount >= 2 && fkCount / columnCount > 0.5) junctionScore += 0.5;
    if (connections.filter(c => c.relationshipType === 'many-to-many').length > 0) junctionScore += 0.3;
    if (columnCount <= 5) junctionScore += 0.2;

    // Master table indicators
    if (columnCount > 20 && degree > 15) masterScore += 0.4;
    if (connections.filter(c => c.relationshipType === 'one-to-many').length > degree * 0.6) masterScore += 0.3;
    if (pkCount === 1 && fkCount <= 2) masterScore += 0.3;

    // Audit table indicators (connects to many but lightweight)
    if (table.columns.some(c => c.type.toLowerCase().includes('timestamp') || c.type.toLowerCase().includes('date'))) {
      auditScore += 0.3;
    }
    if (degree > 20 && columnCount < 15) auditScore += 0.4;
    if (connections.every(c => c.weight < 0.5)) auditScore += 0.3;

    // Determine hub type
    const scores = {
      lookup: lookupScore,
      junction: junctionScore,
      master: masterScore,
      audit: auditScore
    };

    const maxScore = Math.max(...Object.values(scores));
    const hubType = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as HubInfo['hubType'];

    return { hubType, hubScore: maxScore };
  }

  /**
   * Remove hubs while preserving connectivity
   */
  private removeHubsWithPreservation(
    tables: TableInfo[],
    edges: WeightedEdge[],
    hubs: HubInfo[]
  ): {
    edges: WeightedEdge[];
    preservedCount: number;
    preservedEdges: PreservedEdge[];
  } {
    const hubNames = new Set(hubs.map(h => h.tableName));
    const preservedEdges: PreservedEdge[] = [];
    
    // Filter out edges directly connected to hubs
    const nonHubEdges = edges.filter(edge => 
      !hubNames.has(edge.source) && !hubNames.has(edge.target)
    );

    // For each hub, preserve important indirect connections
    hubs.forEach(hub => {
      const preserved = this.preserveHubConnections(hub, edges, hubNames);
      preservedEdges.push(...preserved);
    });

    // Convert preserved edges to weighted edges
    const preservedWeightedEdges = preservedEdges.map(pe => ({
      source: pe.source,
      target: pe.target,
      relationship: {
        sourceTable: pe.source,
        targetTable: pe.target,
        sourceColumn: 'preserved',
        targetColumn: 'preserved',
        nullable: true
      },
      components: {
        structuralWeight: pe.mediatedWeight * 0.8,
        topologicalWeight: pe.mediatedWeight * 0.7,
        constraintWeight: pe.mediatedWeight * 0.6,
        similarityWeight: pe.mediatedWeight * 0.5,
        finalWeight: pe.mediatedWeight
      }
    }));

    // Combine and deduplicate edges
    const allEdges = [...nonHubEdges, ...preservedWeightedEdges];
    const uniqueEdges = this.deduplicateEdges(allEdges);

    logger.info('Hub removal with preservation complete', {
      originalEdges: edges.length,
      hubEdgesRemoved: edges.length - nonHubEdges.length,
      edgesPreserved: preservedEdges.length,
      finalEdges: uniqueEdges.length
    });

    return {
      edges: uniqueEdges,
      preservedCount: preservedEdges.length,
      preservedEdges
    };
  }

  /**
   * Preserve important connections through a hub
   */
  private preserveHubConnections(
    hub: HubInfo,
    allEdges: WeightedEdge[],
    hubNames: Set<string>
  ): PreservedEdge[] {
    const preserved: PreservedEdge[] = [];
    const hubConnections = hub.connections;
    const MAX_PRESERVED_PER_HUB = 10; // Limit total preserved edges per hub

    // Filter out connections to other hubs
    const validConnections = hubConnections.filter(c => 
      !hubNames.has(c.targetTable) && c.weight > 0.5
    );

    if (validConnections.length === 0) return preserved;

    // Sort by weight to get strongest connections
    const sortedConnections = validConnections
      .sort((a, b) => b.weight - a.weight);

    // For junction hubs with few connections, be more selective
    if (hub.hubType === 'junction' && sortedConnections.length <= 5) {
      // Only preserve connections between tables with weight > 0.8
      const strongConnections = sortedConnections.filter(c => c.weight > 0.8);
      
      // Only create edges between the top 3 strongest connections
      const topConnections = strongConnections.slice(0, 3);
      for (let i = 0; i < topConnections.length; i++) {
        for (let j = i + 1; j < topConnections.length; j++) {
          const conn1 = topConnections[i];
          const conn2 = topConnections[j];

          preserved.push({
            source: conn1.targetTable,
            target: conn2.targetTable,
            originalWeight: Math.min(conn1.weight, conn2.weight),
            mediatedWeight: Math.min(conn1.weight, conn2.weight) * 0.5, // Reduced weight
            hubPath: [hub.tableName]
          });

          if (preserved.length >= MAX_PRESERVED_PER_HUB) return preserved;
        }
      }
    }
    // For other hub types, be very selective
    else {
      // Only take top 10% of connections, max 5
      const percentile10 = Math.ceil(sortedConnections.length * 0.1);
      const topCount = Math.min(5, percentile10);
      const strongConnections = sortedConnections.slice(0, topCount);

      // Only connect immediate neighbors (i to i+1)
      for (let i = 0; i < strongConnections.length - 1; i++) {
        const conn1 = strongConnections[i];
        const conn2 = strongConnections[i + 1];

        // Only preserve if both connections are very strong
        if (conn1.weight > 0.7 && conn2.weight > 0.7) {
          preserved.push({
            source: conn1.targetTable,
            target: conn2.targetTable,
            originalWeight: Math.min(conn1.weight, conn2.weight),
            mediatedWeight: Math.min(conn1.weight, conn2.weight) * 0.4, // Further reduced
            hubPath: [hub.tableName]
          });

          if (preserved.length >= MAX_PRESERVED_PER_HUB) return preserved;
        }
      }
    }

    return preserved;
  }

  /**
   * Reduce hub connections without removing hubs entirely
   */
  private reduceHubConnections(
    edges: WeightedEdge[],
    hubs: HubInfo[]
  ): WeightedEdge[] {
    const hubNames = new Set(hubs.map(h => h.tableName));
    const processedEdges: WeightedEdge[] = [];
    
    // Group edges by hub
    const hubEdges = new Map<string, WeightedEdge[]>();
    const nonHubEdges: WeightedEdge[] = [];
    
    edges.forEach(edge => {
      if (hubNames.has(edge.source)) {
        if (!hubEdges.has(edge.source)) hubEdges.set(edge.source, []);
        hubEdges.get(edge.source)!.push(edge);
      } else if (hubNames.has(edge.target)) {
        if (!hubEdges.has(edge.target)) hubEdges.set(edge.target, []);
        hubEdges.get(edge.target)!.push(edge);
      } else {
        nonHubEdges.push(edge);
      }
    });
    
    // Keep all non-hub edges
    processedEdges.push(...nonHubEdges);
    
    // For each hub, keep only the strongest connections
    hubEdges.forEach((edges, hubName) => {
      const hub = hubs.find(h => h.tableName === hubName);
      if (!hub) return;
      
      // Sort by weight descending
      const sortedEdges = edges.sort((a, b) => 
        b.components.finalWeight - a.components.finalWeight
      );
      
      // Keep different amounts based on hub type
      let keepCount: number;
      switch (hub.hubType) {
        case 'junction':
          keepCount = Math.min(5, Math.ceil(edges.length * 0.3)); // Keep 30% or max 5
          break;
        case 'lookup':
          keepCount = Math.min(10, Math.ceil(edges.length * 0.2)); // Keep 20% or max 10
          break;
        case 'master':
          keepCount = Math.min(15, Math.ceil(edges.length * 0.25)); // Keep 25% or max 15
          break;
        default:
          keepCount = Math.min(8, Math.ceil(edges.length * 0.15)); // Keep 15% or max 8
      }
      
      // Add the strongest edges
      processedEdges.push(...sortedEdges.slice(0, keepCount));
    });
    
    logger.info('Reduced hub connections', {
      originalEdges: edges.length,
      reducedEdges: processedEdges.length,
      reduction: edges.length - processedEdges.length
    });
    
    return processedEdges;
  }

  /**
   * Deduplicate edges, keeping the strongest connection
   */
  private deduplicateEdges(edges: WeightedEdge[]): WeightedEdge[] {
    const edgeMap = new Map<string, WeightedEdge>();

    edges.forEach(edge => {
      const key1 = `${edge.source}-${edge.target}`;
      const key2 = `${edge.target}-${edge.source}`;
      
      const existingEdge = edgeMap.get(key1) || edgeMap.get(key2);
      
      if (!existingEdge || edge.components.finalWeight > existingEdge.components.finalWeight) {
        // Ensure consistent ordering
        const [source, target] = edge.source < edge.target 
          ? [edge.source, edge.target] 
          : [edge.target, edge.source];
        
        edgeMap.set(`${source}-${target}`, {
          ...edge,
          source,
          target
        });
      }
    });

    return Array.from(edgeMap.values());
  }

  /**
   * Identify connected components in the graph
   */
  private identifyComponents(
    tables: TableInfo[],
    edges: WeightedEdge[]
  ): GraphComponent[] {
    const components: GraphComponent[] = [];
    const visited = new Set<string>();
    const adjacency = new Map<string, Set<string>>();

    // Build adjacency list
    tables.forEach(table => adjacency.set(table.name, new Set()));
    edges.forEach(edge => {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    });

    // Find components using DFS
    let componentId = 0;
    tables.forEach(table => {
      if (!visited.has(table.name)) {
        const component = this.dfsComponent(
          table.name,
          adjacency,
          visited,
          edges,
          componentId++
        );
        components.push(component);
      }
    });

    // Sort by size and mark main component
    components.sort((a, b) => b.size - a.size);
    if (components.length > 0) {
      components[0].isMainComponent = true;
    }

    return components;
  }

  /**
   * DFS to find a connected component
   */
  private dfsComponent(
    start: string,
    adjacency: Map<string, Set<string>>,
    visited: Set<string>,
    allEdges: WeightedEdge[],
    componentId: number
  ): GraphComponent {
    const componentTables: string[] = [];
    const stack = [start];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;

      visited.add(current);
      componentTables.push(current);

      const neighbors = adjacency.get(current) || new Set();
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      });
    }

    // Find edges within component
    const componentSet = new Set(componentTables);
    const componentEdges = allEdges.filter(edge =>
      componentSet.has(edge.source) && componentSet.has(edge.target)
    );

    // Calculate density
    const n = componentTables.length;
    const possibleEdges = n * (n - 1) / 2;
    const density = possibleEdges > 0 ? componentEdges.length / possibleEdges : 0;

    return {
      id: componentId,
      tables: componentTables,
      edges: componentEdges,
      size: componentTables.length,
      density,
      isMainComponent: false
    };
  }

  /**
   * Normalize edge weights within components
   */
  private normalizeEdgeWeights(
    edges: WeightedEdge[],
    components: GraphComponent[]
  ): { edges: WeightedEdge[]; method: string } {
    const normalizedEdges: WeightedEdge[] = [];
    const method = components.length > 1 ? 'component-wise' : 'global';

    if (method === 'component-wise') {
      // Normalize within each component
      components.forEach(component => {
        const componentWeights = component.edges.map(e => e.components.finalWeight);
        const { min, max } = this.calculateWeightStatistics(componentWeights);
        const range = max - min;

        component.edges.forEach(edge => {
          const normalizedWeight = range > 0 
            ? (edge.components.finalWeight - min) / range
            : 0.5;

          normalizedEdges.push({
            ...edge,
            components: {
              ...edge.components,
              finalWeight: 0.1 + normalizedWeight * 0.9 // Keep minimum weight of 0.1
            }
          });
        });
      });
    } else {
      // Global normalization
      const allWeights = edges.map(e => e.components.finalWeight);
      const { min, max } = this.calculateWeightStatistics(allWeights);
      const range = max - min;

      edges.forEach(edge => {
        const normalizedWeight = range > 0 
          ? (edge.components.finalWeight - min) / range
          : 0.5;

        normalizedEdges.push({
          ...edge,
          components: {
            ...edge.components,
            finalWeight: 0.1 + normalizedWeight * 0.9
          }
        });
      });
    }

    return { edges: normalizedEdges, method };
  }

  /**
   * Merge small disconnected components
   */
  private mergeSmallComponents(
    tables: TableInfo[],
    edges: WeightedEdge[],
    components: GraphComponent[]
  ): { edges: WeightedEdge[]; mergedCount: number } {
    if (components.length <= 1) {
      return { edges, mergedCount: 0 };
    }

    const mainComponent = components.find(c => c.isMainComponent)!;
    const smallComponents = components.filter(c => !c.isMainComponent && c.size < 5);
    const newEdges: WeightedEdge[] = [...edges];
    let mergedCount = 0;

    smallComponents.forEach(smallComp => {
      // Find best connection point to main component
      const connectionEdge = this.findBestComponentConnection(
        smallComp,
        mainComponent,
        tables
      );

      if (connectionEdge) {
        newEdges.push(connectionEdge);
        mergedCount++;
      }
    });

    return { edges: newEdges, mergedCount };
  }

  /**
   * Find best connection between components
   */
  private findBestComponentConnection(
    smallComponent: GraphComponent,
    mainComponent: GraphComponent,
    tables: TableInfo[]
  ): WeightedEdge | null {
    let bestConnection: { source: string; target: string; score: number } | null = null;
    let bestScore = 0;

    // Try each table in small component
    smallComponent.tables.forEach(smallTable => {
      const sourceTable = tables.find(t => t.name === smallTable);
      if (!sourceTable) return;

      // Try connecting to each table in main component
      mainComponent.tables.forEach(mainTable => {
        const targetTable = tables.find(t => t.name === mainTable);
        if (!targetTable) return;

        // Calculate connection score based on table similarity
        const score = this.calculateConnectionScore(sourceTable, targetTable);

        if (score > bestScore) {
          bestScore = score;
          bestConnection = { source: smallTable, target: mainTable, score };
        }
      });
    });

    if (!bestConnection || bestScore < 0.3) {
      return null;
    }

    // Create a weak connection edge
    return {
      source: bestConnection.source,
      target: bestConnection.target,
      relationship: {
        sourceTable: bestConnection.source,
        targetTable: bestConnection.target,
        sourceColumn: 'merged',
        targetColumn: 'merged',
        nullable: true
      },
      components: {
        structuralWeight: bestScore * 0.3,
        topologicalWeight: 0.1,
        constraintWeight: 0.1,
        similarityWeight: bestScore * 0.5,
        finalWeight: bestScore * 0.4
      }
    };
  }

  /**
   * Calculate connection score between two tables
   */
  private calculateConnectionScore(
    table1: TableInfo,
    table2: TableInfo
  ): number {
    // Similar column names
    const names1 = new Set(table1.columns.map(c => c.name.toLowerCase()));
    const names2 = new Set(table2.columns.map(c => c.name.toLowerCase()));
    const nameOverlap = [...names1].filter(n => names2.has(n)).length;
    const nameScore = (nameOverlap / Math.min(names1.size, names2.size)) || 0;

    // Similar data types
    const types1 = table1.columns.map(c => this.normalizeDataType(c.type));
    const types2 = table2.columns.map(c => this.normalizeDataType(c.type));
    const typeOverlap = types1.filter(t => types2.includes(t)).length;
    const typeScore = (typeOverlap / Math.min(types1.length, types2.length)) || 0;

    // Similar structure
    const sizeDiff = Math.abs(table1.columns.length - table2.columns.length);
    const sizeScore = 1 / (1 + sizeDiff / 10);

    return nameScore * 0.5 + typeScore * 0.3 + sizeScore * 0.2;
  }

  /**
   * Normalize data type for comparison
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
    
    return 'other';
  }
}

export const databaseGraphPreprocessor = new DatabaseGraphPreprocessor();