import { type TableData, type Relationship } from '@shared/schema';
import Graph from 'graphology';
import { relationshipAnalyzer, type RelationshipWeight } from './relationshipAnalyzer';
import { algorithmicDomainClassifier as businessRuleEngine, type DomainClassificationResult } from './businessRuleEngine';
import { intelligentDomainAnalyzer, type EnhancedDomainCluster } from './intelligentDomainAnalyzer';
import { vectorClusteringService } from './vectorClusteringService';
import { domainPersistenceService } from './domainPersistenceService';

export interface TableDomainMembership {
  tableName: string;
  domainMemberships: Map<string, number>; // domain ID -> strength score (0.0-1.0)
  primaryDomain: string;
  secondaryDomains: string[];
}

export interface MultiDomainCluster {
  id: string;
  name: string;
  description: string;
  coreTableNames: Set<string>; // Tables with strong membership (>= 0.8)
  allTableNames: Set<string>; // All participating tables (>= 0.3)
  tableMemberships: Map<string, number>; // table -> membership strength
  internalConnections: number;
  externalConnections: Map<string, number>;
  cohesionScore: number;
  businessClassification: DomainClassificationResult;
  suggestedColor: string;
  coreTables: number;
  totalTables: number;
}

export interface AdvancedTableCluster extends MultiDomainCluster {
  tables: TableData[];
  tableNames: Set<string>;
  modularityScore: number;
  size: number;
  
  // AI Enhancement properties (optional for backward compatibility)
  aiEnhanced?: boolean;
  explanations?: {
    purpose: string;
    coreTableReasons: Map<string, string>;
    contextualTableReasons: Map<string, string>;
    junctionTableReasons: Map<string, string>;
    excludedTableReasons: Map<string, string>;
  };
  confidenceScore?: number;
  businessMetrics?: {
    completeness: number;
    independence: number;
    usability: number;
  };
}

export interface MultiDomainDetectionResult {
  tableMemberships: Map<string, TableDomainMembership>;
  domains: MultiDomainCluster[];
  overlapScore: number;
  totalDomains: number;
}

export class AdvancedDomainAnalyzer {
  
  /**
   * Main entry point: Discover overlapping domains using multi-domain analysis
   * Enhanced with AI-powered semantic understanding when enabled
   */
  public async discoverDomains(tables: TableData[], relationships: Relationship[], projectId?: string): Promise<AdvancedTableCluster[]> {
    const startTime = Date.now();
    console.log(`🔬 Multi-domain discovery for ${tables.length} tables, ${relationships.length} relationships`);
    
    // DEPRECATED: Old intelligent clustering system (disabled to prevent interference with hybrid system)
    // The new hybrid clustering system in contextualSchemaAnalyzer.ts is the primary approach
    const useIntelligentClustering = false; // Permanently disabled - was: process.env.USE_INTELLIGENT_CLUSTERING === 'true'
    
    if (useIntelligentClustering && projectId) {
      console.warn(`⚠️ USE_INTELLIGENT_CLUSTERING is deprecated and disabled`);
      console.warn(`   The new hybrid clustering system provides superior results`);
      console.warn(`   Please use contextualSchemaAnalyzer for domain analysis`);
      
      // This code path is now unreachable but kept for reference
      // The hybrid clustering system replaces this entire approach
      
    } else if (process.env.USE_INTELLIGENT_CLUSTERING === 'true') {
      console.warn(`⚠️ USE_INTELLIGENT_CLUSTERING environment variable detected but disabled`);
      console.warn(`   This system has been replaced by the hybrid clustering approach`);
      console.warn(`   Set USE_HYBRID_CLUSTERING=false to disable the new system if needed`);
    }
    
    // Traditional multi-domain clustering (fallback or when AI is disabled)
    console.log(`📊 Using traditional graph-based domain clustering`);
    
    // Step 1: Analyze relationship weights
    const relationshipWeights = relationshipAnalyzer.analyzeRelationships(tables, relationships);
    
    // Step 2: Build weighted graph
    const graph = this.buildWeightedGraph(tables, relationshipWeights);
    console.log(`📊 Built weighted graph with ${graph.nodes().length} nodes, ${graph.edges().length} edges`);
    
    // Step 3: Apply multi-domain detection
    const multiDomainResult = this.applyMultiDomainDetection(graph, tables, relationshipWeights);
    console.log(`🌐 Detected ${multiDomainResult.totalDomains} overlapping domains (overlap score: ${multiDomainResult.overlapScore.toFixed(3)})`);
    
    // Step 4: Convert to legacy format for backward compatibility
    const finalClusters = this.convertMultiDomainToClusters(tables, multiDomainResult, relationships);
    
    const duration = Date.now() - startTime;
    console.log(`⚡ Traditional multi-domain discovery completed in ${duration}ms`);
    
    // Log final results
    this.logFinalResults(finalClusters);
    
    return finalClusters;
  }
  
