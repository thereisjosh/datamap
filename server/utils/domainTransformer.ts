import type { TableData, Relationship } from '@shared/schema';

// Local interface definition (previously imported from hybridClusteringEngine)
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
  junctionTables?: string[];
  containerDetections?: any[];
  // LLM Enhancement metadata
  llmMetadata?: {
    description: string;
    confidence: number;
    reasoning: string;
  };
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

interface MermaidResponse {
  diagram: string;
  displayName?: string;
  metadata: {
    tables_count: number;
    relationships_count: number;
    domain?: string;
  };
  
  // AI Enhancement properties
  aiEnhanced?: boolean;
  confidenceScore?: number;
  businessMetrics?: {
    completeness: number;
    independence: number;
    usability: number;
  };
}

/**
 * Transform hybrid clustering results to frontend domain format
 */
export function transformHybridClustersToDomainsResponse(
  clusters: HybridCluster[],
  allTables: TableData[],
  allRelationships: Relationship[]
): Record<string, MermaidResponse> {
  const results: Record<string, MermaidResponse> = {};
  
  // Create a map for quick table lookup
  const tableMap = new Map(allTables.map(t => [t.name, t]));
  
  // Add overview domain
  results['overview'] = {
    diagram: generateOverviewDiagram(allTables, allRelationships),
    displayName: 'Overview',
    metadata: {
      tables_count: allTables.length,
      relationships_count: allRelationships.length,
      domain: 'overview'
    }
  };
  
  // Convert each cluster to a domain
  clusters.forEach((cluster, index) => {
    const domainId = `domain_${index + 1}`;
    const domainTables = cluster.tables.map(tableName => tableMap.get(tableName)).filter(Boolean) as TableData[];
    
    // CORRECTED: Only include intra-domain relationships for clean domain isolation
    const domainRelationships = filterRelationshipsForTables(allRelationships, cluster.tables);
    
    results[domainId] = {
      diagram: generateDomainDiagram(domainTables, domainRelationships, cluster, allTables, clusters),
      displayName: cluster.clusterName || `${cluster.businessDomain} (${cluster.coreTable})`,
      metadata: {
        tables_count: domainTables.length,
        relationships_count: domainRelationships.length,
        domain: domainId
      },
      aiEnhanced: true,
      confidenceScore: cluster.confidenceScore,
      businessMetrics: {
        completeness: cluster.validationResults?.completenessScore || 0,
        independence: cluster.isolationScore || 0,
        usability: cluster.coherenceScore || 0
      }
    };
  });
  
  return results;
}

/**
 * Get relevant relationships for a domain - includes both intra-domain and cross-domain relationships
 * This preserves FK connections that were being lost in the original filtering
 */
function getRelevantRelationshipsForDomain(
  relationships: Relationship[],
  domainTableNames: string[]
): Relationship[] {
  const tableSet = new Set(domainTableNames);
  
  return relationships.filter(rel => {
    // Include relationships where at least one table is in this domain
    // This captures both intra-domain (both tables in domain) and cross-domain (one table in domain) relationships
    return tableSet.has(rel.sourceTable) || tableSet.has(rel.targetTable);
  });
}

/**
 * DEPRECATED: Filter relationships to only include those between specified tables
 * This was causing the data loss issue - keeping for backward compatibility if needed
 */
function filterRelationshipsForTables(
  relationships: Relationship[],
  tableNames: string[]
): Relationship[] {
  const tableSet = new Set(tableNames);
  return relationships.filter(rel => 
    tableSet.has(rel.sourceTable) && tableSet.has(rel.targetTable)
  );
}

/**
 * Generate overview diagram showing all domains
 */
function generateOverviewDiagram(
  tables: TableData[],
  relationships: Relationship[]
): string {
  let diagram = 'erDiagram\n';
  
  // Add tables with their attributes
  tables.forEach(table => {
    const sanitizedName = sanitizeTableName(table.name);
    diagram += `  ${sanitizedName} {\n`;
    
    const attributes = table.attributes || table.columns || [];
    attributes.forEach(attr => {
      const sanitizedAttr = sanitizeTableName(attr.name);
      const sanitizedType = sanitizeTableName(attr.type || 'string');
      let keyIndicator = '';
      
      if (attr.isPrimaryKey) keyIndicator = ' PK';
      else if (attr.isForeignKey) keyIndicator = ' FK';
      
      diagram += `    ${sanitizedAttr} ${sanitizedType}${keyIndicator}\n`;
    });
    
    diagram += '  }\n';
  });
  
  // Add relationships
  const processedRelationships = new Set<string>();
  relationships.forEach(rel => {
    const relKey = `${rel.sourceTable}-${rel.targetTable}`;
    if (!processedRelationships.has(relKey)) {
      const sanitizedSource = sanitizeTableName(rel.sourceTable);
      const sanitizedTarget = sanitizeTableName(rel.targetTable);
      const sanitizedColumn = sanitizeTableName(rel.sourceColumn);
      
      diagram += `  ${sanitizedSource} }o--|| ${sanitizedTarget} : "FK ${sanitizedColumn}"\n`;
      processedRelationships.add(relKey);
    }
  });
  
  return diagram;
}

