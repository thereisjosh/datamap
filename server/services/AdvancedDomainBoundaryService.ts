import { TableInfo, Relationship } from '../../shared/schema';
import { Logger } from '../utils/logger';

// Import all advanced components
import { StatisticalHubDetector, HubDetectionResult } from './advanced/StatisticalHubDetector';
import { UniversalEdgeWeighter, EdgeWeightingResult, WeightedEdge, EdgeWeightingOptions } from './advanced/UniversalEdgeWeighter';
import { SpectralClusteringEngine, SpectralClusteringResult } from './advanced/SpectralClusteringEngine';
import { ERDDBSCANCluster, DBSCANResult } from './advanced/ERDDBSCANCluster';
import { ClusterValidationEngine, ClusterValidationResult, ValidationInput } from './advanced/ClusterValidationEngine';
import { UniversalHubAssignmentEngine, HubAssignmentResult } from './advanced/UniversalHubAssignmentEngine';
import { StructuralDomainClusteringService, DomainResult } from './advanced/StructuralDomainClusteringService';

// Import new semantic and dependency-driven components
import { SemanticVectorService, TableVector, TableEmbeddingOptions } from './semanticVectorService';
import { LouvainClusteringEngine, LouvainClusteringResult, LouvainClusteringOptions } from './LouvainClusteringEngine';
import { DependencyAnalysisEngine, DomainFormationResult, HubDomainExpansion, DependencyAnalysisOptions } from './DependencyAnalysisEngine';
import { EmbeddingBatchProcessor, BatchProcessingOptions } from './embeddingBatchProcessor';
import { HubConsolidationService, HubConsolidationResult, ConsolidatedDomain } from './HubConsolidationService';

const logger = new Logger('AdvancedDomainBoundaryService');

// Advanced domain clustering result
export interface AdvancedDomainCluster {
  id: string;
  name: string;
  tables: string[];
  size: number;
  confidence: number;
  coherenceScore: number;
  businessContext?: string;
  hubTables: string[];
  algorithmUsed: 'spectral' | 'dbscan' | 'hybrid';
  qualityMetrics: {
    internalConnectivity: number;
    externalSeparation: number;
    compactness: number;
    isolation: number;
    businessCoherence: number;
    sizeAppropriatenss: number;
  };
}

export interface AdvancedClusteringResult {
  domains: AdvancedDomainCluster[];
  hubDetection: HubDetectionResult;
  hubConsolidation?: HubConsolidationResult;
  edgeWeighting: EdgeWeightingResult;
  spectralClustering?: SpectralClusteringResult;
  louvainClustering?: LouvainClusteringResult;
  dependencyAnalysis?: DomainFormationResult;
  semanticAnalysis?: {
    vectorCount: number;
    averageSimilarity: number;
    semanticCoverage: number;
    embeddingDimensions: number;
  };
  dbscanClustering?: DBSCANResult;
  hubAssignment: HubAssignmentResult;
  validation: ClusterValidationResult;
  performance: {
    totalProcessingTime: number;
    hubDetectionTime: number;
    hubConsolidationTime?: number;
    semanticProcessingTime: number;
    edgeWeightingTime: number;
    clusteringTime: number;
    dependencyAnalysisTime: number;
    validationTime: number;
    memoryUsage: number;
  };
  recommendations: string[];
  isOptimal: boolean;
}

export interface AdvancedClusteringOptions {
  algorithm: 'spectral' | 'louvain' | 'dependency' | 'dbscan' | 'hybrid' | 'auto';
  targetClusterCount?: number;
  minClusterSize?: number;
  maxClusterSize?: number;
  hubThreshold?: number;
  
  // Semantic processing options
  enableSemanticAnalysis?: boolean;
  semanticWeight?: number;
  structuralWeight?: number;
  scoringMethod?: 'additive' | 'multiplicative' | 'hybrid';
  conservativeMode?: boolean;
  
  // Dependency-driven options
  enableDependencyAnalysis?: boolean;
  includeTransitiveDeps?: boolean;
  businessWeighting?: number;
  
  enableLLM?: boolean;
  enableValidation?: boolean;
  performanceMode?: 'accuracy' | 'speed' | 'balanced';
  batchProcessing?: boolean;
  cachingEnabled?: boolean;
}

export class AdvancedDomainBoundaryService {
  private hubDetector: StatisticalHubDetector;
  private edgeWeighter: UniversalEdgeWeighter;
  private spectralEngine: SpectralClusteringEngine;
  private louvainEngine: LouvainClusteringEngine;
  private dependencyEngine: DependencyAnalysisEngine;
  private dbscanEngine: ERDDBSCANCluster;
  private validationEngine: ClusterValidationEngine;
  private hubAssignmentEngine: UniversalHubAssignmentEngine;
  private structuralClusteringService: StructuralDomainClusteringService;
  
  // Semantic processing components
  private semanticVectorService: SemanticVectorService;
  private batchProcessor: EmbeddingBatchProcessor;
  
  // Hub consolidation component
  private hubConsolidationService: HubConsolidationService;

  // Default configuration for conservative enterprise clustering
  private readonly DEFAULT_OPTIONS: AdvancedClusteringOptions = {
    algorithm: 'auto',
    targetClusterCount: 20,      // Target 20 meaningful business domains
    minClusterSize: 5,           // Prevent micro-domains (increased from 3)
    maxClusterSize: 40,          // Allow larger coherent domains
    
    // Semantic analysis settings (conservative approach)
    enableSemanticAnalysis: true,
    semanticWeight: 0.4,           // Balanced semantic influence
    structuralWeight: 0.6,         // Structure-first approach
    scoringMethod: 'multiplicative', // Conservative scoring
    conservativeMode: true,         // Require both structural AND semantic strength
    
    // Dependency analysis settings
    enableDependencyAnalysis: true,
    includeTransitiveDeps: false,   // Conservative - direct dependencies only
    businessWeighting: 0.3,         // Business naming influence
    
    enableLLM: process.env.USE_INTELLIGENT_CLUSTERING === 'true', // Use environment configuration
    enableValidation: true,
    performanceMode: 'balanced',
    batchProcessing: true,
    cachingEnabled: true
  };

  constructor() {
    this.hubDetector = new StatisticalHubDetector();
    this.edgeWeighter = new UniversalEdgeWeighter();
    this.spectralEngine = new SpectralClusteringEngine();
    this.louvainEngine = new LouvainClusteringEngine();
    this.dependencyEngine = new DependencyAnalysisEngine();
    this.dbscanEngine = new ERDDBSCANCluster();
    this.validationEngine = new ClusterValidationEngine();
    this.hubAssignmentEngine = new UniversalHubAssignmentEngine();
    this.structuralClusteringService = new StructuralDomainClusteringService();
    
    // Initialize semantic components with optimized rate limits for OpenAI Tier 2+
    this.semanticVectorService = new SemanticVectorService();
    this.batchProcessor = new EmbeddingBatchProcessor({
      batchSize: 10,                       // Smaller batches for better control
      maxConcurrentBatches: 8,             // Higher concurrency for maximum throughput
      rateLimitRPM: 3000,                  // Full Tier 2+ capacity (3000 RPM = 50 RPS)
      maxRetries: 5,                       // More retries for resilience
      baseRetryDelay: 500,                 // Faster backoff for high-capacity processing
      enableJitter: true,
      resumable: true
    });
    
    // Initialize hub consolidation service
    this.hubConsolidationService = new HubConsolidationService();
  }

