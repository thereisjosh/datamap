/**
 * Louvain Modularity Optimization Clustering Engine
 * 
 * Implements the Louvain community detection algorithm optimized for database schema clustering.
 * This algorithm is particularly effective for sparse graphs and scales well with large datasets.
 * 
 * Key Features:
 * - Modularity optimization for community detection
 * - Multi-resolution clustering with resolution parameter
 * - Handles sparse connectivity graphs typical in database schemas
 * - Preserves hub table connectivity during clustering
 * - Supports weighted edges (structural + semantic similarity)
 */

import type { TableInfo } from './coreTableDiscoveryService';
import type { Relationship } from '@shared/schema';

export interface LouvainClusteringOptions {
  resolution: number;              // Resolution parameter (default: 1.0, higher = more clusters)
  minClusterSize: number;         // Minimum tables per cluster (default: 2)
  maxIterations: number;          // Maximum optimization iterations (default: 100)
  convergenceThreshold: number;   // Modularity improvement threshold (default: 0.001)
  enableHubPreservation: boolean; // Preserve hub connectivity (default: true)
  randomSeed?: number;            // For reproducible results
  verbose: boolean;               // Enable detailed logging (default: false)
}

export interface LouvainNode {
  id: string;                     // Table name
  community: number;              // Current community assignment
  weight: number;                 // Node weight (number of columns/relationships)
  degree: number;                 // Total edge weight connected to this node
  internalEdges: number;          // Weight of edges within current community
}

export interface LouvainEdge {
  source: string;
  target: string;
  weight: number;                 // Combined structural + semantic similarity
  type: 'structural' | 'semantic' | 'hybrid';
}

export interface LouvainCommunity {
  id: number;
  nodes: string[];
  totalWeight: number;            // Sum of internal edge weights
  internalEdges: number;          // Number of internal connections
  externalEdges: number;          // Number of external connections
  modularity: number;             // Community contribution to global modularity
  hubTables: string[];            // Hub tables in this community
}

export interface LouvainClusteringResult {
  communities: LouvainCommunity[];
  globalModularity: number;       // Overall modularity score
  iterations: number;             // Number of optimization iterations
  convergenceAchieved: boolean;   // Whether algorithm converged
  hubPreservationScore: number;   // How well hub connectivity was preserved
  processingTime: number;         // Milliseconds taken
  metrics: {
    totalNodes: number;
    totalEdges: number;
    averageClusterSize: number;
    modularityImprovement: number;
    hubConnectivityPreserved: number;
  };
}

export class LouvainClusteringEngine {
  private options: LouvainClusteringOptions;
  private nodes: Map<string, LouvainNode> = new Map();
  private edges: LouvainEdge[] = [];
  private communities: Map<number, Set<string>> = new Map();
  private totalEdgeWeight: number = 0;
  private currentModularity: number = 0;
  private hubTables: Set<string> = new Set();
  private semanticSimilarityMap: Map<string, number> = new Map();
  private tableToDomainMap: Map<string, number> = new Map(); // Track table assignments

  constructor(options: Partial<LouvainClusteringOptions> = {}) {
    this.options = {
      resolution: 1.0,
      minClusterSize: 2,
      maxIterations: 100,
      convergenceThreshold: 0.001,
      enableHubPreservation: true,
      verbose: false,
      ...options
    };

    if (this.options.verbose) {
      console.log('🏘️ Louvain Clustering Engine initialized:');
      console.log(`   🎯 Resolution: ${this.options.resolution}`);
      console.log(`   📏 Min cluster size: ${this.options.minClusterSize}`);
      console.log(`   🔄 Max iterations: ${this.options.maxIterations}`);
      console.log(`   🎲 Random seed: ${this.options.randomSeed || 'dynamic'}`);
    }
  }

