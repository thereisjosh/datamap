import { TableInfo } from '@shared/schema';
import { Relationship } from '@shared/schema';
import { DomainBoundaryDetectionService, DomainCluster } from './DomainBoundaryDetectionService';
import { Logger } from '../utils/logger';

const logger = new Logger('HybridClusteringEngine');

// Interfaces
export interface HybridCluster {
  clusterId: string;
  clusterName: string;
  coreTable: string;
  tables: string[];
  hybridScore: number;
  connectivityScore: number;
  semanticScore: number;
  coherenceScore: number;
  confidenceScore: number;
  businessDomain?: string;
  junctionTables: string[];
  containerDetections?: any[];
  semanticStructure?: {
    hasMultipleSemanticGroups: boolean;
    subClusters: any[];
    semanticGaps: number[];
    recommendedAction: string;
    confidenceScore: number;
    overallCoherence: number;
    splitThreshold: number;
  };
  qualityAnalysis?: {
    coreTableCentrality: number;
    semanticDensity: number;
    structuralIntegrity: number;
    outlierTables: string[];
    recommendedAction: string;
  };
}

export interface HybridClusteringOptions {
  minConnections?: number;
  maxTables?: number;
  semanticThreshold?: number;
  coherenceThreshold?: number;
  connectivityWeight?: number;
  semanticWeight?: number;
  enableSemanticSplitting?: boolean;
  minClusterSize?: number;
  requireMinimumQuality?: boolean;
  fallbackToConnectivity?: boolean;
  batchSize?: number;
  enableSemanticValidation?: boolean;
  enableDependencyAnalysis?: boolean;
  projectId?: string;
  resolution?: number;
  maxIterations?: number;
  enableLLM?: boolean;
  enableValidation?: boolean;
}

export interface HybridClusteringResult {
  hybridClusters: HybridCluster[];
  clusteringMetrics: any;
  processingMetrics: {
    connectivityAnalysisTime: number;
    semanticAnalysisTime: number;
    hybridDecisionTime: number;
    totalProcessingTime: number;
  };
  qualityAssessment?: any;
  referenceTables?: Set<string>;
}

export class HybridClusteringEngine {
  private domainBoundaryService: DomainBoundaryDetectionService;
  
  constructor(config?: any) {
    this.domainBoundaryService = new DomainBoundaryDetectionService(config || {});
  }

  /**
   * Main hybrid clustering algorithm - delegates to DomainBoundaryDetectionService
   */
  async generateHybridClusters(
    tables: TableInfo[],
    relationships: Relationship[],
    options: HybridClusteringOptions = {}
  ): Promise<HybridClusteringResult> {
    const startTime = Date.now();
    
    logger.info('Starting hybrid clustering pipeline', {
      tableCount: tables.length,
      relationshipCount: relationships.length,
      options
    });

    try {
      // Delegate to DomainBoundaryDetectionService for the complete pipeline:
      // Leiden → LLM → Validation → Container Detection → Orphan Assignment
      const domainClusters = await this.domainBoundaryService.detectDomainBoundaries(
        tables,
        relationships,
        {
          maxIterations: options.maxIterations,
          minClusterSize: options.minClusterSize || 2,
          resolution: options.resolution || 1.0,
          enableLLM: options.enableLLM !== false,
          enableValidation: options.enableValidation !== false
        }
      );

      // Convert domain clusters to hybrid clusters
      const hybridClusters = this.convertToHybridClusters(domainClusters);

      // Add junction table detection
      const clustersWithJunctions = this.detectJunctionTables(hybridClusters, relationships);

      // Identify reference tables
      const referenceTables = this.identifyReferenceTables(clustersWithJunctions, relationships);

      // Calculate metrics
      const clusteringMetrics = this.calculateClusteringMetrics(clustersWithJunctions, tables.length);
      const qualityAssessment = this.assessClusteringQuality(clustersWithJunctions, options);
      
      const totalTime = Date.now() - startTime;

      const result: HybridClusteringResult = {
        hybridClusters: clustersWithJunctions,
        clusteringMetrics,
        processingMetrics: {
          connectivityAnalysisTime: totalTime * 0.3, // Estimation
          semanticAnalysisTime: totalTime * 0.3,
          hybridDecisionTime: totalTime * 0.4,
          totalProcessingTime: totalTime
        },
        qualityAssessment,
        referenceTables
      };

      logger.info('Hybrid clustering completed', {
        duration: totalTime,
        clusterCount: clustersWithJunctions.length,
        averageQuality: qualityAssessment.qualityScore
      });
      
      return result;

    } catch (error) {
      logger.error('Error in hybrid clustering', error);
      throw error;
    }
  }

  /**
   * Convert domain clusters to hybrid clusters
   */
  private convertToHybridClusters(domainClusters: DomainCluster[]): HybridCluster[] {
    return domainClusters.map(domain => {
      // Find the core table (table with most connections within the cluster)
      const coreTable = this.findCoreTable(domain);
      
      return {
        clusterId: domain.id,
        clusterName: domain.name,
        coreTable: coreTable,
        tables: domain.tables,
        hybridScore: domain.confidence,
        connectivityScore: domain.coherenceScore,
        semanticScore: domain.confidence,
        coherenceScore: domain.coherenceScore,
        confidenceScore: domain.confidence,
        businessDomain: domain.businessContext || domain.name,
        junctionTables: domain.junctionTables || [],
        containerDetections: domain.containerDetections || []
      };
    });
  }

