import type { TableInfo } from './coreTableDiscoveryService';
import type { Relationship } from '@shared/schema';
import { RateLimitedEmbeddingClient } from './rateLimitedEmbeddingClient';
import { vectorClusteringService } from './vectorClusteringService';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface TableVector {
  tableName: string;
  embedding: number[];           // Vector from embedding model (384D local, 1536D OpenAI)
  semanticMetadata: {
    businessDomain: string;      // Inferred from table/column names
    tableType: 'entity' | 'junction' | 'reference' | 'lookup';
    businessProcess: string[];   // E.g., ['transactional', 'hierarchical', 'temporal']
    confidence: number;          // Confidence in classification (0-1)
  };
  embeddingSource: 'openai' | 'sentence-transformers' | 'cached';
  createdAt: Date;
}

export interface SemanticSimilarity {
  table1: string;
  table2: string;
  similarityScore: number;      // Cosine similarity (0-1)
  semanticDistance: number;     // 1 - similarityScore
  relationshipType: 'high' | 'medium' | 'low' | 'none';
}

export interface SemanticClusterValidation {
  clusterTables: string[];
  averageSimilarity: number;
  coherenceScore: number;       // How well tables belong together semantically
  outlierTables: string[];      // Tables that don't fit semantically
  recommendedAction: 'accept' | 'split' | 'merge' | 'refine';
}

export interface TableEmbeddingOptions {
  includeColumnNames: boolean;
  includeRelationships: boolean;
  includeForeignKeys: boolean;
  useCache: boolean;
  maxTokens: number;
  validationMode: boolean;          // When true, only use table names for validation-focused embeddings
}

export class SemanticVectorService {
  private embeddingCache: Map<string, TableVector> = new Map();
  private similarityCache: Map<string, number> = new Map();
  private openaiApiKey: string;
  private rateLimitedClient: RateLimitedEmbeddingClient | null = null;
  
  // Embedding strategy configuration (LOCAL-FIRST approach)
  private readonly useLocalFirst: boolean;
  private readonly localOnlyMode: boolean;
  
  // File-based persistent cache
  private readonly cacheDir: string = './cache/embeddings';
  private readonly cacheExpiry: number = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  
  // Metrics tracking
  private metrics = {
    localEmbeddingsGenerated: 0,
    apiEmbeddingsGenerated: 0,
    cacheHits: 0,
    cacheMisses: 0,
    processingTime: 0,
    averageEmbeddingTime: 0
  };
  
  // Similarity thresholds for full-content embeddings
  private readonly HIGH_SIMILARITY_THRESHOLD = 0.85;
  private readonly MEDIUM_SIMILARITY_THRESHOLD = 0.7;
  private readonly LOW_SIMILARITY_THRESHOLD = 0.5;
  
  // More conservative thresholds for validation-mode (name-only) embeddings
  private readonly VALIDATION_HIGH_SIMILARITY_THRESHOLD = 0.7;
  private readonly VALIDATION_MEDIUM_SIMILARITY_THRESHOLD = 0.5;
  private readonly VALIDATION_LOW_SIMILARITY_THRESHOLD = 0.3;

  constructor(openaiApiKey?: string) {
    // Configure embedding strategy - OPENAI-FIRST for enterprise 1536D embeddings
    this.useLocalFirst = process.env.EMBEDDING_STRATEGY === 'local-first'; // Changed: now opt-in only
    this.localOnlyMode = process.env.EMBEDDING_STRATEGY === 'local-only';
    
    this.openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY || '';
    
    console.log(`🚀 Semantic Vector Service initialized with strategy: ${this.localOnlyMode ? 'LOCAL-ONLY' : this.useLocalFirst ? 'LOCAL-FIRST' : 'OPENAI-FIRST (1536D)'}`);
    
    if (!this.openaiApiKey && !this.localOnlyMode) {
      console.warn('⚠️ No OpenAI API key provided - falling back to local embeddings (384D)');
      console.log('🏠 Using local embeddings (Xenova/all-MiniLM-L6-v2) - no rate limits, full privacy');
      this.useLocalFirst = true; // Force local if no API key
    } else if (this.openaiApiKey && !this.localOnlyMode) {
      console.log('✅ OpenAI API key configured for primary 1536D embedding generation');
      
      // Initialize rate-limited client for primary usage
      this.rateLimitedClient = new RateLimitedEmbeddingClient(this.openaiApiKey, {
        tokensPerMinute: parseInt(process.env.OPENAI_RATE_LIMIT_RPM || '3000'), // Realistic for Tier 2+
        maxConcurrentRequests: parseInt(process.env.OPENAI_MAX_CONCURRENT || '20'),  // Higher concurrency
        maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '5'),          // More retries for resilience
        baseRetryDelay: parseInt(process.env.OPENAI_BASE_RETRY_DELAY || '1500'), // Reasonable delays
        jitterEnabled: process.env.OPENAI_JITTER_ENABLED !== 'false',
        circuitBreakerThreshold: parseFloat(process.env.OPENAI_CIRCUIT_BREAKER_THRESHOLD || '0.2') // More tolerant
      });
    }
    