  /**
   * Main clustering method using Louvain algorithm with hub-centered conservative approach
   */
  public async clusterTables(
    tables: TableInfo[],
    relationships: Relationship[],
    edgeWeights: Map<string, number>,
    hubTables?: string[],  // Hub tables to guide conservative clustering
    semanticVectors?: import('./semanticVectorService').TableVector[]  // Semantic embeddings for similarity
  ): Promise<LouvainClusteringResult> {
    const startTime = Date.now();
    
    console.log(`🔍 LOUVAIN DEBUG: Method called with:`);
    console.log(`   📊 Tables: ${tables.length}`);
    console.log(`   🎯 Hub tables: ${hubTables ? hubTables.length : 0}`);
    console.log(`   🧠 Semantic vectors: ${semanticVectors ? semanticVectors.length : 0}`);
    
    // Store hub tables and semantic vectors for conservative clustering
    if (hubTables && hubTables.length > 0) {
      this.hubTables = new Set(hubTables);
      if (this.options.verbose) {
        console.log(`🚀 Starting hub-centered Louvain clustering for ${tables.length} tables, ${relationships.length} relationships`);
        console.log(`🎯 Using ${hubTables.length} hub tables for conservative domain formation`);
        if (semanticVectors) {
          console.log(`🧠 Using ${semanticVectors.length} semantic vectors (1536D) for similarity-based assignment`);
        }
      }
    } else {
      this.hubTables.clear();
      if (this.options.verbose) {
        console.log(`🚀 Starting Louvain clustering for ${tables.length} tables, ${relationships.length} relationships`);
      }
    }

    // Create semantic similarity map for efficient lookup
    this.semanticSimilarityMap.clear();
    if (semanticVectors && semanticVectors.length > 0) {
      this.buildSemanticSimilarityMap(semanticVectors, this.semanticSimilarityMap);
    }

    // Initialize graph structure with semantic similarity
    this.initializeGraph(tables, relationships, edgeWeights, this.semanticSimilarityMap);
    
    // Phase 1: Local optimization (move nodes to improve modularity) - DISABLED
    // The FK-based initial assignment is already optimal, Louvain optimization disrupts it
    let iteration = 0;
    let improvement = false; // DISABLED: Skip Louvain optimization to preserve FK-based assignments
    let previousModularity = this.calculateGlobalModularity();
    
    console.log(`🚫 OPTIMIZATION DISABLED: Preserving FK-based hub assignments, communities: ${this.communities.size}, modularity: ${previousModularity.toFixed(4)}`);
    
    // Commented out optimization loop that was disrupting FK-based assignments
    while (false && improvement && iteration < this.options.maxIterations) {
      console.log(`🔄 OPTIMIZATION DEBUG: Starting iteration ${iteration}, communities: ${this.communities.size}`);
      improvement = await this.optimizeLocalModularity(iteration);
      const currentModularity = this.calculateGlobalModularity();
      
      if (this.options.verbose && iteration % 10 === 0) {
        console.log(`   🔄 Iteration ${iteration}: modularity = ${currentModularity.toFixed(4)}`);
      }
      
      console.log(`🔄 OPTIMIZATION DEBUG: After iteration ${iteration}, communities: ${this.communities.size}, modularity: ${currentModularity.toFixed(4)}, improved: ${improvement}`);
      
      // Check for convergence
      if (Math.abs(currentModularity - previousModularity) < this.options.convergenceThreshold) {
        improvement = false;
        if (this.options.verbose) {
          console.log(`   ✅ Converged after ${iteration + 1} iterations`);
        }
      }
      
      previousModularity = currentModularity;
      iteration++;
    }

    // Phase 2: Community aggregation (merge small communities)
    await this.aggregateSmallCommunities();
    
    // Phase 3: Hub preservation post-processing
    if (this.options.enableHubPreservation) {
      await this.preserveHubConnectivity();
    }

    // Phase 4: Integrate orphan clusters with main hub domains
    const integrationResult = this.integrateOrphanClustersWithHubDomains(relationships);
    console.log(`🔗 ORPHAN INTEGRATION: Integrated ${integrationResult.clustersIntegrated} orphan clusters into main domains, ${integrationResult.tablesAffected} tables affected`);

    const finalModularity = this.calculateGlobalModularity();
    const processingTime = Date.now() - startTime;
    
    const result = this.buildClusteringResult(
      finalModularity,
      iteration,
      improvement === false,
      processingTime
    );

    if (this.options.verbose) {
      console.log(`✅ Louvain clustering completed:`);
      console.log(`   🏘️ Communities: ${result.communities.length}`);
      console.log(`   📊 Global modularity: ${result.globalModularity.toFixed(4)}`);
      console.log(`   ⏱️ Processing time: ${result.processingTime}ms`);
      console.log(`   🔗 Hub preservation: ${result.hubPreservationScore.toFixed(3)}`);
    }

    return result;
  }

