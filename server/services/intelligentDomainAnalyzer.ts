import { type TableData, type Relationship } from '@shared/schema';
import { llmService } from './llmService';
import { businessRuleEngine, type BusinessDomainClassification, type BusinessDomainType } from './businessRuleEngine';

/**
 * Enhanced table analysis with AI-powered semantic understanding
 */
export interface TableDomainAnalysis {
  tableName: string;
  primaryPurpose: string;
  businessDomains: string[];
  domainContexts: Map<string, {
    relevanceScore: number;        // 0.0-1.0
    contextualRole: string;        // "Serves as donor profiles"
    reasoning: string;             // "Contains donor info needed for donations"
    relevantColumns: string[];     // Columns relevant to this domain
  }>;
  confidence: number;              // Overall analysis confidence
  suggestedColumns: Map<string, string[]>; // domain -> relevant columns
  isJunctionTable: boolean;        // Detected as junction/bridge table
  junctionAnalysis?: JunctionTableAnalysis;
}

/**
 * Specialized analysis for junction tables
 */
export interface JunctionTableAnalysis {
  connectedDomains: string[];
  primaryDomain: string;           // Domain that owns this junction table
  businessProcess: string;         // Primary business process enabled
  confidence: number;              // Confidence in placement decision
  reasoning: string;               // Why it belongs to primary domain
}

/**
 * Enhanced domain cluster with AI explanations
 */
export interface EnhancedDomainCluster {
  id: string;
  name: string;
  displayName: string;
  purpose: string;                 // AI-generated business purpose description
  
  // Table membership with context
  coreTables: Set<string>;         // Tables that definitely belong (score >= 0.8)
  contextualTables: Map<string, {  // Tables in specific context (score >= 0.4)
    relevanceScore: number;
    role: string;
    columns: string[];             // Only relevant columns
    reasoning: string;
  }>;
  junctionTables: Set<string>;     // Bridge tables assigned here
  excludedTables: Map<string, string>; // Tables excluded + reasons
  
  // Quality metrics
  cohesionScore: number;           // Domain coherence metric
  confidenceScore: number;         // Overall confidence in this grouping
  totalTables: number;
  businessMetrics: {
    completeness: number;          // How complete this business view is
    independence: number;          // How independent from other domains
    usability: number;            // How useful for business analysis
  };
  
  // Explanations for transparency
  explanations: {
    purpose: string;
    coreTableReasons: Map<string, string>;
    contextualTableReasons: Map<string, string>;
    junctionTableReasons: Map<string, string>;
    excludedTableReasons: Map<string, string>;
  };
}

/**
 * Caching interface for AI analysis results
 */
interface AnalysisCache {
  tableAnalyses: Map<string, {
    analysis: TableDomainAnalysis;
    timestamp: number;
    schemaHash: string;             // Hash of table structure
    expiryTime: number;            // TTL for cache invalidation
  }>;
  
  domainAssemblies: Map<string, {
    domains: EnhancedDomainCluster[];
    timestamp: number;
    tablesHash: string;            // Hash of all tables in the analysis
    version: string;               // System version for compatibility
  }>;
}

/**
 * AI-Enhanced Domain Clustering Service
 * 
 * Replaces hardcoded regex patterns with semantic understanding of table relationships
 * and business purposes using Large Language Models.
 */
export class IntelligentDomainAnalyzer {
  private cache: AnalysisCache = {
    tableAnalyses: new Map(),
    domainAssemblies: new Map()
  };
  
  private readonly cacheConfig = {
    tableAnalysisExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
    domainAssemblyExpiry: 24 * 60 * 60 * 1000,     // 1 day
    maxCacheSize: 1000,                             // Maximum cached analyses
    enabled: process.env.DOMAIN_ANALYSIS_CACHE !== 'false'
  };
  
  private usageStats = {
    analysisCount: 0,
    cacheHits: 0,
    apiCalls: 0,
    totalCost: 0,
    lastCleanup: Date.now()
  };

