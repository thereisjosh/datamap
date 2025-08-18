import { type TableData, type Relationship } from '@shared/schema';
import { domainAnalyzer, type TableCluster } from './domainAnalyzer';
import { advancedDomainAnalyzer, type AdvancedTableCluster } from './advancedDomainAnalyzer';

interface MermaidOptions {
  theme?: string;
  direction?: string;
  maxTables?: number;
  maxRelationships?: number;
  domain?: string;
}

interface MermaidResponse {
  diagram: string;
  displayName?: string;
  metadata: {
    tables_count: number;
    relationships_count: number;
    domain?: string;
  };
}

interface DomainConfig {
  id: string;
  name: string;
  tablePatterns: string[];
  maxTables: number;
  maxRelationships: number;
  priority: number;
  color: string;
  description: string;
}


export class MermaidGeneratorService {

  // Domain configurations following big tech ERD practices - business capability focused
  private domainConfigs: DomainConfig[] = [
    {
      id: 'user-management',
      name: 'User Management',
      description: 'Identity, authentication, roles, and permissions',
      tablePatterns: ['User', 'Role', 'Group', 'Permission', 'Login'],
      maxTables: 30,
      maxRelationships: 60,
      priority: 1,
      color: ''
    },
    {
      id: 'donations-payments',
      name: 'Donations & Payments',
      description: 'Complete donation ecosystem: giving, payments, claims, receipts',
      tablePatterns: [
        'Donation', 'Giver', 'Pledge', 'Fund', 'Donor',
        'Payment', 'Transaction', 'Invoice', 'Billing',
        'ClaimTDR', 'TaxDeductible', 'Receipt'
      ],
      maxTables: 50,
      maxRelationships: 100,
      priority: 2,
      color: ''
    },
    {
      id: 'opportunities',
      name: 'Opportunities',
      description: 'Sales pipeline, deals, quotes, and lead management',
      tablePatterns: ['Opportunity', 'Deal', 'Quote', 'Lead'],
      maxTables: 40,
      maxRelationships: 80,
      priority: 3,
      color: ''
    },
    {
      id: 'campaigns',
      name: 'Campaigns & Marketing',
      description: 'Marketing automation, campaigns, and customer engagement',
      tablePatterns: ['Campaign', 'Marketing', 'Contact'],
      maxTables: 35,
      maxRelationships: 70,
      priority: 4,
      color: ''
    },
    {
      id: 'system',
      name: 'System & Configuration',
      description: 'Infrastructure, logging, configuration, and system support',
      tablePatterns: ['Log', 'SSO', 'AppVar', 'Configuration', 'Settings'],
      maxTables: 25,
      maxRelationships: 50,
      priority: 5,
      color: ''
    },
    {
      id: 'cross-domain',
      name: 'Cross-Domain Connections',
      description: 'Relationships that span across business domains',
      tablePatterns: [], // Special domain - doesn't match table patterns
      maxTables: 30,
      maxRelationships: 100,
      priority: 6,
      color: ''
    }
  ];