  /**
   * Vector-Based Domain Discovery using semantic embeddings
   */
  private async discoverDomainsWithVectors(tables: TableData[], relationships: Relationship[], projectId: string): Promise<AdvancedTableCluster[]> {
    console.log(`🔗 Starting vector-based domain analysis...`);
    
    try {
      // Step 1: Convert TableData to TableInfo format for vector service
      const tableInfos = tables.map(table => ({
        name: table.name,
        columns: table.attributes.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          defaultValue: col.defaultValue,
        })),
        primaryKeys: table.primaryKeys || [],
        foreignKeys: relationships
          .filter(rel => rel.fromTable === table.name)
          .map(rel => `${rel.fromColumn} -> ${rel.toTable}.${rel.toColumn}`),
      }));
      
      // Step 2: Perform vector clustering with relationships for context
      const vectorResult = await vectorClusteringService.performVectorClusteringWithContext(tableInfos, relationships);
      console.log(`   ✅ Vector clustering created ${vectorResult.clusters.length} clusters`);
      
      // Step 3: Store results in database for future use
      const embeddings = await vectorClusteringService.generateTableEmbeddings(tableInfos);
      await domainPersistenceService.storeDomainClustering(projectId, vectorResult, embeddings);
      console.log(`   💾 Stored domain clustering for project ${projectId}`);
      
      // Step 4: Convert vector clusters to standard format
      const vectorClusters = this.convertVectorClustersToStandard(tables, vectorResult, relationships);
      
      // Step 5: Post-process with relationship analysis for compatibility
      const finalClusters = this.postProcessClusters(vectorClusters, relationships);
      
      console.log(`   🎯 Vector clustering completed with ${finalClusters.length} final domains`);
      
      return finalClusters;
      
    } catch (error) {
      console.error('❌ Vector domain analysis failed:', error);
      throw error;
    }
  }

  /**
   * AI-Enhanced Domain Discovery using semantic understanding (Legacy)
   * @deprecated Use discoverDomainsWithVectors for better performance
   */
  private async discoverDomainsWithAI(tables: TableData[], relationships: Relationship[]): Promise<AdvancedTableCluster[]> {
    console.log(`🧠 Starting AI-enhanced domain analysis...`);
    
    try {
      // Step 1: Get AI-enhanced domain clusters
      const enhancedClusters = await intelligentDomainAnalyzer.assembleDomains(tables, relationships);
      console.log(`   ✅ AI assembled ${enhancedClusters.length} enhanced domains`);
      
      // Step 2: Convert enhanced clusters to standard format with AI metadata
      const aiClusters = this.convertEnhancedToStandardClusters(tables, enhancedClusters, relationships);
      
      // Step 3: Post-process with relationship analysis for compatibility
      const finalClusters = this.postProcessClusters(aiClusters, relationships);
      
      console.log(`   🎯 AI clustering completed with ${finalClusters.length} final domains`);
      
      return finalClusters;
      
    } catch (error) {
      console.error('❌ AI domain analysis failed:', error);
      throw error;
    }
  }
  
  /**
   * Convert enhanced AI clusters to standard cluster format
   */
  private convertEnhancedToStandardClusters(
    tables: TableData[],
    enhancedClusters: EnhancedDomainCluster[],
    relationships: Relationship[]
  ): AdvancedTableCluster[] {
    const tableMap = new Map(tables.map(table => [table.name, table]));
    const clusters: AdvancedTableCluster[] = [];
    
    enhancedClusters.forEach((enhanced, index) => {
      // Gather all tables that belong to this domain (core + contextual + junction)
      const domainTableNames = new Set([
        ...enhanced.coreTables,
        ...enhanced.contextualTables.keys(),
        ...enhanced.junctionTables
      ]);
      
      // Get actual table objects
      const domainTables: TableData[] = [];
      domainTableNames.forEach(tableName => {
        const table = tableMap.get(tableName);
        if (table) {
          domainTables.push(table);
        }
      });
      
      if (domainTables.length === 0) {
        console.warn(`⚠️ Enhanced cluster "${enhanced.name}" has no valid tables, skipping`);
        return;
      }
      
      // Create standard cluster with AI enhancement metadata
      const cluster: AdvancedTableCluster = {
        // Standard properties
        id: enhanced.id,
        name: enhanced.name,
        description: enhanced.purpose,
        tables: domainTables,
        tableNames: new Set(domainTables.map(t => t.name)),
        
        // Multi-domain properties
        coreTableNames: enhanced.coreTables,
        allTableNames: domainTableNames,
        tableMemberships: this.convertContextualToMemberships(enhanced.contextualTables, enhanced.coreTables),
        coreTables: enhanced.coreTables.size,
        totalTables: domainTableNames.size,
        
        // Legacy properties (will be calculated in post-processing)
        internalConnections: 0,
        externalConnections: new Map(),
        cohesionScore: enhanced.cohesionScore,
        modularityScore: enhanced.confidenceScore,
        size: domainTables.length,
        
        // Business classification
        businessClassification: this.createBusinessClassification(enhanced),
        suggestedColor: this.generateColor(index),
        
        // AI Enhancement metadata
        aiEnhanced: true,
        explanations: enhanced.explanations,
        confidenceScore: enhanced.confidenceScore,
        businessMetrics: enhanced.businessMetrics
      };
      
      clusters.push(cluster);
    });
    
    console.log(`   🔄 Converted ${enhancedClusters.length} AI clusters to ${clusters.length} standard clusters`);
    return clusters;
  }
  
  /**
   * Convert contextual tables map to membership strengths map
   */
  private convertContextualToMemberships(
    contextualTables: Map<string, { relevanceScore: number; role: string; columns: string[]; reasoning: string; }>,
    coreTables: Set<string>
  ): Map<string, number> {
    const memberships = new Map<string, number>();
    
    // Core tables get maximum membership (0.9)
    coreTables.forEach(tableName => {
      memberships.set(tableName, 0.9);
    });
    
    // Contextual tables get their relevance scores
    contextualTables.forEach((context, tableName) => {
      memberships.set(tableName, context.relevanceScore);
    });
    
    return memberships;
  }
  
  /**
   * Convert vector clusters to standard cluster format
   */
  private convertVectorClustersToStandard(
    tables: TableData[],
    vectorResult: any, // VectorClusteringResult
    relationships: Relationship[]
  ): AdvancedTableCluster[] {
    const tableMap = new Map(tables.map(table => [table.name, table]));
    const clusters: AdvancedTableCluster[] = [];
    
    vectorResult.clusters.forEach((vectorCluster: any, index: number) => {
      // Get actual table objects for this cluster
      const clusterTables: TableData[] = [];
      const clusterTableNames = new Set<string>();
      
      vectorCluster.tables.forEach((tableEmbedding: any) => {
        const table = tableMap.get(tableEmbedding.tableName);
        if (table) {
          clusterTables.push(table);
          clusterTableNames.add(table.name);
        }
      });
      
      if (clusterTables.length === 0) {
        console.warn(`⚠️ Vector cluster "${vectorCluster.suggestedDomainName}" has no valid tables, skipping`);
        return;
      }
      
      // Create business classification from vector cluster
      const businessClassification: DomainClassificationResult = {
        structuralType: 'unknown', // TODO: Map vectorCluster to structural type
        confidence: vectorCluster.coherenceScore,
        connectivityScore: 0.5, // TODO: Calculate from vector cluster
        semanticCohesion: vectorCluster.coherenceScore,
        industryAgnosticLabel: vectorCluster.suggestedDomainName,
        description: vectorCluster.businessPurpose,
        structuralFeatures: {
          hasHierarchy: false,
          hasTransactionality: false,
          hasTemporalPatterns: false,
          hasUserContext: false,
          centralityScore: 0.5,
          relationshipDensity: 0.5
        }
      };
      
      // Create memberships map (all tables in vector cluster have equal membership)
      const tableMemberships = new Map<string, number>();
      clusterTableNames.forEach(tableName => {
        tableMemberships.set(tableName, vectorCluster.coherenceScore);
      });
      
      // Create standard cluster with vector enhancement metadata
      const cluster: AdvancedTableCluster = {
        // Standard properties
        id: `vector_${index}`,
        name: vectorCluster.suggestedDomainName,
        description: vectorCluster.businessPurpose,
        tables: clusterTables,
        tableNames: clusterTableNames,
        
        // Multi-domain properties
        coreTableNames: clusterTableNames, // All tables are considered core in vector clustering
        allTableNames: clusterTableNames,
        tableMemberships,
        coreTables: clusterTableNames.size,
        totalTables: clusterTableNames.size,
        
        // Legacy properties (will be calculated in post-processing)
        internalConnections: 0,
        externalConnections: new Map(),
        cohesionScore: vectorCluster.coherenceScore,
        modularityScore: vectorCluster.coherenceScore,
        businessClassification,
        suggestedColor: this.generateColor(index),
        size: clusterTables.length,
        
        // AI Enhancement properties
        aiEnhanced: true,
        explanations: {
          purpose: vectorCluster.businessPurpose,
          coreTableReasons: new Map(
            [...clusterTableNames].map(name => [
              name, 
              `Semantically clustered with ${vectorCluster.coherenceScore.toFixed(3)} coherence score`
            ])
          ),
          contextualTableReasons: new Map(),
          junctionTableReasons: new Map(),
          excludedTableReasons: new Map(),
        },
        confidenceScore: vectorCluster.coherenceScore,
        businessMetrics: {
          completeness: vectorCluster.coherenceScore,
          independence: 0.8, // Default for vector clustering
          usability: vectorCluster.coherenceScore * 0.9,
        },
      };
      
      clusters.push(cluster);
    });
    
    return clusters;
  }
  
  /**
   * Create business classification from enhanced cluster
   */
  private createBusinessClassification(enhanced: EnhancedDomainCluster): DomainClassificationResult {
    // Use structural analysis instead of hardcoded mappings
    const structuralType = this.inferStructuralTypeFromCluster(enhanced);
    const connectivityScore = this.calculateConnectivityScore(enhanced);
    const semanticCohesion = this.calculateSemanticCohesion(enhanced);
    
    return {
      structuralType,
      confidence: enhanced.confidenceScore,
      connectivityScore,
      semanticCohesion,
      industryAgnosticLabel: enhanced.displayName,
      description: enhanced.purpose,
      structuralFeatures: {
        hasHierarchy: this.detectHierarchyInCluster(enhanced),
        hasTransactionality: this.detectTransactionalityInCluster(enhanced),
        hasTemporalPatterns: this.detectTemporalPatternsInCluster(enhanced),
        hasUserContext: this.detectUserContextInCluster(enhanced),
        centralityScore: enhanced.confidenceScore,
        relationshipDensity: connectivityScore
      }
    };
  }
  
  /**
   * Build weighted graph from tables and relationship weights
   */
  private buildWeightedGraph(tables: TableData[], weights: RelationshipWeight[]): Graph {
    const graph = new Graph({ type: 'undirected', allowSelfLoops: true }); // Industry standard: enable for hierarchical DB structures
    
    // Track duplicate names to generate unique node IDs
    const nameCounter = new Map<string, number>();
    const tableToNodeId = new Map<string, string>();
    
    // Add nodes (tables) with unique IDs to handle duplicates
    tables.forEach(table => {
      let nodeId = table.name;
      
      // Handle duplicate table names by adding a counter
      if (nameCounter.has(table.name)) {
        const count = nameCounter.get(table.name)! + 1;
        nameCounter.set(table.name, count);
        nodeId = `${table.name}_${count}`;
        console.log(`⚠️  Duplicate table name detected: "${table.name}" → using unique ID: "${nodeId}"`);
      } else {
        nameCounter.set(table.name, 1);
      }
      
      // Store mapping for relationship processing
      tableToNodeId.set(table.name, nodeId);
      
      graph.addNode(nodeId, { 
        table,
        originalName: table.name, // Keep original name for reference
        size: table.attributes.length // Table complexity as node weight
      });
    });
    
    // Add weighted edges (relationships) using unique node IDs
    let selfLoopCount = 0;
    weights.forEach(weight => {
      const sourceNodeId = tableToNodeId.get(weight.source);
      const targetNodeId = tableToNodeId.get(weight.target);
      
      if (sourceNodeId && targetNodeId && graph.hasNode(sourceNodeId) && graph.hasNode(targetNodeId)) {
        // Handle self-referential relationships (hierarchical structures)
        const isSelfLoop = sourceNodeId === targetNodeId;
        if (isSelfLoop) {
          selfLoopCount++;
          console.log(`🔄 Self-referential relationship detected: ${weight.source} → ${weight.target} (hierarchical structure)`);
        }
        
        // Avoid duplicate edges by checking both directions (except for self-loops)
        const edgeExists = isSelfLoop ? 
          graph.hasEdge(sourceNodeId, targetNodeId) :
          (graph.hasEdge(sourceNodeId, targetNodeId) || graph.hasEdge(targetNodeId, sourceNodeId));
          
        if (!edgeExists) {
          // Apply industry standard weighting for self-loops (typically reduced weight)
          const adjustedWeight = isSelfLoop ? weight.weight * 0.5 : weight.weight;
          
          graph.addEdge(sourceNodeId, targetNodeId, {
            weight: adjustedWeight,
            type: weight.type,
            strength: weight.strength,
            originalSourceTable: weight.source,
            originalTargetTable: weight.target,
            isSelfLoop: isSelfLoop,
            isHierarchical: isSelfLoop
          });
        }
      }
    });
    
    console.log(`   Graph statistics: ${graph.nodes().length} nodes, ${graph.edges().length} edges`);
    console.log(`   Average degree: ${(2 * graph.edges().length / graph.nodes().length).toFixed(2)}`);
    if (selfLoopCount > 0) {
      console.log(`   Self-loops (hierarchical): ${selfLoopCount} relationships`);
    }
    
    return graph;
  }
  
  /**
   * Apply multi-domain detection with overlapping membership
   */
  private applyMultiDomainDetection(
    graph: Graph, 
    tables: TableData[], 
    weights: RelationshipWeight[]
  ): MultiDomainDetectionResult {
    console.log(`🌐 Applying multi-domain overlap detection...`);
    
    // Step 1: Identify core business domains using seed tables
    const coreDomains = this.identifyCoreDomains(tables, weights);
    console.log(`   Identified ${coreDomains.length} core domains`);
    
    // Step 2: Calculate table membership strengths for each domain
    const tableMemberships = this.calculateTableMemberships(tables, coreDomains, weights, graph);
    
    // Step 3: Create multi-domain clusters
    const domains = this.createMultiDomainClusters(coreDomains, tableMemberships);
    
    // Step 4: Calculate overlap statistics
    const overlapScore = this.calculateOverlapScore(tableMemberships);
    
    console.log(`   Multi-domain results:`);
    console.log(`     Core domains: ${coreDomains.length}`);
    console.log(`     Final domains: ${domains.length}`);
    console.log(`     Overlap score: ${overlapScore.toFixed(4)}`);
    
    return {
      tableMemberships,
      domains,
      overlapScore,
      totalDomains: domains.length
    };
  }
  
  /**
   * Identify core business domains using seed tables and business rules
   */
  private identifyCoreDomains(
    tables: TableData[], 
    weights: RelationshipWeight[]
  ): { id: string; name: string; seedTables: string[]; domainType: string }[] {
    const coreDomains: { id: string; name: string; seedTables: string[]; domainType: string }[] = [];
    
    // Use graph-based community detection instead of business patterns
    const connectivityGraph = this.buildConnectivityGraph(tables, weights);
    const communities = this.detectCommunities(connectivityGraph);
    
    console.log(`🏗️ Detected ${communities.length} structural communities using graph analysis`);
    
    // Generate domains from structural communities
    communities.forEach((community, index) => {
      const structuralAnalysis = this.analyzeStructuralCharacteristics(community);
      const semanticLabel = this.generateSemanticLabel(community);
      
      coreDomains.push({
        id: `structural_domain_${index + 1}`,
        name: semanticLabel,
        seedTables: community.map(table => table.name),
        domainType: structuralAnalysis.structuralType
      });
      
      console.log(`   Structural domain "${semanticLabel}": ${community.length} tables (type: ${structuralAnalysis.structuralType})`);
    });
    
    return coreDomains;
  }
  
  /**
   * Calculate membership strengths for each table across all domains
   */
  private calculateTableMemberships(
    tables: TableData[],
    coreDomains: { id: string; name: string; seedTables: string[]; domainType: string }[],
    weights: RelationshipWeight[],
    graph: Graph
  ): Map<string, TableDomainMembership> {
    const memberships = new Map<string, TableDomainMembership>();
    
    tables.forEach(table => {
      const tableMembership: TableDomainMembership = {
        tableName: table.name,
        domainMemberships: new Map(),
        primaryDomain: '',
        secondaryDomains: []
      };
      
      // Calculate membership strength for each domain
      coreDomains.forEach(domain => {
        const strength = this.calculateDomainMembershipStrength(
          table.name, domain, weights, graph
        );
        
        if (strength >= 0.3) { // Only include meaningful memberships
          tableMembership.domainMemberships.set(domain.id, strength);
        }
      });
      
      // Determine primary and secondary domains
      if (tableMembership.domainMemberships.size > 0) {
        const sorted = Array.from(tableMembership.domainMemberships.entries())
          .sort((a, b) => b[1] - a[1]);
        
        tableMembership.primaryDomain = sorted[0][0];
        tableMembership.secondaryDomains = sorted.slice(1)
          .filter(([_, strength]) => strength >= 0.4)
          .map(([domainId, _]) => domainId);
      }
      
      memberships.set(table.name, tableMembership);
    });
    
    console.log(`   Calculated memberships for ${memberships.size} tables`);
    return memberships;
  }
  
  /**
   * Calculate domain membership strength for a specific table
   */
  private calculateDomainMembershipStrength(
    tableName: string,
    domain: { id: string; name: string; seedTables: string[]; domainType: string },
    weights: RelationshipWeight[],
    graph: Graph
  ): number {
    let membershipStrength = 0;
    
    // 1. Direct name pattern match (strong indicator)
    const namePatternStrength = this.calculateNamePatternStrength(tableName, domain);
    membershipStrength += namePatternStrength * 0.4;
    
    // 2. Relationship strength to seed tables
    const relationshipStrength = this.calculateRelationshipStrength(tableName, domain.seedTables, weights);
    membershipStrength += relationshipStrength * 0.4;
    
    // 3. Graph proximity to domain core (PageRank-style)
    const proximityStrength = this.calculateProximityStrength(tableName, domain.seedTables, graph);
    membershipStrength += proximityStrength * 0.2;
    
    return Math.min(membershipStrength, 1.0);
  }
  
  /**
   * Calculate name pattern strength for domain membership
   */
  private calculateNamePatternStrength(
    tableName: string,
    domain: { id: string; name: string; seedTables: string[]; domainType: string }
  ): number {
    const lowerName = tableName.toLowerCase();
    
    // Check if table is directly a seed table (perfect match)
    if (domain.seedTables.includes(tableName)) {
      return 1.0;
    }
    
    // Use semantic similarity instead of hardcoded patterns
    const semanticStrength = this.calculateSemanticPatternStrength(tableName, domain);
    return semanticStrength;
  }
  
  /**
   * Calculate relationship strength to seed tables
   */
  private calculateRelationshipStrength(
    tableName: string,
    seedTables: string[],
    weights: RelationshipWeight[]
  ): number {
    let totalStrength = 0;
    let connectionCount = 0;
    
    weights.forEach(weight => {
      const isSourceMatch = weight.source === tableName && seedTables.includes(weight.target);
      const isTargetMatch = weight.target === tableName && seedTables.includes(weight.source);
      
      if (isSourceMatch || isTargetMatch) {
        totalStrength += weight.weight;
        connectionCount++;
      }
    });
    
    return connectionCount > 0 ? Math.min(totalStrength / connectionCount, 1.0) : 0;
  }
  
  /**
   * Calculate graph proximity strength using simple path analysis
   */
  private calculateProximityStrength(
    tableName: string,
    seedTables: string[],
    graph: Graph
  ): number {
    if (!graph.hasNode(tableName)) return 0;
    
    let proximityScore = 0;
    let seedConnections = 0;
    
    seedTables.forEach(seedTable => {
      if (graph.hasNode(seedTable)) {
        // Direct connection (distance 1)
        if (graph.hasEdge(tableName, seedTable)) {
          proximityScore += 1.0;
          seedConnections++;
        } else {
          // Check for indirect connection through shared neighbors (distance 2)
          const commonNeighbors = graph.neighbors(tableName).filter(neighbor =>
            graph.hasEdge(neighbor, seedTable)
          );
          if (commonNeighbors.length > 0) {
            proximityScore += 0.5;
            seedConnections++;
          }
        }
      }
    });
    
    return seedConnections > 0 ? Math.min(proximityScore / seedConnections, 1.0) : 0;
  }
  
  /**
   * Create multi-domain clusters from membership data
   */
  private createMultiDomainClusters(
    coreDomains: { id: string; name: string; seedTables: string[]; domainType: string }[],
    tableMemberships: Map<string, TableDomainMembership>
  ): MultiDomainCluster[] {
    const domains: MultiDomainCluster[] = [];
    
    coreDomains.forEach(coreDomain => {
      const coreTableNames = new Set<string>();
      const allTableNames = new Set<string>();
      const tableMembershipStrengths = new Map<string, number>();
      
      // Collect tables for this domain
      tableMemberships.forEach((membership, tableName) => {
        const strength = membership.domainMemberships.get(coreDomain.id) || 0;
        
        if (strength >= 0.8) {
          coreTableNames.add(tableName);
          allTableNames.add(tableName);
          tableMembershipStrengths.set(tableName, strength);
        } else if (strength >= 0.3) {
          allTableNames.add(tableName);
          tableMembershipStrengths.set(tableName, strength);
        }
      });
      
      if (allTableNames.size > 0) {
        // Create business classification for this domain
        const businessClassification: DomainClassificationResult = {
          structuralType: 'unknown', // TODO: Map coreDomain.domainType to structural type
          industryAgnosticLabel: coreDomain.name,
          description: `Multi-domain cluster for ${coreDomain.name}`,
          confidence: coreTableNames.size / allTableNames.size, // Core ratio as confidence
          connectivityScore: 0.5,
          semanticCohesion: 0.5,
          structuralFeatures: {
            hasHierarchy: false,
            hasTransactionality: false,
            hasTemporalPatterns: false,
            hasUserContext: false,
            centralityScore: 0.5,
            relationshipDensity: 0.5
          }
        };
        
        const domain: MultiDomainCluster = {
          id: coreDomain.id,
          name: coreDomain.name,
          description: businessClassification.description,
          coreTableNames,
          allTableNames,
          tableMemberships: tableMembershipStrengths,
          internalConnections: 0, // Will be calculated later
          externalConnections: new Map(),
          cohesionScore: 0, // Will be calculated later
          businessClassification,
          suggestedColor: this.generateColor(domains.length),
          coreTables: coreTableNames.size,
          totalTables: allTableNames.size
        };
        
        domains.push(domain);
        console.log(`   Domain "${coreDomain.name}": ${coreTableNames.size} core + ${allTableNames.size - coreTableNames.size} secondary tables`);
      }
    });
    
    return domains;
  }
  
  
  /**
   * Calculate overlap score for the multi-domain system
   */
  private calculateOverlapScore(tableMemberships: Map<string, TableDomainMembership>): number {
    let totalTables = 0;
    let tablesWithMultipleMemberships = 0;
    let totalMemberships = 0;
    
    tableMemberships.forEach(membership => {
      totalTables++;
      const membershipCount = membership.domainMemberships.size;
      totalMemberships += membershipCount;
      
      if (membershipCount > 1) {
        tablesWithMultipleMemberships++;
      }
    });
    
    // Higher score means more overlap (shared tables across domains)
    const overlapRatio = totalTables > 0 ? tablesWithMultipleMemberships / totalTables : 0;
    const avgMemberships = totalTables > 0 ? totalMemberships / totalTables : 0;
    
    return (overlapRatio * 0.7) + ((avgMemberships - 1) * 0.3);
  }
  
  /**
   * Convert multi-domain result to legacy format for backward compatibility
   */
  private convertMultiDomainToClusters(
    tables: TableData[],
    multiDomainResult: MultiDomainDetectionResult,
    relationships: Relationship[]
  ): AdvancedTableCluster[] {
    const tableMap = new Map(tables.map(table => [table.name, table]));
    const clusters: AdvancedTableCluster[] = [];
    
    multiDomainResult.domains.forEach((domain, index) => {
      // Get core tables for this domain (primary membership)
      const domainTables: TableData[] = [];
      
      domain.allTableNames.forEach(tableName => {
        const table = tableMap.get(tableName);
        const membership = multiDomainResult.tableMemberships.get(tableName);
        
        if (table && membership && membership.primaryDomain === domain.id) {
          domainTables.push(table);
        }
      });
      
      if (domainTables.length > 0) {
        const cluster: AdvancedTableCluster = {
          id: domain.id,
          name: domain.name,
          description: domain.description,
          tables: domainTables,
          tableNames: new Set(domainTables.map(t => t.name)),
          
          // Multi-domain specific properties
          coreTableNames: domain.coreTableNames,
          allTableNames: domain.allTableNames,
          tableMemberships: domain.tableMemberships,
          coreTables: domain.coreTables,
          totalTables: domain.totalTables,
          
          // Legacy properties
          internalConnections: domain.internalConnections,
          externalConnections: domain.externalConnections,
          cohesionScore: domain.cohesionScore,
          modularityScore: multiDomainResult.overlapScore,
          businessClassification: domain.businessClassification,
          suggestedColor: domain.suggestedColor,
          size: domainTables.length
        };
        
        clusters.push(cluster);
      }
    });
    
    // Post-process to calculate connections and cohesion
    return this.postProcessClusters(clusters, relationships);
  }
  
  /**
   * Post-process clusters to calculate final metrics
   */
  private postProcessClusters(
    clusters: AdvancedTableCluster[],
    relationships: Relationship[]
  ): AdvancedTableCluster[] {
    return clusters.map(cluster => {
      // Calculate internal and external connections
      let internalConnections = 0;
      const externalConnections = new Map<string, number>();
      
      relationships.forEach(rel => {
        const sourceInCluster = cluster.tableNames.has(rel.sourceTable);
        const targetInCluster = cluster.tableNames.has(rel.targetTable);
        
        if (sourceInCluster && targetInCluster) {
          internalConnections++;
        } else if (sourceInCluster || targetInCluster) {
          // Find which other cluster this connects to
          const externalTable = sourceInCluster ? rel.targetTable : rel.sourceTable;
          const otherCluster = clusters.find(c => 
            c !== cluster && c.tableNames.has(externalTable)
          );
          
          if (otherCluster) {
            const currentCount = externalConnections.get(otherCluster.id) || 0;
            externalConnections.set(otherCluster.id, currentCount + 1);
          }
        }
      });
      
      // Calculate cohesion score
      const totalConnections = internalConnections + 
        Array.from(externalConnections.values()).reduce((sum, count) => sum + count, 0);
      const cohesionScore = totalConnections > 0 ? internalConnections / totalConnections : 0;
      
      return {
        ...cluster,
        internalConnections,
        externalConnections,
        cohesionScore
      };
    })
    .filter(cluster => cluster.tables.length > 0) // Remove empty clusters
    .sort((a, b) => b.cohesionScore - a.cohesionScore); // Sort by cohesion score
  }
  
  
  /**
   * Generate distinct colors for domains
   */
  private generateColor(index: number): string {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#F7DC6F', // Light Yellow
      '#BB8FCE', // Light Purple
      '#85C1E9'  // Light Blue
    ];
    
    return colors[index % colors.length];
  }
  
  /**
   * Log final results for debugging
   */
  private logFinalResults(clusters: AdvancedTableCluster[]): void {
    console.log(`\n🎯 Final Multi-Domain Discovery Results:`);
    
    clusters.forEach((cluster, index) => {
      console.log(`\n📊 Domain ${index + 1}: "${cluster.name}"`);
      console.log(`   Type: ${cluster.businessClassification?.structuralType || 'unknown'}`);
      console.log(`   Core tables: ${cluster.coreTables || 0} | Total participating: ${cluster.totalTables || 0}`);
      console.log(`   Primary tables: ${cluster.size || 0} (cohesion: ${cluster.cohesionScore?.toFixed(2) || '0.00'})`);
      console.log(`   Confidence: ${cluster.businessClassification?.confidence?.toFixed(2) || '0.00'}`);
      console.log(`   Internal connections: ${cluster.internalConnections || 0}`);
      console.log(`   External connections: ${cluster.externalConnections ? Array.from(cluster.externalConnections.values()).reduce((sum, count) => sum + count, 0) : 0}`);
      
      // Show core vs secondary tables
      if ((cluster.coreTables || 0) <= 15) {
        console.log(`   Core tables: [${cluster.coreTableNames ? Array.from(cluster.coreTableNames).join(', ') : ''}]`);
        if ((cluster.totalTables || 0) > (cluster.coreTables || 0)) {
          const secondaryTables = cluster.allTableNames && cluster.coreTableNames ? 
            Array.from(cluster.allTableNames).filter(t => !cluster.coreTableNames?.has(t)) : [];
          console.log(`   Secondary tables: [${secondaryTables.slice(0, 8).join(', ')}${secondaryTables.length > 8 ? `, ... +${secondaryTables.length - 8} more` : ''}]`);
        }
      } else {
        const coreList = cluster.coreTableNames ? Array.from(cluster.coreTableNames) : [];
        console.log(`   Core tables: [${coreList.slice(0, 10).join(', ')}, ... +${coreList.length - 10} more]`);
        console.log(`   Secondary tables: ${(cluster.totalTables || 0) - (cluster.coreTables || 0)} additional participating tables`);
      }
    });
    
    // Multi-domain statistics
    const totalCoreTables = clusters.reduce((sum, c) => sum + c.coreTables, 0);
    const totalParticipatingTables = clusters.reduce((sum, c) => sum + c.totalTables, 0);
    const avgCohesion = clusters.reduce((sum, c) => sum + c.cohesionScore, 0) / clusters.length;
    const avgOverlap = clusters.reduce((sum, c) => sum + (c.totalTables - c.coreTables), 0) / clusters.length;
    
    console.log(`\n📈 Multi-Domain Statistics:`);
    console.log(`   Total domains: ${clusters.length}`);
    console.log(`   Core table assignments: ${totalCoreTables}`);
    console.log(`   Total table participations: ${totalParticipatingTables}`);
    console.log(`   Average overlap per domain: ${avgOverlap.toFixed(1)} secondary tables`);
    console.log(`   Average cohesion: ${avgCohesion.toFixed(3)}`);
    console.log(`   Domain core sizes: ${clusters.map(c => c.coreTables).join(', ')}`);
    console.log(`   Domain total sizes: ${clusters.map(c => c.totalTables).join(', ')}`);
  }

  // === INDUSTRY-AGNOSTIC STRUCTURAL ANALYSIS METHODS ===

  /**
   * Build connectivity graph from tables and relationships
   */
  private buildConnectivityGraph(tables: TableData[], weights: RelationshipWeight[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    // Initialize nodes
    tables.forEach(table => {
      graph.set(table.name, new Set<string>());
    });
    
    // Add edges based on relationships
    weights.forEach(weight => {
      const sourceConnections = graph.get(weight.sourceTable) || new Set();
      const targetConnections = graph.get(weight.targetTable) || new Set();
      
      sourceConnections.add(weight.targetTable);
      targetConnections.add(weight.sourceTable);
      
      graph.set(weight.sourceTable, sourceConnections);
      graph.set(weight.targetTable, targetConnections);
    });
    
    return graph;
  }

  /**
   * Detect communities using structural analysis (no business assumptions)
   */
  private detectCommunities(graph: Map<string, Set<string>>): TableData[][] {
    const visited = new Set<string>();
    const communities: TableData[][] = [];
    
    // Use connected components as basic communities
    for (const [tableName, connections] of graph) {
      if (!visited.has(tableName)) {
        const community = this.exploreConnectedComponent(tableName, graph, visited);
        if (community.length > 0) {
          // Convert table names back to TableData objects (simplified for now)
          const communityTables = community.map(name => ({ name } as TableData));
          communities.push(communityTables);
        }
      }
    }
    
    return communities;
  }

  /**
   * Explore connected component in graph
   */
  private exploreConnectedComponent(
    startTable: string, 
    graph: Map<string, Set<string>>, 
    visited: Set<string>
  ): string[] {
    const component: string[] = [];
    const stack = [startTable];
    
    while (stack.length > 0) {
      const currentTable = stack.pop()!;
      
      if (!visited.has(currentTable)) {
        visited.add(currentTable);
        component.push(currentTable);
        
        const connections = graph.get(currentTable) || new Set();
        for (const connectedTable of connections) {
          if (!visited.has(connectedTable)) {
            stack.push(connectedTable);
          }
        }
      }
    }
    
    return component;
  }

  /**
   * Analyze structural characteristics of a community
   */
  private analyzeStructuralCharacteristics(community: TableData[]): { structuralType: string } {
    // Simple structural analysis - can be enhanced
    const tableCount = community.length;
    
    if (tableCount >= 5) {
      return { structuralType: 'entity_aggregate' };
    } else if (tableCount >= 3) {
      return { structuralType: 'relational' };
    } else {
      return { structuralType: 'configuration' };
    }
  }

  /**
   * Generate semantic label from community tables (industry-agnostic)
   */
  private generateSemanticLabel(community: TableData[]): string {
    if (community.length === 0) return 'Empty Domain';
    
    // Extract common terms from table names
    const commonTerms = this.extractCommonTerminology(community.map(t => t.name));
    
    if (commonTerms.length > 0) {
      return `${commonTerms[0]} Domain`;
    }
    
    // Fallback to structural description
    return `${community.length}-Table Domain`;
  }

  /**
   * Extract common terminology from table names (no business assumptions)
   */
  private extractCommonTerminology(tableNames: string[]): string[] {
    const wordFrequency = new Map<string, number>();
    
    tableNames.forEach(name => {
      const words = name.toLowerCase()
        .split(/[_\s]+/)
        .filter(word => word.length > 2)
        .filter(word => !['log', 'type', 'status', 'history', 'audit', 'config'].includes(word));
      
      words.forEach(word => {
        const capitalized = word.charAt(0).toUpperCase() + word.slice(1);
        wordFrequency.set(capitalized, (wordFrequency.get(capitalized) || 0) + 1);
      });
    });
    
    return Array.from(wordFrequency.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([term]) => term)
      .slice(0, 3);
  }

  /**
   * Calculate semantic pattern strength (industry-agnostic)
   */
  private calculateSemanticPatternStrength(tableName: string, domain: any): number {
    if (!domain.seedTables || domain.seedTables.length === 0) {
      return 0.3; // Default moderate strength
    }
    
    // Use semantic similarity based on common word stems
    const tableWords = tableName.toLowerCase().split(/[_\s]+/);
    const domainWords = domain.seedTables.flatMap(seed => 
      seed.toLowerCase().split(/[_\s]+/)
    );
    
    // Calculate word overlap
    const commonWords = tableWords.filter(word => 
      domainWords.some(domainWord => 
        word.includes(domainWord) || domainWord.includes(word)
      )
    );
    
    const overlapRatio = commonWords.length / Math.max(tableWords.length, 1);
    return Math.min(overlapRatio, 1.0);
  }

  // === ENHANCED CLUSTER ANALYSIS METHODS ===

  /**
   * Infer structural type from enhanced cluster characteristics
   */
  private inferStructuralTypeFromCluster(enhanced: EnhancedDomainCluster): string {
    const tableCount = enhanced.tables?.length || 0;
    
    if (tableCount >= 5) return 'entity_aggregate';
    if (tableCount >= 3) return 'relational';
    return 'configuration';
  }

  /**
   * Calculate connectivity score from enhanced cluster
   */
  private calculateConnectivityScore(enhanced: EnhancedDomainCluster): number {
    return enhanced.confidenceScore || 0.5;
  }

  /**
   * Calculate semantic cohesion from enhanced cluster
   */
  private calculateSemanticCohesion(enhanced: EnhancedDomainCluster): number {
    return enhanced.confidenceScore || 0.5;
  }

  /**
   * Detect hierarchy patterns in cluster
   */
  private detectHierarchyInCluster(enhanced: EnhancedDomainCluster): boolean {
    // Simple heuristic - can be enhanced with actual structural analysis
    return (enhanced.tables?.length || 0) > 3;
  }

  /**
   * Detect transactional patterns in cluster
   */
  private detectTransactionalityInCluster(enhanced: EnhancedDomainCluster): boolean {
    // Simple heuristic - can be enhanced with actual temporal analysis
    return (enhanced.confidenceScore || 0) > 0.7;
  }

  /**
   * Detect temporal patterns in cluster
   */
  private detectTemporalPatternsInCluster(enhanced: EnhancedDomainCluster): boolean {
    // Simple heuristic - can be enhanced with column analysis
    return false;
  }

  /**
   * Detect user context patterns in cluster
   */
  private detectUserContextInCluster(enhanced: EnhancedDomainCluster): boolean {
    // Simple heuristic - can be enhanced with relationship analysis
    return false;
  }
}

// Export singleton instance
export const advancedDomainAnalyzer = new AdvancedDomainAnalyzer();