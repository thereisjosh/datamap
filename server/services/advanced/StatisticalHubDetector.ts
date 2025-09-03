import { TableInfo, Relationship } from '../../../shared/schema';
import { Logger } from '../../utils/logger';

const logger = new Logger('StatisticalHubDetector');

// Pure mathematical hub detection without linguistic assumptions
export interface HubDetectionMetrics {
  tableName: string;
  degreeScore: number;           // Total connections (in + out degree)
  betweennessCentrality: number; // Bridge importance in graph
  pageRankScore: number;         // Universal importance metric
  clusteringCoefficient: number; // Local clustering density
  isHub: boolean;                // Final classification
  hubConfidence: number;         // Mathematical confidence score
}

export interface HubDetectionResult {
  hubs: string[];
  nonHubs: string[];
  metrics: HubDetectionMetrics[];
  statistics: {
    totalTables: number;
    hubCount: number;
    hubPercentage: number;
    degreeThreshold: number;
    centralityThreshold: number;
    pageRankThreshold: number;
  };
}

export class StatisticalHubDetector {
  private readonly MIN_HUB_DEGREE = 10;  // Increased from 5 - require 10+ connections for statistical significance
  private readonly HUB_PERCENTILE = 0.98;  // Top 2% by degree (more selective)
  private readonly CENTRALITY_PERCENTILE = 0.95;  // Top 5% by centrality (more selective)
  private readonly PAGERANK_PERCENTILE = 0.90;   // Top 10% by PageRank (more selective)
  private readonly CONFIDENCE_THRESHOLD = 0.8;    // Increased from 0.6 - require higher confidence

  /**
   * Detect hub tables using pure mathematical graph metrics
   * No linguistic patterns, naming conventions, or business logic assumptions
   */
  detectHubs(tables: TableInfo[], relationships: Relationship[]): HubDetectionResult {
    logger.info('Starting statistical hub detection', {
      tableCount: tables.length,
      relationshipCount: relationships.length
    });

    // Build graph representation for analysis
    const graph = this.buildGraphRepresentation(tables, relationships);
    
    // Calculate all mathematical metrics
    const metrics = this.calculateAllMetrics(graph);
    
    // Determine statistical thresholds from data distribution
    const thresholds = this.calculateDynamicThresholds(metrics);
    
    // Classify hubs using multi-metric approach
    const classification = this.classifyHubs(metrics, thresholds);
    
    logger.info('Hub detection complete', {
      totalTables: tables.length,
      hubCount: classification.hubs.length,
      hubPercentage: (classification.hubs.length / tables.length * 100).toFixed(1),
      thresholds
    });

    return classification;
  }

  /**
   * Build graph representation for mathematical analysis
   */
  private buildGraphRepresentation(tables: TableInfo[], relationships: Relationship[]): GraphRepresentation {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // Initialize nodes
    tables.forEach(table => {
      nodes.set(table.name, {
        name: table.name,
        inDegree: 0,
        outDegree: 0,
        neighbors: new Set(),
        columnCount: table.columns.length
      });
    });

    // Add edges and calculate degrees
    relationships.forEach(rel => {
      const sourceNode = nodes.get(rel.sourceTable);
      const targetNode = nodes.get(rel.targetTable);

      if (sourceNode && targetNode) {
        sourceNode.outDegree++;
        targetNode.inDegree++;
        sourceNode.neighbors.add(rel.targetTable);
        targetNode.neighbors.add(rel.sourceTable);

        edges.push({
          source: rel.sourceTable,
          target: rel.targetTable,
          weight: 1.0 // Unweighted for hub detection
        });
      }
    });

    return { nodes, edges };
  }

  /**
   * Calculate all mathematical metrics for hub detection
   */
  private calculateAllMetrics(graph: GraphRepresentation): HubDetectionMetrics[] {
    const metrics: HubDetectionMetrics[] = [];
    const nodeArray = Array.from(graph.nodes.values());

    // Calculate betweenness centrality for all nodes
    const betweennessCentrality = this.calculateBetweennessCentrality(graph);
    
    // Calculate PageRank scores
    const pageRankScores = this.calculatePageRank(graph);

    // Calculate clustering coefficients
    const clusteringCoefficients = this.calculateClusteringCoefficients(graph);

    // Compile metrics for each table
    nodeArray.forEach(node => {
      const degreeScore = node.inDegree + node.outDegree;
      
      metrics.push({
        tableName: node.name,
        degreeScore,
        betweennessCentrality: betweennessCentrality.get(node.name) || 0,
        pageRankScore: pageRankScores.get(node.name) || 0,
        clusteringCoefficient: clusteringCoefficients.get(node.name) || 0,
        isHub: false, // Will be determined in classification step
        hubConfidence: 0 // Will be calculated in classification step
      });
    });

    return metrics;
  }

