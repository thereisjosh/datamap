import { type TableData, type Relationship } from '@shared/schema';

// Graph-based domain discovery interfaces
export interface TableNode {
  name: string;
  table: TableData;
  connections: Set<string>; // Connected table names
  connectionCount: number;
}

export interface TableCluster {
  id: string;
  name: string;
  description: string;
  tables: TableData[];
  tableNames: Set<string>;
  internalConnections: number;
  externalConnections: Map<string, number>; // connections to other clusters
  cohesionScore: number; // 0-1, higher = more cohesive
  suggestedColor: string;
  businessConcepts: string[];
}

export interface RelationshipGraph {
  nodes: Map<string, TableNode>;
  edges: Map<string, string[]>; // table -> connected tables
  clusters: TableCluster[];
  crossClusterRelationships: Relationship[];
}

export class DomainAnalyzer {
  
  /**
   * Main entry point: Discover domains from tables and relationships
   */
  public discoverDomains(tables: TableData[], relationships: Relationship[]): TableCluster[] {
    console.log(`🔍 Relationship-driven domain discovery for ${tables.length} tables, ${relationships.length} relationships`);
    
    // Step 1: Build relationship graph
    const graph = this.buildRelationshipGraph(tables, relationships);
    console.log(`📊 Built graph with ${graph.nodes.size} nodes`);
    
    // Step 2: Find connected components (initial clusters)
    const initialClusters = this.findConnectedComponents(graph);
    console.log(`🏭 Found ${initialClusters.length} initial connected components`);
    
    // Step 3: Refine clusters using cohesion analysis
    const refinedClusters = this.refineClusters(initialClusters, relationships);
    console.log(`✨ Refined to ${refinedClusters.length} cohesive domains`);
    
    // Step 4: Generate domain names and metadata
    const namedClusters = this.generateDomainMetadata(refinedClusters);
    console.log(`🏷️ Generated domain names and business context`);
    
    // Log final results
    namedClusters.forEach((cluster, index) => {
      console.log(`\n🎯 Domain ${index + 1}: "${cluster.name}" (cohesion: ${cluster.cohesionScore.toFixed(2)})`);
      console.log(`   Tables: [${Array.from(cluster.tableNames).join(', ')}]`);
      console.log(`   Internal connections: ${cluster.internalConnections}`);
      console.log(`   Business concepts: [${cluster.businessConcepts.join(', ')}]`);
    });
    
    return namedClusters;
  }

  /**
   * Build graph representation from tables and relationships
   */
  private buildRelationshipGraph(tables: TableData[], relationships: Relationship[]): RelationshipGraph {
    const nodes = new Map<string, TableNode>();
    const edges = new Map<string, string[]>();

    // Initialize nodes
    tables.forEach(table => {
      nodes.set(table.name, {
        name: table.name,
        table,
        connections: new Set(),
        connectionCount: 0
      });
      edges.set(table.name, []);
    });

    // Add edges from relationships
    relationships.forEach(relationship => {
      const source = relationship.sourceTable;
      const target = relationship.targetTable;

      // Skip self-referential relationships for clustering purposes
      if (source === target) return;

      // Add bidirectional connections
      if (nodes.has(source) && nodes.has(target)) {
        // Add to graph edges
        edges.get(source)?.push(target);
        edges.get(target)?.push(source);
        
        // Add to node connections
        nodes.get(source)?.connections.add(target);
        nodes.get(target)?.connections.add(source);
        
        // Update connection counts
        const sourceNode = nodes.get(source);
        const targetNode = nodes.get(target);
        if (sourceNode) sourceNode.connectionCount++;
        if (targetNode) targetNode.connectionCount++;
      }
    });

    return {
      nodes,
      edges,
      clusters: [],
      crossClusterRelationships: []
    };
  }

  /**
   * Find connected components using depth-first search
   */
  private findConnectedComponents(graph: RelationshipGraph): TableCluster[] {
    const visited = new Set<string>();
    const clusters: TableCluster[] = [];
    let clusterId = 1;

    graph.nodes.forEach((node, tableName) => {
      if (!visited.has(tableName)) {
        const clusterTables: TableData[] = [];
        const clusterTableNames = new Set<string>();
        
        // DFS to find all connected tables
        this.dfsVisit(tableName, graph, visited, clusterTables, clusterTableNames);
        
        // Only create clusters with more than 1 table
        if (clusterTables.length > 0) {
          clusters.push({
            id: `cluster-${clusterId++}`,
            name: `Domain ${clusterId - 1}`,
            description: 'Auto-discovered domain cluster',
            tables: clusterTables,
            tableNames: clusterTableNames,
            internalConnections: 0,
            externalConnections: new Map(),
            cohesionScore: 0,
            suggestedColor: this.generateColor(clusterId - 1),
            businessConcepts: []
          });
        }
      }
    });

    return clusters;
  }