  /**
   * Analyze individual table for business domain relevance using AI
   */
  public async analyzeTable(table: TableData, relationships: Relationship[]): Promise<TableDomainAnalysis> {
    console.log(`🧠 AI analyzing table: ${table.name}`);
    
    // Check cache first
    const cacheKey = this.generateTableCacheKey(table);
    const cached = this.getCachedTableAnalysis(cacheKey);
    if (cached) {
      this.usageStats.cacheHits++;
      console.log(`   💾 Cache hit for ${table.name}`);
      return cached;
    }
    
    try {
      // Prepare table context for LLM
      const tableContext = this.prepareTableContext(table, relationships);
      
      // Get AI analysis
      const aiAnalysis = await this.callTableAnalysisLLM(tableContext);
      
      // Parse and structure the AI response
      const analysis = this.parseTableAnalysis(table.name, aiAnalysis);
      
      // Cache the result
      if (this.cacheConfig.enabled) {
        this.cacheTableAnalysis(cacheKey, analysis, table);
      }
      
      this.usageStats.analysisCount++;
      this.usageStats.apiCalls++;
      
      console.log(`   ✅ AI analysis complete for ${table.name} (confidence: ${analysis.confidence.toFixed(2)})`);
      return analysis;
      
    } catch (error) {
      console.error(`❌ AI analysis failed for ${table.name}:`, error);
      
      // Fallback to rule-based analysis
      console.log(`   🔄 Falling back to rule-based analysis for ${table.name}`);
      return this.fallbackTableAnalysis(table, relationships);
    }
  }

  /**
   * Assemble tables into cohesive business domains using contextual relevance
   */
  public async assembleDomains(tables: TableData[], relationships: Relationship[]): Promise<EnhancedDomainCluster[]> {
    console.log(`🏗️ AI assembling domains for ${tables.length} tables`);
    const startTime = Date.now();
    
    // Check cache for complete domain assembly
    const assemblyKey = this.generateAssemblyCacheKey(tables);
    const cachedAssembly = this.getCachedDomainAssembly(assemblyKey);
    if (cachedAssembly) {
      console.log(`   💾 Cache hit for domain assembly (${cachedAssembly.length} domains)`);
      return cachedAssembly;
    }
    
    try {
      // Step 1: Analyze all tables individually
      const tableAnalyses = await this.batchAnalyzeTables(tables, relationships);
      
      // Step 2: Identify core business domains
      const coreDomains = this.identifyCoreDomains(tableAnalyses);
      
      // Step 3: Assemble domains with contextual membership
      const domains = await this.assembleDomainsWithContext(tableAnalyses, coreDomains, relationships);
      
      // Step 4: Resolve junction table placements
      const finalDomains = await this.resolveJunctionTables(domains, tableAnalyses, relationships);
      
      // Step 5: Calculate domain quality metrics
      this.calculateDomainMetrics(finalDomains, relationships);
      
      // Cache the result
      if (this.cacheConfig.enabled) {
        this.cacheDomainAssembly(assemblyKey, finalDomains, tables);
      }
      
      const duration = Date.now() - startTime;
      console.log(`🎯 AI domain assembly complete: ${finalDomains.length} domains in ${duration}ms`);
      
      return finalDomains;
      
    } catch (error) {
      console.error('❌ AI domain assembly failed:', error);
      throw error;
    }
  }

  /**
   * Intelligently place junction tables based on business purpose
   */
  public async resolveJunctionTables(
    domains: EnhancedDomainCluster[], 
    tableAnalyses: Map<string, TableDomainAnalysis>,
    relationships: Relationship[]
  ): Promise<EnhancedDomainCluster[]> {
    console.log(`🔗 Resolving junction table placements`);
    
    // Find junction tables that need resolution
    const junctionTables = Array.from(tableAnalyses.values())
      .filter(analysis => analysis.isJunctionTable && analysis.junctionAnalysis);
    
    if (junctionTables.length === 0) {
      console.log(`   No junction tables to resolve`);
      return domains;
    }
    
    for (const junctionAnalysis of junctionTables) {
      if (!junctionAnalysis.junctionAnalysis) continue;
      
      const { primaryDomain, reasoning } = junctionAnalysis.junctionAnalysis;
      
      // Find the target domain and move junction table there
      const targetDomain = domains.find(d => d.id === primaryDomain);
      if (targetDomain) {
        // Remove from other domains
        domains.forEach(domain => {
          if (domain !== targetDomain) {
            domain.coreTables.delete(junctionAnalysis.tableName);
            domain.contextualTables.delete(junctionAnalysis.tableName);
            domain.junctionTables.delete(junctionAnalysis.tableName);
          }
        });
        
        // Add to target domain as junction table
        targetDomain.junctionTables.add(junctionAnalysis.tableName);
        targetDomain.explanations.junctionTableReasons.set(junctionAnalysis.tableName, reasoning);
        
        console.log(`   📍 Placed junction table "${junctionAnalysis.tableName}" in "${targetDomain.name}" domain`);
        console.log(`      Reasoning: ${reasoning}`);
      }
    }
    
    return domains;
  }

