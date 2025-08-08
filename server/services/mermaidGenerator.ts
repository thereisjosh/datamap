import { type TableData, type Relationship } from '@shared/schema';

interface MermaidOptions {
  theme?: string;
  direction?: string;
  maxTables?: number;
  maxRelationships?: number;
  domain?: string;
}

interface MermaidResponse {
  diagram: string;
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
}

export class MermaidGeneratorService {
  // Domain configurations for better organization
  private domainConfigs: DomainConfig[] = [
    {
      id: 'user-management',
      name: 'User Management',
      tablePatterns: ['User', 'Role', 'Group', 'Permission', 'Login'],
      maxTables: 30,
      maxRelationships: 60,
      priority: 1
    },
    {
      id: 'opportunities',
      name: 'Opportunities',
      tablePatterns: ['Opportunity', 'Deal', 'Quote', 'Lead'],
      maxTables: 40,
      maxRelationships: 80,
      priority: 2
    },
    {
      id: 'campaigns',
      name: 'Active Campaign',
      tablePatterns: ['ActiveCampaignContact', 'BulkImport', 'FieldConfig'],
      maxTables: 30,
      maxRelationships: 60,
      priority: 3
    },
    {
      id: 'system',
      name: 'System & Configuration',
      tablePatterns: ['Log', 'SSO', 'AppVar', 'ConsentFile', 'Article', 'Campaign', 'EntityGroup'],
      maxTables: 25,
      maxRelationships: 50,
      priority: 4
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

  // Group tables by domain
  private groupTablesByDomain(tables: TableData[]): Record<string, TableData[]> {
    console.log(`🏷️ groupTablesByDomain called with ${tables.length} tables`);
    console.log(`  Table names: ${tables.map(t => t.name).join(', ')}`);
    
    const grouped: Record<string, TableData[]> = {};
    
    // Initialize groups
    this.domainConfigs.forEach(config => {
      grouped[config.id] = [];
    });
    
    // Group tables by domain patterns
    tables.forEach(table => {
      console.log(`\n🔍 Processing table: "${table.name}"`);
      let assigned = false;
      
      for (const config of this.domainConfigs) {
        console.log(`  Checking domain "${config.id}" with patterns: [${config.tablePatterns.join(', ')}]`);
        
        const matchesPattern = config.tablePatterns.some(pattern => {
          const tableName = table.name.toLowerCase();
          const patternLower = pattern.toLowerCase();
          
          // Try multiple matching strategies
          const exactMatch = table.name.includes(pattern);
          const caseInsensitiveMatch = tableName.includes(patternLower);
          const partialMatch = this.isPartialTableMatch(tableName, patternLower);
          
          const matches = exactMatch || caseInsensitiveMatch || partialMatch;
          
          console.log(`    Pattern "${pattern}" → ${matches ? '✅ MATCH' : '❌ no match'} (exact: ${exactMatch}, case-insensitive: ${caseInsensitiveMatch}, partial: ${partialMatch})`);
          return matches;
        });
        
        if (matchesPattern) {
          console.log(`  ✅ Assigned "${table.name}" to domain "${config.id}"`);
          grouped[config.id].push(table);
          assigned = true;
          break; // Assign to first matching domain
        }
      }
      
      // If no domain matches, assign to system
      if (!assigned) {
        console.log(`  ⚠️ No domain match for "${table.name}" - assigned to system domain`);
        grouped['system'].push(table);
      }
    });
    
    // Summary logging
    console.log('\n📊 Domain grouping results:');
    Object.entries(grouped).forEach(([domain, domainTables]) => {
      console.log(`  ${domain}: ${domainTables.length} tables [${domainTables.map(t => t.name).join(', ')}]`);
    });
    
    return grouped;
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

  generateMermaidDiagram(tables: TableData[], relationships: Relationship[] = [], options: MermaidOptions = {}): MermaidResponse {
    console.log(`🎨 generateMermaidDiagram called for domain: ${options.domain || 'default'}`);
    console.log(`  Input tables: ${tables.length}`);
    console.log(`  Input relationships: ${relationships.length}`);
    
    let diagram = 'erDiagram\n';
    
    // If a specific domain is requested, filter for that domain
    let selectedTables: TableData[];
    let selectedRelationships: Relationship[];
    
    if (options.domain && options.domain !== 'overview') {
      const domainConfig = this.domainConfigs.find(d => d.id === options.domain);
      if (domainConfig) {
        const domainTables = tables.filter(table => 
          domainConfig.tablePatterns.some(pattern => table.name.includes(pattern))
        );
        selectedTables = this.getMostConnectedTables(
          domainTables, 
          relationships, 
          options.maxTables || domainConfig.maxTables
        );
        const tableNames = new Set(selectedTables.map(t => t.name));
        selectedRelationships = this.getMeaningfulRelationships(
          relationships, 
          tableNames, 
          options.maxRelationships || domainConfig.maxRelationships
        );
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
      const groupedTables = this.groupTablesByDomain(tables);
      const overviewTables: TableData[] = [];
      
      // Take top tables from each domain (increased from 3 to 8 per domain)
      this.domainConfigs.forEach(config => {
        const domainTables = groupedTables[config.id] || [];
        console.log(`  Domain ${config.id}: ${domainTables.length} tables`);
        const topTables = this.getMostConnectedTables(domainTables, relationships, 8);
        console.log(`    Selected ${topTables.length} top tables: ${topTables.map(t => t.name).join(', ')}`);
        overviewTables.push(...topTables);
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

    // Generate relationships
    const processedRelationships = new Set<string>();
    
    for (const rel of selectedRelationships) {
      // Create a unique key for this relationship to avoid duplicates
      const relKey = `${rel.sourceTable}-${rel.sourceColumn}-${rel.targetTable}-${rel.targetColumn}`;
      
      if (!processedRelationships.has(relKey)) {
        // Sanitize table names for relationships
        const sanitizedSourceTable = this.sanitizeIdentifier(rel.sourceTable);
        const sanitizedTargetTable = this.sanitizeIdentifier(rel.targetTable);
        const sanitizedSourceColumn = this.sanitizeIdentifier(rel.sourceColumn);
        
        // Use proper Mermaid relationship syntax
        // }o--|| means zero or one to one or more  
        diagram += `  ${sanitizedSourceTable} }o--|| ${sanitizedTargetTable} : "FK ${sanitizedSourceColumn}"\n`;
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
        domain: options.domain,
        isValid: validation.isValid,
        validationErrors: validation.errors
      }
    };
  }

  // Generate diagrams for all domains
  generateAllDomainDiagrams(tables: TableData[], relationships: Relationship[] = []): Record<string, MermaidResponse> {
    console.log(`🚀 generateAllDomainDiagrams called with:`);
    console.log(`  Tables: ${tables.length}`);
    console.log(`  Relationships: ${relationships.length}`);
    
    const results: Record<string, MermaidResponse> = {};
    
    // Generate overview
    console.log('🔄 Generating overview domain...');
    results['overview'] = this.generateMermaidDiagram(tables, relationships, { domain: 'overview' });
    
    // Generate domain-specific diagrams
    this.domainConfigs.forEach(config => {
      console.log(`🔄 Generating ${config.id} domain...`);
      results[config.id] = this.generateMermaidDiagram(tables, relationships, { 
        domain: config.id,
        maxTables: config.maxTables,
        maxRelationships: config.maxRelationships
      });
    });
    
    console.log(`✅ Generated ${Object.keys(results).length} domain diagrams`);
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