  // Sanitize identifiers for Mermaid syntax
  private sanitizeIdentifier(name: string): string {
    if (!name || name.trim().length === 0) {
      return 'Unknown';
    }
    
    // Replace spaces and special characters with underscores
    let sanitized = name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure it starts with a letter or underscore (not a number)
    if (/^\d/.test(sanitized)) {
      sanitized = `_${sanitized}`;
    }
    
    // Remove consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');
    
    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    
    // Ensure it's not empty after sanitization
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

  // Check if table name partially matches pattern (for flexible domain matching)
  private isPartialTableMatch(tableName: string, pattern: string): boolean {
    // Direct matching without physical name prefix handling since we use logical names only
    const tableNameLower = tableName.toLowerCase();
    const patternLower = pattern.toLowerCase();
    
    // Check if pattern is contained in table name or vice versa
    if (tableNameLower.includes(patternLower) || patternLower.includes(tableNameLower)) {
      return true;
    }
    
    // Check for word-based matching (split by underscores)
    const tableWords = tableNameLower.split(/[_\s]+/).filter(w => w.length > 2);
    const patternWords = patternLower.split(/[_\s]+/).filter(w => w.length > 2);
    
    // If any significant words match, consider it a partial match
    for (const tableWord of tableWords) {
      for (const patternWord of patternWords) {
        if (tableWord.includes(patternWord) || patternWord.includes(tableWord)) {
          return true;
        }
      }
    }
    
    return false;
  }

  // ADVANCED: Relationship-driven domain grouping with business intelligence
  private groupTablesByRelationships(tables: TableData[], relationships: Relationship[]): { 
    grouped: Record<string, TableData[]>, 
    displayNames: Record<string, string> 
  } {
    console.log(`🔗 Advanced relationship-driven domain discovery for ${tables.length} tables`);
    
    // Use the advanced domain analyzer with Louvain algorithm
    const discoveredDomains = advancedDomainAnalyzer.discoverDomains(tables, relationships);
    
    // Convert to the expected format
    const grouped: Record<string, TableData[]> = {};
    const displayNames: Record<string, string> = {};
    
    discoveredDomains.forEach(domain => {
      grouped[domain.id] = domain.tables;
      displayNames[domain.id] = domain.name; // Store the business-friendly display name
      console.log(`✨ Advanced domain: "${domain.name}" (${domain.tables.length} tables, cohesion: ${domain.cohesionScore.toFixed(2)})`);
      console.log(`   Type: ${domain.businessClassification.domainType} (confidence: ${domain.businessClassification.confidence.toFixed(2)})`);
      
      if (domain.tables.length <= 15) {
        console.log(`   Tables: [${Array.from(domain.tableNames).join(', ')}]`);
      } else {
        const tableList = Array.from(domain.tableNames);
        console.log(`   Tables: [${tableList.slice(0, 8).join(', ')}, ... +${tableList.length - 8} more]`);
      }
    });

    return { grouped, displayNames };
  }

  // LEGACY: Industry-standard domain grouping following DDD bounded context principles
  private groupTablesByDomain(tables: TableData[]): Record<string, TableData[]> {
    console.log(`🏷️ Industry-standard domain grouping for ${tables.length} tables`);
    console.log(`  Following DDD bounded context patterns used by Netflix/Amazon/Google`);
    console.log(`  Table names: ${tables.map(t => t.name).join(', ')}`);
    
    const grouped: Record<string, TableData[]> = {};
    
    // Initialize business capability domains
    this.domainConfigs.forEach(config => {
      grouped[config.id] = [];
    });
    
    // Business-capability-first domain assignment (priority order matters)
    tables.forEach(table => {
      console.log(`\n🏢 Processing table: "${table.name}" for business capability assignment`);
      let assigned = false;
      
      // Sort by priority to ensure business-critical domains get first choice
      const sortedConfigs = [...this.domainConfigs].sort((a, b) => a.priority - b.priority);
      
      for (const config of sortedConfigs) {
        console.log(`  🎯 Checking business domain "${config.name}" (${config.id})`);
        console.log(`    Patterns: [${config.tablePatterns.join(', ')}]`);
        
        const matchesPattern = config.tablePatterns.some(pattern => {
          const tableName = table.name.toLowerCase();
          const patternLower = pattern.toLowerCase();
          
          // More precise matching strategies - prioritize exact word matches
          const exactMatch = table.name === pattern;
          const exactCaseInsensitiveMatch = tableName === patternLower;
          
          // Word boundary matching - pattern appears as whole word or prefix
          const wordBoundaryMatch = new RegExp(`\\b${patternLower}`, 'i').test(tableName) ||
                                   new RegExp(`^${patternLower}`, 'i').test(tableName);
          
          // Legacy broad matching for partial patterns (more restrictive now)
          const partialMatch = this.isPartialTableMatch(tableName, patternLower);
          
          // Prioritize exact matches and word boundaries over partial matches
          const matches = exactMatch || exactCaseInsensitiveMatch || wordBoundaryMatch || 
                         (partialMatch && tableName.length > patternLower.length + 3); // Avoid short partial matches
          
          console.log(`    Pattern "${pattern}" → ${matches ? '✅ MATCH' : '❌ no match'} (exact: ${exactMatch || exactCaseInsensitiveMatch}, word-boundary: ${wordBoundaryMatch}, partial: ${partialMatch})`);
          return matches;
        });
        
        if (matchesPattern) {
          console.log(`  ✅ Business capability match: "${table.name}" → "${config.name}"`);
          grouped[config.id].push(table);
          assigned = true;
          break; // Assign to first matching business capability (priority-based)
        }
      }
      
      // Smart fallback: Analyze table name for better domain assignment
      if (!assigned) {
        const tableLower = table.name.toLowerCase();
        
        // Check for common system/infrastructure patterns
        if (tableLower.includes('log') || tableLower.includes('audit') || 
            tableLower.includes('config') || tableLower.includes('setting') ||
            tableLower.includes('sso') || tableLower.includes('auth')) {
          console.log(`  🏗️ Infrastructure assignment: "${table.name}" → System domain`);
          grouped['system'].push(table);
        }
        // Check for business-related patterns that might indicate opportunities
        else if (tableLower.includes('opportunity') || tableLower.includes('lead') || 
                 tableLower.includes('deal') || tableLower.includes('quote')) {
          console.log(`  🎯 Smart assignment: "${table.name}" → Opportunities domain`);
          grouped['opportunities'].push(table);
        }
        // Check for user/contact patterns
        else if (tableLower.includes('contact') || tableLower.includes('person') || 
                 tableLower.includes('profile')) {
          console.log(`  👤 Smart assignment: "${table.name}" → User Management domain`);
          grouped['user-management'].push(table);
        }
        // Generic tables go to system domain but with less priority
        else {
          console.log(`  🔧 General assignment: "${table.name}" → System domain (fallback)`);
          grouped['system'].push(table);
        }
      }
    });
    
    // Business capability summary following DDD bounded context logging
    console.log('\n🎯 Business Capability Domain Assignment Results:');
    Object.entries(grouped).forEach(([domainId, domainTables]) => {
      const config = this.domainConfigs.find(c => c.id === domainId);
      const domainName = config?.name || domainId;
      console.log(`  📊 ${domainName}: ${domainTables.length} entities`);
      if (domainTables.length > 0) {
        console.log(`    └── [${domainTables.map(t => t.name).join(', ')}]`);
      }
    });
    
    return grouped;
  }


  // Get domain configuration information
  getDomainConfigs(): DomainConfig[] {
    return this.domainConfigs;
  }

  // Detect cross-domain relationships for special styling
  private detectCrossDomainRelationships(
    relationships: Relationship[], 
    tableGroupings: Record<string, TableData[]>
  ): { intraDomain: Relationship[], crossDomain: Relationship[] } {
    const intraDomain: Relationship[] = [];
    const crossDomain: Relationship[] = [];
    
    // Create table to domain mapping for quick lookup
    const tableToDomain = new Map<string, string>();
    Object.entries(tableGroupings).forEach(([domain, tables]) => {
      tables.forEach(table => tableToDomain.set(table.name, domain));
    });
    
    relationships.forEach(rel => {
      const sourceDomain = tableToDomain.get(rel.sourceTable);
      const targetDomain = tableToDomain.get(rel.targetTable);
      
      if (sourceDomain && targetDomain) {
        if (sourceDomain === targetDomain) {
          intraDomain.push(rel);
        } else {
          crossDomain.push(rel);
          console.log(`🔗 Cross-domain relationship detected: ${rel.sourceTable}(${sourceDomain}) → ${rel.targetTable}(${targetDomain})`);
        }
      }
    });
    
    console.log(`📊 Relationship analysis: ${intraDomain.length} intra-domain, ${crossDomain.length} cross-domain`);
    return { intraDomain, crossDomain };
  }

  // Generate domain-specific CSS - COMPLETELY REMOVED ALL STYLING
  generateDomainCSS(domain?: string): string {
    console.log(`🎨 GENERATING CLEAN CSS FOR DOMAIN: ${domain} - ALL STYLING REMOVED`);
    console.log(`  ✅ No entity styling, no relationship styling, no domain colors applied`);
    
    // Return minimal CSS with no diagram styling for completely clean appearance
    return `
/* ✅ COMPLETELY CLEAN: No diagram styling applied - pure structural diagrams only */
.erd-svg-container svg {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
`;
  }

  // Get the most connected tables within a domain
  private getMostConnectedTables(
    tables: TableData[], 
    relationships: Relationship[], 
    maxTables: number
  ): TableData[] {
    console.log(`🔗 getMostConnectedTables called with ${tables.length} tables, max: ${maxTables}`);
    
    if (tables.length <= maxTables) {
      console.log(`  All ${tables.length} tables fit within limit`);
      return tables;
    }
    
    // Count relationships for each table
    const tableRelationshipCounts: Record<string, number> = {};
    const tableMap = new Map(tables.map(t => [t.name, t]));
    const selectedTables = new Set<string>();
    
    // First pass: count relationships and identify connected tables
    relationships.forEach(rel => {
      if (tableMap.has(rel.sourceTable)) {
        tableRelationshipCounts[rel.sourceTable] = (tableRelationshipCounts[rel.sourceTable] || 0) + 1;
      }
      if (tableMap.has(rel.targetTable)) {
        tableRelationshipCounts[rel.targetTable] = (tableRelationshipCounts[rel.targetTable] || 0) + 1;
      }
    });
    
    console.log(`  Relationship counts:`, tableRelationshipCounts);
    
    // Sort by relationship count and take top tables
    const sortedByConnections = Object.entries(tableRelationshipCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([name]) => name);
    
    // Add highly connected tables first
    const highlyConnectedLimit = Math.floor(maxTables * 0.7); // 70% for highly connected
    for (let i = 0; i < Math.min(highlyConnectedLimit, sortedByConnections.length); i++) {
      selectedTables.add(sortedByConnections[i]);
    }
    
    // Second pass: ensure relationship endpoints are included
    relationships.forEach(rel => {
      if (selectedTables.size >= maxTables) return;
      
      // If we have the source table, try to include the target table
      if (selectedTables.has(rel.sourceTable) && tableMap.has(rel.targetTable) && !selectedTables.has(rel.targetTable)) {
        selectedTables.add(rel.targetTable);
        console.log(`  ➕ Added target table "${rel.targetTable}" to complete relationship with "${rel.sourceTable}"`);
      }
      // If we have the target table, try to include the source table  
      else if (selectedTables.has(rel.targetTable) && tableMap.has(rel.sourceTable) && !selectedTables.has(rel.sourceTable)) {
        selectedTables.add(rel.sourceTable);
        console.log(`  ➕ Added source table "${rel.sourceTable}" to complete relationship with "${rel.targetTable}"`);
      }
    });
    
    const result = Array.from(selectedTables).map(name => tableMap.get(name)!).filter(Boolean);
    
    // Add any remaining tables if we don't have enough
    if (result.length < maxTables) {
      const remainingTables = tables.filter(t => !selectedTables.has(t.name));
      result.push(...remainingTables.slice(0, maxTables - result.length));
    }
    
    console.log(`  Selected ${result.length} tables: ${result.map(t => t.name).join(', ')}`);
    return result;
  }

  // Get meaningful relationships between selected tables
  private getMeaningfulRelationships(
    relationships: Relationship[], 
    selectedTables: Set<string>, 
    maxRelationships: number
  ): Relationship[] {
    console.log(`🔍 getMeaningfulRelationships called with:`);
    console.log(`  Input relationships: ${relationships.length}`);
    console.log(`  Selected tables: ${Array.from(selectedTables).join(', ')}`);
    console.log(`  Max relationships: ${maxRelationships}`);
    
    const meaningfulRelationships: Relationship[] = [];
    const processedKeys = new Set<string>();
    
    // Debug: log all relationships
    relationships.forEach((rel, index) => {
      const sourceInTables = selectedTables.has(rel.sourceTable);
      const targetInTables = selectedTables.has(rel.targetTable);
      console.log(`  Rel ${index + 1}: ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn} (source: ${sourceInTables}, target: ${targetInTables})`);
    });
    
    // Sort relationships by importance (you could add more sophisticated logic here)
    const sortedRelationships = relationships.sort((a, b) => {
      // Prioritize relationships between tables in the same domain
      const aInDomain = selectedTables.has(a.sourceTable) && selectedTables.has(a.targetTable);
      const bInDomain = selectedTables.has(b.sourceTable) && selectedTables.has(b.targetTable);
      
      if (aInDomain && !bInDomain) return -1;
      if (!aInDomain && bInDomain) return 1;
      
      return 0;
    });
    
    for (const rel of sortedRelationships) {
      if (meaningfulRelationships.length >= maxRelationships) break;
      
      const relKey = `${rel.sourceTable}-${rel.sourceColumn}-${rel.targetTable}-${rel.targetColumn}`;
      
      if (!processedKeys.has(relKey) && 
          selectedTables.has(rel.sourceTable) && 
          selectedTables.has(rel.targetTable)) {
        meaningfulRelationships.push(rel);
        processedKeys.add(relKey);
        console.log(`  ✅ Added relationship: ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn}`);
      } else {
        console.log(`  ❌ Skipped relationship: ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn} (duplicate: ${processedKeys.has(relKey)}, source in tables: ${selectedTables.has(rel.sourceTable)}, target in tables: ${selectedTables.has(rel.targetTable)})`);
      }
    }
    
    console.log(`🎯 Final meaningful relationships: ${meaningfulRelationships.length}`);
    return meaningfulRelationships;
  }

  generateMermaidDiagram(tables: TableData[], relationships: Relationship[] = [], options: MermaidOptions = {}, precomputedDomainGroups?: Record<string, TableData[]>): MermaidResponse {
    console.log(`🎨 generateMermaidDiagram called for domain: ${options.domain || 'default'}`);
    console.log(`  Input tables: ${tables.length}`);
    console.log(`  Input relationships: ${relationships.length}`);
    
    let diagram = 'erDiagram\n';
    
    // Compute domain groupings once if not provided (for efficiency)
    const groupedTables = precomputedDomainGroups || this.groupTablesByDomain(tables);
    
    // If a specific domain is requested, filter for that domain
    let selectedTables: TableData[];
    let selectedRelationships: Relationship[];
    
    if (options.domain && options.domain !== 'overview') {
      const domainConfig = this.domainConfigs.find(d => d.id === options.domain);
      const isDynamicDomain = !domainConfig && groupedTables[options.domain];
      
      if (options.domain === 'cross-domain') {
        // Special handling for cross-domain connections view with intelligent limiting
        console.log('🔗 Generating Cross-Domain Connections view');
        
        const relationshipAnalysis = this.detectCrossDomainRelationships(relationships, groupedTables);
        
        // Intelligent filtering for cross-domain to prevent "Maximum text size exceeded"
        const maxCrossDomainTables = 20; // Reduced from unlimited to prevent size issues
        const maxCrossDomainRelationships = 30; // Reduced from 100 to prevent size issues
        
        // Prioritize relationships by importance (FK relationships are most important)
        const prioritizedRelationships = relationshipAnalysis.crossDomain
          .sort((a, b) => {
            // Prioritize FK relationships
            const aIsFk = a.sourceColumn.toLowerCase().includes('id') || a.targetColumn.toLowerCase().includes('id');
            const bIsFk = b.sourceColumn.toLowerCase().includes('id') || b.targetColumn.toLowerCase().includes('id');
            if (aIsFk && !bIsFk) return -1;
            if (!aIsFk && bIsFk) return 1;
            return 0;
          })
          .slice(0, maxCrossDomainRelationships);
        
        // Get tables involved in the prioritized cross-domain relationships
        const crossDomainTables = new Set<string>();
        prioritizedRelationships.forEach(rel => {
          crossDomainTables.add(rel.sourceTable);
          crossDomainTables.add(rel.targetTable);
        });
        
        // Limit tables to prevent diagram size issues
        const crossDomainTableArray = Array.from(crossDomainTables).slice(0, maxCrossDomainTables);
        selectedTables = tables.filter(table => crossDomainTableArray.includes(table.name));
        selectedRelationships = prioritizedRelationships;
        
        console.log(`  Found ${relationshipAnalysis.crossDomain.length} total cross-domain relationships`);
        console.log(`  Selected ${selectedRelationships.length} prioritized relationships`);
        console.log(`  Selected ${selectedTables.length} tables involved in cross-domain relationships`);
        
        // Add warning if we had to limit the results
        if (relationshipAnalysis.crossDomain.length > maxCrossDomainRelationships) {
          console.log(`  ⚠️ Limited cross-domain view to ${maxCrossDomainRelationships} most important relationships`);
        }
        
      } else if (domainConfig || isDynamicDomain) {
        const domainId = options.domain!;
        const domainName = domainConfig?.name || domainId;
        
        if (domainConfig) {
          console.log(`🎯 Legacy domain filtering for "${domainId}" with patterns: [${domainConfig.tablePatterns.join(', ')}]`);
        } else {
          console.log(`🎯 Dynamic domain filtering for discovered domain: "${domainId}"`);
        }
        
        // Use precomputed domain groupings for consistency and efficiency
        const domainTables = groupedTables[domainId] || [];
        
        console.log(`🔍 Domain table filtering results for "${domainId}" (using relationship-driven discovery):`);
        console.log(`  Total input tables: ${tables.length}`);
        console.log(`  Tables assigned to domain: ${domainTables.length}`);
        console.log(`  Domain tables: [${domainTables.map(t => t.name).join(', ')}]`);
        
        selectedTables = this.getMostConnectedTables(
          domainTables, 
          relationships, 
          options.maxTables || domainConfig?.maxTables || 50
        );
        
        console.log(`📊 After getMostConnectedTables for "${domainId}":`);
        console.log(`  Selected tables: ${selectedTables.length}/${domainTables.length}`);
        console.log(`  Selected table names: [${selectedTables.map(t => t.name).join(', ')}]`);
        
        const tableNames = new Set(selectedTables.map(t => t.name));
        selectedRelationships = this.getMeaningfulRelationships(
          relationships, 
          tableNames, 
          options.maxRelationships || domainConfig?.maxRelationships || 100
        );
        
        console.log(`🔗 Relationship filtering for "${domainId}":`);
        console.log(`  Selected relationships: ${selectedRelationships.length}`);
      } else {
        // Fallback to overview with increased limits
        console.log('🔄 Domain not found, falling back to general overview');
        selectedTables = this.getMostConnectedTables(tables, relationships, options.maxTables || 15);
        const tableNames = new Set(selectedTables.map(t => t.name));
        selectedRelationships = this.getMeaningfulRelationships(relationships, tableNames, options.maxRelationships || 30);
      }
    } else {
      // Overview mode - show key tables from all domains
      console.log('📊 Overview mode - selecting key tables from all domains');
      const overviewTables: TableData[] = [];
      
      // Take top tables from each discovered domain (increased from 3 to 8 per domain)
      Object.keys(groupedTables).forEach(domainId => {
        const domainTables = groupedTables[domainId] || [];
        if (domainTables.length > 0) {
          console.log(`  Domain ${domainId}: ${domainTables.length} tables`);
          const topTables = this.getMostConnectedTables(domainTables, relationships, 8);
          console.log(`    Selected ${topTables.length} top tables: ${topTables.map(t => t.name).join(', ')}`);
          overviewTables.push(...topTables);
        }
      });
      
      // If we don't have enough tables from domains, add some from the most connected overall
      if (overviewTables.length < 20 && tables.length > overviewTables.length) {
        console.log('🔄 Adding fallback tables from overall most connected');
        const allSelectedNames = new Set(overviewTables.map(t => t.name));
        const remainingTables = tables.filter(t => !allSelectedNames.has(t.name));
        const additionalTables = this.getMostConnectedTables(remainingTables, relationships, 15);
        console.log(`  Adding ${additionalTables.length} additional tables: ${additionalTables.map(t => t.name).join(', ')}`);
        overviewTables.push(...additionalTables);
      }
      
      console.log(`  Total overview tables before limit: ${overviewTables.length}`);
      // Reduced overview limit to prevent browser overload
      selectedTables = overviewTables.slice(0, options.maxTables || 15);
      console.log(`  Final selected tables: ${selectedTables.length}`);
      console.log(`  Table names: ${selectedTables.map(t => t.name).join(', ')}`);
      
      const tableNames = new Set(selectedTables.map(t => t.name));
      // Reduced relationship limit to prevent browser overload
      selectedRelationships = this.getMeaningfulRelationships(relationships, tableNames, options.maxRelationships || 25);
    }

    // Industry-standard cross-domain relationship detection for enhanced styling
    let groupedTablesForDetection: Record<string, TableData[]> = {};
    if (options.domain && options.domain !== 'overview') {
      // For specific domains, still need all table groupings to detect cross-domain relationships
      groupedTablesForDetection = this.groupTablesByDomain(tables);
    } else {
      // For overview, group the selected tables only
      groupedTablesForDetection = this.groupTablesByDomain(selectedTables);
    }
    
    const relationshipAnalysis = this.detectCrossDomainRelationships(selectedRelationships, groupedTablesForDetection);
    console.log(`🔗 Relationship analysis complete: ${relationshipAnalysis.intraDomain.length} intra-domain, ${relationshipAnalysis.crossDomain.length} cross-domain`);

    // Generate entity definitions
    for (const table of selectedTables) {
      const sanitizedTableName = this.sanitizeIdentifier(table.name);
      diagram += `  ${sanitizedTableName} {\n`;
      
      for (const attribute of table.attributes) {
        let keyIndicator = '';
        if (attribute.isPrimaryKey) {
          keyIndicator = ' PK';
        } else if (attribute.isForeignKey) {
          keyIndicator = ' FK';
        }
        
        const sanitizedAttrName = this.sanitizeIdentifier(attribute.name);
        const sanitizedType = this.sanitizeIdentifier(attribute.type);
        diagram += `    ${sanitizedAttrName} ${sanitizedType}${keyIndicator}\n`;
      }
      
      diagram += '  }\n';
    }

    // Add an empty line before relationships
    if (selectedRelationships.length > 0) {
      diagram += '\n';
    }

    // Generate relationships with industry-standard cross-domain styling
    const processedRelationships = new Set<string>();
    
    // Process intra-domain relationships first (primary styling)
    for (const rel of relationshipAnalysis.intraDomain) {
      const relKey = `${rel.sourceTable}-${rel.sourceColumn}-${rel.targetTable}-${rel.targetColumn}`;
      
      if (!processedRelationships.has(relKey)) {
        const sanitizedSourceTable = this.sanitizeIdentifier(rel.sourceTable);
        const sanitizedTargetTable = this.sanitizeIdentifier(rel.targetTable);
        const sanitizedSourceColumn = this.sanitizeIdentifier(rel.sourceColumn);
        
        // Intra-domain relationships use solid lines with domain styling
        diagram += `  ${sanitizedSourceTable} }o--|| ${sanitizedTargetTable} : "FK ${sanitizedSourceColumn}"\n`;
        processedRelationships.add(relKey);
      }
    }
    
    // Process cross-domain relationships (different styling)
    for (const rel of relationshipAnalysis.crossDomain) {
      const relKey = `${rel.sourceTable}-${rel.sourceColumn}-${rel.targetTable}-${rel.targetColumn}`;
      
      if (!processedRelationships.has(relKey)) {
        const sanitizedSourceTable = this.sanitizeIdentifier(rel.sourceTable);
        const sanitizedTargetTable = this.sanitizeIdentifier(rel.targetTable);
        const sanitizedSourceColumn = this.sanitizeIdentifier(rel.sourceColumn);
        
        // Cross-domain relationships will be styled differently via CSS
        diagram += `  ${sanitizedSourceTable} }o--|| ${sanitizedTargetTable} : "Cross-Domain FK ${sanitizedSourceColumn}"\n`;
        processedRelationships.add(relKey);
      }
    }

    const finalDiagram = diagram.trim();
    
    // Validate the generated Mermaid syntax
    const validation = this.validateMermaidSyntax(finalDiagram);
    if (!validation.isValid) {
      console.error(`🚨 Invalid Mermaid syntax generated for domain ${options.domain}:`);
      validation.errors.forEach(error => console.error(`  ❌ ${error}`));
      console.error(`📝 Full diagram length: ${finalDiagram.length} characters`);
      console.error('📝 Generated diagram preview (first 1000 chars):');
      console.error(finalDiagram.substring(0, 1000));
      
      if (finalDiagram.length > 1000) {
        console.error('📝 Last 500 characters:');
        console.error(finalDiagram.substring(finalDiagram.length - 500));
      }
    } else {
      console.log(`✅ Valid Mermaid syntax generated for domain ${options.domain}`);
      console.log(`📊 Diagram stats: ${selectedTables.length} tables, ${processedRelationships.size} relationships`);
      
      // Log diagram preview for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('📝 Generated diagram preview (first 500 chars):');
        console.log(finalDiagram.substring(0, 500) + (finalDiagram.length > 500 ? '...' : ''));
      }
    }

    return {
      diagram: finalDiagram,
      metadata: {
        tables_count: selectedTables.length,
        relationships_count: processedRelationships.size,
        domain: options.domain
      }
    };
  }

