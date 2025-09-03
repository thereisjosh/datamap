/**
 * Production RAG-Standard Embedding Batch Processor
 * Handles large-scale embedding generation with rate limiting, retry logic, and resilient processing
 */

import type { TableInfo } from './coreTableDiscoveryService';
import type { TableVector, TableEmbeddingOptions } from './semanticVectorService';

export interface BatchProcessingOptions {
  batchSize: number;                    // Tables per batch (default: 20)
  maxConcurrentBatches: number;         // Parallel batches (default: 2)
  rateLimitRPM: number;                 // OpenAI rate limit per minute (default: 50)
  maxRetries: number;                   // Max retries per request (default: 3)
  baseRetryDelay: number;               // Initial retry delay in ms (default: 1000)
  enableJitter: boolean;                // Add jitter to retry delays (default: true)
  resumable: boolean;                   // Enable resumable processing (default: true)
}

export interface BatchProgress {
  totalTables: number;
  processedTables: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  currentBatch: number;
  totalBatches: number;
  rateLimitHits: number;
  averageLatency: number;
  estimatedTimeRemaining: number;      // seconds
}

export interface BatchProcessingResult {
  vectors: TableVector[];
  progress: BatchProgress;
  errors: Array<{
    tableName: string;
    error: string;
    retryCount: number;
  }>;
  metrics: {
    totalProcessingTime: number;
    averageTimePerTable: number;
    apiCallsCount: number;
    cacheHitRate: number;
    rateLimitRecoveryTime: number;
  };
}

export class EmbeddingBatchProcessor {
  private readonly options: BatchProcessingOptions;
  private readonly rateLimitQueue: Array<() => Promise<void>> = [];
  private rateLimitTokens: number;
  private lastTokenRefill: number;
  private progress: BatchProgress;
  private startTime: number;
  private latencies: number[] = [];

  constructor(options: Partial<BatchProcessingOptions> = {}) {
    this.options = {
      batchSize: 10,                       // Smaller batches for better control
      maxConcurrentBatches: 6,             // Higher concurrency for better throughput
      rateLimitRPM: 200,                   // More realistic for Tier 2+ (70% of 3000 RPM)
      maxRetries: 5,                       // More retries for resilience
      baseRetryDelay: 1000,
      enableJitter: true,
      resumable: true,
      ...options
    };

    // Initialize rate limiting with token bucket algorithm
    this.rateLimitTokens = this.options.rateLimitRPM;
    this.lastTokenRefill = Date.now();
    this.progress = this.initializeProgress();
    this.startTime = Date.now();

    console.log(`🏭 Embedding Batch Processor initialized:`);
    console.log(`   📦 Batch size: ${this.options.batchSize} tables`);
    console.log(`   🔄 Max concurrent: ${this.options.maxConcurrentBatches} batches`);
    console.log(`   ⏱️ Rate limit: ${this.options.rateLimitRPM} requests/minute`);
  }