  /**
   * Depth-first search to visit connected nodes
   */
  private dfsVisit(
    tableName: string,
    graph: RelationshipGraph,
    visited: Set<string>,
    clusterTables: TableData[],
    clusterTableNames: Set<string>
  ): void {
    visited.add(tableName);
    
    const node = graph.nodes.get(tableName);
    if (node) {
      clusterTables.push(node.table);
      clusterTableNames.add(tableName);
      
      // Visit all connected tables
      const connections = graph.edges.get(tableName) || [];
      connections.forEach(connectedTable => {
        if (!visited.has(connectedTable)) {
          this.dfsVisit(connectedTable, graph, visited, clusterTables, clusterTableNames);
        }
      });
    }
  }

  /**
   * Refine clusters by analyzing cohesion and splitting if needed
   */
  private refineClusters(clusters: TableCluster[], relationships: Relationship[]): TableCluster[] {
    return clusters.map(cluster => {
      // Calculate internal connections
      let internalConnections = 0;
      const externalConnections = new Map<string, number>();

      relationships.forEach(rel => {
        const sourceInCluster = cluster.tableNames.has(rel.sourceTable);
        const targetInCluster = cluster.tableNames.has(rel.targetTable);

        if (sourceInCluster && targetInCluster) {
          // Internal connection
          internalConnections++;
        } else if (sourceInCluster || targetInCluster) {
          // External connection - find which other cluster it connects to
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
      const totalConnections = internalConnections + Array.from(externalConnections.values()).reduce((sum, count) => sum + count, 0);
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
   * Generate meaningful domain names and metadata
   */
  private generateDomainMetadata(clusters: TableCluster[]): TableCluster[] {
    return clusters.map((cluster, index) => {
      const businessConcepts = this.extractBusinessConcepts(cluster.tables);
      const suggestedName = this.generateDomainName(businessConcepts, cluster.tables);
      const description = this.generateDomainDescription(businessConcepts, cluster.tables.length);

      return {
        ...cluster,
        name: suggestedName,
        description,
        businessConcepts
      };
    });
  }

  /**
   * Extract business concepts from table names
   */
  private extractBusinessConcepts(tables: TableData[]): string[] {
    const concepts = new Map<string, number>();

    // Common business concept patterns
    const businessPatterns = [
      // Financial
      { patterns: ['payment', 'transaction', 'billing', 'invoice', 'checkout'], concept: 'Payments' },
      { patterns: ['donation', 'pledge', 'fund', 'donor', 'giver'], concept: 'Donations' },
      { patterns: ['order', 'cart', 'purchase', 'sale'], concept: 'Orders' },
      
      // Customer/User
      { patterns: ['user', 'customer', 'account', 'profile'], concept: 'Users' },
      { patterns: ['contact', 'person', 'individual'], concept: 'Contacts' },
      
      // Content/Campaign
      { patterns: ['campaign', 'marketing', 'email'], concept: 'Marketing' },
      { patterns: ['opportunity', 'deal', 'lead', 'quote'], concept: 'Sales' },
      
      // System
      { patterns: ['log', 'audit', 'config', 'setting'], concept: 'System' },
      { patterns: ['role', 'permission', 'auth', 'login'], concept: 'Authorization' },
    ];

    tables.forEach(table => {
      const tableName = table.name.toLowerCase();
      
      businessPatterns.forEach(({ patterns, concept }) => {
        const matchCount = patterns.filter(pattern => 
          tableName.includes(pattern) || pattern.includes(tableName.split(/[_\s]/)[0])
        ).length;
        
        if (matchCount > 0) {
          concepts.set(concept, (concepts.get(concept) || 0) + matchCount);
        }
      });
    });

    // Return concepts sorted by frequency
    return Array.from(concepts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([concept]) => concept)
      .slice(0, 3); // Top 3 concepts
  }

  /**
   * Generate a meaningful domain name from business concepts
   */
  private generateDomainName(concepts: string[], tables: TableData[]): string {
    if (concepts.length === 0) {
      // Fallback to table name analysis
      const tableNames = tables.map(t => t.name);
      const commonWords = this.findCommonWords(tableNames);
      return commonWords.length > 0 ? 
        `${commonWords[0]} Management` : 
        `Domain ${Math.random().toString(36).substr(2, 5)}`;
    }

    // Generate name based on top concepts
    if (concepts.length === 1) {
      return `${concepts[0]} Management`;
    } else if (concepts.length === 2) {
      return `${concepts[0]} & ${concepts[1]}`;
    } else {
      return `${concepts[0]}, ${concepts[1]} & ${concepts[2]}`;
    }
  }

  /**
   * Generate domain description
   */
  private generateDomainDescription(concepts: string[], tableCount: number): string {
    if (concepts.length === 0) {
      return `Business domain with ${tableCount} related tables`;
    }

    const conceptList = concepts.slice(0, 2).join(' and ');
    return `Business domain focused on ${conceptList} with ${tableCount} interconnected tables`;
  }

  /**
   * Find common words in table names
   */
  private findCommonWords(tableNames: string[]): string[] {
    const wordFreq = new Map<string, number>();
    
    tableNames.forEach(name => {
      const words = name.split(/[_\s]+/).filter(word => word.length > 2);
      words.forEach(word => {
        const lowerWord = word.toLowerCase();
        wordFreq.set(lowerWord, (wordFreq.get(lowerWord) || 0) + 1);
      });
    });

    return Array.from(wordFreq.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, 3);
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
}

// Export singleton instance
export const domainAnalyzer = new DomainAnalyzer();