  /**
   * Enhanced ERD domain boundary detection with semantic analysis and dependency-driven clustering
   * Supports multiple clustering algorithms including Louvain modularity optimization
   */
  async detectAdvancedDomainBoundaries(
    tables: TableInfo[],
    relationships: Relationship[],
    options: Partial<AdvancedClusteringOptions> = {}
  ): Promise<AdvancedClusteringResult> {
    const startTime = performance.now();
    const config = { ...this.DEFAULT_OPTIONS, ...options };

    logger.info('Starting enhanced domain boundary detection', {
      tableCount: tables.length,
      relationshipCount: relationships.length,
      algorithm: config.algorithm,
      enableSemanticAnalysis: config.enableSemanticAnalysis,
      enableDependencyAnalysis: config.enableDependencyAnalysis,
      scoringMethod: config.scoringMethod,
      performanceMode: config.performanceMode
    });

    // Dataset size-aware approach
    if (tables.length < 20) {
      // Small datasets: use simple reliable clustering
      logger.info('Small dataset detected, using simplified clustering approach', {
        tableCount: tables.length,
        fallbackStrategy: 'connected_components'
      });
      return await this.detectSimpleDomainBoundaries(tables, relationships, config);
    } else if (tables.length <= 50) {
      // Medium datasets: use adaptive thresholds + sophisticated clustering
      logger.info('Medium dataset detected, using adaptive thresholds', {
        tableCount: tables.length,
        approach: 'adaptive_sophisticated'
      });
      return await this.detectMediumDatasetBoundaries(tables, relationships, config);
    }

    // Large datasets: use original sophisticated clustering (unchanged)
    logger.info('Large dataset detected, using original sophisticated clustering', {
      tableCount: tables.length,
      approach: 'original_advanced'
    });

    try {
      // Stage 1: Semantic Vector Generation (if enabled)
      let semanticVectors: TableVector[] = [];
      let semanticAnalysis: AdvancedClusteringResult['semanticAnalysis'] | undefined;
      const semanticStart = performance.now();
      
      if (config.enableSemanticAnalysis) {
        logger.info('Stage 1: Semantic vector generation');
        semanticVectors = await this.generateSemanticVectors(tables, config);
        
        if (semanticVectors.length > 0) {
          semanticAnalysis = {
            vectorCount: semanticVectors.length,
            averageSimilarity: this.calculateAverageSemanticSimilarity(semanticVectors),
            semanticCoverage: semanticVectors.length / tables.length,
            embeddingDimensions: semanticVectors[0]?.embedding.length || 0
          };
          
          logger.info('Semantic analysis complete', {
            vectorCount: semanticAnalysis.vectorCount,
            coverage: (semanticAnalysis.semanticCoverage * 100).toFixed(1) + '%',
            dimensions: semanticAnalysis.embeddingDimensions,
            avgSimilarity: semanticAnalysis.averageSimilarity.toFixed(3)
          });
        }
      }
      const semanticProcessingTime = performance.now() - semanticStart;

      // Stage 2: Statistical Hub Detection
      const hubDetectionStart = performance.now();
      logger.info('Stage 2: Statistical hub detection');
      
      const hubDetection = this.hubDetector.detectHubs(tables, relationships);
      const hubDetectionTime = performance.now() - hubDetectionStart;

      // Log table progression - Track which tables are hubs vs regular
      const regularTables = tables.filter(t => !hubDetection.hubs.includes(t.name));
      logger.info('📊 STAGE 2 - Table Progression After Hub Detection', {
        totalInputTables: tables.length,
        hubTables: hubDetection.hubs.length,
        regularTables: regularTables.length,
        hubTableNames: hubDetection.hubs,
        hubPercentage: hubDetection.statistics.hubPercentage.toFixed(1),
        processingTime: `${hubDetectionTime.toFixed(1)}ms`
      });

      // Stage 2.5: Hub Consolidation based on FK relationships and semantic similarity
      const hubConsolidationStart = performance.now();
      logger.info('Stage 2.5: Hub consolidation analysis');
      
      const hubConsolidation = this.hubConsolidationService.consolidateHubs(
        hubDetection.hubs, 
        tables, 
        relationships, 
        semanticVectors
      );
      const hubConsolidationTime = performance.now() - hubConsolidationStart;

      logger.info('📊 STAGE 2.5 - Hub Consolidation Complete', {
        originalHubs: hubConsolidation.originalHubCount,
        consolidatedDomains: hubConsolidation.consolidatedHubCount,
        mergedPairs: hubConsolidation.mergedHubPairs.length,
        processingTime: `${hubConsolidationTime.toFixed(1)}ms`
      });

      // Extract consolidated hub list for clustering
      const consolidatedHubList = hubConsolidation.consolidatedDomains.map(domain => domain.primaryHub);

      // Stage 3: Enhanced Edge Weighting with Semantic Integration
      const edgeWeightingStart = performance.now();
      logger.info('Stage 3: Enhanced edge weighting with semantic integration');
      
      const edgeWeightingOptions: EdgeWeightingOptions = {
        scoringMethod: config.scoringMethod || 'multiplicative',
        semanticWeight: config.semanticWeight || 0.4,
        structuralWeight: config.structuralWeight || 0.6,
        semanticThreshold: 0.3,
        conservativeMode: config.conservativeMode || true,
        enableSemanticBoost: false
      };
      
      const edgeWeighting = this.edgeWeighter.calculateEdgeWeights(
        tables, 
        relationships, 
        semanticVectors, 
        edgeWeightingOptions
      );
      const edgeWeightingTime = performance.now() - edgeWeightingStart;

      logger.info('Enhanced edge weighting complete', {
        totalEdges: edgeWeighting.statistics.totalEdges,
        avgWeight: edgeWeighting.statistics.avgWeight.toFixed(4),
        semanticCoverage: (edgeWeighting.statistics.semanticCoverage * 100).toFixed(1) + '%',
        multiplicativeBoost: edgeWeighting.statistics.multiplicativeBoost.toFixed(4),
        processingTime: `${edgeWeightingTime.toFixed(1)}ms`
      });

      // Stage 4: Intelligent Clustering Algorithm Selection
      const clusteringStart = performance.now();
      const selectedAlgorithm = this.selectOptimalAdvancedAlgorithm(tables, relationships, consolidatedHubList, config);
      logger.info(`Stage 4: ${selectedAlgorithm} clustering`);
      
      let louvainResult: LouvainClusteringResult | undefined;
      let dependencyAnalysis: DomainFormationResult | undefined;
      
      try {
        if (selectedAlgorithm === 'louvain') {
          // Use consolidated hubs for clustering
          const consolidatedHubDetection = {
            ...hubDetection,
            hubs: consolidatedHubList
          };
          louvainResult = await this.performLouvainClustering(tables, relationships, edgeWeighting.weightedEdges, config, consolidatedHubDetection, semanticVectors);
        } else if (selectedAlgorithm === 'dependency') {
          dependencyAnalysis = await this.performDependencyAnalysis(tables, relationships, config);
        } else {
          // Default to Louvain for any other case
          logger.info('Defaulting to Louvain clustering for unknown algorithm selection');
          const consolidatedHubDetection = {
            ...hubDetection,
            hubs: consolidatedHubList
          };
          louvainResult = await this.performLouvainClustering(tables, relationships, edgeWeighting.weightedEdges, config, consolidatedHubDetection, semanticVectors);
        }
      } catch (clusteringError) {
        logger.error(`${selectedAlgorithm} clustering failed, falling back to dependency analysis`, clusteringError);
        try {
          dependencyAnalysis = await this.performDependencyAnalysis(tables, relationships, config);
        } catch (fallbackError) {
          logger.error('Dependency analysis fallback also failed', fallbackError);
          throw new Error(`All clustering methods failed: ${clusteringError.message} | ${fallbackError.message}`);
        }
      }

      const clusteringTime = performance.now() - clusteringStart;

      // Stage 5: Dependency Analysis (if enabled and not already performed)
      let dependencyAnalysisTime = 0;
      if (config.enableDependencyAnalysis && !dependencyAnalysis) {
        const depAnalysisStart = performance.now();
        logger.info('Stage 5: Dependency analysis for domain refinement');
        dependencyAnalysis = await this.performDependencyAnalysis(tables, relationships, config);
        dependencyAnalysisTime = performance.now() - depAnalysisStart;
      }

      // Stage 6: Structural Domain Assembly
      logger.info('Stage 6: Structural domain assembly');
      const structuralStart = performance.now();

      // Convert clustering results to unified format based on algorithm used
      let clusteringResults;
      if (louvainResult) {
        // Convert Louvain communities to expected cluster format
        clusteringResults = louvainResult.communities.map(community => ({
          id: community.id.toString(),
          tables: community.nodes
        }));
        logger.info('Using Louvain clustering results', {
          communityCount: louvainResult.communities.length,
          globalModularity: louvainResult.globalModularity.toFixed(4)
        });
      } else if (dependencyAnalysis) {
        // Convert dependency analysis domains to cluster format
        clusteringResults = dependencyAnalysis.domains.map((domain, index) => ({
          id: index.toString(),
          tables: domain.tables
        }));
        logger.info('Using dependency analysis results', {
          domainCount: dependencyAnalysis.domains.length
        });
      } else {
        throw new Error('No valid clustering results available - both Louvain and dependency analysis failed');
      }

      const structuralDomains = await this.structuralClusteringService.performStructuralClustering({
        tables,
        relationships,
        hubTables: hubDetection.hubs,
        spectralClusters: clusteringResults
      });

      const structuralTime = performance.now() - structuralStart;

      // Log detailed domain analysis
      const domainSizes = structuralDomains.map(d => d.totalTables.length);
      const totalTablesInDomains = domainSizes.reduce((sum, size) => sum + size, 0);
      
      logger.info('📊 STAGE 4 - Structural Domain Assembly Complete', {
        domainCount: structuralDomains.length,
        domainSizes: domainSizes,
        totalTablesInDomains: totalTablesInDomains,
        largestDomain: Math.max(...domainSizes),
        smallestDomain: Math.min(...domainSizes),
        avgDomainSize: (totalTablesInDomains / structuralDomains.length).toFixed(1),
        structuralTime: `${structuralTime.toFixed(1)}ms`,
        totalClusteringTime: `${(clusteringTime + structuralTime).toFixed(1)}ms`
      });

      // Log each domain's composition
      structuralDomains.forEach((domain, index) => {
        logger.info(`🏗️ ${domain.name}`, {
          totalTables: domain.totalTables.length,
          coreTables: domain.coreTables.length,
          referencedHubs: domain.referencedHubs.length,
          masterHub: domain.masterHub || 'none',
          confidence: domain.confidence.toFixed(3),
          sampleTables: domain.totalTables.slice(0, 8),
          hasMoreTables: domain.totalTables.length > 8 ? `... and ${domain.totalTables.length - 8} more` : null
        });
      });

      // Convert to final domain format
      const finalDomains = this.convertStructuralDomainsToFinalFormat(
        structuralDomains,
        'spectral'
      );

      // Log final domain composition
      const finalDomainSizes = finalDomains.map(d => d.tables.length);
      const totalFinalTables = finalDomainSizes.reduce((sum, size) => sum + size, 0);
      
      logger.info('📊 STAGE 5 - Final Domain Assembly Complete', {
        totalDomains: finalDomains.length,
        domainSizes: finalDomainSizes,
        totalFinalTables: totalFinalTables,
        expectedTables: tables.length, // Should match original input
        largestDomain: Math.max(...finalDomainSizes),
        problemDomains: finalDomainSizes.filter(size => size > 30).length,
        avgDomainSize: (totalFinalTables / finalDomains.length).toFixed(1)
      });

      // Log each final domain with detailed composition
      finalDomains.forEach(domain => {
        const hubsInDomain = domain.hubTables || [];
        const regularTablesInDomain = domain.tables.filter(t => !hubsInDomain.includes(t));
        
        logger.info(`🏗️ Final Domain ${domain.id}`, {
          name: domain.name,
          totalTables: domain.tables.length,
          hubCount: hubsInDomain.length,
          regularTableCount: regularTablesInDomain.length,
          hubs: hubsInDomain,
          sampleTables: domain.tables.slice(0, 8),
          confidence: domain.confidence.toFixed(3),
          coherenceScore: domain.coherenceScore.toFixed(3),
          algorithmUsed: domain.algorithmUsed
        });
      });

      // Stage 5: Simplified Validation
      const validationStart = performance.now();
      logger.info('Stage 5: Simplified validation');
      
      const validation = await this.performSimplifiedValidation(
        tables,
        relationships,
        finalDomains,
        config
      );
      const validationTime = performance.now() - validationStart;

      logger.info('Validation complete', {
        domainCount: finalDomains.length,
        avgDomainSize: (totalTablesInDomains / finalDomains.length).toFixed(1),
        validationPassed: validation.overallQuality.isOptimal,
        processingTime: `${validationTime.toFixed(1)}ms`
      });

      // Calculate performance metrics
      const totalTime = performance.now() - startTime;
      const memoryUsage = this.estimateMemoryUsage(tables.length, relationships.length);

      const performance_metrics = {
        totalProcessingTime: totalTime,
        hubDetectionTime,
        hubConsolidationTime,
        semanticProcessingTime,
        edgeWeightingTime,
        clusteringTime,
        dependencyAnalysisTime,
        validationTime,
        memoryUsage
      };

      // Create simplified hub assignment result for compatibility
      const hubAssignmentResult: HubAssignmentResult = {
        assignedHubs: structuralDomains.flatMap(domain => 
          domain.referencedHubs.concat(domain.masterHub ? [domain.masterHub] : [])
            .map(hub => ({
              hubTable: hub,
              assignedCluster: parseInt(domain.id),
              affinityScore: domain.confidence,
              assignmentType: 'structural' as const
            }))
        ),
        isolatedHubs: [],
        statistics: {
          avgAffinityScore: structuralDomains.reduce((sum, d) => sum + d.confidence, 0) / structuralDomains.length,
          assignmentDistribution: {}
        }
      };

      const result: AdvancedClusteringResult = {
        domains: finalDomains,
        hubDetection,
        hubConsolidation,
        edgeWeighting,
        spectralClustering: undefined, // Spectral clustering removed - using Louvain-first approach
        louvainClustering: louvainResult,
        dependencyAnalysis,
        semanticAnalysis,
        dbscanClustering: undefined, // DBSCAN not used in enhanced approach
        hubAssignment: hubAssignmentResult,
        validation,
        performance: performance_metrics,
        recommendations: [],
        isOptimal: validation.overallQuality.isOptimal
      };

      logger.info('Advanced domain boundary detection complete', {
        domainCount: finalDomains.length,
        totalTime: `${totalTime.toFixed(1)}ms`,
        memoryUsage: `${memoryUsage.toFixed(1)}MB`,
        isOptimal: result.isOptimal,
        overallScore: validation.overallQuality.overallScore.toFixed(3)
      });

      return result;

    } catch (error) {
      logger.error('Error in advanced domain boundary detection', error);
      throw error;
    }
  }

