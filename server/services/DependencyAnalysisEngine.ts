/**
 * Dependency Analysis Engine for Hub-Centric Domain Detection
 * 
 * Implements dependency-driven domain architecture where hub tables include
 * tables they depend on (reference) but exclude tables that depend on them (consumers).
 * 
 * Key Principles:
 * - Hub tables include their dependencies (tables they need for core functionality)
 * - Hub tables exclude their consumers (tables that reference them)
 * - Follows Domain-Driven Design principles for bounded context determination
 * - Composition over association relationships
 * - Core business entities own their required data
 */

import type { TableInfo } from './coreTableDiscoveryService';
import type { Relationship } from '@shared/schema';

export interface DependencyNode {
  tableName: string;
  nodeType: 'hub' | 'entity' | 'junction' | 'reference' | 'lookup';
  
  // Dependency relationships
  dependencies: Set<string>;      // Tables this table depends on (outgoing FKs)
  dependents: Set<string>;        // Tables that depend on this table (incoming FKs)
  
  // Business metrics
  businessImportance: number;     // 0-1 score based on naming patterns and connections
  domainCentrality: number;       // How central this table is to its domain
  
  // Structural metrics
  inDegree: number;               // Number of tables referencing this one
  outDegree: number;              // Number of tables this one references
  connectionStrength: number;     // Weighted sum of connection strengths
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, DependencyRelationship>;
  hubTables: Set<string>;
  domainRoots: Set<string>;       // Tables that could serve as aggregate roots
}

export interface DependencyRelationship {
  from: string;                   // Table that depends (has FK)
  to: string;                     // Table being depended on (has PK)
  relationshipType: 'composition' | 'association' | 'aggregation' | 'inheritance';
  strength: number;               // 0-1 strength of dependency
  businessNature: 'core' | 'supporting' | 'lookup' | 'audit' | 'metadata';
}

export interface HubDomainExpansion {
  hubTable: string;
  coreEntities: string[];         // Tables the hub depends on (INCLUDE in domain)
  supportingEntities: string[];   // Secondary dependencies (INCLUDE if high coupling)
  consumerEntities: string[];     // Tables that depend on hub (EXCLUDE from domain)
  lookupTables: string[];         // Reference data (INCLUDE if exclusive to domain)
  
  domainScore: number;            // Quality score for this domain formation
  cohesionScore: number;          // How tightly coupled the included tables are
  couplingScore: number;          // How loosely coupled to external entities
}

export interface DependencyAnalysisOptions {
  hubThreshold: number;           // Min connections to be considered a hub (default: 5)
  maxDomainSize: number;          // Max tables per domain (default: 15)
  minCohesionScore: number;       // Min cohesion to form domain (default: 0.6)
  includeTransitiveDeps: boolean; // Include transitive dependencies (default: false)
  businessWeighting: number;      // Weight of business naming vs structural (default: 0.3)
  verbose: boolean;               // Enable detailed logging (default: false)
}

export interface DomainFormationResult {
  domains: HubDomainExpansion[];
  orphanTables: string[];         // Tables not assigned to any domain
  junctionAssignments: Map<string, string>; // Junction table -> domain assignments
  qualityMetrics: {
    averageCohesion: number;
    averageCoupling: number;
    domainSizeDistribution: number[];
    hubCoverageRatio: number;
  };
}

export class DependencyAnalysisEngine {
  private options: DependencyAnalysisOptions;
  private dependencyGraph: DependencyGraph;
  private businessKeywords: Map<string, number>; // keyword -> importance weight

  constructor(options: Partial<DependencyAnalysisOptions> = {}) {
    this.options = {
      hubThreshold: 5,
      maxDomainSize: 15,
      minCohesionScore: 0.6,
      includeTransitiveDeps: false,
      businessWeighting: 0.3,
      verbose: false,
      ...options
    };

    this.dependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      hubTables: new Set(),
      domainRoots: new Set()
    };