  /**
   * Process tables in batches with rate limiting and resilient error handling
   */
  public async processTables(
    tables: TableInfo[],
    embeddingGenerator: (table: TableInfo, options: TableEmbeddingOptions) => Promise<TableVector>,
    embeddingOptions: TableEmbeddingOptions = {} as TableEmbeddingOptions
  ): Promise<BatchProcessingResult> {
    console.log(`🚀 Starting batch processing for ${tables.length} tables`);
    
    this.progress = this.initializeProgress(tables.length);
    this.startTime = Date.now();
    
    // Split tables into batches
    const batches = this.createBatches(tables);
    console.log(`   📊 Created ${batches.length} batches of ~${this.options.batchSize} tables each`);

    const allVectors: TableVector[] = [];
    const allErrors: Array<{ tableName: string; error: string; retryCount: number }> = [];
    
    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += this.options.maxConcurrentBatches) {
      const batchGroup = batches.slice(i, i + this.options.maxConcurrentBatches);
      
      // Process batch group in parallel
      const batchPromises = batchGroup.map((batch, batchIndex) => 
        this.processBatch(
          batch, 
          i + batchIndex, 
          embeddingGenerator, 
          embeddingOptions
        )
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect results from batch group
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          allVectors.push(...result.value.vectors);
          allErrors.push(...result.value.errors);
        } else {
          // Handle batch failure
          const batchTables = batchGroup[batchIndex];
          batchTables.forEach(table => {
            allErrors.push({
              tableName: table.name,
              error: `Batch processing failed: ${result.reason}`,
              retryCount: this.options.maxRetries
            });
          });
        }
      });

      // Log progress
      this.updateProgress(allVectors.length, allErrors.length);
      this.logProgress();
    }

    const metrics = this.calculateMetrics(allVectors.length);
    
    console.log(`✅ Batch processing completed:`);
    console.log(`   📊 Successfully processed: ${allVectors.length}/${tables.length} tables`);
    console.log(`   ❌ Failed: ${allErrors.length} tables`);
    console.log(`   ⏱️ Total time: ${(metrics.totalProcessingTime / 1000).toFixed(1)}s`);
    console.log(`   📈 Average per table: ${metrics.averageTimePerTable.toFixed(0)}ms`);

    return {
      vectors: allVectors,
      progress: this.progress,
      errors: allErrors,
      metrics
    };
  }

  /**
   * Process a single batch of tables
   */
  private async processBatch(
    tables: TableInfo[],
    batchIndex: number,
    embeddingGenerator: (table: TableInfo, options: TableEmbeddingOptions) => Promise<TableVector>,
    embeddingOptions: TableEmbeddingOptions
  ): Promise<{ vectors: TableVector[]; errors: Array<{ tableName: string; error: string; retryCount: number }> }> {
    console.log(`   🔄 Processing batch ${batchIndex + 1}: ${tables.length} tables`);
    
    const vectors: TableVector[] = [];
    const errors: Array<{ tableName: string; error: string; retryCount: number }> = [];
    
    // Process tables in batch sequentially to respect rate limits
    for (const table of tables) {
      try {
        const vector = await this.processTableWithRetry(table, embeddingGenerator, embeddingOptions);
        vectors.push(vector);
      } catch (error) {
        errors.push({
          tableName: table.name,
          error: error.message,
          retryCount: this.options.maxRetries
        });
      }
    }
    
    return { vectors, errors };
  }

  /**
   * Process single table with rate limiting and retry logic
   */
  private async processTableWithRetry(
    table: TableInfo,
    embeddingGenerator: (table: TableInfo, options: TableEmbeddingOptions) => Promise<TableVector>,
    embeddingOptions: TableEmbeddingOptions,
    retryCount: number = 0
  ): Promise<TableVector> {
    // Apply rate limiting
    await this.acquireRateLimit();
    
    const startTime = Date.now();
    
    try {
      const vector = await embeddingGenerator(table, embeddingOptions);
      
      // Record latency
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      
      return vector;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      
      // Check if this is a rate limit error
      if (error.message.includes('429') && retryCount < this.options.maxRetries) {
        this.progress.rateLimitHits++;
        
        const delay = this.calculateBackoffDelay(retryCount);
        console.log(`   ⏳ Rate limit hit for ${table.name}, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.options.maxRetries})`);
        
        await this.delay(delay);
        return this.processTableWithRetry(table, embeddingGenerator, embeddingOptions, retryCount + 1);
      }
      
      // For other errors or max retries exceeded
      throw error;
    }
  }

  /**
   * Rate limiting using token bucket algorithm
   */
  private async acquireRateLimit(): Promise<void> {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const timeSinceRefill = now - this.lastTokenRefill;
    const tokensToAdd = Math.floor(timeSinceRefill * this.options.rateLimitRPM / (60 * 1000));
    
    if (tokensToAdd > 0) {
      this.rateLimitTokens = Math.min(this.options.rateLimitRPM, this.rateLimitTokens + tokensToAdd);
      this.lastTokenRefill = now;
    }
    
    // Wait if no tokens available
    if (this.rateLimitTokens <= 0) {
      const waitTime = Math.ceil((60 * 1000) / this.options.rateLimitRPM);
      console.log(`   🚦 Rate limit queue: waiting ${waitTime}ms for token`);
      await this.delay(waitTime);
      return this.acquireRateLimit();
    }
    
    // Consume token
    this.rateLimitTokens--;
  }

  /**
   * Calculate backoff delay with exponential backoff and optional jitter
   */
  private calculateBackoffDelay(retryCount: number): number {
    const exponentialDelay = this.options.baseRetryDelay * Math.pow(2, retryCount);
    
    if (!this.options.enableJitter) {
      return exponentialDelay;
    }
    
    // Add jitter (±25% variation)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(100, exponentialDelay + jitter);
  }

  /**
   * Create batches from tables array
   */
  private createBatches(tables: TableInfo[]): TableInfo[][] {
    const batches: TableInfo[][] = [];
    
    for (let i = 0; i < tables.length; i += this.options.batchSize) {
      batches.push(tables.slice(i, i + this.options.batchSize));
    }
    
    return batches;
  }

  /**
   * Initialize progress tracking
   */
  private initializeProgress(totalTables: number = 0): BatchProgress {
    return {
      totalTables,
      processedTables: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(totalTables / this.options.batchSize),
      rateLimitHits: 0,
      averageLatency: 0,
      estimatedTimeRemaining: 0
    };
  }

  /**
   * Update progress tracking
   */
  private updateProgress(successCount: number, errorCount: number): void {
    this.progress.successfulEmbeddings = successCount;
    this.progress.failedEmbeddings = errorCount;
    this.progress.processedTables = successCount + errorCount;
    
    // Calculate average latency
    if (this.latencies.length > 0) {
      this.progress.averageLatency = this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length;
    }
    
    // Estimate time remaining
    if (this.progress.processedTables > 0) {
      const elapsed = Date.now() - this.startTime;
      const avgTimePerTable = elapsed / this.progress.processedTables;
      const remaining = this.progress.totalTables - this.progress.processedTables;
      this.progress.estimatedTimeRemaining = Math.round((avgTimePerTable * remaining) / 1000);
    }
  }

  /**
   * Log current progress
   */
  private logProgress(): void {
    const percent = (this.progress.processedTables / this.progress.totalTables * 100).toFixed(1);
    const eta = this.progress.estimatedTimeRemaining;
    
    console.log(`   📊 Progress: ${this.progress.processedTables}/${this.progress.totalTables} (${percent}%) | ETA: ${eta}s`);
    
    if (this.progress.rateLimitHits > 0) {
      console.log(`   🚦 Rate limit recoveries: ${this.progress.rateLimitHits}`);
    }
  }

  /**
   * Calculate final metrics
   */
  private calculateMetrics(successCount: number): BatchProcessingResult['metrics'] {
    const totalTime = Date.now() - this.startTime;
    const avgLatency = this.latencies.length > 0 ? 
      this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length : 0;
    
    return {
      totalProcessingTime: totalTime,
      averageTimePerTable: avgLatency,
      apiCallsCount: this.progress.processedTables + this.progress.rateLimitHits, // Including retries
      cacheHitRate: 0, // Will be implemented in Phase 3
      rateLimitRecoveryTime: this.progress.rateLimitHits * this.options.baseRetryDelay
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}