  // Generate diagrams for all domains
  generateAllDomainDiagrams(tables: TableData[], relationships: Relationship[] = []): Record<string, MermaidResponse> {
    const runId = Math.random().toString(36).substr(2, 9);
    console.log(`🚀 generateAllDomainDiagrams called with [RUN-${runId}]:`);
    console.log(`  Tables: ${tables.length}`);
    console.log(`  Relationships: ${relationships.length}`);
    console.log(`  Table names: ${tables.map(t => t.name).join(', ')}`);
    
    // Compute domain groupings once for efficiency and consistency
    console.log(`🏷️ [RUN-${runId}] Computing advanced relationship-driven domain groupings once for all diagrams...`);
    const domainData = this.groupTablesByRelationships(tables, relationships);
    const precomputedDomainGroups = domainData.grouped;
    const displayNames = domainData.displayNames;
    
    console.log(`📊 [RUN-${runId}] Domain grouping summary:`);
    Object.entries(precomputedDomainGroups).forEach(([domain, domainTables]) => {
      const displayName = displayNames[domain] || domain;
      console.log(`  ${domain} ("${displayName}"): ${domainTables.length} tables`);
    });
    
    const results: Record<string, MermaidResponse> = {};
    
    // Generate overview
    console.log(`🔄 [RUN-${runId}] Generating overview domain...`);
    const overviewResult = this.generateMermaidDiagram(tables, relationships, { domain: 'overview' }, precomputedDomainGroups);
    results['overview'] = {
      ...overviewResult,
      displayName: 'Overview' // Add display name for overview
    };
    
    // Generate domain-specific diagrams for discovered domains
    Object.keys(precomputedDomainGroups).forEach(domainId => {
      const domainTables = precomputedDomainGroups[domainId];
      if (domainTables.length > 0) {
        const displayName = displayNames[domainId] || domainId;
        console.log(`🔄 [RUN-${runId}] Generating discovered domain: ${domainId} ("${displayName}") (${domainTables.length} tables)...`);
        const domainResult = this.generateMermaidDiagram(tables, relationships, { 
          domain: domainId,
          maxTables: 50, // Reasonable default for discovered domains
          maxRelationships: 100
        }, precomputedDomainGroups);
        
        results[domainId] = {
          ...domainResult,
          displayName: displayName // Add business-friendly display name
        };
      }
    });
    
    console.log(`✅ [RUN-${runId}] Generated ${Object.keys(results).length} domain diagrams`);
    return results;
  }