    // Initialize persistent cache
    this.initializePersistentCache();
  }

  /**
   * Initialize persistent file-based cache
   */
  private async initializePersistentCache(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`📦 Embedding cache initialized at ${this.cacheDir}`);
    } catch (error) {
      console.warn(`⚠️ Failed to initialize embedding cache:`, error);
    }
  }

  /**
   * Generate semantic embedding for a table
   */
  public async generateTableEmbedding(
    table: TableInfo,
    options: Partial<TableEmbeddingOptions> = {}
  ): Promise<TableVector> {
    const opts: TableEmbeddingOptions = {
      includeColumnNames: true,
      includeRelationships: true,
      includeForeignKeys: true,
      useCache: true,
      maxTokens: 8000,
      validationMode: false,
      ...options
    };

    // DEBUG: Log validation mode status
    console.log(`🔍 DEBUG: Embedding ${table.name} with validationMode: ${opts.validationMode}`);

    console.log(`🔤 Generating embedding for table: ${table.name}`);
    const startTime = Date.now();

    // Check in-memory cache first
    const cacheKey = this.generateCacheKey(table, opts);
    if (opts.useCache && this.embeddingCache.has(cacheKey)) {
      console.log(`   📦 Using in-memory cached embedding for ${table.name}`);
      this.metrics.cacheHits++;
      return this.embeddingCache.get(cacheKey)!;
    }

    // Check persistent cache
    if (opts.useCache) {
      const cachedVector = await this.loadFromPersistentCache(cacheKey);
      if (cachedVector) {
        console.log(`   💾 Using persistent cached embedding for ${table.name}`);
        this.embeddingCache.set(cacheKey, cachedVector);
        this.metrics.cacheHits++;
        return cachedVector;
      }
    }
    
    this.metrics.cacheMisses++;

    // Build text representation of table
    const tableText = this.buildTableTextRepresentation(table, opts);

    // Generate embedding using LOCAL-FIRST strategy
    let embedding: number[];
    let embeddingSource: TableVector['embeddingSource'];

    try {
      if (this.localOnlyMode || (this.useLocalFirst && !this.rateLimitedClient)) {
        // LOCAL-ONLY: Use local Xenova transformer model (384D)
        embedding = await this.generateLocalEmbedding(tableText);
        embeddingSource = 'sentence-transformers';
        this.metrics.localEmbeddingsGenerated++;
        console.log(`   🏠 Local embedding generated for ${table.name} (${embedding.length} dimensions)`);
      } else if (!this.useLocalFirst && this.rateLimitedClient) {
        // PRIMARY: Use OpenAI API for 1536D embeddings (enterprise mode)
        embedding = await this.rateLimitedClient.generateEmbedding(tableText);
        embeddingSource = 'openai';
        this.metrics.apiEmbeddingsGenerated++;
        console.log(`   ☁️ OpenAI embedding generated for ${table.name} (${embedding.length} dimensions)`);
      } else {
        // FALLBACK: Use local if OpenAI unavailable
        embedding = await this.generateLocalEmbedding(tableText);
        embeddingSource = 'sentence-transformers';
        this.metrics.localEmbeddingsGenerated++;
        console.log(`   🏠 Local fallback embedding generated for ${table.name} (${embedding.length} dimensions)`);
      }
    } catch (error) {
      console.error(`   ❌ Primary embedding generation failed for ${table.name}:`, error);
      
      // Log rate limiting metrics if available
      if (this.rateLimitedClient) {
        const metrics = this.rateLimitedClient.getMetrics();
        if (metrics.rateLimitHits > 0 || metrics.circuitBreakerTrips > 0) {
          console.log(`     📊 Client metrics: ${metrics.rateLimitHits} rate limits, ${metrics.circuitBreakerTrips} circuit breaks`);
        }
      }
      
      // Try alternative embedding method
      if (!this.localOnlyMode) {
        try {
          if (embeddingSource !== 'openai' && this.rateLimitedClient) {
            console.log(`   🔄 Trying OpenAI fallback for ${table.name}`);
            embedding = await this.rateLimitedClient.generateEmbedding(tableText);
            embeddingSource = 'openai';
            this.metrics.apiEmbeddingsGenerated++;
          } else {
            console.log(`   🔄 Trying local fallback for ${table.name}`);
            embedding = await this.generateLocalEmbedding(tableText);
            embeddingSource = 'sentence-transformers';
            this.metrics.localEmbeddingsGenerated++;
          }
        } catch (fallbackError) {
          console.error(`   ❌ Fallback embedding also failed for ${table.name}:`, fallbackError);
          embedding = await this.generateSimpleEmbedding(tableText);
          embeddingSource = 'sentence-transformers';
        }
      } else {
        embedding = await this.generateSimpleEmbedding(tableText);
        embeddingSource = 'sentence-transformers';
      }
      console.log(`   🔄 Using emergency embedding generation`);
    }

    // Classify table semantically
    const semanticMetadata = await this.classifyTableSemantics(table, embedding, opts);

    const tableVector: TableVector = {
      tableName: table.name,
      embedding,
      semanticMetadata,
      embeddingSource,
      createdAt: new Date()
    };

    // Cache the result in both memory and persistent storage
    if (opts.useCache) {
      this.embeddingCache.set(cacheKey, tableVector);
      await this.saveToPersistentCache(cacheKey, tableVector);
    }

    // Update metrics
    const processingTime = Date.now() - startTime;
    this.metrics.processingTime += processingTime;
    const totalEmbeddings = this.metrics.localEmbeddingsGenerated + this.metrics.apiEmbeddingsGenerated;
    this.metrics.averageEmbeddingTime = totalEmbeddings > 0 ? this.metrics.processingTime / totalEmbeddings : 0;

    return tableVector;
  }

  /**
   * Build text representation of table for embedding
   */
  private buildTableTextRepresentation(table: TableInfo, options: TableEmbeddingOptions): string {
    // In validation mode, only use table name without "Table:" prefix to avoid artificial similarity inflation
    if (options.validationMode) {
      console.log(`🔍 DEBUG: Using validation mode text for ${table.name}: "${table.name}" (no Table: prefix)`);
      return table.name;
    }
    
    console.log(`🔍 DEBUG: Using full mode text for ${table.name} (includes columns/relationships)`);

    // Full mode: include all table details (original behavior)
    let text = `Table: ${table.name}\n`;

    // Add column information
    if (options.includeColumnNames && table.columns.length > 0) {
      text += `Columns: ${table.columns.map(col => col.name).join(', ')}\n`;
      
      // Add column types if available
      const typedColumns = table.columns
        .filter(col => col.type)
        .map(col => `${col.name}:${col.type}`);
      if (typedColumns.length > 0) {
        text += `Column Types: ${typedColumns.join(', ')}\n`;
      }
    }

    // Add primary keys
    if (table.primaryKeys.length > 0) {
      text += `Primary Keys: ${table.primaryKeys.join(', ')}\n`;
    }

    // Add foreign keys
    if (options.includeForeignKeys && table.foreignKeys.length > 0) {
      const fkDescriptions = table.foreignKeys.map(fk => 
        `${fk.column} references ${fk.referencedTable}.${fk.referencedColumn}`
      );
      text += `Foreign Keys: ${fkDescriptions.join(', ')}\n`;
    }

    // Limit text length to avoid token limits
    if (text.length > options.maxTokens) {
      text = text.substring(0, options.maxTokens) + '...';
    }

    return text.trim();
  }

  /**
   * Get embedding client metrics for monitoring
   */
  public getEmbeddingClientMetrics() {
    if (!this.rateLimitedClient) {
      return null;
    }
    
    return this.rateLimitedClient.getMetrics();
  }

  /**
   * Generate local embedding using Xenova transformer model (HIGH QUALITY)
   */
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    // Use the existing vectorClusteringService which has Xenova/all-MiniLM-L6-v2 loaded
    await vectorClusteringService['ensureEmbedderReady']();
    
    try {
      // Use the same embedder as vectorClusteringService
      const embedder = vectorClusteringService['embedder'];
      if (!embedder) {
        throw new Error('Local embedder not initialized');
      }
      
      // Generate embedding with same configuration as vectorClusteringService
      const embedding = await embedder(text, { pooling: 'mean', normalize: true });
      return Array.from(embedding.data);
    } catch (error) {
      console.error('   ❌ Local Xenova embedding failed:', error);
      throw error;
    }
  }

  /**
   * Generate simple hash-based embedding as last resort fallback
   */
  private async generateSimpleEmbedding(text: string): Promise<number[]> {
    console.log('   🔄 Using simple hash-based embedding (last resort)');
    
    // Simple hash-based embedding (emergency fallback only)
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const embedding = new Array(384).fill(0); // Match local model dimensions
    
    // Simple word frequency encoding
    words.forEach((word, index) => {
      const hash = this.simpleHash(word);
      const position = hash % embedding.length;
      embedding[position] += 1 / (index + 1); // Weight by position
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * Simple hash function for fallback embedding
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Load table vector from persistent cache
   */
  private async loadFromPersistentCache(cacheKey: string): Promise<TableVector | null> {
    try {
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
      const stats = await fs.stat(cacheFile);
      
      // Check if cache is expired
      if (Date.now() - stats.mtime.getTime() > this.cacheExpiry) {
        // Clean up expired cache
        await fs.unlink(cacheFile).catch(() => {}); // Ignore errors
        return null;
      }

      const cacheData = await fs.readFile(cacheFile, 'utf8');
      const cachedVector: TableVector = JSON.parse(cacheData);
      
      // Verify cache integrity
      if (!cachedVector.tableName || !cachedVector.embedding || !Array.isArray(cachedVector.embedding)) {
        return null;
      }
      
      return cachedVector;
    } catch (error) {
      // File doesn't exist or other error - return null
      return null;
    }
  }

  /**
   * Save table vector to persistent cache
   */
  private async saveToPersistentCache(cacheKey: string, tableVector: TableVector): Promise<void> {
    try {
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
      const cacheData = JSON.stringify(tableVector, null, 2);
      await fs.writeFile(cacheFile, cacheData, 'utf8');
    } catch (error) {
      console.warn(`⚠️ Failed to save embedding to cache for ${tableVector.tableName}:`, error);
    }
  }

  /**
   * Calculate semantic similarity between two tables
   */
  public calculateSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error('Vector dimensions must match for similarity calculation');
    }

    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Build semantic similarity matrix for tables
   */
  public async buildSemanticSimilarityMatrix(
    tableVectors: TableVector[]
  ): Promise<SemanticSimilarity[]> {
    console.log(`📊 Building semantic similarity matrix for ${tableVectors.length} tables`);
    
    // Detect if this is validation mode based on semantic metadata characteristics
    const isValidationMode = this.detectValidationMode(tableVectors);
    console.log(`🔍 DEBUG: detectValidationMode() returned: ${isValidationMode}`);
    if (isValidationMode) {
      console.log(`   🔍 Using validation mode thresholds for name-only embeddings`);
    } else {
      console.log(`   🔍 DEBUG: Using STANDARD thresholds (validation mode detection failed)`);
    }
    
    const similarities: SemanticSimilarity[] = [];
    
    for (let i = 0; i < tableVectors.length; i++) {
      for (let j = i + 1; j < tableVectors.length; j++) {
        const table1 = tableVectors[i];
        const table2 = tableVectors[j];
        
        // Check cache first
        const cacheKey = `${table1.tableName}:${table2.tableName}`;
        let similarityScore = this.similarityCache.get(cacheKey);
        
        if (similarityScore === undefined) {
          similarityScore = this.calculateSimilarity(table1.embedding, table2.embedding);
          this.similarityCache.set(cacheKey, similarityScore);
        }
        
        const relationshipType = this.classifyRelationshipType(similarityScore, isValidationMode);
        
        similarities.push({
          table1: table1.tableName,
          table2: table2.tableName,
          similarityScore,
          semanticDistance: 1 - similarityScore,
          relationshipType
        });
      }
    }

    // Sort by similarity score (highest first)
    similarities.sort((a, b) => b.similarityScore - a.similarityScore);
    
    console.log(`   📈 Generated ${similarities.length} similarity pairs`);
    console.log(`   🔥 Top similarities: ${similarities.slice(0, 5).map(s => 
      `${s.table1}↔${s.table2} (${s.similarityScore.toFixed(3)})`
    ).join(', ')}`);
    
    return similarities;
  }

  /**
   * Classify relationship type based on similarity score
   */
  private classifyRelationshipType(score: number, isValidationMode: boolean = false): SemanticSimilarity['relationshipType'] {
    if (isValidationMode) {
      // Use more conservative thresholds for validation mode (name-only embeddings)
      if (score >= this.VALIDATION_HIGH_SIMILARITY_THRESHOLD) return 'high';
      if (score >= this.VALIDATION_MEDIUM_SIMILARITY_THRESHOLD) return 'medium';
      if (score >= this.VALIDATION_LOW_SIMILARITY_THRESHOLD) return 'low';
    } else {
      // Use standard thresholds for full-content embeddings
      if (score >= this.HIGH_SIMILARITY_THRESHOLD) return 'high';
      if (score >= this.MEDIUM_SIMILARITY_THRESHOLD) return 'medium';
      if (score >= this.LOW_SIMILARITY_THRESHOLD) return 'low';
    }
    return 'none';
  }

  /**
   * Detect if table vectors were generated in validation mode
   */
  private detectValidationMode(tableVectors: TableVector[]): boolean {
    if (tableVectors.length === 0) return false;
    
    // Check for characteristics that indicate validation mode:
    // 1. Lower average confidence scores (validation mode has more conservative confidence)
    // 2. More generic business domains (validation mode uses fewer specific classifications)
    const avgConfidence = tableVectors.reduce((sum, tv) => sum + tv.semanticMetadata.confidence, 0) / tableVectors.length;
    const genericDomainRatio = tableVectors.filter(tv => 
      tv.semanticMetadata.businessDomain === 'general_entity'
    ).length / tableVectors.length;
    
    console.log(`🔍 DEBUG: Validation detection - avgConfidence: ${avgConfidence.toFixed(3)}, genericDomainRatio: ${genericDomainRatio.toFixed(3)}`);
    console.log(`🔍 DEBUG: Thresholds - avgConfidence < 0.6: ${avgConfidence < 0.6}, genericDomainRatio > 0.3: ${genericDomainRatio > 0.3}`);
    
    // Sample a few domains to see what we're getting
    const sampleDomains = tableVectors.slice(0, 3).map(tv => `${tv.tableName}:${tv.semanticMetadata.businessDomain}`);
    console.log(`🔍 DEBUG: Sample domains: ${sampleDomains.join(', ')}`);
    
    // Validation mode typically has lower confidence and more generic domains
    return avgConfidence < 0.6 && genericDomainRatio > 0.3;
  }

  /**
   * Classify table semantics using embedding
   */
  private async classifyTableSemantics(table: TableInfo, embedding: number[], options: TableEmbeddingOptions): Promise<TableVector['semanticMetadata']> {
    // Industry-agnostic classification based on table structure and naming
    const tableName = table.name.toLowerCase();
    const columnNames = table.columns.map(c => c.name.toLowerCase());
    
    // Classify table type
    const tableType = this.classifyTableType(table);
    
    let businessProcess: string[];
    let businessDomain: string;
    let confidence: number;
    
    if (options.validationMode) {
      // In validation mode, skip complex business process analysis
      // Only use basic table name patterns for minimal classification
      console.log(`🔍 DEBUG: Using VALIDATION mode classification for ${tableName}`);
      businessProcess = this.inferBasicProcessesFromName(tableName);
      businessDomain = this.inferBasicDomainFromName(tableName);
      confidence = this.calculateBasicClassificationConfidence(tableName);
      console.log(`🔍 DEBUG: Validation classification - domain: ${businessDomain}, confidence: ${confidence}`);
    } else {
      // Full mode: use complete business process analysis
      console.log(`🔍 DEBUG: Using FULL mode classification for ${tableName}`);
      businessProcess = this.inferBusinessProcesses(tableName, columnNames);
      businessDomain = this.inferBusinessDomain(tableName, columnNames, businessProcess);
      confidence = this.calculateClassificationConfidence(tableName, columnNames, businessProcess);
      console.log(`🔍 DEBUG: Full classification - domain: ${businessDomain}, confidence: ${confidence}`);
    }
    
    return {
      businessDomain,
      tableType,
      businessProcess,
      confidence
    };
  }

  /**
   * Classify table type based on pure structural analysis
   */
  private classifyTableType(table: TableInfo): TableVector['semanticMetadata']['tableType'] {
    const hasMultipleFKs = table.foreignKeys.length >= 2;
    const columnCount = table.columns.length;
    const fkCount = table.foreignKeys.length;
    
    // Count non-key columns (structural analysis only)
    const nonKeyColumns = table.columns.filter(col => 
      !('isPrimaryKey' in col ? col.isPrimaryKey : false) && 
      !('isForeignKey' in col ? col.isForeignKey : false)
    ).length;
    
    // Junction table: multiple FKs, few non-key columns (pure structural)
    if (hasMultipleFKs && nonKeyColumns <= 2) {
      return 'junction';
    }
    
    // Reference/lookup table: small table with constraints (pure structural)
    const hasUniqueConstraints = table.columns.some(col => col.unique);
    if (columnCount <= 4 && hasUniqueConstraints) {
      return 'lookup';
    }
    
    // Reference table: small table size (pure structural)
    if (columnCount <= 5 && fkCount === 0) {
      return 'reference';
    }
    
    // Entity table: default for tables with multiple columns
    return 'entity';
  }

  /**
   * Infer process patterns using semantic similarity (industry-agnostic)
   */
  private inferBusinessProcesses(tableName: string, columnNames: string[]): string[] {
    const processes: string[] = [];
    
    // Use structural analysis instead of hardcoded business patterns
    const structuralPatterns = this.analyzeStructuralPatterns(tableName, columnNames);
    
    // Detect temporal patterns
    if (structuralPatterns.hasTemporalColumns) {
      processes.push('temporal');
    }
    
    // Detect transactional patterns
    if (structuralPatterns.hasStateColumns || structuralPatterns.hasStatusColumns) {
      processes.push('transactional');
    }
    
    // Detect hierarchical patterns
    if (structuralPatterns.hasParentChildColumns) {
      processes.push('hierarchical');
    }
    
    // Detect relational patterns
    if (structuralPatterns.hasManyToManyColumns) {
      processes.push('relational');
    }
    
    // Default to entity management if no specific patterns
    if (processes.length === 0) {
      processes.push('entity_management');
    }
    
    return processes;
  }

  /**
   * Generate mathematical domain identifier
   */
  private inferBusinessDomain(tableName: string, columnNames: string[], businessProcesses: string[]): string {
    // Pure mathematical domain identification
    // Use table name as aggregate root
    const aggregateRoot = tableName;
    
    // Without structural data, use basic mathematical classification
    const tableLength = tableName.length;
    const columnCount = columnNames.length;
    
    // Simple mathematical domain classification
    const complexityScore = Math.min(columnCount / 20, 1.0);
    const complexityTier = Math.floor(complexityScore * 5);
    
    return `MATH_DOMAIN_${aggregateRoot}_X${complexityTier}`;
  }

  /**
   * Calculate confidence in classification
   */
  private calculateClassificationConfidence(tableName: string, columnNames: string[], businessProcesses: string[]): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for clear patterns
    if (businessProcesses.length > 0) confidence += 0.2;
    if (businessProcesses.length > 1) confidence += 0.1;
    
    // Higher confidence for descriptive table names
    if (tableName.length > 4 && !tableName.startsWith('temp') && !tableName.includes('unknown')) {
      confidence += 0.1;
    }
    
    // Higher confidence for well-structured columns
    if (columnNames.length > 2) confidence += 0.1;
    
    return Math.min(1.0, confidence);
  }

  /**
   * Mathematical process classification (no pattern matching)
   */
  private inferBasicProcessesFromName(tableName: string): string[] {
    // Cannot infer business processes from names without linguistic assumptions
    // Would need structural data:
    // - Foreign key relationships
    // - Column data types
    // - Constraint patterns
    // - Table size/row count
    
    // Return empty array to avoid linguistic bias
    return [];
  }

  /**
   * Infer basic business domain from table name only (validation mode)
   */
  private inferBasicDomainFromName(tableName: string): string {
    // Generate domain classification dynamically based on the table name itself
    const primaryConcept = this.extractPrimaryConceptFromName(tableName);
    const structuralRole = this.determineStructuralRole(tableName);
    
    // Create domain name algorithmically without hardcoded mappings
    if (structuralRole === 'support') {
      return `${primaryConcept.toLowerCase()}_support`;
    } else if (structuralRole === 'junction') {
      return `${primaryConcept.toLowerCase()}_relationships`;
    } else {
      return `${primaryConcept.toLowerCase()}_domain`;
    }
  }

  /**
   * Calculate basic classification confidence from table name only (validation mode)
   */
  private calculateBasicClassificationConfidence(tableName: string): number {
    // Fixed low confidence for name-only analysis
    // Cannot determine confidence without structural data
    return 0.3;
  }

  /**
   * Generate cache key for embeddings
   */
  private generateCacheKey(table: TableInfo, options: TableEmbeddingOptions): string {
    const optionsStr = JSON.stringify(options);
    const tableStr = JSON.stringify({
      name: table.name,
      columns: table.columns.map(c => ({ name: c.name, type: c.type })),
      foreignKeys: table.foreignKeys
    });
    return `${table.name}:${this.simpleHash(tableStr + optionsStr)}`;
  }

  /**
   * Validate semantic coherence of a cluster
   */
  public validateClusterCoherence(
    clusterTables: string[],
    tableVectors: TableVector[]
  ): SemanticClusterValidation {
    console.log(`🔍 Validating semantic coherence for cluster: ${clusterTables.join(', ')}`);
    
    const clusterVectors = tableVectors.filter(tv => clusterTables.includes(tv.tableName));
    
    if (clusterVectors.length < 2) {
      return {
        clusterTables,
        averageSimilarity: 1.0,
        coherenceScore: 1.0,
        outlierTables: [],
        recommendedAction: 'accept'
      };
    }
    
    // Detect validation mode for appropriate threshold selection
    const isValidationMode = this.detectValidationMode(clusterVectors);
    const lowThreshold = isValidationMode ? this.VALIDATION_LOW_SIMILARITY_THRESHOLD : this.LOW_SIMILARITY_THRESHOLD;
    
    // Calculate pairwise similarities within cluster
    const similarities: number[] = [];
    for (let i = 0; i < clusterVectors.length; i++) {
      for (let j = i + 1; j < clusterVectors.length; j++) {
        const similarity = this.calculateSimilarity(
          clusterVectors[i].embedding,
          clusterVectors[j].embedding
        );
        similarities.push(similarity);
      }
    }
    
    const averageSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
    
    // Identify outliers (tables with low similarity to others)
    const outlierTables: string[] = [];
    clusterVectors.forEach(vector => {
      const otherVectors = clusterVectors.filter(v => v.tableName !== vector.tableName);
      const avgSimilarityToOthers = otherVectors.reduce((sum, other) => {
        return sum + this.calculateSimilarity(vector.embedding, other.embedding);
      }, 0) / otherVectors.length;
      
      if (avgSimilarityToOthers < lowThreshold) {
        outlierTables.push(vector.tableName);
      }
    });
    
    // Industry Standard: Dataset-relative coherence score (no arbitrary baselines)
    // Use the actual similarity distribution instead of hardcoded numbers
    const datasetStats = this.calculateSimilarityDistributionStats(similarities);
    const baseline = Math.max(0.1, datasetStats.mean - datasetStats.standardDeviation); // Dynamic baseline
    const range = Math.max(0.3, datasetStats.standardDeviation * 2); // Dynamic range
    const coherenceScore = Math.max(0, Math.min(1, (averageSimilarity - baseline) / range));
    
    // Recommend action
    let recommendedAction: SemanticClusterValidation['recommendedAction'] = 'accept';
    if (coherenceScore < 0.4) {
      recommendedAction = 'split';
    } else if (outlierTables.length > 0) {
      recommendedAction = 'refine';
    } else if (averageSimilarity > 0.9 && clusterTables.length < 3) {
      recommendedAction = 'merge';
    }
    
    console.log(`   📊 Coherence: ${coherenceScore.toFixed(3)}, Avg similarity: ${averageSimilarity.toFixed(3)}`);
    console.log(`   🎯 Recommendation: ${recommendedAction}${outlierTables.length > 0 ? ` (outliers: ${outlierTables.join(', ')})` : ''}`);
    
    return {
      clusterTables,
      averageSimilarity,
      coherenceScore,
      outlierTables,
      recommendedAction
    };
  }

  /**
   * Clear caches
   */
  public clearCaches(): void {
    this.embeddingCache.clear();
    this.similarityCache.clear();
    console.log('🧹 Semantic vector caches cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { embeddingCacheSize: number; similarityCacheSize: number } {
    return {
      embeddingCacheSize: this.embeddingCache.size,
      similarityCacheSize: this.similarityCache.size
    };
  }

  /**
   * Get comprehensive metrics for monitoring
   */
  public getMetrics() {
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0 ? 
      this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) : 0;
    
    return {
      ...this.metrics,
      cacheHitRate: Math.round(cacheHitRate * 100),
      strategy: this.localOnlyMode ? 'LOCAL-ONLY' : this.useLocalFirst ? 'LOCAL-FIRST' : 'API-FIRST',
      localVsApiRatio: this.metrics.apiEmbeddingsGenerated > 0 ? 
        Math.round((this.metrics.localEmbeddingsGenerated / this.metrics.apiEmbeddingsGenerated) * 100) / 100 : 'N/A'
    };
  }

  /**
   * Log performance summary
   */
  public logPerformanceSummary(): void {
    const metrics = this.getMetrics();
    console.log(`\n📊 Embedding Service Performance Summary:`);
    console.log(`   🏠 Local embeddings: ${metrics.localEmbeddingsGenerated}`);
    console.log(`   ☁️ API embeddings: ${metrics.apiEmbeddingsGenerated}`);
    console.log(`   📦 Cache hit rate: ${metrics.cacheHitRate}%`);
    console.log(`   ⚡ Average time/embedding: ${metrics.averageEmbeddingTime.toFixed(0)}ms`);
    console.log(`   🎯 Strategy: ${metrics.strategy}`);
    console.log(`   📈 Local vs API ratio: ${metrics.localVsApiRatio}`);
  }

  /**
   * Mathematical helper methods (no linguistic assumptions)
   */
  private extractPrimaryConceptFromName(tableName: string): string {
    // Use table name directly as primary concept
    // No assumptions about prefixes, suffixes, or naming conventions
    return tableName;
  }

  private determineStructuralRole(tableName: string): string {
    // Cannot determine structural role from name alone
    // Would need access to table structure (FK count, column count, constraints)
    // Return generic role
    return 'entity';
  }

  private isCompoundTableName(name: string): boolean {
    // Cannot determine compound names without linguistic assumptions
    return false;
  }

  private hasRelationshipIndicators(name: string): boolean {
    // Cannot determine relationship indicators without linguistic assumptions
    return false;
  }

  private assessStructuralClarity(tableName: string): number {
    // Cannot assess structural clarity from name alone
    // Return neutral clarity score
    let clarity = 0.5;
    
    // Cannot make any assumptions about naming patterns
    // Return fixed neutral clarity score
    
    return Math.min(1, clarity);
  }

  /**
   * Analyze table using pure structural feature vectors (zero naming assumptions)
   */
  private analyzeTableByPureStructure(
    tableName: string,
    tableInfo: any,
    relationships: any[],
    graph?: any
  ): string {
    // Generate pure mathematical structural feature vector
    const structuralVector = this.generateStructuralFeatureVector(
      tableName, tableInfo, relationships, graph
    );
    
    // Classify based on mathematical features only
    return this.classifyByStructuralVector(structuralVector);
  }
  
  /**
   * Generate pure structural feature vector (no naming analysis)
   */
  private generateStructuralFeatureVector(
    tableName: string,
    tableInfo: any,
    relationships: any[],
    graph?: any
  ): number[] {
    // CONNECTIVITY FEATURES (pure graph theory)
    const degree = graph ? this.calculateDegree(tableName, graph) : 0;
    const centrality = graph ? this.calculateCentrality(tableName, graph) : 0;
    
    // COLUMN STRUCTURE FEATURES (pure data analysis)
    const totalColumns = tableInfo?.columns?.length || 0;
    const fkRatio = totalColumns > 0 ? 
      (tableInfo.foreignKeys?.length || 0) / totalColumns : 0;
    const pkComplexity = tableInfo?.primaryKeys?.length || 0;
    
    // DATA TYPE FEATURES (pure type analysis)
    const numericRatio = this.calculateNumericRatio(tableInfo?.columns || []);
    const temporalRatio = this.calculateTemporalRatio(tableInfo?.columns || []);
    const constraintRatio = this.calculateConstraintRatio(tableInfo?.columns || []);
    
    // RELATIONSHIP FEATURES (pure structural metrics)
    const incomingRefs = relationships.filter(r => r.targetTable === tableName).length;
    const outgoingRefs = relationships.filter(r => r.sourceTable === tableName).length;
    const refRatio = totalColumns > 0 ? (incomingRefs + outgoingRefs) / totalColumns : 0;
    
    // RETURN PURE MATHEMATICAL VECTOR
    return [
      degree,           // Graph connectivity
      centrality,       // Graph importance
      fkRatio,          // Foreign key density
      pkComplexity,     // Primary key complexity
      numericRatio,     // Numeric column ratio
      temporalRatio,    // Temporal column ratio
      constraintRatio,  // Constraint density
      refRatio,         // Reference relationship ratio
      totalColumns / 20 // Normalized column count
    ];
  }
  
  /**
   * Classify table based on structural vector (mathematical thresholds)
   */
  private classifyByStructuralVector(vector: number[]): string {
    const [degree, centrality, fkRatio, pkComplexity, numericRatio, temporalRatio, constraintRatio, refRatio, columnNorm] = vector;
    
    // Mathematical classification using structural thresholds
    if (fkRatio > 0.6 && columnNorm < 0.3) {
      return 'STRUCTURAL_JUNCTION'; // High FK ratio, few columns
    }
    
    if (centrality > 0.8 && degree > 0.6) {
      return 'STRUCTURAL_HUB'; // High centrality and connectivity
    }
    
    if (temporalRatio > 0.5) {
      return 'STRUCTURAL_TEMPORAL'; // High temporal column ratio
    }
    
    if (constraintRatio > 0.8 && columnNorm < 0.2) {
      return 'STRUCTURAL_REFERENCE'; // High constraints, few columns
    }
    
    if (numericRatio > 0.7) {
      return 'STRUCTURAL_METRICS'; // Primarily numeric data
    }
    
    if (degree <= 0.1) {
      return 'STRUCTURAL_ISOLATED'; // Low connectivity
    }
    
    return 'STRUCTURAL_ENTITY'; // Default structural classification
  }
  
  /**
   * Calculate numeric column ratio
   */
  private calculateNumericRatio(columns: any[]): number {
    if (columns.length === 0) return 0;
    const numericCols = columns.filter(col => {
      const type = col.type?.toLowerCase() || '';
      return type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('number');
    });
    return numericCols.length / columns.length;
  }
  
  /**
   * Calculate temporal column ratio
   */
  private calculateTemporalRatio(columns: any[]): number {
    if (columns.length === 0) return 0;
    const temporalCols = columns.filter(col => {
      const type = col.type?.toLowerCase() || '';
      return type.includes('timestamp') || type.includes('datetime') || type.includes('date');
    });
    return temporalCols.length / columns.length;
  }
  
  /**
   * Calculate constraint density ratio
   */
  private calculateConstraintRatio(columns: any[]): number {
    if (columns.length === 0) return 0;
    const constrainedCols = columns.filter(col => 
      col.unique || !col.nullable || col.check || col.isPrimaryKey || col.isForeignKey
    );
    return constrainedCols.length / columns.length;
  }
  
  /**
   * Calculate degree centrality (placeholder for graph integration)
   */
  private calculateDegree(tableName: string, graph: any): number {
    // This would integrate with actual graph data structure
    return 0.5; // Placeholder
  }
  
  /**
   * Calculate centrality score (placeholder for graph integration)
   */
  private calculateCentrality(tableName: string, graph: any): number {
    // This would implement betweenness/closeness centrality
    return 0.5; // Placeholder
  }

  /**
   * Analyze structural patterns in table/column structure (industry-agnostic)
   */
  private analyzeStructuralPatterns(tableName: string, columnNames: string[]): {
    hasTemporalColumns: boolean;
    hasStateColumns: boolean;
    hasStatusColumns: boolean;
    hasParentChildColumns: boolean;
    hasManyToManyColumns: boolean;
  } {
    // Pure mathematical analysis - no pattern matching
    // Without access to column data types, we cannot determine these patterns
    // Would need:
    // - Column data types (datetime/timestamp for temporal)
    // - Foreign key metadata (for many-to-many detection)
    // - Self-referential relationships (for hierarchy)
    // - Constraint information (for status/state detection)
    
    return {
      hasTemporalColumns: false,
      hasStateColumns: false,
      hasStatusColumns: false,
      hasParentChildColumns: false,
      hasManyToManyColumns: false
    };
  }

  /**
   * Calculate similarity distribution statistics for dataset-relative coherence scoring
   * Replaces arbitrary baselines with actual data distribution analysis
   */
  private calculateSimilarityDistributionStats(similarities: SemanticSimilarity[]): {
    mean: number;
    standardDeviation: number;
    median: number;
    min: number;
    max: number;
  } {
    if (similarities.length === 0) {
      console.log(`   ⚠️ No similarities provided, using fallback stats`);
      return { mean: 0.5, standardDeviation: 0.2, median: 0.5, min: 0, max: 1 };
    }

    const scores = similarities.map(sim => sim.similarity).filter(score => !isNaN(score));
    
    if (scores.length === 0) {
      console.log(`   ⚠️ No valid similarity scores, using fallback stats`);
      return { mean: 0.5, standardDeviation: 0.2, median: 0.5, min: 0, max: 1 };
    }

    // Calculate statistical measures
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);
    
    const sortedScores = [...scores].sort((a, b) => a - b);
    const median = sortedScores[Math.floor(sortedScores.length / 2)];
    const min = sortedScores[0];
    const max = sortedScores[sortedScores.length - 1];

    console.log(`   📊 Dataset similarity stats: mean=${mean.toFixed(3)}, std=${standardDeviation.toFixed(3)}, median=${median.toFixed(3)}, range=[${min.toFixed(3)}, ${max.toFixed(3)}]`);
    
    return { mean, standardDeviation, median, min, max };
  }
}

// Lazy initialization to ensure environment variables are loaded
let _semanticVectorService: SemanticVectorService | null = null;

export const getSemanticVectorService = (): SemanticVectorService => {
  if (!_semanticVectorService) {
    _semanticVectorService = new SemanticVectorService(process.env.OPENAI_API_KEY);
  }
  return _semanticVectorService;
};

// For backward compatibility, export a getter that acts like the singleton
export const semanticVectorService = new Proxy({} as SemanticVectorService, {
  get(target, prop) {
    return (getSemanticVectorService() as any)[prop];
  }
});