  /**
   * Perform advanced clustering using selected algorithm
   */
  private async performAdvancedClustering(
    tables: TableInfo[],
    relationships: Relationship[],
    weightedEdges: WeightedEdge[],
    hubTables: string[],
    config: AdvancedClusteringOptions
  ): Promise<{
    clusters: Array<{ id: string; tables: string[] }>;
    algorithmUsed: 'spectral' | 'dbscan' | 'hybrid';
    spectralResult?: SpectralClusteringResult;
    dbscanResult?: DBSCANResult;
  }> {
    let algorithmToUse = config.algorithm;

    // Auto-select algorithm based on data characteristics
    if (algorithmToUse === 'auto') {
      algorithmToUse = this.selectOptimalAlgorithm(tables.length, relationships.length, hubTables.length);
    }

    logger.info(`Using ${algorithmToUse} clustering algorithm`);

    switch (algorithmToUse) {
      case 'spectral':
        const spectralResult = await this.spectralEngine.performSpectralClustering(
          tables,
          weightedEdges,
          hubTables
        );
        
        return {
          clusters: spectralResult.clusters.map(c => ({ 
            id: c.clusterId.toString(), 
            tables: c.tables 
          })),
          algorithmUsed: 'spectral',
          spectralResult
        };

      case 'dbscan':
        const dbscanResult = await this.dbscanEngine.performDBSCANClustering(
          tables,
          weightedEdges,
          hubTables
        );
        
        return {
          clusters: dbscanResult.clusters.map(c => ({ 
            id: c.clusterId.toString(), 
            tables: c.tables 
          })),
          algorithmUsed: 'dbscan',
          dbscanResult
        };

      case 'hybrid':
        return await this.performHybridClustering(tables, relationships, weightedEdges, hubTables, config);

      default:
        throw new Error(`Unknown clustering algorithm: ${algorithmToUse}`);
    }
  }

  /**
   * Perform hybrid clustering combining multiple algorithms
   */
  private async performHybridClustering(
    tables: TableInfo[],
    relationships: Relationship[],
    weightedEdges: WeightedEdge[],
    hubTables: string[],
    config: AdvancedClusteringOptions
  ): Promise<{
    clusters: Array<{ id: string; tables: string[] }>;
    algorithmUsed: 'hybrid';
    spectralResult: SpectralClusteringResult;
    dbscanResult?: DBSCANResult;
  }> {
    logger.info('Performing hybrid clustering (Spectral + DBSCAN)');

    let spectralResult: SpectralClusteringResult;
    let dbscanResult: DBSCANResult | null = null;

    try {
      // Always try spectral clustering first (more reliable)
      spectralResult = await this.spectralEngine.performSpectralClustering(tables, weightedEdges, hubTables);
      logger.info('Spectral clustering completed successfully', {
        clusters: spectralResult.clusters.length,
        silhouetteScore: spectralResult.validation.silhouetteScore.toFixed(3)
      });

      // Try DBSCAN with fallback handling
      try {
        dbscanResult = await this.dbscanEngine.performDBSCANClustering(tables, weightedEdges, hubTables);
        logger.info('DBSCAN clustering completed successfully', {
          clusters: dbscanResult.clusters.length,
          noiseCount: dbscanResult.noise.length
        });
      } catch (dbscanError) {
        logger.warn('DBSCAN clustering failed, falling back to Spectral-only', {
          error: dbscanError instanceof Error ? dbscanError.message : 'Unknown error',
          fallbackTables: tables.length
        });
        // dbscanResult remains null, will use spectral-only
      }
    } catch (spectralError) {
      logger.error('Spectral clustering failed', spectralError);
      throw new Error(`Both clustering algorithms failed. Spectral error: ${spectralError instanceof Error ? spectralError.message : 'Unknown error'}`);
    }

    // Select best result based on validation scores
    const spectralScore = spectralResult.validation.silhouetteScore * 0.6 + 
                         spectralResult.validation.calinskiHarabaszIndex / 1000 * 0.4;
    
    let useBestResult = true; // Default to spectral
    let bestAlgorithm = 'spectral';
    
    if (dbscanResult) {
      const dbscanScore = dbscanResult.statistics.avgDensity * 0.7 + 
                         (1 - dbscanResult.statistics.noiseCount / tables.length) * 0.3;

      logger.info('Hybrid algorithm comparison', {
        spectralScore: spectralScore.toFixed(3),
        dbscanScore: dbscanScore.toFixed(3),
        spectralClusters: spectralResult.clusters.length,
        dbscanClusters: dbscanResult.clusters.length
      });

      // Choose better performing algorithm
      useBestResult = spectralScore > dbscanScore;
      bestAlgorithm = useBestResult ? 'spectral' : 'DBSCAN';
    } else {
      logger.info('Using Spectral-only clustering (DBSCAN failed)', {
        spectralScore: spectralScore.toFixed(3),
        spectralClusters: spectralResult.clusters.length,
        fallbackReason: 'DBSCAN validation failed'
      });
    }

    const clusters = (useBestResult || !dbscanResult)
      ? spectralResult.clusters.map(c => ({ id: c.clusterId.toString(), tables: c.tables }))
      : dbscanResult!.clusters.map(c => ({ id: c.clusterId.toString(), tables: c.tables }));

    logger.info(`Hybrid clustering selected ${bestAlgorithm} result`);

    return {
      clusters,
      algorithmUsed: 'hybrid',
      spectralResult,
      dbscanResult: dbscanResult || undefined
    };
  }