/**
 * Generate domain-specific diagram with selective ghost tables
 */
function generateDomainDiagram(
  tables: TableData[],
  relationships: Relationship[],
  cluster: HybridCluster,
  allTables?: TableData[],
  allClusters?: HybridCluster[]
): string {
  let diagram = 'erDiagram\n';
  
  // Add tables with their attributes
  const coreTableSet = new Set(cluster.coreTables);
  
  tables.forEach(table => {
    const sanitizedName = sanitizeTableName(table.name);
    const isCore = coreTableSet.has(table.name);
    
    // Add comment to indicate core vs supporting
    if (isCore) {
      diagram += `  %% Core Table\n`;
    }
    
    diagram += `  ${sanitizedName} {\n`;
    
    const attributes = table.attributes || table.columns || [];
    attributes.forEach(attr => {
      const sanitizedAttr = sanitizeTableName(attr.name);
      const sanitizedType = sanitizeTableName(attr.type || 'string');
      let keyIndicator = '';
      
      if (attr.isPrimaryKey) keyIndicator = ' PK';
      else if (attr.isForeignKey) keyIndicator = ' FK';
      
      diagram += `    ${sanitizedAttr} ${sanitizedType}${keyIndicator}\n`;
    });
    
    diagram += '  }\n';
  });
  
  // TEMPORARILY DISABLED: Add critical cross-domain ghost tables if context is available
  if (false && allTables && allClusters) {
    const criticalRefs = findCriticalExternalReferences(tables, allTables, allClusters);
    
    console.log(`\n👻 Ghost Table Analysis for ${cluster.clusterName || cluster.clusterId}:`);
    console.log(`  Found ${criticalRefs.length} critical cross-domain references:`);
    criticalRefs.forEach(ref => {
      console.log(`    → ${ref.sourceTable} --FK--> ${ref.targetTable} (${ref.targetDomain}, importance: ${ref.importance})`);
    });
    
    if (criticalRefs.length > 0) {
      diagram += `\n  %% Ghost Tables (Cross-Domain References)\n`;
      
      const addedGhostTables = new Set<string>();
      criticalRefs.forEach(ref => {
        if (!addedGhostTables.has(ref.targetTable)) {
          const sanitizedTarget = sanitizeTableName(ref.targetTable);
          
          // Add ghost table with minimal structure - just the header
          diagram += `  ${sanitizedTarget} {\n`;
          diagram += `    id string PK "Ghost-Table"\n`;
          diagram += `    navigate string "Click-to-navigate-to-${ref.targetDomain}"\n`;
          diagram += `  }\n`;
          
          addedGhostTables.add(ref.targetTable);
          
          console.log(`  👻 Added ghost table: ${ref.targetTable} (importance: ${ref.importance}, domain: ${ref.targetDomain})`);
        }
      });
    }
  }
  
  // Add relationships (including those to ghost tables)
  const processedRelationships = new Set<string>();
  relationships.forEach(rel => {
    const relKey = `${rel.sourceTable}-${rel.targetTable}`;
    if (!processedRelationships.has(relKey)) {
      const sanitizedSource = sanitizeTableName(rel.sourceTable);
      const sanitizedTarget = sanitizeTableName(rel.targetTable);
      const sanitizedColumn = sanitizeTableName(rel.sourceColumn);
      
      diagram += `  ${sanitizedSource} }o--|| ${sanitizedTarget} : "FK ${sanitizedColumn}"\n`;
      processedRelationships.add(relKey);
    }
  });
  
  // TEMPORARILY DISABLED: Add relationships to ghost tables
  if (false && allTables && allClusters) {
    const criticalRefs = findCriticalExternalReferences(tables, allTables, allClusters);
    criticalRefs.forEach(ref => {
      const sanitizedSource = sanitizeTableName(ref.sourceTable);
      const sanitizedTarget = sanitizeTableName(ref.targetTable);
      const sanitizedColumn = sanitizeTableName(ref.fkColumn);
      
      diagram += `  ${sanitizedSource} }o..o| ${sanitizedTarget} : "FK ${sanitizedColumn} Cross-Domain"\n`;
    });
  }
  
  // Validate Mermaid syntax before returning
  if (diagram.includes('[') || diagram.includes(']')) {
    console.warn(`⚠️ Potential Mermaid syntax issue: diagram contains square brackets`);
  }
  
  console.log(`📋 Generated Mermaid diagram for ${cluster.clusterName || cluster.clusterId} (${diagram.split('\n').length} lines)`);
  
  return diagram;
}