    // Initialize business domain keywords with importance weights
    this.businessKeywords = new Map([
      // Core business entities
      ['user', 0.9], ['customer', 0.9], ['account', 0.9], ['order', 0.9],
      ['product', 0.9], ['service', 0.9], ['campaign', 0.9], ['project', 0.9],
      
      // Transactional entities  
      ['transaction', 0.8], ['payment', 0.8], ['invoice', 0.8], ['booking', 0.8],
      ['reservation', 0.8], ['subscription', 0.8], ['contract', 0.8],
      
      // Supporting entities
      ['profile', 0.7], ['settings', 0.6], ['preference', 0.6], ['notification', 0.5],
      ['log', 0.4], ['audit', 0.4], ['history', 0.4],
      
      // Reference entities
      ['type', 0.3], ['status', 0.3], ['category', 0.3], ['template', 0.3],
      ['config', 0.2], ['metadata', 0.2]
    ]);

    if (this.options.verbose) {
      console.log('🔍 Dependency Analysis Engine initialized:');
      console.log(`   🌟 Hub threshold: ${this.options.hubThreshold} connections`);
      console.log(`   📏 Max domain size: ${this.options.maxDomainSize} tables`);
      console.log(`   🎯 Min cohesion score: ${this.options.minCohesionScore}`);
      console.log(`   🧠 Business weighting: ${this.options.businessWeighting}`);
    }
  }

  /**
   * Main method to analyze dependencies and form hub-centric domains
   */
  public async analyzeDependencies(
    tables: TableInfo[],
    relationships: Relationship[]
  ): Promise<DomainFormationResult> {
    if (this.options.verbose) {
      console.log(`🚀 Starting dependency analysis for ${tables.length} tables, ${relationships.length} relationships`);
    }

    // Step 1: Build dependency graph
    await this.buildDependencyGraph(tables, relationships);
    
    // Step 2: Identify hub tables and potential domain roots
    await this.identifyHubTables();
    
    // Step 3: Perform hub-centric domain expansion
    const domains = await this.expandHubDomains();
    
    // Step 4: Handle orphan tables and junctions
    const { orphanTables, junctionAssignments } = await this.assignOrphanTables(domains);
    
    // Step 5: Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(domains);

    const result: DomainFormationResult = {
      domains,
      orphanTables,
      junctionAssignments,
      qualityMetrics
    };

    if (this.options.verbose) {
      console.log(`✅ Dependency analysis completed:`);
      console.log(`   🏘️ Domains formed: ${domains.length}`);
      console.log(`   🏠 Orphan tables: ${orphanTables.length}`);
      console.log(`   📊 Average cohesion: ${qualityMetrics.averageCohesion.toFixed(3)}`);
      console.log(`   🔗 Hub coverage: ${(qualityMetrics.hubCoverageRatio * 100).toFixed(1)}%`);
    }

    return result;
  }

  /**
   * Step 1: Build comprehensive dependency graph
   */
  private async buildDependencyGraph(tables: TableInfo[], relationships: Relationship[]): Promise<void> {
    // Initialize nodes
    for (const table of tables) {
      const node: DependencyNode = {
        tableName: table.name,
        nodeType: this.classifyTableType(table, relationships),
        dependencies: new Set(),
        dependents: new Set(),
        businessImportance: this.calculateBusinessImportance(table.name),
        domainCentrality: 0,
        inDegree: 0,
        outDegree: 0,
        connectionStrength: 0
      };

      this.dependencyGraph.nodes.set(table.name, node);
    }

    // Build dependency relationships
    for (const rel of relationships) {
      const edgeKey = `${rel.sourceTable}->${rel.targetTable}`;
      
      const dependencyRel: DependencyRelationship = {
        from: rel.sourceTable,
        to: rel.targetTable,
        relationshipType: this.classifyRelationshipType(rel, tables),
        strength: this.calculateRelationshipStrength(rel, tables),
        businessNature: this.classifyBusinessNature(rel.sourceTable, rel.targetTable)
      };

      this.dependencyGraph.edges.set(edgeKey, dependencyRel);

      // Update node dependencies
      const sourceNode = this.dependencyGraph.nodes.get(rel.sourceTable);
      const targetNode = this.dependencyGraph.nodes.get(rel.targetTable);

      if (sourceNode && targetNode) {
        sourceNode.dependencies.add(rel.targetTable);
        sourceNode.outDegree++;
        sourceNode.connectionStrength += dependencyRel.strength;

        targetNode.dependents.add(rel.sourceTable);
        targetNode.inDegree++;
        targetNode.connectionStrength += dependencyRel.strength;
      }
    }

    // Calculate domain centrality for each node
    this.calculateDomainCentrality();

    if (this.options.verbose) {
      console.log(`   📊 Dependency graph built: ${this.dependencyGraph.nodes.size} nodes, ${this.dependencyGraph.edges.size} edges`);
    }
  }

  /**
   * Classify table type based on structure and relationships
   */
  private classifyTableType(table: TableInfo, relationships: Relationship[]): DependencyNode['nodeType'] {
    const tableName = table.name.toLowerCase();
    const tableRels = relationships.filter(r => r.sourceTable === table.name || r.targetTable === table.name);
    
    const incomingRels = relationships.filter(r => r.targetTable === table.name);
    const outgoingRels = relationships.filter(r => r.sourceTable === table.name);

    // Junction tables: exactly 2+ outgoing FKs, often with composite primary key
    if (outgoingRels.length >= 2 && incomingRels.length <= 1) {
      return 'junction';
    }

    // Reference/lookup tables: high incoming, low outgoing, specific naming patterns
    if (tableName.includes('type') || tableName.includes('status') || tableName.includes('category') ||
        tableName.includes('lookup') || tableName.endsWith('_ref')) {
      return 'reference';
    }

    // Hub tables: high degree centrality (many connections)
    if (tableRels.length >= this.options.hubThreshold) {
      return 'hub';
    }

    // Default to entity
    return 'entity';
  }

  /**
   * Classify the nature of a relationship
   */
  private classifyRelationshipType(rel: Relationship, tables: TableInfo[]): DependencyRelationship['relationshipType'] {
    const sourceTable = rel.sourceTable.toLowerCase();
    const targetTable = rel.targetTable.toLowerCase();

    // Inheritance patterns
    if (sourceTable.includes('base') || targetTable.includes('base') ||
        sourceTable.includes('parent') || targetTable.includes('parent')) {
      return 'inheritance';
    }

    // Composition: strong ownership (Order -> OrderItem)
    if (sourceTable.includes(targetTable.replace(/s$/, '')) || 
        targetTable.includes(sourceTable.replace(/s$/, ''))) {
      return 'composition';
    }

    // Aggregation: weaker ownership, lifecycle independence
    if (sourceTable.includes('user') || sourceTable.includes('customer') ||
        targetTable.includes('profile') || targetTable.includes('settings')) {
      return 'aggregation';
    }

    // Default to association
    return 'association';
  }

  /**
   * Calculate the strength of a dependency relationship
   */
  private calculateRelationshipStrength(rel: Relationship, tables: TableInfo[]): number {
    let strength = 0.5; // Base strength

    // Stronger for composition relationships
    const sourceTable = rel.sourceTable.toLowerCase();
    const targetTable = rel.targetTable.toLowerCase();

    if (sourceTable.includes(targetTable.replace(/s$/, '')) || 
        targetTable.includes(sourceTable.replace(/s$/, ''))) {
      strength += 0.3;
    }

    // Stronger for core business entities
    const sourceImportance = this.calculateBusinessImportance(rel.sourceTable);
    const targetImportance = this.calculateBusinessImportance(rel.targetTable);
    strength += (sourceImportance + targetImportance) * 0.1;

    // Weaker for pure lookup relationships
    if (targetTable.includes('type') || targetTable.includes('status') || targetTable.includes('category')) {
      strength -= 0.2;
    }

    return Math.max(0.1, Math.min(1.0, strength));
  }

  /**
   * Classify the business nature of a relationship
   */
  private classifyBusinessNature(sourceTable: string, targetTable: string): DependencyRelationship['businessNature'] {
    const source = sourceTable.toLowerCase();
    const target = targetTable.toLowerCase();

    // Core business relationships
    if (this.calculateBusinessImportance(sourceTable) >= 0.7 && this.calculateBusinessImportance(targetTable) >= 0.7) {
      return 'core';
    }

    // Lookup/reference relationships
    if (target.includes('type') || target.includes('status') || target.includes('category') ||
        target.includes('lookup') || target.endsWith('_ref')) {
      return 'lookup';
    }

    // Audit/logging relationships
    if (target.includes('log') || target.includes('audit') || target.includes('history') ||
        source.includes('log') || source.includes('audit')) {
      return 'audit';
    }

    // Metadata relationships
    if (target.includes('config') || target.includes('setting') || target.includes('metadata') ||
        target.includes('template')) {
      return 'metadata';
    }

    // Default to supporting
    return 'supporting';
  }

  /**
   * Calculate business importance based on table naming patterns
   */
  private calculateBusinessImportance(tableName: string): number {
    const name = tableName.toLowerCase();
    let importance = 0.5; // Base importance

    // Check against business keywords
    for (const [keyword, weight] of this.businessKeywords) {
      if (name.includes(keyword)) {
        importance = Math.max(importance, weight);
      }
    }

    // Reduce importance for utility tables
    if (name.includes('temp') || name.includes('cache') || name.includes('queue') ||
        name.startsWith('sys_') || name.startsWith('tmp_')) {
      importance *= 0.3;
    }

    return Math.max(0.1, Math.min(1.0, importance));
  }

  /**
   * Calculate domain centrality using PageRank-like algorithm
   */
  private calculateDomainCentrality(): void {
    const dampingFactor = 0.85;
    const maxIterations = 100;
    const convergenceThreshold = 0.001;

    // Initialize all nodes with equal centrality
    const centrality = new Map<string, number>();
    for (const [tableName] of this.dependencyGraph.nodes) {
      centrality.set(tableName, 1.0);
    }

    // Iterate until convergence
    for (let iter = 0; iter < maxIterations; iter++) {
      const newCentrality = new Map<string, number>();
      let maxChange = 0;

      for (const [tableName, node] of this.dependencyGraph.nodes) {
        let sum = 0;

        // Sum contributions from tables that depend on this table
        for (const dependent of node.dependents) {
          const dependentNode = this.dependencyGraph.nodes.get(dependent);
          if (dependentNode && dependentNode.outDegree > 0) {
            sum += centrality.get(dependent)! / dependentNode.outDegree;
          }
        }

        const newValue = (1 - dampingFactor) + dampingFactor * sum;
        newCentrality.set(tableName, newValue);

        const change = Math.abs(newValue - centrality.get(tableName)!);
        maxChange = Math.max(maxChange, change);
      }

      // Update centrality values
      for (const [tableName, value] of newCentrality) {
        centrality.set(tableName, value);
        this.dependencyGraph.nodes.get(tableName)!.domainCentrality = value;
      }

      // Check for convergence
      if (maxChange < convergenceThreshold) {
        break;
      }
    }
  }

  /**
   * Step 2: Identify hub tables and potential domain roots
   */
  private async identifyHubTables(): Promise<void> {
    for (const [tableName, node] of this.dependencyGraph.nodes) {
      const totalConnections = node.inDegree + node.outDegree;
      
      // Hub criteria: high connectivity + business importance + centrality
      const isHub = totalConnections >= this.options.hubThreshold ||
                   (node.businessImportance >= 0.8 && totalConnections >= 3) ||
                   (node.domainCentrality >= 2.0);

      if (isHub) {
        this.dependencyGraph.hubTables.add(tableName);
        node.nodeType = 'hub';
      }

      // Domain root criteria: high business importance + incoming connections
      const isDomainRoot = node.businessImportance >= 0.7 && node.inDegree >= 2;
      if (isDomainRoot) {
        this.dependencyGraph.domainRoots.add(tableName);
      }
    }

    if (this.options.verbose) {
      console.log(`   🌟 Hub tables identified: ${this.dependencyGraph.hubTables.size}`);
      console.log(`   🏛️ Domain roots identified: ${this.dependencyGraph.domainRoots.size}`);
    }
  }

  /**
   * Step 3: Expand hub tables into domains using dependency-driven approach
   */
  private async expandHubDomains(): Promise<HubDomainExpansion[]> {
    const domains: HubDomainExpansion[] = [];

    for (const hubTable of this.dependencyGraph.hubTables) {
      const hubNode = this.dependencyGraph.nodes.get(hubTable)!;
      
      // Core principle: Include tables the hub depends on, exclude tables that depend on the hub
      const coreEntities = Array.from(hubNode.dependencies).filter(dep => {
        const depNode = this.dependencyGraph.nodes.get(dep)!;
        return depNode.nodeType !== 'reference' && this.isCoreDependency(hubTable, dep);
      });

      // Supporting entities: secondary dependencies with high business coupling
      const supportingEntities = this.findSupportingEntities(hubTable, coreEntities);

      // Consumer entities: tables that depend on the hub (EXCLUDED from domain)
      const consumerEntities = Array.from(hubNode.dependents).filter(dep => {
        const depNode = this.dependencyGraph.nodes.get(dep)!;
        return depNode.nodeType !== 'junction';
      });

      // Lookup tables: include if exclusive to this domain
      const lookupTables = Array.from(hubNode.dependencies).filter(dep => {
        const depNode = this.dependencyGraph.nodes.get(dep)!;
        return depNode.nodeType === 'reference' || depNode.nodeType === 'lookup';
      });

      // Calculate domain quality scores
      const allIncludedTables = [hubTable, ...coreEntities, ...supportingEntities, ...lookupTables];
      
      const cohesionScore = this.calculateCohesionScore(allIncludedTables);
      const couplingScore = this.calculateCouplingScore(allIncludedTables, consumerEntities);
      const domainScore = (cohesionScore * 0.7) + ((1 - couplingScore) * 0.3);

      // Only create domain if it meets quality thresholds
      if (cohesionScore >= this.options.minCohesionScore && 
          allIncludedTables.length <= this.options.maxDomainSize) {
        
        domains.push({
          hubTable,
          coreEntities,
          supportingEntities,
          consumerEntities,
          lookupTables,
          domainScore,
          cohesionScore,
          couplingScore
        });

        if (this.options.verbose) {
          console.log(`   🏘️ Domain formed around ${hubTable}: ${allIncludedTables.length} tables (cohesion: ${cohesionScore.toFixed(3)})`);
        }
      }
    }

    // Sort domains by quality score
    domains.sort((a, b) => b.domainScore - a.domainScore);

    return domains;
  }

  /**
   * Check if a dependency is core to the hub's functionality
   */
  private isCoreDependency(hubTable: string, dependencyTable: string): boolean {
    const edgeKey = `${hubTable}->${dependencyTable}`;
    const rel = this.dependencyGraph.edges.get(edgeKey);
    
    if (!rel) return false;

    // Core dependencies: composition, high strength, core business nature
    return rel.relationshipType === 'composition' ||
           (rel.strength >= 0.7 && rel.businessNature === 'core') ||
           rel.businessNature === 'core';
  }

  /**
   * Find supporting entities through transitive dependencies
   */
  private findSupportingEntities(hubTable: string, coreEntities: string[]): string[] {
    if (!this.options.includeTransitiveDeps) return [];

    const supportingEntities = new Set<string>();

    for (const coreEntity of coreEntities) {
      const coreNode = this.dependencyGraph.nodes.get(coreEntity)!;
      
      for (const transitiveDep of coreNode.dependencies) {
        const transNode = this.dependencyGraph.nodes.get(transitiveDep)!;
        
        // Include if high business importance or strong coupling
        if ((transNode.businessImportance >= 0.6 || transNode.domainCentrality >= 1.5) &&
            transNode.nodeType !== 'reference' &&
            !coreEntities.includes(transitiveDep)) {
          supportingEntities.add(transitiveDep);
        }
      }
    }

    return Array.from(supportingEntities);
  }

  /**
   * Calculate cohesion score for a set of tables
   */
  private calculateCohesionScore(tables: string[]): number {
    if (tables.length <= 1) return 1.0;

    let totalEdges = 0;
    let actualEdges = 0;

    // Count internal connections
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        totalEdges++;
        
        const edge1 = `${tables[i]}->${tables[j]}`;
        const edge2 = `${tables[j]}->${tables[i]}`;
        
        if (this.dependencyGraph.edges.has(edge1) || this.dependencyGraph.edges.has(edge2)) {
          actualEdges++;
        }
      }
    }

    return totalEdges > 0 ? actualEdges / totalEdges : 0;
  }

  /**
   * Calculate coupling score with external entities
   */
  private calculateCouplingScore(includedTables: string[], excludedTables: string[]): number {
    let externalConnections = 0;
    let totalPossibleExternal = includedTables.length * excludedTables.length;

    if (totalPossibleExternal === 0) return 0;

    for (const included of includedTables) {
      for (const excluded of excludedTables) {
        const edge1 = `${included}->${excluded}`;
        const edge2 = `${excluded}->${included}`;
        
        if (this.dependencyGraph.edges.has(edge1) || this.dependencyGraph.edges.has(edge2)) {
          externalConnections++;
        }
      }
    }

    return externalConnections / totalPossibleExternal;
  }

  /**
   * Step 4: Assign orphan tables and junction tables to domains
   */
  private async assignOrphanTables(domains: HubDomainExpansion[]): Promise<{
    orphanTables: string[];
    junctionAssignments: Map<string, string>;
  }> {
    const assignedTables = new Set<string>();
    const junctionAssignments = new Map<string, string>();

    // Mark all domain tables as assigned
    for (const domain of domains) {
      [domain.hubTable, ...domain.coreEntities, ...domain.supportingEntities, ...domain.lookupTables]
        .forEach(table => assignedTables.add(table));
    }

    // Assign junction tables to domains with highest connectivity
    for (const [tableName, node] of this.dependencyGraph.nodes) {
      if (node.nodeType === 'junction' && !assignedTables.has(tableName)) {
        let bestDomain = '';
        let maxConnections = 0;

        for (const domain of domains) {
          const domainTables = new Set([
            domain.hubTable,
            ...domain.coreEntities,
            ...domain.supportingEntities,
            ...domain.lookupTables
          ]);

          let connections = 0;
          for (const dep of node.dependencies) {
            if (domainTables.has(dep)) connections++;
          }

          if (connections > maxConnections) {
            maxConnections = connections;
            bestDomain = domain.hubTable;
          }
        }

        if (bestDomain && maxConnections >= 2) {
          junctionAssignments.set(tableName, bestDomain);
          assignedTables.add(tableName);
        }
      }
    }

    // Identify remaining orphan tables
    const orphanTables = Array.from(this.dependencyGraph.nodes.keys())
      .filter(table => !assignedTables.has(table));

    return { orphanTables, junctionAssignments };
  }

  /**
   * Step 5: Calculate quality metrics for the domain formation
   */
  private calculateQualityMetrics(domains: HubDomainExpansion[]): DomainFormationResult['qualityMetrics'] {
    const cohesionScores = domains.map(d => d.cohesionScore);
    const couplingScores = domains.map(d => d.couplingScore);
    const domainSizes = domains.map(d => 
      1 + d.coreEntities.length + d.supportingEntities.length + d.lookupTables.length
    );

    const averageCohesion = cohesionScores.reduce((sum, score) => sum + score, 0) / cohesionScores.length;
    const averageCoupling = couplingScores.reduce((sum, score) => sum + score, 0) / couplingScores.length;
    const hubCoverageRatio = this.dependencyGraph.hubTables.size > 0 ? 
      domains.length / this.dependencyGraph.hubTables.size : 0;

    return {
      averageCohesion,
      averageCoupling,
      domainSizeDistribution: domainSizes,
      hubCoverageRatio
    };
  }
}