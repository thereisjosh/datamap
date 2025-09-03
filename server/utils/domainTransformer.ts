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
      diagram: generateDomainDiagram(domainTables, domainRelationships, cluster),
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
 * Generate domain-specific diagram
 */
function generateDomainDiagram(
  tables: TableData[],
  relationships: Relationship[],
  cluster: HybridCluster
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
 * Sanitize table/column names for Mermaid
 */
function sanitizeTableName(name: string): string {
  if (!name) return 'Unknown';
  
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
  }
  
  return sanitized;
}