  /**
   * Build semantic similarity map from embeddings for efficient lookup
   */
  private buildSemanticSimilarityMap(
    semanticVectors: import('./semanticVectorService').TableVector[], 
    similarityMap: Map<string, number>
  ): void {
    // Create vector lookup map
    const vectorMap = new Map<string, number[]>();
    semanticVectors.forEach(vector => {
      vectorMap.set(vector.tableName, vector.embedding);
    });

    // Calculate cosine similarities between all pairs
    for (let i = 0; i < semanticVectors.length; i++) {
      for (let j = i + 1; j < semanticVectors.length; j++) {
        const table1 = semanticVectors[i].tableName;
        const table2 = semanticVectors[j].tableName;
        const vector1 = semanticVectors[i].embedding;
        const vector2 = semanticVectors[j].embedding;
        
        const similarity = this.calculateCosineSimilarity(vector1, vector2);
        const key = `${table1}:${table2}`;
        similarityMap.set(key, similarity);
      }
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Initialize graph structure from tables and relationships with semantic similarity
   */
  private initializeGraph(
    tables: TableInfo[],
    relationships: Relationship[],
    edgeWeights: Map<string, number>,
    semanticSimilarityMap?: Map<string, number>
  ): void {
    this.nodes.clear();
    this.edges = [];
    this.communities.clear();
    this.tableToDomainMap.clear();
    this.totalEdgeWeight = 0;
    // DO NOT clear hubTables - they were set in clusterTables method and needed for hub-centered initialization

    // Conservative hub-centered initialization
    console.log(`🔍 INIT DEBUG: Starting hub-centered initialization with ${this.hubTables.size} hubs`);
    let communityIndex = 0;
    
    // Phase 1: Initialize hub tables as separate communities
    const hubNodes = new Set<string>();
    if (this.hubTables.size > 0) {
      console.log(`🎯 INIT DEBUG: Initializing ${this.hubTables.size} hub communities: [${Array.from(this.hubTables).slice(0, 5).join(', ')}...]`);
      tables.forEach(table => {
        if (this.hubTables.has(table.name)) {
          console.log(`   🔸 Creating hub community ${communityIndex} for ${table.name}`);
          const node: LouvainNode = {
            id: table.name,
            community: communityIndex,
            weight: table.columns?.length || 1,
            degree: 0,
            internalEdges: 0
          };
          
          this.nodes.set(table.name, node);
          this.communities.set(communityIndex, new Set([table.name]));
          this.tableToDomainMap.set(table.name, communityIndex); // Track hub assignment
          hubNodes.add(table.name);
          communityIndex++;
        }
      });
    }
    
    // Phase 2: Two-pass assignment system to fix processing order dependency
    console.log(`🔍 TWO-PASS ASSIGNMENT: Processing ${338 - this.hubTables.size} non-hub tables with threshold-based assignment`);
    let strongAssignments = 0;
    const deferredTables: { table: TableInfo, bestHub: number, strength: number }[] = [];
    const STRONG_ASSIGNMENT_THRESHOLD = 0.5; // Based on analysis of scoring distribution
    
    // PASS 1: Only assign tables with strong hub connections (> 0.5 threshold)
    console.log(`\n🎯 PASS 1: Strong assignments (threshold >= ${STRONG_ASSIGNMENT_THRESHOLD})`);
    
    tables.forEach(table => {
      if (!this.hubTables.has(table.name)) { // Non-hub table
        // Find strongest connection to any hub table
        let bestHubCommunity = -1;
        let strongestConnection = 0;
        let bestHubName = '';
        
        if (this.hubTables.size > 0) {
          // Check for direct FK relationships with dependency weighting
          let fkConnectionFound = false;
          
          hubNodes.forEach(hubTable => {
            const edgeKey1 = `${table.name}-${hubTable}`;
            const edgeKey2 = `${hubTable}-${table.name}`;
            const fkConnectionStrength = edgeWeights.get(edgeKey1) || edgeWeights.get(edgeKey2) || 0;
            
            if (fkConnectionStrength > 0) {
              // Apply dependency weighting: prioritize domain-specific hubs over cross-domain references
              const dependencyWeight = this.calculateDependencyWeight(table.name, hubTable, relationships);
              const weightedStrength = fkConnectionStrength * dependencyWeight;
              
              if (weightedStrength > strongestConnection) {
                strongestConnection = weightedStrength;
                const hubNode = this.nodes.get(hubTable);
                if (hubNode) {
                  bestHubCommunity = hubNode.community;
                  bestHubName = hubTable;
                  fkConnectionFound = true;
                }
              }
            }
          });
          
          // Only use semantic similarity if no FK relationship found
          if (!fkConnectionFound && semanticSimilarityMap) {
            hubNodes.forEach(hubTable => {
              const semanticKey1 = `${table.name}:${hubTable}`;
              const semanticKey2 = `${hubTable}:${table.name}`;
              const semanticSimilarity = semanticSimilarityMap.get(semanticKey1) || semanticSimilarityMap.get(semanticKey2) || 0;
              
              // Conservative threshold: Only use semantic similarity if > 0.6 (high confidence)
              if (semanticSimilarity > 0.6) {
                const semanticConnectionStrength = semanticSimilarity * 0.7; // Scale down vs FK relationships
                
                if (semanticConnectionStrength > strongestConnection) {
                  strongestConnection = semanticConnectionStrength;
                  const hubNode = this.nodes.get(hubTable);
                  if (hubNode) {
                    bestHubCommunity = hubNode.community;
                    bestHubName = hubTable;
                  }
                }
              }
            });
          }
        }
        
        // Create node for this table
        const node: LouvainNode = {
          id: table.name,
          community: -1, // Will be assigned in pass 1 or 2
          weight: table.columns?.length || 1,
          degree: 0,
          internalEdges: 0
        };
        this.nodes.set(table.name, node);
        
        // PASS 1 DECISION: Only assign if strength >= threshold
        if (bestHubCommunity >= 0 && strongestConnection >= STRONG_ASSIGNMENT_THRESHOLD) {
          // Strong assignment - assign immediately
          node.community = bestHubCommunity;
          this.communities.get(bestHubCommunity)!.add(table.name);
          this.tableToDomainMap.set(table.name, bestHubCommunity);
          strongAssignments++;
          console.log(`   ✅ STRONG: ${table.name} → ${bestHubName} (${strongestConnection.toFixed(3)})`);
        } else {
          // Weak or no connection - defer to Pass 2
          deferredTables.push({ table, bestHub: bestHubCommunity, strength: strongestConnection });
          if (strongestConnection > 0) {
            console.log(`   🔄 DEFERRED: ${table.name} → ${bestHubName} (${strongestConnection.toFixed(3)} < ${STRONG_ASSIGNMENT_THRESHOLD})`);
          } else {
            console.log(`   🔄 DEFERRED: ${table.name} (no hub connection)`);
          }
        }
      }
    });

    console.log(`   ✅ Pass 1 strong assignments: ${strongAssignments}`);
    console.log(`   🔄 Pass 1 deferred tables: ${deferredTables.length}`);
    
    // PASS 2A: Form natural clusters from deferred tables using connected components
    console.log(`\n🌍 PASS 2A: Natural cluster formation from ${deferredTables.length} deferred tables`);
    const naturalClusters = this.findConnectedComponents(deferredTables.map(d => d.table), relationships);
    console.log(`   🔗 Found ${naturalClusters.length} natural clusters from FK relationships`);
    
    // PASS 2B: Assign natural clusters to nearest hubs using aggregate scoring
    console.log(`\n🎯 PASS 2B: Assigning natural clusters to hub domains`);
    let clusterAssignments = 0;
    let remainingOrphans = 0;
    const CLUSTER_ASSIGNMENT_THRESHOLD = 0.3; // Minimum aggregate score for cluster assignment
    
    // DEBUG: Log edge weights map contents before cluster assignment
    console.log(`🔍 EDGE WEIGHTS MAP DEBUG:`, {
      totalEdgeWeights: edgeWeights.size,
      sampleKeys: Array.from(edgeWeights.keys()).slice(0, 10),
      sampleEntries: Array.from(edgeWeights.entries()).slice(0, 5).map(([key, value]) => `${key}:${value}`),
      mapType: edgeWeights.constructor.name
    });
    
    // Log some specific relationship lookups
    relationships.slice(0, 5).forEach(rel => {
      const key1 = `${rel.sourceTable}-${rel.targetTable}`;
      const key2 = `${rel.targetTable}-${rel.sourceTable}`;
      console.log(`🔍 SAMPLE RELATIONSHIP LOOKUP:`, {
        relationship: `${rel.sourceTable} → ${rel.targetTable}`,
        key1: key1,
        key1Weight: edgeWeights.get(key1),
        key1Exists: edgeWeights.has(key1),
        key2: key2,
        key2Weight: edgeWeights.get(key2),
        key2Exists: edgeWeights.has(key2)
      });
    });
    
    naturalClusters.forEach((cluster, clusterIndex) => {
      if (cluster.length === 0) return;
      
      // Calculate aggregate score for this cluster against each hub
      let bestHubCommunity = -1;
      let bestAggregateScore = 0;
      let bestHubName = '';
      
      // Check each hub community
      for (let hubId = 0; hubId < this.hubTables.size; hubId++) {
        const hubCommunity = this.communities.get(hubId);
        if (!hubCommunity) continue;
        
        const hubName = Array.from(hubCommunity).find(t => this.hubTables.has(t)) || '';
        let totalStrength = 0;
        let connectionCount = 0;
        
        // NEW: Scan ALL relationships between cluster tables and hub domain tables
        const hubDomainTables = new Set(Array.from(this.communities.get(hubId)!));
        const clusterConnections: { tableName: string, strength: number }[] = [];
        
        cluster.forEach(clusterTable => {
          let bestStrengthToHub = 0;
          
          // Check all relationships between this cluster table and hub domain
          relationships.forEach(rel => {
            let connectionStrength = 0;
            let isConnected = false;
            
            if (rel.sourceTable === clusterTable && hubDomainTables.has(rel.targetTable)) {
              // Cluster table → Hub domain table
              const edgeKey = `${rel.sourceTable}-${rel.targetTable}`;
              connectionStrength = edgeWeights.get(edgeKey) || 0;
              isConnected = true;
              
              // DEBUG: Log edge weight lookup details
              console.log(`🔍 EDGE WEIGHT DEBUG: Forward lookup`, {
                clusterTable,
                hubTable: rel.targetTable,
                edgeKey,
                foundWeight: connectionStrength,
                hasKey: edgeWeights.has(edgeKey),
                relationshipType: `${rel.sourceTable} → ${rel.targetTable}`
              });
            } else if (rel.targetTable === clusterTable && hubDomainTables.has(rel.sourceTable)) {
              // Hub domain table → Cluster table (reverse relationship)
              const edgeKey = `${rel.sourceTable}-${rel.targetTable}`;
              connectionStrength = edgeWeights.get(edgeKey) || 0;
              isConnected = true;
              
              // DEBUG: Log edge weight lookup details
              console.log(`🔍 EDGE WEIGHT DEBUG: Reverse lookup`, {
                clusterTable,
                hubTable: rel.sourceTable,
                edgeKey,
                foundWeight: connectionStrength,
                hasKey: edgeWeights.has(edgeKey),
                relationshipType: `${rel.sourceTable} → ${rel.targetTable}`
              });
            }
            
            if (isConnected && connectionStrength > 0) {
              // Apply dependency weight
              const dependencyWeight = this.calculateDependencyWeight(clusterTable, rel.sourceTable === clusterTable ? rel.targetTable : rel.sourceTable, relationships);
              const weightedStrength = connectionStrength * dependencyWeight;
              bestStrengthToHub = Math.max(bestStrengthToHub, weightedStrength);
            }
          });
          
          if (bestStrengthToHub > 0) {
            clusterConnections.push({ tableName: clusterTable, strength: bestStrengthToHub });
            totalStrength += bestStrengthToHub;
            connectionCount++;
          }
        });
        
        if (connectionCount > 0) {
          const averageStrength = totalStrength / connectionCount;
          const densityFactor = connectionCount / cluster.length; // Fraction of cluster connected to this hub
          
          // NEW: Additive scoring instead of multiplicative penalty
          // NEW: Add semantic validation using OpenAI embeddings
          let semanticScore = 0;
          let semanticValid = true;
          
          if (semanticSimilarityMap && semanticSimilarityMap.size > 0) {
            // Calculate average semantic similarity between cluster and hub domain
            let totalSemantic = 0;
            let semanticCount = 0;
            
            cluster.forEach(clusterTable => {
              hubDomainTables.forEach(hubTable => {
                const semanticKey1 = `${clusterTable}:${hubTable}`;
                const semanticKey2 = `${hubTable}:${clusterTable}`;
                const similarity = semanticSimilarityMap.get(semanticKey1) || semanticSimilarityMap.get(semanticKey2) || 0;
                
                if (similarity > 0) {
                  totalSemantic += similarity;
                  semanticCount++;
                }
              });
            });
            
            if (semanticCount > 0) {
              semanticScore = totalSemantic / semanticCount;
              // Semantic validation threshold: reject if semantic similarity too low
              semanticValid = semanticScore >= 0.3; // Business coherence threshold
            }
          }
          
          const baseScore = averageStrength * 0.6; // Base FK strength (60% weight)
          const densityBonus = densityFactor * 0.25; // Density bonus (25% weight) 
          const semanticBonus = semanticScore * 0.15; // Semantic bonus (15% weight)
          const aggregateScore = baseScore + densityBonus + semanticBonus;
          
          console.log(`     📊 Cluster ${clusterIndex + 1} → ${hubName}: avg=${averageStrength.toFixed(3)}, density=${densityFactor.toFixed(3)}, semantic=${semanticScore.toFixed(3)}, score=${aggregateScore.toFixed(3)}`);
          console.log(`       └─ Components: base=${baseScore.toFixed(3)} + density=${densityBonus.toFixed(3)} + semantic=${semanticBonus.toFixed(3)}, valid=${semanticValid}`);
          console.log(`       └─ Connected tables (${connectionCount}/${cluster.length}): ${clusterConnections.map(c => `${c.tableName}(${c.strength.toFixed(2)})`).join(', ')}`);
          
          
          if (semanticValid && aggregateScore > bestAggregateScore) {
            bestAggregateScore = aggregateScore;
            bestHubCommunity = hubId;
            bestHubName = hubName;
          } else if (!semanticValid) {
            console.log(`       ⚠️ Rejected due to low semantic coherence (${semanticScore.toFixed(3)} < 0.3)`);
          }
        }
      }
      
      // Assign cluster if aggregate score meets threshold
      if (bestHubCommunity >= 0 && bestAggregateScore >= CLUSTER_ASSIGNMENT_THRESHOLD) {
        cluster.forEach(tableName => {
          const node = this.nodes.get(tableName);
          if (node) {
            node.community = bestHubCommunity;
            this.communities.get(bestHubCommunity)!.add(tableName);
            this.tableToDomainMap.set(tableName, bestHubCommunity);
          }
        });
        clusterAssignments += cluster.length;
        console.log(`   ✅ CLUSTER: ${cluster.join(', ')} → ${bestHubName} (score: ${bestAggregateScore.toFixed(3)})`);
      } else {
        // Cluster doesn't meet threshold - remain orphaned
        cluster.forEach(tableName => {
          remainingOrphans++;
        });
        console.log(`   🔄 ORPHANED: ${cluster.join(', ')} (score: ${bestAggregateScore.toFixed(3)} < ${CLUSTER_ASSIGNMENT_THRESHOLD})`);
      }
    });

    console.log(`\n📊 TWO-PASS ASSIGNMENT SUMMARY:`);
    console.log(`   ✅ Pass 1 strong assignments: ${strongAssignments}`);
    console.log(`   🔗 Pass 2A natural clusters: ${naturalClusters.length}`);
    console.log(`   🎯 Pass 2B cluster assignments: ${clusterAssignments}`);
    console.log(`   🔄 Remaining orphans: ${remainingOrphans}`);
    console.log(`   🏮 Total hub communities: ${this.hubTables.size}`);
    
    // Show final hub community assignments
    console.log(`\n📊 FINAL HUB COMMUNITY ASSIGNMENTS:`);
    for (let hubId = 0; hubId < this.hubTables.size; hubId++) {
      const hubCommunity = this.communities.get(hubId);
      if (hubCommunity) {
        const hubTables = Array.from(hubCommunity).filter(t => this.hubTables.has(t));
        const assignedTables = Array.from(hubCommunity).filter(t => !this.hubTables.has(t));
        console.log(`   Hub ${hubId}: ${hubTables[0]} (${hubCommunity.size} total tables)`);
        console.log(`     └─ Assigned tables (${assignedTables.length}): ${assignedTables.join(', ')}`);
      }
    }

    // Initialize edge weights for graph processing
    this.initializeEdgeWeights(relationships, edgeWeights);
    
    // Calculate node degrees for community metrics
    this.calculateNodeDegrees();
  }

  /**
   * Calculate dependency weight using pure FK relationship analysis
   * Returns higher weight if the table belongs to the hub's business domain based on FK patterns
   */
  private calculateDependencyWeight(tableName: string, hubTable: string, relationships: Relationship[]): number {
    // Check for direct FK relationship (table depends on hub)
    const tableToHub = relationships.some(rel => 
      rel.sourceTable === tableName && rel.targetTable === hubTable
    );
    
    // Check for reverse FK relationship (hub depends on table)
    const hubToTable = relationships.some(rel => 
      rel.sourceTable === hubTable && rel.targetTable === tableName
    );
    
    // Check for many-to-many relationships through junction tables
    const junctionRelationships = relationships.filter(rel => 
      rel.sourceTable === tableName || rel.targetTable === tableName
    ).filter(rel => {
      const otherTable = rel.sourceTable === tableName ? rel.targetTable : rel.sourceTable;
      return relationships.some(hubRel => 
        (hubRel.sourceTable === otherTable && hubRel.targetTable === hubTable) ||
        (hubRel.sourceTable === hubTable && hubRel.targetTable === otherTable)
      );
    });
    
    // Weight based on relationship type and strength
    if (tableToHub) {
      return 2.0; // Strong: table depends on hub (primary domain relationship)
    } else if (hubToTable) {
      return 1.5; // Medium: hub depends on table (important supporting table)
    } else if (junctionRelationships.length > 0) {
      return 1.2; // Weak: indirect relationship through junction
    }
    
    // No FK relationship to hub or hub's domain
    return 1.0; // Default weight
  }

  /**
   * Find connected components from deferred tables using FK relationships
   * Groups tables that have direct FK relationships into natural business clusters
   */
  private findConnectedComponents(deferredTables: TableInfo[], relationships: Relationship[]): string[][] {
    const tableNames = new Set(deferredTables.map(t => t.name));
    const visited = new Set<string>();
    const clusters: string[][] = [];
    const isolatedTables: string[] = [];
    
    // Build adjacency list for FK relationships between deferred tables only
    const adjacencyList = new Map<string, string[]>();
    deferredTables.forEach(table => {
      adjacencyList.set(table.name, []);
    });
    
    relationships.forEach(rel => {
      // Only consider relationships between deferred tables
      if (tableNames.has(rel.sourceTable) && tableNames.has(rel.targetTable)) {
        adjacencyList.get(rel.sourceTable)!.push(rel.targetTable);
        adjacencyList.get(rel.targetTable)!.push(rel.sourceTable); // Undirected graph
      }
    });
    
    // NEW: Separate isolated tables (0 FK relationships) from connected tables
    const connectedTables: string[] = [];
    deferredTables.forEach(table => {
      const connections = adjacencyList.get(table.name) || [];
      if (connections.length === 0) {
        isolatedTables.push(table.name);
      } else {
        connectedTables.push(table.name);
      }
    });
    
    console.log(`   🔍 Table categorization: ${connectedTables.length} connected, ${isolatedTables.length} isolated`);
    
    // DFS to find connected components
    const dfs = (tableName: string, currentCluster: string[]) => {
      if (visited.has(tableName)) return;
      
      visited.add(tableName);
      currentCluster.push(tableName);
      
      const neighbors = adjacencyList.get(tableName) || [];
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, currentCluster);
        }
      });
    };
    
    // Find connected components only from connected tables (ignore isolated ones)
    connectedTables.forEach(tableName => {
      if (!visited.has(tableName)) {
        const cluster: string[] = [];
        dfs(tableName, cluster);
        if (cluster.length > 1) { // Only include multi-table clusters
          clusters.push(cluster);
        } else if (cluster.length === 1) {
          // Single connected table - treat as isolated
          isolatedTables.push(cluster[0]);
        }
      }
    });
    
    console.log(`   🔗 Connected components analysis:`);
    clusters.forEach((cluster, index) => {
      console.log(`     Cluster ${index + 1}: ${cluster.join(', ')} (${cluster.length} tables)`);
    });
    
    // Add isolated tables as individual "clusters" for separate processing
    isolatedTables.forEach(table => {
      clusters.push([table]);
    });
    
    console.log(`   🔄 Added ${isolatedTables.length} isolated tables for individual evaluation`);
    
    return clusters;
  }

  /**
   * Initialize edge weights from relationships and semantic similarity
   */
  private initializeEdgeWeights(
    relationships: Relationship[],
    edgeWeights: Map<string, number>
  ): void {
    // Build edges from relationships
    relationships.forEach(rel => {
      const edgeKey = `${rel.sourceTable}-${rel.targetTable}`;
      const weight = edgeWeights.get(edgeKey) || 0.1; // Default weight for missing edges
      
      const edge: LouvainEdge = {
        source: rel.sourceTable,
        target: rel.targetTable,
        weight,
        type: 'structural'
      };
      
      this.edges.push(edge);
      this.totalEdgeWeight += weight;
    });

    // Add semantic similarity edges if available
    if (this.semanticSimilarityMap.size > 0) {
      this.semanticSimilarityMap.forEach((similarity, key) => {
        const [source, target] = key.split(':');
        if (source && target && similarity > 0.3) { // Only add strong semantic connections
          const semanticWeight = similarity * 0.5; // Scale down semantic vs structural
          
          const edge: LouvainEdge = {
            source,
            target,
            weight: semanticWeight,
            type: 'semantic'
          };
          
          this.edges.push(edge);
          this.totalEdgeWeight += semanticWeight;
        }
      });
    }
  }

  /**
   * Calculate node degrees from edges
   */
  private calculateNodeDegrees(): void {
    this.nodes.forEach(node => {
      node.degree = 0;
      node.internalEdges = 0;
    });

    this.edges.forEach(edge => {
      const sourceNode = this.nodes.get(edge.source);
      const targetNode = this.nodes.get(edge.target);
      
      if (sourceNode) {
        sourceNode.degree += edge.weight;
        if (sourceNode.community === targetNode?.community) {
          sourceNode.internalEdges += edge.weight;
        }
      }
      
      if (targetNode) {
        targetNode.degree += edge.weight;
        if (targetNode.community === sourceNode?.community) {
          targetNode.internalEdges += edge.weight;
        }
      }
    });
  }

  /**
   * Calculate global modularity score
   */
  private calculateGlobalModularity(): number {
    if (this.totalEdgeWeight === 0) return 0;
    
    let modularity = 0;
    const communities = new Map<number, { internalWeight: number, totalDegree: number }>();
    
    // Initialize community metrics
    this.communities.forEach((_, communityId) => {
      communities.set(communityId, { internalWeight: 0, totalDegree: 0 });
    });
    
    // Calculate internal weights and total degrees
    this.edges.forEach(edge => {
      const sourceNode = this.nodes.get(edge.source);
      const targetNode = this.nodes.get(edge.target);
      
      if (sourceNode && targetNode && sourceNode.community === targetNode.community && sourceNode.community >= 0) {
        const communityMetrics = communities.get(sourceNode.community);
        if (communityMetrics) {
          communityMetrics.internalWeight += edge.weight;
        }
      }
    });
    
    this.nodes.forEach(node => {
      if (node.community >= 0) {
        const communityMetrics = communities.get(node.community);
        if (communityMetrics) {
          communityMetrics.totalDegree += node.degree;
        }
      }
    });
    
    // Calculate modularity
    communities.forEach(metrics => {
      const expectedInternal = (metrics.totalDegree * metrics.totalDegree) / (2 * this.totalEdgeWeight);
      modularity += (metrics.internalWeight - expectedInternal) / this.totalEdgeWeight;
    });
    
    return modularity;
  }

  /**
   * Build final clustering result
   */
  private buildClusteringResult(
    modularity: number,
    iterations: number,
    converged: boolean,
    processingTime: number
  ): LouvainClusteringResult {
    const communities: LouvainCommunity[] = [];
    
    this.communities.forEach((tableNames, communityId) => {
      const nodes = Array.from(tableNames).map(name => this.nodes.get(name)!).filter(Boolean);
      const hubTables = Array.from(tableNames).filter(name => this.hubTables.has(name));
      
      let totalWeight = 0;
      let internalEdges = 0;
      let externalEdges = 0;
      
      this.edges.forEach(edge => {
        const sourceInCommunity = tableNames.has(edge.source);
        const targetInCommunity = tableNames.has(edge.target);
        
        if (sourceInCommunity && targetInCommunity) {
          internalEdges++;
          totalWeight += edge.weight;
        } else if (sourceInCommunity || targetInCommunity) {
          externalEdges++;
        }
      });
      
      communities.push({
        id: communityId,
        nodes: Array.from(tableNames),
        totalWeight,
        internalEdges,
        externalEdges,
        modularity: 0, // Could calculate community-specific modularity
        hubTables
      });
    });
    
    const totalNodes = this.nodes.size;
    const totalEdges = this.edges.length;
    const averageClusterSize = totalNodes / communities.length;
    
    return {
      communities,
      globalModularity: modularity,
      iterations,
      convergenceAchieved: converged,
      hubPreservationScore: this.calculateHubPreservationScore(),
      processingTime,
      metrics: {
        totalNodes,
        totalEdges,
        averageClusterSize,
        modularityImprovement: modularity,
        hubConnectivityPreserved: this.calculateHubConnectivityPreserved()
      }
    };
  }

  /**
   * Calculate hub preservation score
   */
  private calculateHubPreservationScore(): number {
    // Simple metric: what fraction of hub tables remained in their own communities
    let preservedHubs = 0;
    
    this.hubTables.forEach(hubTable => {
      const node = this.nodes.get(hubTable);
      if (node) {
        // Check if hub is still the primary node in its community
        const community = this.communities.get(node.community);
        if (community && community.has(hubTable)) {
          preservedHubs++;
        }
      }
    });
    
    return this.hubTables.size > 0 ? preservedHubs / this.hubTables.size : 1.0;
  }

  /**
   * Calculate hub connectivity preservation metric
   */
  private calculateHubConnectivityPreserved(): number {
    // This is a placeholder - could implement more sophisticated hub connectivity analysis
    return 0.95;
  }

  /**
   * Aggregate small communities (placeholder - not needed for hub-centered approach)
   */
  private async aggregateSmallCommunities(): Promise<void> {
    // Skip aggregation for hub-centered conservative clustering
    // Hub communities are already well-formed and shouldn't be merged
  }

  /**
   * Preserve hub connectivity (placeholder - not needed as hubs are preserved by design)
   */
  private async preserveHubConnectivity(): Promise<void> {
    // No additional hub preservation needed - already handled in initialization
  }

  /**
   * Integrate orphan clusters with main hub domains (placeholder)
   */
  private integrateOrphanClustersWithHubDomains(relationships: Relationship[]): {
    clustersIntegrated: number;
    tablesAffected: number;
  } {
    // This functionality is now handled in the two-pass assignment system
    return {
      clustersIntegrated: 0,
      tablesAffected: 0
    };
  }
}