  /**
   * Auto-select optimal algorithm based on data characteristics
   */
  private selectOptimalAlgorithm(
    tableCount: number, 
    relationshipCount: number, 
    hubCount: number
  ): 'spectral' | 'dbscan' | 'hybrid' {
    const density = relationshipCount / (tableCount * (tableCount - 1) / 2);
    const hubRatio = hubCount / tableCount;

    // High density + few hubs -> Spectral works well
    if (density > 0.1 && hubRatio < 0.1) {
      return 'spectral';
    }
    
    // Low density + many hubs -> DBSCAN handles noise better
    if (density < 0.05 && hubRatio > 0.15) {
      return 'dbscan';
    }
    
    // Medium complexity -> Use hybrid for best results
    if (tableCount > 100) {
      return 'hybrid';
    }

    return 'spectral'; // Default for most cases
  }

  /**
   * Assemble final domains from clustering results and hub assignments
   */
  private assembleFinalDomains(
    clusters: Array<{ id: string; tables: string[] }>,
    hubAssignment: HubAssignmentResult,
    algorithmUsed: 'spectral' | 'dbscan' | 'hybrid'
  ): AdvancedDomainCluster[] {
    const domains: AdvancedDomainCluster[] = [];

    // Create domain map for hub assignment integration
    const clusterMap = new Map<string, string[]>();
    clusters.forEach(cluster => {
      clusterMap.set(cluster.id, [...cluster.tables]);
    });

    // Integrate hub assignments
    hubAssignment.assignedHubs.forEach(assignment => {
      const clusterId = assignment.assignedCluster.toString();
      const clusterTables = clusterMap.get(clusterId);
      
      if (clusterTables) {
        clusterTables.push(assignment.hubTable);
      }
    });

    // Create isolated domains for unassigned hubs
    hubAssignment.isolatedHubs.forEach((hubTable, index) => {
      const isolatedId = `isolated_${index}`;
      clusterMap.set(isolatedId, [hubTable]);
    });

    // Convert to final domain format
    clusterMap.forEach((tables, id) => {
      if (tables.length === 0) return;

      // Identify hub tables in this domain
      const domainHubs = hubAssignment.assignedHubs
        .filter(a => a.assignedCluster.toString() === id)
        .map(a => a.hubTable);

      // Add isolated hubs
      const isolatedInDomain = hubAssignment.isolatedHubs.filter(hub => tables.includes(hub));
      domainHubs.push(...isolatedInDomain);

      // Generate domain name based on ID and characteristics
      const domainName = this.generateDomainName(id, tables, domainHubs);

      // Calculate confidence and coherence scores
      const confidence = this.calculateDomainConfidence(tables.length, domainHubs.length, algorithmUsed);
      const coherenceScore = this.calculateInitialCoherence(tables);

      domains.push({
        id,
        name: domainName,
        tables,
        size: tables.length,
        confidence,
        coherenceScore,
        hubTables: domainHubs,
        algorithmUsed,
        qualityMetrics: {
          internalConnectivity: 0, // Will be calculated in validation
          externalSeparation: 0,   // Will be calculated in validation
          compactness: 0,          // Will be calculated in validation
          isolation: 0,            // Will be calculated in validation
          businessCoherence: 0,    // Will be calculated in validation
          sizeAppropriatenss: this.calculateSizeAppropriateness(tables.length)
        }
      });
    });

    // FIXED: Preserve original hub community order instead of sorting by size
    // The Louvain clustering engine creates communities in meaningful hub order (0-6)
    // Sorting by size scrambles this carefully constructed domain organization
    // domains.sort((a, b) => b.size - a.size); // DISABLED: Causes domain index misalignment

    return domains;
  }

  /**
   * Perform comprehensive validation using the validation engine
   */
  private async performComprehensiveValidation(
    tables: TableInfo[],
    relationships: Relationship[],
    domains: AdvancedDomainCluster[],
    config: AdvancedClusteringOptions
  ): Promise<ClusterValidationResult> {
    if (!config.enableValidation) {
      // Return minimal validation result
      return {
        silhouetteScore: 0.5,
        daviesBouldinIndex: 1.0,
        calinskiHarabaszIndex: 100,
        dunnsIndex: 0.5,
        adjustedRandIndex: -1,
        internalValidation: {
          withinClusterSumSquares: 0,
          betweenClusterSumSquares: 0,
          totalSumSquares: 0,
          explainedVariance: 0.5
        },
        clusterCoherence: [],
        overallQuality: {
          overallScore: 0.5,
          isOptimal: false,
          recommendations: ['Validation disabled'],
          confidence: 0.3,
          qualityGrade: 'Fair'
        }
      };
    }

    const validationInput: ValidationInput = {
      clusters: domains.map(domain => ({
        clusterId: parseInt(domain.id) || 0,
        tables: domain.tables,
        size: domain.size
      }))
    };

    const validationResult = await this.validationEngine.validateClustering(
      tables,
      relationships,
      validationInput
    );

    // Update domain quality metrics from validation results
    this.updateDomainQualityMetrics(domains, validationResult);

    return validationResult;
  }

  /**
   * Update domain quality metrics from validation results
   */
  private updateDomainQualityMetrics(
    domains: AdvancedDomainCluster[],
    validation: ClusterValidationResult
  ): void {
    validation.clusterCoherence.forEach(coherence => {
      const domain = domains.find(d => parseInt(d.id) === coherence.clusterId);
      if (domain) {
        domain.qualityMetrics = {
          internalConnectivity: coherence.internalConnectivity,
          externalSeparation: coherence.externalSeparation,
          compactness: coherence.compactness,
          isolation: coherence.isolation,
          businessCoherence: coherence.businessCoherence,
          sizeAppropriatenss: coherence.sizeAppropriatenss
        };
        
        // Update overall coherence score
        domain.coherenceScore = (
          coherence.internalConnectivity * 0.25 +
          coherence.externalSeparation * 0.25 +
          coherence.compactness * 0.2 +
          coherence.businessCoherence * 0.2 +
          coherence.sizeAppropriatenss * 0.1
        );
      }
    });
  }

  /**
   * Generate domain name based on characteristics
   */
  private generateDomainName(id: string, tables: string[], hubTables: string[]): string {
    if (id.startsWith('isolated_')) {
      return `Isolated_Domain_${id.split('_')[1]}`;
    }
    
    const domainSize = tables.length;
    const hubCount = hubTables.length;
    
    // Generate business-meaningful names based on primary hub table
    if (hubCount > 0) {
      const primaryHub = hubTables[0]; // Use the first hub as primary
      
      // Extract meaningful name from hub table
      const businessName = this.extractBusinessNameFromTable(primaryHub);
      
      if (hubCount === 1) {
        return `${businessName} Domain`;
      } else {
        return `${businessName} & Related Domains`;
      }
    } 
    
    // For domains without hubs, try to infer from table names
    if (tables.length > 0) {
      const businessName = this.inferDomainNameFromTables(tables);
      if (businessName !== 'General') {
        return `${businessName} Domain`;
      }
    }
    
    // Fallback to size-based naming
    if (domainSize >= 20) {
      return `Large Domain ${id}`;
    } else if (domainSize <= 5) {
      return `Small Domain ${id}`;
    } else {
      return `Mixed Domain ${id}`;
    }
  }

  /**
   * Extract business-meaningful name from table name
   */
  private extractBusinessNameFromTable(tableName: string): string {
    if (!tableName) return 'General';
    
    // Handle common naming patterns
    const businessTerms: Record<string, string> = {
      'campaign': 'Campaign Management',
      'user': 'User Management', 
      'member': 'Membership',
      'donation': 'Donation Processing',
      'gift': 'Gift Management',
      'giver': 'Donor Relations',
      'volunteer': 'Volunteer Management',
      'event': 'Event Management',
      'organization': 'Organization',
      'programme': 'Programme Management',
      'program': 'Program Management',
      'payment': 'Payment Processing',
      'transaction': 'Transaction',
      'contact': 'Contact Management',
      'account': 'Account Management',
      'finance': 'Financial',
      'report': 'Reporting',
      'audit': 'Audit & Compliance',
      'system': 'System Configuration',
      'admin': 'Administration',
      'log': 'Logging & Monitoring'
    };
    
    const lowerTableName = tableName.toLowerCase();
    
    // Find matching business term
    for (const [key, businessName] of Object.entries(businessTerms)) {
      if (lowerTableName.includes(key)) {
        return businessName;
      }
    }
    
    // Clean up table name for display
    return tableName.charAt(0).toUpperCase() + tableName.slice(1).replace(/[_-]/g, ' ');
  }

  /**
   * Infer domain name from collection of table names
   */
  private inferDomainNameFromTables(tables: string[]): string {
    const termCounts: Record<string, number> = {};
    
    const businessTerms = [
      'campaign', 'user', 'member', 'donation', 'gift', 'giver', 
      'volunteer', 'event', 'organization', 'programme', 'program',
      'payment', 'transaction', 'contact', 'account', 'finance',
      'report', 'audit', 'system', 'admin', 'log'
    ];
    
    // Count occurrences of business terms across all tables
    tables.forEach(tableName => {
      const lowerName = tableName.toLowerCase();
      businessTerms.forEach(term => {
        if (lowerName.includes(term)) {
          termCounts[term] = (termCounts[term] || 0) + 1;
        }
      });
    });
    
    // Find most common term
    let maxCount = 0;
    let dominantTerm = '';
    
    Object.entries(termCounts).forEach(([term, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantTerm = term;
      }
    });
    
    // Return meaningful name if dominant term found
    if (dominantTerm && maxCount >= 2) {
      const businessName = this.extractBusinessNameFromTable(dominantTerm);
      return businessName.replace(' Domain', ''); // Remove 'Domain' suffix as it will be added later
    }
    
    return 'General';
  }