  /**
   * Find the core table in a domain cluster
   */
  private findCoreTable(domain: DomainCluster): string {
    // If there's a container detection, the root container is likely the core
    if (domain.containerDetections && domain.containerDetections.length > 0) {
      const containers = domain.containerDetections
        .filter(d => d.container && domain.tables.includes(d.container))
        .map(d => d.container!);
      
      // Find the container that is not contained by others
      const rootContainers = containers.filter(container => 
        !domain.containerDetections.some(d => d.table === container && d.container)
      );
      
      if (rootContainers.length > 0) {
        return rootContainers[0];
      }
    }
    
    // Default to first table if no better option
    return domain.tables[0];
  }

  /**
   * Detect junction tables in clusters
   */
  private detectJunctionTables(
    clusters: HybridCluster[],
    relationships: Relationship[]
  ): HybridCluster[] {
    return clusters.map(cluster => {
      const junctionTables = new Set<string>(cluster.junctionTables);
      
      // Additional junction table detection for tables that might have been missed
      for (const table of cluster.tables) {
        if (this.isJunctionTable(table, relationships, cluster.tables)) {
          junctionTables.add(table);
        }
      }
      
      return {
        ...cluster,
        junctionTables: Array.from(junctionTables)
      };
    });
  }

  /**
   * Check if a table is a junction table
   */
  private isJunctionTable(
    tableName: string,
    relationships: Relationship[],
    clusterTables: string[]
  ): boolean {
    // Get all relationships for this table
    const outgoing = relationships.filter(r => r.from === tableName);
    const incoming = relationships.filter(r => r.to === tableName);
    
    // Junction tables typically have exactly 2 outgoing FK relationships
    if (outgoing.length !== 2) return false;
    
    // Both FKs should point to tables in the same cluster
    const targetTables = outgoing.map(r => r.to);
    const allInCluster = targetTables.every(t => clusterTables.includes(t));
    
    // Junction tables usually have few incoming relationships
    if (incoming.length > 1) return false;
    
    return allInCluster;
  }

  /**
   * Identify reference tables that appear in multiple domains
   */
  private identifyReferenceTables(clusters: HybridCluster[], relationships: Relationship[]): Set<string> {
    const tableOccurrences = new Map<string, number>();
    
    // Count table occurrences across clusters
    for (const cluster of clusters) {
      for (const table of cluster.tables) {
        tableOccurrences.set(table, (tableOccurrences.get(table) || 0) + 1);
      }
    }
    
    // Find tables that appear in multiple clusters
    const referenceTables = new Set<string>();
    for (const [table, count] of tableOccurrences) {
      if (count > 1) {
        referenceTables.add(table);
      }
    }
    
    return referenceTables;
  }

  /**
   * Calculate clustering metrics
   */
  private calculateClusteringMetrics(clusters: HybridCluster[], totalTables: number): any {
    const totalClusters = clusters.length;
    const clusterSizes = clusters.map(c => c.tables.length);
    const avgClusterSize = clusterSizes.reduce((sum, size) => sum + size, 0) / totalClusters;
    const coverage = clusterSizes.reduce((sum, size) => sum + size, 0) / totalTables;
    const avgQuality = clusters.reduce((sum, c) => sum + c.hybridScore, 0) / totalClusters;
    
    return {
      totalClusters,
      averageClusterSize: avgClusterSize,
      minClusterSize: Math.min(...clusterSizes),
      maxClusterSize: Math.max(...clusterSizes),
      coverage,
      averageQuality: avgQuality
    };
  }

  /**
   * Assess clustering quality
   */
  private assessClusteringQuality(clusters: HybridCluster[], options: HybridClusteringOptions): any {
    const qualityScores = clusters.map(c => c.hybridScore);
    const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / clusters.length;
    const minQuality = Math.min(...qualityScores);
    const maxQuality = Math.max(...qualityScores);
    
    return {
      qualityScore: avgQuality,
      minQuality,
      maxQuality,
      recommendation: avgQuality > 0.7 ? 'accept' : 'review'
    };
  }

  private logClusterSummary(clusters: HybridCluster[]): void {
    console.log('📋 Cluster Summary:');
    clusters.forEach((cluster, index) => {
      console.log(`  ${index + 1}. ${cluster.clusterName} (${cluster.tables.length} tables)`);
      console.log(`      🎯 Scores: hybrid=${cluster.hybridScore.toFixed(3)}, coherence=${cluster.coherenceScore.toFixed(3)}, confidence=${cluster.confidenceScore.toFixed(3)}`);
      console.log(`      📊 Type: bridge_linked, Domain: ${cluster.businessDomain || cluster.clusterName}`);
      const displayTables = cluster.tables.slice(0, 5);
      const moreCount = cluster.tables.length - displayTables.length;
      console.log(`      📁 Tables: ${displayTables.join(', ')}${moreCount > 0 ? `, ... +${moreCount} more` : ''}`);
    });
  }
}

export const hybridClusteringEngine = new HybridClusteringEngine({
  llmProvider: process.env.LLM_PROVIDER || 'openai',
  apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
});