  /**
   * Calculate betweenness centrality using Brandes algorithm
   */
  private calculateBetweennessCentrality(graph: GraphRepresentation): Map<string, number> {
    const centrality = new Map<string, number>();
    const nodes = Array.from(graph.nodes.keys());

    // Initialize centrality scores
    nodes.forEach(node => centrality.set(node, 0));

    // For each source node, calculate shortest paths
    nodes.forEach(source => {
      const stack: string[] = [];
      const paths = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const delta = new Map<string, number>();
      const distance = new Map<string, number>();

      // Initialize
      nodes.forEach(node => {
        paths.set(node, []);
        sigma.set(node, 0);
        delta.set(node, 0);
        distance.set(node, -1);
      });

      sigma.set(source, 1);
      distance.set(source, 0);

      const queue: string[] = [source];

      // BFS to find shortest paths
      while (queue.length > 0) {
        const current = queue.shift()!;
        stack.push(current);

        const currentNode = graph.nodes.get(current)!;
        currentNode.neighbors.forEach(neighbor => {
          // First time visiting neighbor?
          if (distance.get(neighbor) === -1) {
            queue.push(neighbor);
            distance.set(neighbor, distance.get(current)! + 1);
          }

          // Shortest path to neighbor via current?
          if (distance.get(neighbor) === distance.get(current)! + 1) {
            sigma.set(neighbor, sigma.get(neighbor)! + sigma.get(current)!);
            paths.get(neighbor)!.push(current);
          }
        });
      }

      // Accumulate betweenness from leaves
      while (stack.length > 0) {
        const node = stack.pop()!;
        paths.get(node)!.forEach(predecessor => {
          const contribution = (sigma.get(predecessor)! / sigma.get(node)!) * 
                              (1 + delta.get(node)!);
          delta.set(predecessor, delta.get(predecessor)! + contribution);
        });

        if (node !== source) {
          centrality.set(node, centrality.get(node)! + delta.get(node)!);
        }
      }
    });

    // Normalize centrality scores
    const nodeCount = nodes.length;
    const normalizationFactor = nodeCount > 2 ? 1.0 / ((nodeCount - 1) * (nodeCount - 2)) : 1.0;
    
    centrality.forEach((value, node) => {
      centrality.set(node, value * normalizationFactor);
    });

    return centrality;
  }

  /**
   * Calculate PageRank scores using power iteration method
   */
  private calculatePageRank(graph: GraphRepresentation, dampingFactor: number = 0.85): Map<string, number> {
    const pageRank = new Map<string, number>();
    const nodes = Array.from(graph.nodes.keys());
    const nodeCount = nodes.length;
    
    if (nodeCount === 0) return pageRank;

    // Initialize PageRank values
    const initialValue = 1.0 / nodeCount;
    nodes.forEach(node => pageRank.set(node, initialValue));

    // Power iteration
    const maxIterations = 100;
    const convergenceThreshold = 1e-6;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const newPageRank = new Map<string, number>();
      let totalDiff = 0;

      nodes.forEach(node => {
        let rank = (1 - dampingFactor) / nodeCount;

        // Add contributions from incoming edges
        const currentNode = graph.nodes.get(node)!;
        graph.edges.forEach(edge => {
          if (edge.target === node) {
            const sourceNode = graph.nodes.get(edge.source)!;
            const sourceTotalDegree = sourceNode.inDegree + sourceNode.outDegree;
            
            if (sourceTotalDegree > 0) {
              rank += dampingFactor * (pageRank.get(edge.source)! / sourceTotalDegree);
            }
          }
        });

        newPageRank.set(node, rank);
        totalDiff += Math.abs(rank - pageRank.get(node)!);
      });

      // Update PageRank values
      newPageRank.forEach((value, node) => pageRank.set(node, value));

      // Check for convergence
      if (totalDiff < convergenceThreshold) {
        logger.debug('PageRank converged after iterations', { iteration: iteration + 1 });
        break;
      }
    }

