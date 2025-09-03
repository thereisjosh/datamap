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
      const businessConcepts = this.extractStructuralConcepts(cluster.tables);
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
  private extractStructuralConcepts(tables: TableData[]): string[] {
    const concepts = new Map<string, number>();

    // Extract concepts algorithmically based on table structure and naming
    tables.forEach(table => {
      const structuralType = this.analyzeTableStructure(table);
      const primaryConcept = this.extractPrimaryConcept(table.name);
      
      // Add structural type as concept
      if (structuralType) {
        concepts.set(structuralType, (concepts.get(structuralType) || 0) + 1);
      }
      
      // Add primary table concept for domain naming
      if (primaryConcept && primaryConcept.length > 2) {
        concepts.set(primaryConcept, (concepts.get(primaryConcept) || 0) + 0.5);
      }
    });

    // Return concepts sorted by frequency
    return Array.from(concepts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([concept]) => concept)
      .slice(0, 3); // Top 3 concepts
  }

  /**
   * Analyze table structure algorithmically to determine its architectural role
   */
  private analyzeTableStructure(table: TableData): string {
    const name = table.name.toLowerCase();
    const columns = table.columns || [];
    
    // Algorithmic analysis based on naming patterns and structure
    
    // 1. Junction/relationship tables (compound names or multiple FK-like columns)
    if (this.isCompoundTableName(name) || this.hasMultipleForeignKeyLikeColumns(columns)) {
      return 'Relational';
    }
    
    // 2. Audit/logging tables (time-based fields and user tracking)
    if (this.hasAuditingStructure(columns, name)) {
      return 'Audit';
    }
    
    // 3. Reference/lookup tables (small, descriptive, enum-like)
    if (this.hasReferenceStructure(columns, name)) {
      return 'Reference';
    }
    
    // 4. Identity/access tables (user-related fields and auth patterns)
    if (this.hasIdentityStructure(columns, name)) {
      return 'Identity';
    }
    
    // 5. Transaction-like tables (amount/value fields with timestamps)
    if (this.hasTransactionalStructure(columns, name)) {
      return 'Transactional';
    }
    
    // 6. Content/media tables (blob fields or file-related columns)
    if (this.hasContentStructure(columns, name)) {
      return 'Content';
    }
    
    // 7. Communication tables (message-like structure)
    if (this.hasCommunicationStructure(columns, name)) {
      return 'Communication';
    }
    
    // 8. Configuration tables (key-value or settings structure)
    if (this.hasConfigurationStructure(columns, name)) {
      return 'Configuration';
    }
    
    // Default: Primary entity based on extracted concept
    return this.extractPrimaryConcept(name);
  }

  // Algorithmic structure detection methods
  private isCompoundTableName(name: string): boolean {
    // Detects compound names like "user_role", "ProductCategory", etc.
    return /^[a-z]+[_][a-z]+$/.test(name) || 
           /^[a-z]+[A-Z][a-z]+[A-Z][a-z]+/.test(name) ||
           name.split('_').length > 2;
  }

  private hasMultipleForeignKeyLikeColumns(columns: any[]): boolean {
    const idColumns = columns.filter(col => 
      col.name.toLowerCase().endsWith('_id') || 
      col.name.toLowerCase().endsWith('id')
    );
    return idColumns.length >= 2;
  }

  private hasAuditingStructure(columns: any[], name: string): boolean {
    const auditIndicators = columns.filter(col => {
      const colName = col.name.toLowerCase();
      return colName.includes('created') || colName.includes('modified') || 
             colName.includes('updated') || colName.includes('deleted') ||
             colName.includes('timestamp') || colName.includes('date');
    });
    
    const userTrackingFields = columns.filter(col => {
      const colName = col.name.toLowerCase();
      return colName.includes('by') && (colName.includes('created') || colName.includes('modified'));
    });
    
    return auditIndicators.length >= 2 || userTrackingFields.length >= 1 || 
           /log|audit|history|track/.test(name);
  }

  private hasReferenceStructure(columns: any[], name: string): boolean {
    // Small tables with descriptive fields
    const hasDescriptiveFields = columns.some(col => 
      /name|description|label|title/.test(col.name.toLowerCase())
    );
    
    const isSmallTable = columns.length <= 5;
    const hasEnumLikeName = /status|type|category|kind|class/.test(name);
    
    return (isSmallTable && hasDescriptiveFields) || hasEnumLikeName;
  }

  private hasIdentityStructure(columns: any[], tableConnectivity: number): boolean {
    // Pure mathematical statistical analysis - no pattern matching
    if (columns.length === 0) return false;
    
    // Statistical constraint analysis
    const uniqueRatio = columns.filter(col => col.unique).length / columns.length;
    const nullableRatio = columns.filter(col => col.nullable).length / columns.length;
    const primaryKeyCount = columns.filter(col => col.isPrimaryKey).length;
    
    // Connectivity statistical analysis
    const connectivityScore = Math.min(tableConnectivity / 10, 1.0); // Normalize to 0-1
    const lowConnectivity = connectivityScore < 0.3;
    
    // Mathematical identity probability calculation
    const constraintDensity = (uniqueRatio * 0.4) + ((1 - nullableRatio) * 0.3) + (primaryKeyCount > 0 ? 0.3 : 0);
    const identityProbability = constraintDensity * (lowConnectivity ? 1.2 : 0.8);
    
    return identityProbability > 0.6;
  }

  private hasTransactionalStructure(columns: any[], tableConnectivity: number): boolean {
    // Pure mathematical statistical analysis - no type name matching
    if (columns.length === 0) return false;
    
    // Statistical column diversity analysis
    const columnCount = columns.length;
    const foreignKeyRatio = columns.filter(col => col.isForeignKey).length / columnCount;
    const primaryKeyCount = columns.filter(col => col.isPrimaryKey).length;
    const nullableRatio = columns.filter(col => col.nullable).length / columnCount;
    const uniqueRatio = columns.filter(col => col.unique).length / columnCount;
    
    // Connectivity-based analysis
    const normalizedConnectivity = Math.min(tableConnectivity / 8, 1.0); // Normalize to 0-1
    const moderateConnectivity = normalizedConnectivity >= 0.25 && normalizedConnectivity <= 0.75;
    
    // Mathematical transactional probability
    const structuralComplexity = (foreignKeyRatio * 0.3) + 
                               ((1 - nullableRatio) * 0.2) + 
                               (uniqueRatio * 0.2) + 
                               (primaryKeyCount === 1 ? 0.3 : 0);
    
    const transactionalProbability = structuralComplexity * (moderateConnectivity ? 1.1 : 0.9);
    
    return transactionalProbability > 0.5 && columnCount >= 4;
  }

  private hasContentStructure(columns: any[], tableConnectivity: number): boolean {
    // Pure mathematical statistical analysis - no type name or length assumptions
    if (columns.length === 0) return false;
    
    // Statistical column analysis
    const columnCount = columns.length;
    const nullableRatio = columns.filter(col => col.nullable).length / columnCount;
    const constrainedRatio = columns.filter(col => col.unique || !col.nullable).length / columnCount;
    const primaryKeyCount = columns.filter(col => col.isPrimaryKey).length;
    const foreignKeyRatio = columns.filter(col => col.isForeignKey).length / columnCount;
    
    // Connectivity statistical analysis
    const normalizedConnectivity = Math.min(tableConnectivity / 6, 1.0);
    const lowToModerateConnectivity = normalizedConnectivity >= 0.1 && normalizedConnectivity <= 0.5;
    
    // Mathematical content storage probability
    // Tables with diverse constraints and moderate size often store content
    const structuralDiversity = (nullableRatio * 0.3) + 
                               (constrainedRatio * 0.2) + 
                               (foreignKeyRatio < 0.3 ? 0.3 : 0) + 
                               (columnCount >= 5 && columnCount <= 15 ? 0.2 : 0);
    
    const contentProbability = structuralDiversity * (lowToModerateConnectivity ? 1.1 : 0.9);
    
    return contentProbability > 0.6;
  }

  private hasCommunicationStructure(columns: any[], name: string): boolean {
    const messageFields = columns.filter(col => {
      const colName = col.name.toLowerCase();
      return colName.includes('message') || colName.includes('subject') || 
             colName.includes('body') || colName.includes('content') ||
             colName.includes('sender') || colName.includes('recipient');
    });
    
    return messageFields.length >= 2 || /message|mail|notification|chat|communication/.test(name);
  }

  private hasConfigurationStructure(columns: any[], name: string): boolean {
    const configFields = columns.filter(col => {
      const colName = col.name.toLowerCase();
      return colName.includes('key') || colName.includes('value') || 
             colName.includes('setting') || colName.includes('config') ||
             colName.includes('parameter') || colName.includes('option');
    });
    
    return configFields.length >= 2 || /config|setting|parameter|preference/.test(name);
  }

  /**
   * Extract primary concept from table name for domain identification
   */
  private extractPrimaryConcept(tableName: string): string {
    const name = tableName.toLowerCase();
    
    // Remove common prefixes/suffixes
    const cleanName = name
      .replace(/^(tbl_|table_|tb_)/, '')
      .replace(/(_tbl|_table|_tb)$/, '')
      .replace(/(_log|_audit|_history)$/, '')
      .replace(/(_status|_type|_ref)$/, '');
    
    // Split camelCase and get primary word
    const words = cleanName.replace(/([A-Z])/g, ' $1').trim()
      .toLowerCase().split(/[\s_]+/).filter(word => word.length > 2);
    
    const primaryWord = words[0] || cleanName;
    return primaryWord.charAt(0).toUpperCase() + primaryWord.slice(1);
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