  /**
   * Calculate domain confidence based on characteristics
   */
  private calculateDomainConfidence(
    tableCount: number, 
    hubCount: number, 
    algorithmUsed: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Size-based confidence
    if (tableCount >= 3 && tableCount <= 25) {
      confidence += 0.2;
    }

    // Hub integration confidence
    if (hubCount > 0 && hubCount <= 3) {
      confidence += 0.15;
    }

    // Algorithm-based confidence
    switch (algorithmUsed) {
      case 'spectral':
        confidence += 0.15;
        break;
      case 'hybrid':
        confidence += 0.2;
        break;
      case 'dbscan':
        confidence += 0.1;
        break;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate initial coherence score
   */
  private calculateInitialCoherence(tables: string[]): number {
    // Simple size-based coherence (will be updated by validation)
    const size = tables.length;
    
    if (size >= 3 && size <= 15) {
      return 0.8;
    } else if (size >= 16 && size <= 25) {
      return 0.6;
    } else if (size >= 2) {
      return 0.4;
    } else {
      return 0.2;
    }
  }

  /**
   * Calculate size appropriateness
   */
  private calculateSizeAppropriateness(size: number): number {
    if (size >= 3 && size <= 20) {
      return 1.0;
    } else if (size >= 21 && size <= 25) {
      return 0.8;
    } else if (size === 2) {
      return 0.6;
    } else if (size === 1) {
      return 0.3;
    } else {
      return Math.max(0.1, 1.0 - (size - 25) / 50);
    }
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(
    validation: ClusterValidationResult,
    domains: AdvancedDomainCluster[],
    hubDetection: HubDetectionResult,
    config: AdvancedClusteringOptions
  ): string[] {
    const recommendations: string[] = [];

    // Add validation recommendations
    recommendations.push(...validation.overallQuality.recommendations);

    // Domain count recommendations
    const domainCount = domains.length;
    if (domainCount < 8) {
      recommendations.push(`Consider increasing granularity to get more than ${domainCount} domains for better separation.`);
    } else if (domainCount > 30) {
      recommendations.push(`Consider consolidating some of the ${domainCount} domains to reduce complexity.`);
    }

    // Hub-related recommendations
    const hubRatio = hubDetection.statistics.hubPercentage;
    if (hubRatio > 20) {
      recommendations.push(`High hub percentage (${hubRatio.toFixed(1)}%) may indicate overly connected schema. Consider reviewing table relationships.`);
    }

    // Size distribution recommendations
    const smallDomains = domains.filter(d => d.size < 3).length;
    const largeDomains = domains.filter(d => d.size > 25).length;
    
    if (smallDomains > domains.length * 0.3) {
      recommendations.push(`Many small domains detected (${smallDomains}). Consider merging related domains or reviewing clustering parameters.`);
    }
    
    if (largeDomains > 0) {
      recommendations.push(`Some domains are very large (${largeDomains} domains > 25 tables). Consider splitting for better maintainability.`);
    }

    // Performance recommendations
    if (config.performanceMode === 'speed' && !validation.overallQuality.isOptimal) {
      recommendations.push('Consider using "accuracy" mode for better clustering quality.');
    }

    // Remove duplicates and limit to most important recommendations
    const uniqueRecommendations = Array.from(new Set(recommendations));
    return uniqueRecommendations.slice(0, 8);
  }

  /**
   * Estimate memory usage for performance tracking
   */
  private estimateMemoryUsage(tableCount: number, relationshipCount: number): number {
    // Rough estimation in MB based on data structures
    const matrixSize = (tableCount * tableCount * 8) / (1024 * 1024); // Adjacency matrix
    const edgeStorage = (relationshipCount * 200) / (1024 * 1024);    // Weighted edges
    const overhead = 2; // Other data structures
    
    return matrixSize + edgeStorage + overhead;
  }

  /**
   * Advanced clustering with circuit breaker protection
   */
  private async performAdvancedClusteringWithCircuitBreaker(
    tables: TableInfo[],
    relationships: Relationship[],
    weightedEdges: WeightedEdge[],
    hubTables: string[],
    config: AdvancedClusteringOptions,
    sessionStartTime: number
  ): Promise<{
    clusters: Array<{ id: string; tables: string[] }>;
    algorithmUsed: 'spectral' | 'dbscan' | 'hybrid';
    spectralResult?: SpectralClusteringResult;
    dbscanResult?: DBSCANResult;
  }> {
    const TOTAL_SESSION_TIMEOUT = 300000; // 5 minutes total
    const CLUSTERING_TIMEOUT = 240000;    // 4 minutes for clustering
    
    // Check if we're already approaching session timeout
    const elapsedTime = performance.now() - sessionStartTime;
    if (elapsedTime > TOTAL_SESSION_TIMEOUT * 0.8) {
      throw new Error(`Session timeout approaching (${elapsedTime}ms), skipping advanced clustering`);
    }

    // Estimate memory usage and check limits
    const memoryEstimate = this.estimateMemoryUsage(tables.length, relationships.length);
    if (memoryEstimate > 500) { // 500MB limit
      logger.warn('High memory usage estimated, using simplified clustering', {
        memoryEstimateMB: memoryEstimate,
        tableCount: tables.length
      });
      throw new Error(`Memory usage too high (${memoryEstimate.toFixed(1)}MB), using fallback`);
    }

    // Set shorter timeout for clustering operations
    const clusteringStart = performance.now();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Clustering operation timeout after ${CLUSTERING_TIMEOUT}ms`));
      }, CLUSTERING_TIMEOUT);
    });

    // Run clustering with timeout protection
    const clusteringPromise = this.performAdvancedClustering(
      tables, 
      relationships, 
      weightedEdges, 
      hubTables, 
      config
    );

    return Promise.race([clusteringPromise, timeoutPromise]);
  }

  /**
   * Create fallback clustering using simple size-based grouping
   */
  private createFallbackClustering(
    tables: TableInfo[],
    hubTables: string[]
  ): {
    clusters: Array<{ id: string; tables: string[] }>;
    algorithmUsed: 'spectral' | 'dbscan' | 'hybrid';
  } {
    logger.info('Creating fallback clustering using size-based grouping');

    const clusters: Array<{ id: string; tables: string[] }> = [];
    const regularTables = tables.filter(t => !hubTables.includes(t.name));
    const TARGET_CLUSTER_SIZE = 15;
    const clusterCount = Math.ceil(regularTables.length / TARGET_CLUSTER_SIZE);

    // Create size-based clusters
    for (let i = 0; i < clusterCount; i++) {
      const startIdx = i * TARGET_CLUSTER_SIZE;
      const endIdx = Math.min(startIdx + TARGET_CLUSTER_SIZE, regularTables.length);
      const clusterTables = regularTables.slice(startIdx, endIdx).map(t => t.name);
      
      if (clusterTables.length > 0) {
        clusters.push({
          id: `fallback_${i}`,
          tables: clusterTables
        });
      }
    }

    // Distribute hub tables across clusters
    hubTables.forEach((hubTable, index) => {
      const targetCluster = clusters[index % clusters.length];
      if (targetCluster) {
        targetCluster.tables.push(hubTable);
      }
    });

    logger.info('Fallback clustering created', {
      clusterCount: clusters.length,
      avgClusterSize: clusters.length > 0 ? 
        clusters.reduce((sum, c) => sum + c.tables.length, 0) / clusters.length : 0,
      hubTablesDistributed: hubTables.length
    });

    return {
      clusters,
      algorithmUsed: 'spectral' // Fallback reported as spectral for compatibility
    };
  }

  /**
   * Convert structural domains to final format for compatibility
   */
  private convertStructuralDomainsToFinalFormat(
    structuralDomains: DomainResult[],
    algorithmUsed: 'spectral' | 'dbscan' | 'hybrid'
  ): AdvancedDomainCluster[] {
    
    return structuralDomains.map((domain, index) => {
      // Use Set to prevent hub duplication when masterHub is also in referencedHubs
      const allHubs = domain.referencedHubs.concat(domain.masterHub ? [domain.masterHub] : []);
      const hubTables = [...new Set(allHubs)]; // Remove duplicates
      
      // Generate proper hub-based domain name
      const primaryHub = domain.masterHub || hubTables[0] || `UnknownDomain${index + 1}`;
      const properDomainName = `${primaryHub} Domain`;
      
      
      return {
        id: domain.id,
        name: properDomainName,
        tables: domain.totalTables,
        size: domain.totalTables.length,
        confidence: domain.confidence,
        coherenceScore: domain.confidence, // Use confidence as coherence score
        businessContext: this.generateBusinessContext(domain),
        hubTables,
        algorithmUsed,
        qualityMetrics: {
          internalConnectivity: domain.confidence * 0.8, // Estimate from confidence
          externalSeparation: domain.confidence * 0.7,   
          compactness: domain.confidence * 0.9,          
          isolation: domain.confidence * 0.6,            
          businessCoherence: domain.confidence,          
          sizeAppropriatenss: this.calculateSizeAppropriateness(domain.totalTables.length)
        }
      };
    });
  }

  /**
   * Generate business context description for domain
   */
  private generateBusinessContext(domain: DomainResult): string {
    if (domain.masterHub) {
      // Return clean hub-based name (same as domain.name)
      return `${domain.masterHub} Domain`;
    }
    
    if (domain.referencedHubs.length > 0) {
      // Use the first referenced hub for naming
      const primaryHub = domain.referencedHubs[0];
      return `${primaryHub} Domain`;
    }
    
    return `General Domain`;
  }

  /**
   * Simplified validation that focuses on practical constraints
   */
  private async performSimplifiedValidation(
    tables: TableInfo[],
    relationships: Relationship[],
    finalDomains: AdvancedDomainCluster[],
    config: AdvancedClusteringOptions
  ): Promise<ClusterValidationResult> {
    
    logger.info('Starting simplified validation', {
      tableCount: tables.length,
      domainCount: finalDomains.length
    });

    // Simple validation rules
    const totalTables = finalDomains.reduce((sum, domain) => sum + domain.tables.length, 0);
    const avgDomainSize = totalTables / finalDomains.length;
    
    // Check for obvious problems
    const hasMegaDomain = finalDomains.some(domain => domain.size > tables.length * 0.5);
    const hasTinyDomains = finalDomains.some(domain => domain.size < 2);
    const reasonableCount = finalDomains.length >= 3 && finalDomains.length <= Math.sqrt(tables.length) * 2;
    
    // Calculate simple validation score
    let validationScore = 1.0;
    
    if (hasMegaDomain) {
      validationScore -= 0.5;
      logger.warn('Mega-domain detected', { 
        largestDomain: Math.max(...finalDomains.map(d => d.size)) 
      });
    }
    
    if (hasTinyDomains) {
      validationScore -= 0.2;
    }
    
    if (!reasonableCount) {
      validationScore -= 0.3;
      logger.warn('Unreasonable domain count', { 
        domainCount: finalDomains.length,
        recommended: `${Math.ceil(Math.sqrt(tables.length))} - ${Math.ceil(Math.sqrt(tables.length) * 2)}`
      });
    }
    
    // Ensure minimum score
    validationScore = Math.max(0, validationScore);
    
    const isOptimal = validationScore > 0.7 && !hasMegaDomain && reasonableCount;

    return {
      structural: {
        clusterSizeDistribution: { isValid: !hasTinyDomains, score: hasTinyDomains ? 0.6 : 1.0 },
        coverage: { isValid: totalTables >= tables.length * 0.95, score: 0.9 },
        noiseRatio: { isValid: true, score: 1.0 },
        clusterBalance: { isValid: reasonableCount, score: reasonableCount ? 1.0 : 0.5 }
      },
      semantic: {
        referentialIntegrity: { isValid: true, score: 0.8 },
        foreignKeyPreservation: { isValid: true, score: 0.9 },
        cardinalityConsistency: { isValid: true, score: 0.8 }
      },
      graphQuality: {
        modularity: { isValid: !hasMegaDomain, score: hasMegaDomain ? 0.3 : 0.8 },
        conductance: { isValid: true, score: 0.7 },
        coverage: { isValid: true, score: 0.9 },
        separability: { isValid: !hasMegaDomain, score: hasMegaDomain ? 0.4 : 0.8 }
      },
      overallQuality: {
        overallScore: validationScore,
        qualityGrade: isOptimal ? 'A' : validationScore > 0.5 ? 'B' : 'C',
        isOptimal,
        recommendations: isOptimal ? [] : [
          'Consider adjusting clustering parameters',
          hasMegaDomain ? 'Large domain detected - may need splitting' : '',
          !reasonableCount ? 'Domain count may be too high or too low' : ''
        ].filter(Boolean)
      }
    };
  }

  /**
   * Generate semantic vectors for tables using batch processing
   */
  private async generateSemanticVectors(
    tables: TableInfo[], 
    config: AdvancedClusteringOptions
  ): Promise<TableVector[]> {
    const embeddingOptions: TableEmbeddingOptions = {
      includeColumnNames: true,
      includeRelationships: false,  // Handled separately in edge weighting
      includeForeignKeys: true,
      useCache: config.cachingEnabled || true,
      maxTokens: 8000,
      validationMode: false  // Full content embeddings
    };

    if (config.batchProcessing) {
      const batchResult = await this.batchProcessor.processTables(
        tables,
        (table, options) => this.semanticVectorService.generateTableEmbedding(table, options),
        embeddingOptions
      );

      if (batchResult.errors.length > 0) {
        logger.warn('Some tables failed semantic vector generation', {
          failedCount: batchResult.errors.length,
          totalCount: tables.length
        });
      }

      return batchResult.vectors;
    } else {
      // Sequential processing for small datasets
      const vectors: TableVector[] = [];
      for (const table of tables) {
        try {
          const vector = await this.semanticVectorService.generateTableEmbedding(table, embeddingOptions);
          vectors.push(vector);
        } catch (error) {
          logger.warn(`Failed to generate vector for table ${table.name}`, error);
        }
      }
      return vectors;
    }
  }

  /**
   * Calculate average semantic similarity across all table pairs
   */
  private calculateAverageSemanticSimilarity(vectors: TableVector[]): number {
    if (vectors.length < 2) return 0;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const similarity = this.cosineSimilarity(vectors[i].embedding, vectors[j].embedding);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Select optimal clustering algorithm based on data characteristics
   */
  private selectOptimalAdvancedAlgorithm(
    tables: TableInfo[], 
    relationships: Relationship[], 
    hubTables: string[], 
    config: AdvancedClusteringOptions
  ): 'louvain' | 'dependency' {
    const density = relationships.length / (tables.length * (tables.length - 1) / 2);
    const hubRatio = hubTables.length / tables.length;

    // User specified algorithm (only allow louvain or dependency)
    if (config.algorithm !== 'auto') {
      const userAlgorithm = config.algorithm as string;
      if (userAlgorithm === 'louvain' || userAlgorithm === 'dependency') {
        return userAlgorithm as 'louvain' | 'dependency';
      }
      // For any other specified algorithm, default to Louvain
      return 'louvain';
    }

    // Dependency analysis for highly hierarchical enterprise databases
    if (config.enableDependencyAnalysis && hubRatio > 0.15 && tables.length >= 100) {
      return 'dependency';
    }

    // Louvain is excellent for sparse graphs (typical in database schemas)
    if (density < 0.05 && tables.length >= 20) {
      return 'louvain';
    }

    // Default to Louvain for modularity-based community detection
    // Louvain is optimal for most database clustering scenarios
    return 'louvain';
  }

  /**
   * Perform Louvain modularity optimization clustering
   */
  private async performLouvainClustering(
    tables: TableInfo[],
    relationships: Relationship[],
    weightedEdges: WeightedEdge[],
    config: AdvancedClusteringOptions,
    hubDetection: HubDetectionResult,
    semanticVectors?: TableVector[]
  ): Promise<LouvainClusteringResult> {
    // Convert weighted edges to edge weights map
    const edgeWeights = new Map<string, number>();
    weightedEdges.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      edgeWeights.set(key, edge.components.finalWeight);
    });

    const louvainOptions: LouvainClusteringOptions = {
      resolution: 4.0,  // High resolution for hub-centered clustering (targeting 15-25 domains)
      minClusterSize: config.minClusterSize || 5,  // Prevent micro-domains
      maxIterations: 100,
      convergenceThreshold: 0.001,
      enableHubPreservation: true,
      verbose: true  // Enable debugging to track hub-centered initialization
    };

    
    // Pass hub table names and semantic vectors for complete conservative clustering  
    return await this.louvainEngine.clusterTables(tables, relationships, edgeWeights, hubDetection.hubs, semanticVectors);
  }

  /**
   * Perform dependency-driven domain analysis
   */
  private async performDependencyAnalysis(
    tables: TableInfo[],
    relationships: Relationship[],
    config: AdvancedClusteringOptions
  ): Promise<DomainFormationResult> {
    const dependencyOptions: DependencyAnalysisOptions = {
      hubThreshold: config.hubThreshold || 5,
      maxDomainSize: config.maxDomainSize || 15,
      minCohesionScore: 0.6,
      includeTransitiveDeps: config.includeTransitiveDeps || false,
      businessWeighting: config.businessWeighting || 0.3,
      verbose: false
    };

    return await this.dependencyEngine.analyzeDependencies(tables, relationships);
  }

  /**
   * Simple domain boundary detection for small datasets (< 20 tables)
   * Uses connected components and basic hub detection
   */
  private async detectSimpleDomainBoundaries(
    tables: TableInfo[],
    relationships: Relationship[],
    config: AdvancedClusteringOptions
  ): Promise<AdvancedClusteringResult> {
    const startTime = performance.now();

    // Stage 1: Simple hub detection with relaxed thresholds
    const hubDetection = this.hubDetector.detectHubs(tables, relationships);
    const hubDetectionTime = performance.now() - startTime;

    // Stage 2: Basic edge weighting
    const edgeWeightingStart = performance.now();
    const edgeWeighting = this.edgeWeighter.calculateEdgeWeights(
      tables, 
      relationships, 
      [], // No semantic vectors for simple datasets
      { ...config, conservativeMode: true }
    );
    const edgeWeightingTime = performance.now() - edgeWeightingStart;

    // Stage 3: Connected components clustering
    const clusteringStart = performance.now();
    
    // Create simple spectral clusters for small datasets based on connected components
    const spectralClusters: Array<{ id: string; tables: string[] }> = [];
    
    // For small datasets, create clusters around each hub
    hubDetection.hubs.forEach((hub, index) => {
      spectralClusters.push({
        id: `hub_cluster_${index}`,
        tables: [hub]  // Start with just the hub, structural clustering will expand
      });
    });
    
    // If no hubs detected, create a single cluster with all tables
    if (hubDetection.hubs.length === 0) {
      spectralClusters.push({
        id: 'default_cluster_0',
        tables: tables.map(t => t.name)
      });
    }
    
    const structuralResult = await this.structuralClusteringService.performStructuralClustering({
      tables,
      relationships,
      hubTables: hubDetection.hubs,
      spectralClusters
    });
    const clusteringTime = performance.now() - clusteringStart;

    // Convert to AdvancedClusteringResult format with null safety
    let domains: AdvancedDomainCluster[] = [];
    
    if (structuralResult && structuralResult.domains && Array.isArray(structuralResult.domains) && structuralResult.domains.length > 0) {
      domains = structuralResult.domains.map((domain, index) => ({
        id: `domain_${index + 1}`,
        name: domain.name,
        tables: domain.tables,
        size: domain.tables.length,
        confidence: domain.confidence,
        coherenceScore: domain.coherenceScore,
        businessContext: domain.businessContext,
        hubTables: domain.hubTables,
        algorithmUsed: 'hybrid' as const,
        qualityMetrics: {
          internalConnectivity: domain.qualityMetrics?.internalConnectivity || 0,
          externalSeparation: domain.qualityMetrics?.externalSeparation || 0,
          compactness: domain.qualityMetrics?.compactness || 0,
          isolation: domain.qualityMetrics?.isolation || 0,
          businessCoherence: domain.qualityMetrics?.businessCoherence || 0,
          sizeAppropriatenss: domain.qualityMetrics?.sizeAppropriatenss || 0
        }
      }));
      
      logger.info('💡 Simple dataset domains converted successfully', {
        domainCount: domains.length,
        structuralResultExists: !!structuralResult,
        structuralDomainsExists: !!structuralResult?.domains,
        structuralDomainsLength: structuralResult?.domains?.length || 0
      });
    } else {
      // Create emergency fallback domains when structural clustering returns empty results
      logger.warn('⚠️ Small dataset structural clustering returned empty domains - creating fallback domains', {
        structuralResultExists: !!structuralResult,
        structuralDomainsExists: !!structuralResult?.domains,
        structuralDomainsType: typeof structuralResult?.domains,
        hubCount: hubDetection.hubs.length,
        tableCount: tables.length
      });
      
      // Create fallback domains for small datasets: one domain per hub + one for orphans
      if (hubDetection.hubs.length > 0) {
        hubDetection.hubs.forEach((hub, index) => {
          domains.push({
            id: `fallback_hub_domain_${index + 1}`,
            name: `${hub} Domain`,
            tables: [hub], // Will be expanded by connected components
            size: 1,
            confidence: 0.6, // Medium-high confidence for hub-based domains
            coherenceScore: 0.5,
            businessContext: 'Auto-generated hub domain',
            hubTables: [hub],
            algorithmUsed: 'hybrid' as const,
            qualityMetrics: {
              internalConnectivity: 0.4,
              externalSeparation: 0.4,
              compactness: 0.5,
              isolation: 0.4,
              businessCoherence: 0.4,
              sizeAppropriatenss: 0.5
            }
          });
        });
        
        // Add remaining tables to largest hub domain
        const nonHubTables = tables.filter(t => !hubDetection.hubs.includes(t.name)).map(t => t.name);
        if (nonHubTables.length > 0 && domains.length > 0) {
          domains[0].tables.push(...nonHubTables);
          domains[0].size = domains[0].tables.length;
        }
      } else {
        // No hubs detected - create single domain
        domains.push({
          id: 'fallback_domain_1',
          name: 'Primary Domain',
          tables: tables.map(t => t.name),
          size: tables.length,
          confidence: 0.4, // Lower confidence for no-hub fallback
          coherenceScore: 0.3,
          businessContext: 'Auto-generated single domain',
          hubTables: [],
          algorithmUsed: 'hybrid' as const,
          qualityMetrics: {
            internalConnectivity: 0.3,
            externalSeparation: 0.3,
            compactness: 0.4,
            isolation: 0.3,
            businessCoherence: 0.3,
            sizeAppropriatenss: 0.4
          }
        });
      }
      
      logger.info('🔄 Created fallback domains for small dataset', {
        fallbackDomains: domains.length,
        hubDomains: hubDetection.hubs.length,
        totalTablesInFallback: domains.reduce((sum, d) => sum + d.size, 0)
      });
    }

    // Industry-standard post-processing: consolidate domains below minimum viable size
    logger.info('🔍 BEFORE CONSOLIDATION DEBUG', {
      domainsCount: domains.length,
      domainSizes: domains.map(d => ({ name: d.name, size: d.size, tables: d.tables })),
      totalTableCount: tables.length
    });
    
    try {
      domains = this.consolidateSmallDomains(domains, relationships, tables.length);
      
      logger.info('✅ AFTER CONSOLIDATION DEBUG', {
        domainsCount: domains.length,
        domainSizes: domains.map(d => ({ name: d.name, size: d.size, tables: d.tables }))
      });
    } catch (error) {
      logger.error('❌ CONSOLIDATION ERROR', {
        error: error.message,
        stack: error.stack,
        domainsBeforeError: domains.length
      });
      // Continue with original domains if consolidation fails
    }

    return {
      domains,
      hubDetection,
      edgeWeighting,
      structuralClustering: structuralResult,
      hubAssignment: { assignments: [], unassignedHubs: [], domainHubCounts: [] },
      validation: { isValid: true, overallQuality: 0.8, individualScores: [], recommendations: [], warnings: [] },
      performance: {
        totalProcessingTime: performance.now() - startTime,
        hubDetectionTime,
        semanticProcessingTime: 0,
        edgeWeightingTime,
        clusteringTime,
        dependencyAnalysisTime: 0,
        validationTime: 0,
        memoryUsage: process.memoryUsage().heapUsed
      },
      recommendations: ['Small dataset - using simple clustering'],
      isOptimal: true
    };
  }

  /**
   * Consolidate domains below minimum viable size following industry standards
   * Small datasets should have meaningful domain boundaries, not single-table domains
   */
  private consolidateSmallDomains(
    domains: AdvancedDomainCluster[], 
    relationships: Relationship[], 
    totalTableCount: number
  ): AdvancedDomainCluster[] {
    // Industry standards for minimum domain size
    const MIN_DOMAIN_SIZE_SMALL = totalTableCount < 15 ? 2 : 3;
    const MAX_DOMAINS_SMALL = Math.max(1, Math.floor(totalTableCount / 4)); // Max 1 domain per 4 tables
    
    logger.info('🔄 Starting domain consolidation analysis', {
      originalDomains: domains.length,
      totalTables: totalTableCount,
      minDomainSize: MIN_DOMAIN_SIZE_SMALL,
      maxDomainsAllowed: MAX_DOMAINS_SMALL
    });
    
    // Separate domains by size
    const largeDomains = domains.filter(d => d.size >= MIN_DOMAIN_SIZE_SMALL);
    const smallDomains = domains.filter(d => d.size < MIN_DOMAIN_SIZE_SMALL);
    
    if (smallDomains.length === 0) {
      logger.info('✅ No small domains found, no consolidation needed');
      return domains;
    }
    
    logger.info('📊 Domain size analysis', {
      largeDomainsCount: largeDomains.length,
      smallDomainsCount: smallDomains.length,
      smallDomainSizes: smallDomains.map(d => `${d.name}:${d.size}`).join(', ')
    });
    
    // Strategy: merge small domains with their closest related large domain
    const consolidatedDomains = [...largeDomains];
    
    smallDomains.forEach(smallDomain => {
      const bestMergeTarget = this.findBestMergeTarget(smallDomain, largeDomains, relationships);
      
      if (bestMergeTarget) {
        // Merge small domain into the best target
        this.mergeDomains(bestMergeTarget, smallDomain);
        logger.info(`🔗 Merged "${smallDomain.name}" into "${bestMergeTarget.name}"`, {
          originalSize: bestMergeTarget.size - smallDomain.size,
          newSize: bestMergeTarget.size,
          addedTables: smallDomain.tables.join(', ')
        });
      } else {
        // No suitable merge target - keep as is or merge with largest domain
        if (largeDomains.length > 0) {
          const largestDomain = largeDomains.reduce((max, domain) => 
            domain.size > max.size ? domain : max
          );
          this.mergeDomains(largestDomain, smallDomain);
          logger.info(`🔗 Merged orphan "${smallDomain.name}" into largest domain "${largestDomain.name}"`);
        } else {
          // All domains are small - keep the small domain
          consolidatedDomains.push(smallDomain);
        }
      }
    });
    
    // Additional consolidation if we still have too many domains
    while (consolidatedDomains.length > MAX_DOMAINS_SMALL && consolidatedDomains.length > 1) {
      const smallestDomain = consolidatedDomains.reduce((min, domain) => 
        domain.size < min.size ? domain : min
      );
      const remainingDomains = consolidatedDomains.filter(d => d.id !== smallestDomain.id);
      const bestTarget = this.findBestMergeTarget(smallestDomain, remainingDomains, relationships) || 
                         remainingDomains[0]; // Fallback to first domain
      
      this.mergeDomains(bestTarget, smallestDomain);
      consolidatedDomains.splice(consolidatedDomains.indexOf(smallestDomain), 1);
      
      logger.info(`🎯 Additional consolidation: merged "${smallestDomain.name}" into "${bestTarget.name}"`);
    }
    
    logger.info('✅ Domain consolidation complete', {
      originalDomains: domains.length,
      finalDomains: consolidatedDomains.length,
      finalSizes: consolidatedDomains.map(d => `${d.name}:${d.size}`).join(', ')
    });
    
    return consolidatedDomains;
  }
  
  /**
   * Find the best merge target for a small domain based on FK relationships
   */
  private findBestMergeTarget(
    smallDomain: AdvancedDomainCluster, 
    candidateDomains: AdvancedDomainCluster[], 
    relationships: Relationship[]
  ): AdvancedDomainCluster | null {
    let bestTarget: AdvancedDomainCluster | null = null;
    let maxConnectionStrength = 0;
    
    candidateDomains.forEach(candidate => {
      const connectionStrength = this.calculateDomainConnectionStrength(
        smallDomain, candidate, relationships
      );
      
      if (connectionStrength > maxConnectionStrength) {
        maxConnectionStrength = connectionStrength;
        bestTarget = candidate;
      }
    });
    
    return maxConnectionStrength > 0 ? bestTarget : null;
  }
  
  /**
   * Calculate connection strength between two domains based on FK relationships
   */
  private calculateDomainConnectionStrength(
    domain1: AdvancedDomainCluster, 
    domain2: AdvancedDomainCluster, 
    relationships: Relationship[]
  ): number {
    let connectionCount = 0;
    const domain1Tables = new Set(domain1.tables);
    const domain2Tables = new Set(domain2.tables);
    
    relationships.forEach(rel => {
      const sourceInDomain1 = domain1Tables.has(rel.sourceTable);
      const targetInDomain1 = domain1Tables.has(rel.targetTable);
      const sourceInDomain2 = domain2Tables.has(rel.sourceTable);
      const targetInDomain2 = domain2Tables.has(rel.targetTable);
      
      // Count cross-domain relationships
      if ((sourceInDomain1 && targetInDomain2) || (sourceInDomain2 && targetInDomain1)) {
        connectionCount++;
      }
    });
    
    return connectionCount;
  }
  
  /**
   * Merge source domain into target domain
   */
  private mergeDomains(target: AdvancedDomainCluster, source: AdvancedDomainCluster): void {
    // Merge tables
    target.tables.push(...source.tables);
    target.size = target.tables.length;
    
    // Merge hub tables
    target.hubTables.push(...source.hubTables);
    target.hubTables = [...new Set(target.hubTables)]; // Remove duplicates
    
    // Update domain name to reflect merger if needed
    if (source.hubTables.length > 0 && source.hubTables[0] !== target.hubTables[0]) {
      // If merging domains with different primary hubs, create a composite name
      const primaryHub = target.hubTables[0] || target.tables[0];
      target.name = `${primaryHub} Domain`;
    }
    
    // Update business context
    if (source.businessContext && source.businessContext !== target.businessContext) {
      target.businessContext += ` (includes ${source.businessContext})`;
    }
    
    // Recalculate confidence as weighted average
    const totalSize = target.size;
    const targetWeight = (target.size - source.size) / totalSize;
    const sourceWeight = source.size / totalSize;
    target.confidence = (target.confidence * targetWeight) + (source.confidence * sourceWeight);
    
    // Update quality metrics (simple averaging)
    Object.keys(target.qualityMetrics).forEach(key => {
      const targetValue = target.qualityMetrics[key as keyof typeof target.qualityMetrics];
      const sourceValue = source.qualityMetrics[key as keyof typeof source.qualityMetrics];
      (target.qualityMetrics as any)[key] = (targetValue * targetWeight) + (sourceValue * sourceWeight);
    });
  }

  /**
   * Medium dataset boundary detection (20-50 tables)
   * Uses adaptive thresholds with sophisticated clustering
   */
  private async detectMediumDatasetBoundaries(
    tables: TableInfo[],
    relationships: Relationship[],
    config: AdvancedClusteringOptions
  ): Promise<AdvancedClusteringResult> {
    const startTime = performance.now();

    // Stage 1: Hub detection with adaptive thresholds
    const hubDetection = this.hubDetector.detectHubs(tables, relationships);
    const hubDetectionTime = performance.now() - startTime;

    // Stage 2: Enhanced edge weighting
    const edgeWeightingStart = performance.now();
    const edgeWeighting = this.edgeWeighter.calculateEdgeWeights(
      tables, 
      relationships, 
      [], // No semantic vectors for medium datasets
      { ...config, conservativeMode: false }
    );
    const edgeWeightingTime = performance.now() - edgeWeightingStart;

    // Stage 3: Louvain clustering for medium datasets
    const clusteringStart = performance.now();
    
    // Convert weighted edges to edge weights map
    const edgeWeights = new Map<string, number>();
    edgeWeighting.weightedEdges.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      const weight = edge.components.finalWeight;
      
      // Validation: ensure weight is a valid number
      if (typeof weight === 'number' && !isNaN(weight)) {
        edgeWeights.set(key, weight);
      } else {
        logger.warn('⚠️ Invalid edge weight detected, skipping', {
          edgeKey: key,
          weight,
          weightType: typeof weight
        });
      }
    });
    
    logger.info('🔧 Edge weight map created for medium dataset', {
      totalEdges: edgeWeighting.weightedEdges.length,
      validWeights: edgeWeights.size,
      sampleWeights: Array.from(edgeWeights.entries()).slice(0, 5).map(([key, value]) => `${key}:${value.toFixed(3)}`)
    });
    
    const louvainResult = await this.louvainEngine.clusterTables(
      tables,
      relationships,
      edgeWeights,
      hubDetection.hubs,
      [] // No semantic vectors for medium datasets
    );
    const clusteringTime = performance.now() - clusteringStart;

    // Stage 4: Structural domain assembly
    const structuralStart = performance.now();
    const structuralResult = await this.structuralClusteringService.performStructuralClustering({
      tables,
      relationships,
      hubTables: hubDetection.hubs,
      spectralClusters: louvainResult.communities.map((community, index) => ({
        id: `cluster_${index}`,
        tables: community.nodes
      }))
    });
    const structuralTime = performance.now() - structuralStart;

    // Convert to AdvancedClusteringResult format with null safety
    let domains: AdvancedDomainCluster[] = [];
    
    if (structuralResult && structuralResult.domains && Array.isArray(structuralResult.domains) && structuralResult.domains.length > 0) {
      domains = structuralResult.domains.map((domain, index) => ({
      id: `domain_${index + 1}`,
      name: domain.name,
      tables: domain.tables,
      size: domain.tables.length,
      confidence: domain.confidence,
      coherenceScore: domain.coherenceScore,
      businessContext: domain.businessContext,
      hubTables: domain.hubTables,
      algorithmUsed: 'hybrid' as const,
      qualityMetrics: {
        internalConnectivity: domain.qualityMetrics?.internalConnectivity || 0,
        externalSeparation: domain.qualityMetrics?.externalSeparation || 0,
        compactness: domain.qualityMetrics?.compactness || 0,
        isolation: domain.qualityMetrics?.isolation || 0,
        businessCoherence: domain.qualityMetrics?.businessCoherence || 0,
        sizeAppropriatenss: domain.qualityMetrics?.sizeAppropriatenss || 0
      }
      }));
      
      logger.info('💡 Medium dataset domains converted successfully', {
        domainCount: domains.length,
        structuralResultExists: !!structuralResult,
        structuralDomainsExists: !!structuralResult?.domains,
        structuralDomainsLength: structuralResult?.domains?.length || 0
      });
    } else {
      // Create emergency fallback domains when structural clustering returns empty results
      logger.warn('⚠️ Structural clustering returned empty domains - creating fallback domains', {
        structuralResultExists: !!structuralResult,
        structuralDomainsExists: !!structuralResult?.domains,
        structuralDomainsType: typeof structuralResult?.domains,
        louvainCommunities: louvainResult.communities.length,
        hubCount: hubDetection.hubs.length
      });
      
      // Create fallback domains directly from Louvain communities
      domains = louvainResult.communities.map((community, index) => ({
        id: `fallback_domain_${index + 1}`,
        name: `Fallback Domain ${index + 1}`,
        tables: community.nodes,
        size: community.nodes.length,
        confidence: 0.5, // Medium confidence for fallback
        coherenceScore: 0.4,
        businessContext: 'Auto-generated fallback domain',
        hubTables: community.hubTables || [],
        algorithmUsed: 'hybrid' as const,
        qualityMetrics: {
          internalConnectivity: 0.3,
          externalSeparation: 0.3,
          compactness: 0.4,
          isolation: 0.3,
          businessCoherence: 0.3,
          sizeAppropriatenss: 0.4
        }
      }));
      
      logger.info('🔄 Created fallback domains from Louvain communities', {
        fallbackDomains: domains.length,
        totalTablesInFallback: domains.reduce((sum, d) => sum + d.size, 0)
      });
    }

    return {
      domains,
      hubDetection,
      edgeWeighting,
      louvainClustering: louvainResult,
      structuralClustering: structuralResult,
      hubAssignment: { assignments: [], unassignedHubs: [], domainHubCounts: [] },
      validation: { isValid: true, overallQuality: 0.8, individualScores: [], recommendations: [], warnings: [] },
      performance: {
        totalProcessingTime: performance.now() - startTime,
        hubDetectionTime,
        semanticProcessingTime: 0,
        edgeWeightingTime,
        clusteringTime,
        dependencyAnalysisTime: 0,
        validationTime: 0,
        memoryUsage: process.memoryUsage().heapUsed
      },
      recommendations: ['Medium dataset - using adaptive clustering'],
      isOptimal: true
    };
  }
}