    return pageRank;
  }

  /**
   * Calculate clustering coefficient for each node
   */
  private calculateClusteringCoefficients(graph: GraphRepresentation): Map<string, number> {
    const coefficients = new Map<string, number>();

    graph.nodes.forEach((node, nodeName) => {
      const neighbors = Array.from(node.neighbors);
      const neighborCount = neighbors.length;

      if (neighborCount < 2) {
        coefficients.set(nodeName, 0);
        return;
      }

      // Count edges between neighbors
      let edgesAmongNeighbors = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const neighbor1 = graph.nodes.get(neighbors[i]);
          if (neighbor1 && neighbor1.neighbors.has(neighbors[j])) {
            edgesAmongNeighbors++;
          }
        }
      }

      // Clustering coefficient = actual edges / possible edges
      const possibleEdges = (neighborCount * (neighborCount - 1)) / 2;
      const coefficient = possibleEdges > 0 ? edgesAmongNeighbors / possibleEdges : 0;
      
      coefficients.set(nodeName, coefficient);
    });

    return coefficients;
  }

  /**
   * Calculate dynamic thresholds based on data distribution statistics
   */
  private calculateDynamicThresholds(metrics: HubDetectionMetrics[]): ThresholdParameters {
    const degreeScores = metrics.map(m => m.degreeScore).sort((a, b) => a - b);
    const centralityScores = metrics.map(m => m.betweennessCentrality).sort((a, b) => a - b);
    const pageRankScores = metrics.map(m => m.pageRankScore).sort((a, b) => a - b);

    // Calculate percentile-based thresholds
    const degreeThreshold = Math.max(
      this.percentile(degreeScores, this.HUB_PERCENTILE),
      this.MIN_HUB_DEGREE
    );
    
    const centralityThreshold = this.percentile(centralityScores, this.CENTRALITY_PERCENTILE);
    const pageRankThreshold = this.percentile(pageRankScores, this.PAGERANK_PERCENTILE);

    return {
      degreeThreshold,
      centralityThreshold,
      pageRankThreshold,
      confidenceThreshold: this.CONFIDENCE_THRESHOLD
    };
  }

  /**
   * Classify hubs using multi-metric approach with confidence scoring
   */
  private classifyHubs(
    metrics: HubDetectionMetrics[], 
    thresholds: ThresholdParameters
  ): HubDetectionResult {
    const hubs: string[] = [];
    const nonHubs: string[] = [];

    // Sort metrics by degree score for better logging
    const sortedMetrics = [...metrics].sort((a, b) => b.degreeScore - a.degreeScore);
    
    logger.info('🔍 Individual hub analysis (sorted by connections)', {
      totalTables: metrics.length,
      degreeThreshold: thresholds.degreeThreshold,
      centralityThreshold: thresholds.centralityThreshold.toFixed(4),
      pageRankThreshold: thresholds.pageRankThreshold.toFixed(4)
    });

    // Calculate confidence scores and classify
    sortedMetrics.forEach((metric, index) => {
      // Score each metric (0-1 scale)
      const degreeScore = metric.degreeScore >= thresholds.degreeThreshold ? 1.0 : 0.0;
      const centralityScore = metric.betweennessCentrality >= thresholds.centralityThreshold ? 1.0 : 0.0;
      const pageRankScore = metric.pageRankScore >= thresholds.pageRankThreshold ? 1.0 : 0.0;

      // Combined confidence (weighted average)
      const hubConfidence = (
        degreeScore * 0.5 +      // Degree is most important
        centralityScore * 0.3 +   // Centrality is significant
        pageRankScore * 0.2       // PageRank provides validation
      );

      metric.hubConfidence = hubConfidence;
      metric.isHub = hubConfidence >= thresholds.confidenceThreshold;

      // Log individual hub analysis (top 25 tables by connections)
      if (index < 25) {
        logger.info(`🔗 Table ${index + 1}: ${metric.tableName}`, {
          connections: metric.degreeScore,
          centrality: metric.betweennessCentrality.toFixed(4),
          pageRank: metric.pageRankScore.toFixed(4),
          confidence: hubConfidence.toFixed(3),
          isHub: metric.isHub ? '✅' : '❌',
          scores: {
            degree: degreeScore === 1.0 ? '✅' : '❌',
            centrality: centralityScore === 1.0 ? '✅' : '❌',
            pagerank: pageRankScore === 1.0 ? '✅' : '❌'
          }
        });
      }

      if (metric.isHub) {
        hubs.push(metric.tableName);
      } else {
        nonHubs.push(metric.tableName);
      }
    });

    // Log summary statistics of connection distribution
    const connectionCounts = sortedMetrics.map(m => m.degreeScore);
    const totalConnections = connectionCounts.reduce((sum, count) => sum + count, 0);
    const avgConnections = totalConnections / connectionCounts.length;
    const medianConnections = connectionCounts[Math.floor(connectionCounts.length / 2)];
    const topQuartileIndex = Math.floor(connectionCounts.length * 0.25);
    const topQuartileMinConnections = connectionCounts[topQuartileIndex];

    logger.info('📊 Connection distribution analysis', {
      totalTables: connectionCounts.length,
      totalConnections,
      averageConnections: avgConnections.toFixed(1),
      medianConnections,
      topQuartileMinConnections,
      hubsDetected: hubs.length,
      weakHubsDetected: hubs.filter(hub => {
        const hubMetric = sortedMetrics.find(m => m.tableName === hub);
        return hubMetric && hubMetric.degreeScore < topQuartileMinConnections;
      }).length,
      strongHubsDetected: hubs.filter(hub => {
        const hubMetric = sortedMetrics.find(m => m.tableName === hub);
        return hubMetric && hubMetric.degreeScore >= topQuartileMinConnections;
      }).length
    });

    return {
      hubs,
      nonHubs,
      metrics: sortedMetrics, // Return sorted metrics for consistency
      statistics: {
        totalTables: metrics.length,
        hubCount: hubs.length,
        hubPercentage: (hubs.length / metrics.length) * 100,
        degreeThreshold: thresholds.degreeThreshold,
        centralityThreshold: thresholds.centralityThreshold,
        pageRankThreshold: thresholds.pageRankThreshold
      }
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = percentile * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
    
    const weight = index % 1;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }
}

// Supporting interfaces
interface GraphRepresentation {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

interface GraphNode {
  name: string;
  inDegree: number;
  outDegree: number;
  neighbors: Set<string>;
  columnCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface ThresholdParameters {
  degreeThreshold: number;
  centralityThreshold: number;
  pageRankThreshold: number;
  confidenceThreshold: number;
}