  /**
   * Prepare table context for LLM analysis
   */
  private prepareTableContext(table: TableData, relationships: Relationship[]): string {
    const relatedTables = relationships
      .filter(rel => rel.sourceTable === table.name || rel.targetTable === table.name)
      .map(rel => {
        const otherTable = rel.sourceTable === table.name ? rel.targetTable : rel.sourceTable;
        const direction = rel.sourceTable === table.name ? 'references' : 'referenced by';
        return `${direction} ${otherTable}`;
      });
    
    const columnInfo = table.attributes.map(attr => {
      const keyInfo = attr.isPrimaryKey ? ' (PK)' : 
                     attr.isForeignKey ? ' (FK)' : '';
      return `${attr.name}: ${attr.type}${keyInfo}`;
    }).join(', ');
    
    return JSON.stringify({
      tableName: table.name,
      columns: columnInfo,
      relationships: relatedTables,
      columnCount: table.attributes.length,
      hasId: table.attributes.some(attr => attr.name.toLowerCase().includes('id')),
      hasForeignKeys: table.attributes.some(attr => attr.isForeignKey),
      hasDates: table.attributes.some(attr => attr.type.toLowerCase().includes('date') || attr.type.toLowerCase().includes('time'))
    });
  }

  /**
   * Call LLM for table analysis
   */
  private async callTableAnalysisLLM(tableContext: string): Promise<string> {
    try {
      // Use the new domain analysis method from LLM service
      const response = await llmService.analyzeTableForDomains(tableContext);
      this.estimateApiCost();
      return response;
    } catch (error) {
      console.error('LLM table analysis call failed:', error);
      throw error;
    }
  }

