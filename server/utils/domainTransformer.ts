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
  
  // Add critical cross-domain ghost tables if context is available
  if (allTables && allClusters) {
    const criticalRefs = findCriticalExternalReferences(tables, allTables, allClusters);
    
    console.log(`\n👻 Ghost Table Analysis for ${cluster.clusterName || cluster.clusterId}:`);
    console.log(`  Found ${criticalRefs.length} critical cross-domain references:`);
    criticalRefs.forEach(ref => {
      console.log(`    → ${ref.sourceTable} --FK--> ${ref.targetTable} (${ref.targetDomain}, importance: ${ref.importance})`);
    });
    console.log(`🐛 [DEBUG] Domain references will use frontend-compatible IDs (domain_1, domain_2, etc.)`);
    
    if (criticalRefs.length > 0) {
      diagram += `\n  %% Ghost Tables (Cross-Domain References)\n`;
      
      const addedGhostTables = new Set<string>();
      criticalRefs.forEach(ref => {
        if (!addedGhostTables.has(ref.targetTable)) {
          const sanitizedTarget = sanitizeTableName(ref.targetTable);
          
          // Add ghost table with minimal structure - header only, no metadata columns
          diagram += `  ${sanitizedTarget} {\n`;
          diagram += `    id string PK\n`;
          diagram += `  }\n`;
          
          // Store ghost table metadata for frontend detection (not as table columns)
          diagram += `  %% GHOST-META: ${sanitizedTarget} -> ${ref.targetDomain}\n`;
          
          addedGhostTables.add(ref.targetTable);
          
          console.log(`  👻 Added ghost table: ${ref.targetTable} (importance: ${ref.importance}, domain: ${ref.targetDomain})`);
        }
      });
      
      // Add class definitions and styling (valid Mermaid ER syntax with hex colors)
      diagram += `\n  %% Ghost Table Class Definition\n`;
      diagram += `  classDef ghostTable fill:#e5e7eb,stroke:#9ca3af,stroke-width:2px,color:#6b7280\n`;
      
      // Apply ghost class to all ghost tables (individual applications for Mermaid compatibility)
      const ghostTableNames = Array.from(addedGhostTables);
      console.log(`🐛 [DEBUG] Generated ${ghostTableNames.length} ghost tables: [${ghostTableNames.join(', ')}]`);
      
      if (ghostTableNames.length > 0) {
        const sanitizedGhostNames = ghostTableNames.map(name => sanitizeTableName(name));
        // Apply class to each table individually (more reliable than bulk assignment)
        sanitizedGhostNames.forEach(tableName => {
          const classApplication = `  class ${tableName} ghostTable\n`;
          diagram += classApplication;
          console.log(`🐛 [DEBUG] Applied ghost class to: ${tableName}`);
        });
      }
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
  
  // Add relationships to ghost tables (using solid lines for compatibility)
  if (allTables && allClusters) {
    const criticalRefs = findCriticalExternalReferences(tables, allTables, allClusters);
    console.log(`🐛 [DEBUG] Adding ${criticalRefs.length} ghost table relationships...`);
    
    criticalRefs.forEach(ref => {
      const sanitizedSource = sanitizeTableName(ref.sourceTable);
      const sanitizedTarget = sanitizeTableName(ref.targetTable);
      const sanitizedColumn = sanitizeTableName(ref.fkColumn);
      
      // Use solid line syntax for ghost relationships (dotted may not be supported)
      const ghostRelationship = `  ${sanitizedSource} }o--|| ${sanitizedTarget} : "External: ${sanitizedColumn}"\n`;
      diagram += ghostRelationship;
      console.log(`🐛 [DEBUG] Added ghost relationship: ${sanitizedSource} -> ${sanitizedTarget}`);
    });
  }
  
  // Comprehensive Mermaid syntax validation before returning
  console.log(`🔍 Validating Mermaid syntax for ${cluster.clusterName || cluster.clusterId}...`);
  
  // Count expected elements
  const expectedTableCount = tables.length;
  const expectedGhostCount = allTables && allClusters ? 
    findCriticalExternalReferences(tables, allTables, allClusters).reduce((acc, ref) => {
      if (!acc.has(ref.targetTable)) {
        acc.add(ref.targetTable);
      }
      return acc;
    }, new Set()).size : 0;
  
  // Validate diagram structure
  const tableMatches = diagram.match(/^\s*\w+\s*\{/gm) || [];
  const relationshipMatches = diagram.match(/^\s*\w+\s*}o--\|\|\s*\w+/gm) || [];
  const classDefMatches = diagram.match(/^\s*classDef\s+/gm) || [];
  const classApplyMatches = diagram.match(/^\s*class\s+\w+\s+\w+/gm) || [];
  
  console.log(`🐛 [DEBUG] Mermaid validation results:`);
  console.log(`  📊 Expected: ${expectedTableCount} regular + ${expectedGhostCount} ghost = ${expectedTableCount + expectedGhostCount} total tables`);
  console.log(`  📊 Found: ${tableMatches.length} table definitions`);
  console.log(`  🔗 Found: ${relationshipMatches.length} relationships`);
  console.log(`  🎨 Found: ${classDefMatches.length} class definitions, ${classApplyMatches.length} class applications`);
  
  // Check for common syntax issues
  const issues: string[] = [];
  
  if (diagram.includes('[') || diagram.includes(']')) {
    issues.push('Contains square brackets (potential syntax issue)');
  }
  
  if (diagram.includes('rgba(')) {
    issues.push('Contains rgba() colors (use hex instead)');
  }
  
  if (diagram.includes('}o..o|')) {
    issues.push('Contains dotted relationships (may not be supported)');
  }
  
  if (tableMatches.length !== expectedTableCount + expectedGhostCount) {
    issues.push(`Table count mismatch: expected ${expectedTableCount + expectedGhostCount}, found ${tableMatches.length}`);
  }
  
  if (issues.length > 0) {
    console.warn(`⚠️ Mermaid syntax issues found:`);
    issues.forEach(issue => console.warn(`  - ${issue}`));
  } else {
    console.log(`✅ Mermaid syntax validation passed`);
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
            
            // Find the domain index for this cluster to match frontend domain IDs
            const targetClusterIndex = allClusters.findIndex(c => c.clusterId === targetCluster.clusterId);
            const targetDomainId = targetClusterIndex >= 0 ? `domain_${targetClusterIndex + 1}` : (targetCluster.clusterName || targetCluster.clusterId);
            
            criticalRefs.push({
              sourceTable: table.name,
              targetTable: targetTable,
              targetDomain: targetDomainId,
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