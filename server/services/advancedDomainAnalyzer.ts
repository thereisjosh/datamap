import { type TableData, type Relationship } from '@shared/schema';
import Graph from 'graphology';
import { relationshipAnalyzer, type RelationshipWeight } from './relationshipAnalyzer';
import { businessRuleEngine, type BusinessDomainClassification } from './businessRuleEngine';

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
  businessClassification: BusinessDomainClassification;
  suggestedColor: string;
  coreTables: number;
  totalTables: number;
}

export interface AdvancedTableCluster extends MultiDomainCluster {
  tables: TableData[];
  tableNames: Set<string>;
  modularityScore: number;
  size: number;
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
   */
  public discoverDomains(tables: TableData[], relationships: Relationship[]): AdvancedTableCluster[] {
    const startTime = Date.now();
    console.log(`🔬 Multi-domain discovery for ${tables.length} tables, ${relationships.length} relationships`);
    
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
    console.log(`⚡ Multi-domain discovery completed in ${duration}ms`);
    
    // Log final results
    this.logFinalResults(finalClusters);
    
    return finalClusters;
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
    
    // Define business domain patterns with seed tables
    const domainPatterns = [
      {
        id: 'donations_payments',
        name: 'Donations and Payments',
        domainType: 'payments_donations',
        patterns: [/donation/i, /payment/i, /transaction/i, /checkout/i, /refund/i, /pledge/i, /recurring/i]
      },
      {
        id: 'opportunities_volunteer',
        name: 'Opportunities', 
        domainType: 'opportunities',
        patterns: [/opportunity/i, /volunteer/i, /registration/i, /helper/i, /partner/i, /skill/i, /position/i, /attendance/i]
      },
      {
        id: 'campaigns_marketing',
        name: 'Campaigns',
        domainType: 'campaigns_marketing', 
        patterns: [/campaign/i, /article/i, /marketing/i, /brand/i, /asset/i, /story/i, /event/i]
      },
      {
        id: 'user_organization',
        name: 'Users',
        domainType: 'organization_management',
        patterns: [/user/i, /entity/i, /organization/i, /auth/i, /permission/i, /role/i, /group/i, /giver/i]
      },
      {
        id: 'system_config',
        name: 'System Management',
        domainType: 'system_configuration',
        patterns: [/batch/i, /status/i, /type/i, /config/i, /log/i, /audit/i, /api/i, /file/i, /sequence/i]
      }
    ];
    
    // Find seed tables for each domain
    domainPatterns.forEach(pattern => {
      const seedTables = tables.filter(table => 
        pattern.patterns.some(p => p.test(table.name))
      ).map(t => t.name);
      
      if (seedTables.length > 0) {
        coreDomains.push({
          id: pattern.id,
          name: pattern.name,
          seedTables,
          domainType: pattern.domainType
        });
        console.log(`   Core domain "${pattern.name}": ${seedTables.length} seed tables`);
      }
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
    
    // Define domain-specific patterns
    const domainPatterns: Record<string, RegExp[]> = {
      'donations_payments': [/donation/i, /payment/i, /transaction/i, /checkout/i, /refund/i, /pledge/i, /recurring/i, /bank/i, /fee/i],
      'opportunities': [/opportunity/i, /volunteer/i, /registration/i, /helper/i, /partner/i, /skill/i, /position/i, /attendance/i, /suitable/i, /approve/i],
      'campaigns_marketing': [/campaign/i, /article/i, /marketing/i, /brand/i, /asset/i, /story/i, /event/i, /content/i, /collection/i],
      'organization_management': [/user/i, /entity/i, /organization/i, /auth/i, /permission/i, /role/i, /group/i, /giver/i, /member/i, /sector/i],
      'system_configuration': [/batch/i, /status/i, /type/i, /config/i, /log/i, /audit/i, /api/i, /file/i, /sequence/i, /system/i, /app/i]
    };
    
    const patterns = domainPatterns[domain.domainType] || [];
    const matchingPatterns = patterns.filter(pattern => pattern.test(lowerName));
    
    return matchingPatterns.length > 0 ? Math.min(matchingPatterns.length * 0.3, 1.0) : 0;
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
        const businessClassification: BusinessDomainClassification = {
          domainType: coreDomain.domainType,
          suggestedName: coreDomain.name,
          description: `Multi-domain cluster for ${coreDomain.name}`,
          confidence: coreTableNames.size / allTableNames.size, // Core ratio as confidence
          patterns: []
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
      console.log(`   Type: ${cluster.businessClassification.domainType}`);
      console.log(`   Core tables: ${cluster.coreTables} | Total participating: ${cluster.totalTables}`);
      console.log(`   Primary tables: ${cluster.size} (cohesion: ${cluster.cohesionScore.toFixed(2)})`);
      console.log(`   Confidence: ${cluster.businessClassification.confidence.toFixed(2)}`);
      console.log(`   Internal connections: ${cluster.internalConnections}`);
      console.log(`   External connections: ${Array.from(cluster.externalConnections.values()).reduce((sum, count) => sum + count, 0)}`);
      
      // Show core vs secondary tables
      if (cluster.coreTables <= 15) {
        console.log(`   Core tables: [${Array.from(cluster.coreTableNames).join(', ')}]`);
        if (cluster.totalTables > cluster.coreTables) {
          const secondaryTables = Array.from(cluster.allTableNames).filter(t => !cluster.coreTableNames.has(t));
          console.log(`   Secondary tables: [${secondaryTables.slice(0, 8).join(', ')}${secondaryTables.length > 8 ? `, ... +${secondaryTables.length - 8} more` : ''}]`);
        }
      } else {
        const coreList = Array.from(cluster.coreTableNames);
        console.log(`   Core tables: [${coreList.slice(0, 10).join(', ')}, ... +${coreList.length - 10} more]`);
        console.log(`   Secondary tables: ${cluster.totalTables - cluster.coreTables} additional participating tables`);
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
}

// Export singleton instance
export const advancedDomainAnalyzer = new AdvancedDomainAnalyzer();