  validateMermaidSyntax(diagram: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Basic validation checks
    if (!diagram.startsWith('erDiagram')) {
      errors.push('Diagram must start with "erDiagram"');
    }

    // Check for balanced braces (excluding relationship symbols)
    const lines = diagram.split('\n');
    let tableOpenBraces = 0;
    let tableCloseBraces = 0;
    let braceBalance = 0;
    let currentTable = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip relationship lines (contain }o--|| symbols)
      if (line.includes('}o--||') || line.includes('||--{') || line.includes('--')) {
        continue;
      }
      
      // Count opening braces in table definition lines
      if (line.includes('{') && !line.includes('}o--')) {
        currentTable = line.replace('{', '').trim();
        tableOpenBraces++;
        braceBalance++;
      }
      
      // Count closing braces in table definition lines (standalone })
      if (line === '}' || (line.includes('}') && !line.includes('}o--'))) {
        tableCloseBraces++;
        braceBalance--;
        
        if (braceBalance < 0) {
          errors.push(`Extra closing brace found at line ${i + 1}: ${line}`);
        }
      }
    }
    
    if (tableOpenBraces !== tableCloseBraces) {
      errors.push(`Unbalanced table braces: ${tableOpenBraces} opening braces, ${tableCloseBraces} closing braces`);
      
      if (braceBalance > 0) {
        errors.push(`Missing ${braceBalance} closing brace(s). Last table: ${currentTable}`);
      }
    }

    // Check for valid relationship syntax
    const relationshipLines = diagram.split('\n').filter(line => 
      line.includes('--') && (line.includes('}') || line.includes('|'))
    );
    
    for (const line of relationshipLines) {
      if (!line.match(/\s+\w+\s+[}|o]+--[|]+\s+\w+\s*:\s*".*"$/)) {
        errors.push(`Invalid relationship syntax: ${line.trim()}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const mermaidGeneratorService = new MermaidGeneratorService();