/**
 * Find critical external references for ghost table generation
 */
function findCriticalExternalReferences(
  domainTables: TableData[],
  allTables: TableData[],
  allClusters: HybridCluster[]
): Array<{
  sourceTable: string;
  targetTable: string;
  targetDomain: string;
  fkColumn: string;
  importance: number;
}> {
  const domainTableNames = new Set(domainTables.map(t => t.name));
  const criticalRefs: Array<{
    sourceTable: string;
    targetTable: string;
    targetDomain: string;
    fkColumn: string;
    importance: number;
  }> = [];

  // Build cluster lookup map
  const tableToClusterMap = new Map<string, HybridCluster>();
  allClusters.forEach(cluster => {
    cluster.tables.forEach(tableName => {
      tableToClusterMap.set(tableName, cluster);
    });
  });

  // Analyze FK relationships from domain tables to external tables
  domainTables.forEach(table => {
    const attributes = table.attributes || table.columns || [];
    
    attributes.forEach(attr => {
      if (attr.isForeignKey && attr.references) {
        const targetTable = attr.references.table || attr.references.tableName;
        
        // Only include external references (target not in current domain)
        if (targetTable && !domainTableNames.has(targetTable)) {
          const targetCluster = tableToClusterMap.get(targetTable);
          
          if (targetCluster) {
            // Calculate importance based on connectivity
            const importance = calculateTableImportance(targetTable, allTables);
            
            criticalRefs.push({
              sourceTable: table.name,
              targetTable: targetTable,
              targetDomain: targetCluster.clusterName || targetCluster.clusterId,
              fkColumn: attr.name,
              importance: importance
            });
          }
        }
      }
    });
  });

  // Sort by importance and return top 5 most critical references
  return criticalRefs
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
}

/**
 * Calculate table importance based on FK connectivity
 */
function calculateTableImportance(tableName: string, allTables: TableData[]): number {
  let importance = 0;
  
  // Count incoming FK references (how many tables reference this one)
  allTables.forEach(table => {
    const attributes = table.attributes || table.columns || [];
    attributes.forEach(attr => {
      if (attr.isForeignKey && attr.references) {
        const targetTable = attr.references.table || attr.references.tableName;
        if (targetTable === tableName) {
          importance += 1;
        }
      }
    });
  });
  
  // Boost importance for hub tables (tables with many outgoing FKs)
  const targetTable = allTables.find(t => t.name === tableName);
  if (targetTable) {
    const attributes = targetTable.attributes || targetTable.columns || [];
    const outgoingFKs = attributes.filter(attr => attr.isForeignKey).length;
    importance += outgoingFKs * 0.5; // Weight outgoing FKs less than incoming
  }
  
  return importance;
}

/**
 * Sanitize table/column names for Mermaid
 */
function sanitizeTableName(name: string): string {
  if (!name) return 'Unknown';
  
  // Exception list for common hub table names - preserve these exactly to maintain event delegation
  const hubTableExceptions = [
    'Campaign', 'EntityGroup', 'User', 'File', 'Giver', 'PaymentTransaction', 'Opportunity',
    'CampaignDonation', 'CampaignAsset', 'EntityGroupUser', 'EntityGroupAPI', 'EntityGroupAsset'
  ];
  
  if (hubTableExceptions.includes(name)) {
    console.log(`🔧 Preserving hub table name: "${name}" (no sanitization)`);
    return name;
  }
  
  // Replace spaces and special characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  
  // Ensure it starts with a letter
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `Table_${sanitized}`;
  }
  
  if (sanitized.length === 0) {
    sanitized = 'Unknown';
  }
  
  // Ensure it's not a Mermaid reserved word
  const reservedWords = ['erDiagram', 'PK', 'FK', 'int', 'string', 'boolean', 'date'];
  if (reservedWords.includes(sanitized.toLowerCase())) {
    sanitized = `${sanitized}_`;
    console.log(`⚠️ Table name "${name}" conflicts with Mermaid reserved word, sanitized to "${sanitized}"`);
  }
  
  return sanitized;
}