  /**
   * Parse LLM response into structured table analysis
   */
  private parseTableAnalysis(tableName: string, llmResponse: string): TableDomainAnalysis {
    try {
      // Extract structured data from LLM response
      const primaryPurpose = this.extractValue(llmResponse, 'PRIMARY_PURPOSE') || 'Unknown business purpose';
      const businessDomainsStr = this.extractValue(llmResponse, 'BUSINESS_DOMAINS') || '';
      const businessDomains = businessDomainsStr.split(',').map(d => d.trim()).filter(d => d);
      const isJunctionTable = this.extractValue(llmResponse, 'IS_JUNCTION')?.toLowerCase() === 'true';
      
      // Parse domain analysis sections
      const domainContexts = new Map();
      const suggestedColumns = new Map();
      
      // Extract domain analyses
      const domainAnalysisSection = this.extractSection(llmResponse, 'DOMAIN_ANALYSIS');
      if (domainAnalysisSection) {
        const domainLines = domainAnalysisSection.split('\n').filter(line => line.trim().startsWith('-'));
        
        for (const line of domainLines) {
          const match = line.match(/- (\w+):\s*relevance=([\d.]+),\s*role="([^"]*)",\s*reasoning="([^"]*)",\s*columns=\[([^\]]*)\]/);
          if (match) {
            const [, domain, relevanceStr, role, reasoning, columnsStr] = match;
            const relevance = parseFloat(relevanceStr);
            const columns = columnsStr.split(',').map(c => c.trim()).filter(c => c);
            
            if (relevance >= 0.3) { // Only include meaningful memberships
              domainContexts.set(domain, {
                relevanceScore: relevance,
                contextualRole: role,
                reasoning: reasoning,
                relevantColumns: columns
              });
              
              suggestedColumns.set(domain, columns);
            }
          }
        }
      }
      
      // Parse junction table analysis if present
      let junctionAnalysis: JunctionTableAnalysis | undefined;
      if (isJunctionTable) {
        const junctionSection = this.extractSection(llmResponse, 'JUNCTION_ANALYSIS');
        if (junctionSection) {
          const connectedDomainsStr = this.extractValue(junctionSection, 'connected_domains') || '';
          const connectedDomains = connectedDomainsStr.replace(/[\[\]]/g, '').split(',').map(d => d.trim());
          const primaryDomain = this.extractValue(junctionSection, 'primary_domain') || connectedDomains[0] || '';
          const businessProcess = this.extractValue(junctionSection, 'business_process') || 'Unknown process';
          const reasoning = this.extractValue(junctionSection, 'reasoning') || 'No reasoning provided';
          
          junctionAnalysis = {
            connectedDomains,
            primaryDomain,
            businessProcess,
            confidence: 0.8, // Default confidence for junction analysis
            reasoning
          };
        }
      }
      
      // Calculate overall confidence
      const avgRelevance = domainContexts.size > 0 ? 
        Array.from(domainContexts.values()).reduce((sum, ctx) => sum + ctx.relevanceScore, 0) / domainContexts.size : 0.5;
      const confidence = Math.min(0.95, Math.max(0.3, avgRelevance * 0.8 + 0.2));
      
      return {
        tableName,
        primaryPurpose,
        businessDomains,
        domainContexts,
        confidence,
        suggestedColumns,
        isJunctionTable,
        junctionAnalysis
      };
      
    } catch (error) {
      console.error(`Failed to parse LLM response for ${tableName}:`, error);
      // Return basic analysis on parse failure
      return {
        tableName,
        primaryPurpose: 'Unknown business purpose',
        businessDomains: [],
        domainContexts: new Map(),
        confidence: 0.3,
        suggestedColumns: new Map(),
        isJunctionTable: false
      };
    }
  }

  /**
   * Fallback to rule-based analysis when AI fails
   */
  private fallbackTableAnalysis(table: TableData, relationships: Relationship[]): TableDomainAnalysis {
    console.log(`🔄 Using fallback analysis for ${table.name}`);
    
    // Use existing business rule engine
    const classification = businessRuleEngine.classifyDomain([table]);
    const domainContexts = new Map();
    
    if (classification.confidence > 0.3) {
      domainContexts.set(classification.domainType, {
        relevanceScore: classification.confidence,
        contextualRole: 'Rule-based classification',
        reasoning: `Matched patterns: ${classification.matchingPatterns.join(', ')}`,
        relevantColumns: table.attributes.slice(0, 5).map(attr => attr.name) // First 5 columns as default
      });
    }
    
    // Detect junction tables by foreign key count
    const foreignKeyCount = table.attributes.filter(attr => attr.isForeignKey).length;
    const isJunctionTable = foreignKeyCount >= 2 && table.attributes.length <= 6;
    
    return {
      tableName: table.name,
      primaryPurpose: classification.description || 'Unknown business purpose',
      businessDomains: classification.domainType !== 'unknown' ? [classification.domainType] : [],
      domainContexts,
      confidence: Math.max(0.3, classification.confidence),
      suggestedColumns: new Map([[classification.domainType, table.attributes.map(attr => attr.name)]]),
      isJunctionTable
    };
  }

  // Utility methods for parsing LLM responses
  private extractValue(text: string, key: string): string | null {
    const regex = new RegExp(`${key}:\\s*(.+?)(?=\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  private extractSection(text: string, sectionName: string): string | null {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  // Batch processing for efficiency
  private async batchAnalyzeTables(tables: TableData[], relationships: Relationship[]): Promise<Map<string, TableDomainAnalysis>> {
    console.log(`🔄 Batch analyzing ${tables.length} tables`);
    const analyses = new Map<string, TableDomainAnalysis>();
    
    // Process tables in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);
      const batchPromises = batch.map(table => this.analyzeTable(table, relationships));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(analysis => {
          analyses.set(analysis.tableName, analysis);
        });
        
        console.log(`   📊 Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tables.length/batchSize)}`);
        
        // Small delay between batches to respect API limits
        if (i + batchSize < tables.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Batch analysis failed for batch ${Math.floor(i/batchSize) + 1}:`, error);
        // Continue with other batches
      }
    }
    
    return analyses;
  }

  // Core domain identification
  private identifyCoreDomains(tableAnalyses: Map<string, TableDomainAnalysis>): Array<{id: string, name: string, seedTables: Set<string>}> {
    const domainMap = new Map<string, Set<string>>();
    
    // Group tables by their primary domains
    tableAnalyses.forEach(analysis => {
      analysis.domainContexts.forEach((context, domainId) => {
        if (context.relevanceScore >= 0.6) { // Core or strong contextual membership
          if (!domainMap.has(domainId)) {
            domainMap.set(domainId, new Set());
          }
          domainMap.get(domainId)!.add(analysis.tableName);
        }
      });
    });
    
    // Convert to core domain format
    const coreDomains = Array.from(domainMap.entries())
      .filter(([_, tables]) => tables.size > 0)
      .map(([domainId, seedTables]) => ({
        id: domainId,
        name: this.getDomainDisplayName(domainId),
        seedTables
      }));
    
    console.log(`   🎯 Identified ${coreDomains.length} core domains:`, coreDomains.map(d => `${d.name}(${d.seedTables.size})`).join(', '));
    return coreDomains;
  }

  // Domain assembly with contextual understanding
  private async assembleDomainsWithContext(
    tableAnalyses: Map<string, TableDomainAnalysis>,
    coreDomains: Array<{id: string, name: string, seedTables: Set<string>}>,
    relationships: Relationship[]
  ): Promise<EnhancedDomainCluster[]> {
    const domains: EnhancedDomainCluster[] = [];
    
    for (const coreDomain of coreDomains) {
      const domain: EnhancedDomainCluster = {
        id: coreDomain.id,
        name: coreDomain.name,
        displayName: this.getDomainDisplayName(coreDomain.id),
        purpose: `Manage ${coreDomain.name.toLowerCase()} business processes`,
        
        coreTables: new Set(),
        contextualTables: new Map(),
        junctionTables: new Set(),
        excludedTables: new Map(),
        
        cohesionScore: 0,
        confidenceScore: 0,
        totalTables: 0,
        businessMetrics: {
          completeness: 0,
          independence: 0,
          usability: 0
        },
        
        explanations: {
          purpose: `AI-discovered domain for ${coreDomain.name.toLowerCase()} business processes`,
          coreTableReasons: new Map(),
          contextualTableReasons: new Map(),
          junctionTableReasons: new Map(),
          excludedTableReasons: new Map()
        }
      };
      
      // Assemble tables for this domain
      tableAnalyses.forEach(analysis => {
        const domainContext = analysis.domainContexts.get(coreDomain.id);
        if (!domainContext) return;
        
        if (domainContext.relevanceScore >= 0.8) {
          // Core table
          domain.coreTables.add(analysis.tableName);
          domain.explanations.coreTableReasons.set(analysis.tableName, domainContext.reasoning);
        } else if (domainContext.relevanceScore >= 0.4) {
          // Contextual table
          domain.contextualTables.set(analysis.tableName, {
            relevanceScore: domainContext.relevanceScore,
            role: domainContext.contextualRole,
            columns: domainContext.relevantColumns,
            reasoning: domainContext.reasoning
          });
          domain.explanations.contextualTableReasons.set(analysis.tableName, domainContext.reasoning);
        }
      });
      
      domain.totalTables = domain.coreTables.size + domain.contextualTables.size;
      
      if (domain.totalTables > 0) {
        domains.push(domain);
      }
    }
    
    return domains;
  }

  // Calculate domain quality metrics
  private calculateDomainMetrics(domains: EnhancedDomainCluster[], relationships: Relationship[]): void {
    domains.forEach(domain => {
      const allTables = new Set([...domain.coreTables, ...domain.contextualTables.keys(), ...domain.junctionTables]);
      
      // Calculate internal vs external connections
      let internalConnections = 0;
      let externalConnections = 0;
      
      relationships.forEach(rel => {
        const sourceInDomain = allTables.has(rel.sourceTable);
        const targetInDomain = allTables.has(rel.targetTable);
        
        if (sourceInDomain && targetInDomain) {
          internalConnections++;
        } else if (sourceInDomain || targetInDomain) {
          externalConnections++;
        }
      });
      
      // Cohesion score: ratio of internal to total connections
      const totalConnections = internalConnections + externalConnections;
      domain.cohesionScore = totalConnections > 0 ? internalConnections / totalConnections : 0;
      
      // Confidence score: weighted average of table confidences
      const tableAnalysisValues = Array.from(domain.contextualTables.values());
      const coreTableWeight = domain.coreTables.size * 0.9; // High confidence for core tables
      const contextualWeight = tableAnalysisValues.reduce((sum, ctx) => sum + ctx.relevanceScore, 0);
      domain.confidenceScore = domain.totalTables > 0 ? (coreTableWeight + contextualWeight) / domain.totalTables : 0;
      
      // Business metrics
      domain.businessMetrics = {
        completeness: Math.min(1.0, domain.totalTables / 10), // Assume 10 tables = complete domain
        independence: domain.cohesionScore,
        usability: (domain.cohesionScore + domain.confidenceScore) / 2
      };
    });
  }

  // Caching implementation
  private generateTableCacheKey(table: TableData): string {
    const columnHash = table.attributes.map(attr => `${attr.name}:${attr.type}`).join('|');
    return `table:${table.name}:${this.hashString(columnHash)}`;
  }

  private generateAssemblyCacheKey(tables: TableData[]): string {
    const tablesHash = tables.map(t => t.name).sort().join('|');
    return `assembly:${this.hashString(tablesHash)}`;
  }

  private getCachedTableAnalysis(cacheKey: string): TableDomainAnalysis | null {
    if (!this.cacheConfig.enabled) return null;
    
    const cached = this.cache.tableAnalyses.get(cacheKey);
    if (cached && Date.now() < cached.expiryTime) {
      return cached.analysis;
    }
    
    if (cached) {
      this.cache.tableAnalyses.delete(cacheKey); // Remove expired
    }
    return null;
  }

  private cacheTableAnalysis(cacheKey: string, analysis: TableDomainAnalysis, table: TableData): void {
    if (!this.cacheConfig.enabled) return;
    
    const columnHash = table.attributes.map(attr => `${attr.name}:${attr.type}`).join('|');
    this.cache.tableAnalyses.set(cacheKey, {
      analysis,
      timestamp: Date.now(),
      schemaHash: this.hashString(columnHash),
      expiryTime: Date.now() + this.cacheConfig.tableAnalysisExpiry
    });
    
    this.cleanupCacheIfNeeded();
  }

  private getCachedDomainAssembly(assemblyKey: string): EnhancedDomainCluster[] | null {
    if (!this.cacheConfig.enabled) return null;
    
    const cached = this.cache.domainAssemblies.get(assemblyKey);
    if (cached && Date.now() < cached.timestamp + this.cacheConfig.domainAssemblyExpiry) {
      return cached.domains;
    }
    
    if (cached) {
      this.cache.domainAssemblies.delete(assemblyKey); // Remove expired
    }
    return null;
  }

  private cacheDomainAssembly(assemblyKey: string, domains: EnhancedDomainCluster[], tables: TableData[]): void {
    if (!this.cacheConfig.enabled) return;
    
    const tablesHash = tables.map(t => t.name).sort().join('|');
    this.cache.domainAssemblies.set(assemblyKey, {
      domains,
      timestamp: Date.now(),
      tablesHash: this.hashString(tablesHash),
      version: '1.0'
    });
  }

  private cleanupCacheIfNeeded(): void {
    const now = Date.now();
    
    // Cleanup every hour
    if (now - this.usageStats.lastCleanup < 60 * 60 * 1000) return;
    
    // Remove expired table analyses
    for (const [key, cached] of this.cache.tableAnalyses.entries()) {
      if (now > cached.expiryTime) {
        this.cache.tableAnalyses.delete(key);
      }
    }
    
    // Remove expired domain assemblies
    for (const [key, cached] of this.cache.domainAssemblies.entries()) {
      if (now > cached.timestamp + this.cacheConfig.domainAssemblyExpiry) {
        this.cache.domainAssemblies.delete(key);
      }
    }
    
    this.usageStats.lastCleanup = now;
    console.log(`🧹 Cache cleanup completed: ${this.cache.tableAnalyses.size} table analyses, ${this.cache.domainAssemblies.size} domain assemblies`);
  }

  // Utility methods
  private getDomainDisplayName(domainId: string): string {
    const displayNames: Record<string, string> = {
      'user_management': 'User Management',
      'payments_donations': 'Donations & Payments',
      'opportunities': 'Opportunities',
      'campaigns_marketing': 'Campaigns & Marketing',
      'system_configuration': 'System Configuration',
      'organization_management': 'Organization Management',
      'content_management': 'Content Management'
    };
    
    return displayNames[domainId] || domainId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private estimateApiCost(): void {
    // Rough estimate: ~$0.01 per analysis for Claude 3 Sonnet
    this.usageStats.totalCost += 0.01;
  }

  /**
   * Get usage statistics for monitoring
   */
  public getUsageStats() {
    return {
      ...this.usageStats,
      cacheHitRate: this.usageStats.analysisCount > 0 ? this.usageStats.cacheHits / this.usageStats.analysisCount : 0,
      cacheSize: this.cache.tableAnalyses.size + this.cache.domainAssemblies.size
    };
  }

  /**
   * Clear cache (for testing or manual cleanup)
   */
  public clearCache(): void {
    this.cache.tableAnalyses.clear();
    this.cache.domainAssemblies.clear();
    console.log('🧹 Cache cleared manually');
  }
}

// Export singleton instance
export const intelligentDomainAnalyzer = new IntelligentDomainAnalyzer();