/**
 * Production RAG-Standard Rate-Limited OpenAI Embedding Client
 * Implements circuit breaker pattern, exponential backoff, and intelligent retry logic
 */

export interface RateLimitConfig {
  tokensPerMinute: number;              // OpenAI API rate limit
  maxConcurrentRequests: number;        // Max parallel requests
  maxRetries: number;                   // Max retry attempts
  baseRetryDelay: number;               // Initial retry delay (ms)
  maxRetryDelay: number;                // Maximum retry delay (ms)
  jitterEnabled: boolean;               // Add random jitter to delays
  circuitBreakerThreshold: number;      // Failure rate to trigger circuit breaker
  circuitBreakerTimeout: number;        // Time before retrying after circuit break (ms)
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retryCount: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
  averageLatency: number;
  currentTokens: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class RateLimitedEmbeddingClient {
  private readonly config: RateLimitConfig;
  private readonly openaiApiKey: string;
  
  // Token bucket for rate limiting
  private tokens: number;
  private lastRefill: number;
  private readonly tokenRefillRate: number;
  
  // Circuit breaker state
  private circuitState: CircuitState = 'CLOSED';
  private circuitOpenTime: number = 0;
  private recentFailures: number[] = [];
  
  // Request queue and concurrency control
  private activeRequests: number = 0;
  private requestQueue: Array<() => void> = [];
  
  // Metrics tracking
  private metrics: RequestMetrics;
  private latencies: number[] = [];

  constructor(apiKey: string, config: Partial<RateLimitConfig> = {}) {
    this.openaiApiKey = apiKey;
    this.config = {
      tokensPerMinute: 3000,            // Realistic for Tier 2+ (3000 RPM = 50 RPS)
      maxConcurrentRequests: 20,        // Higher concurrency for better throughput
      maxRetries: 5,                    // More retries for rate limit resilience
      baseRetryDelay: 1000,             // 1 second base delay
      maxRetryDelay: 64000,             // 64 seconds max (exponential: 1,2,4,8,16,32,64)
      jitterEnabled: true,              // Prevent thundering herd
      circuitBreakerThreshold: 0.7,     // More tolerant (70% failure rate)
      circuitBreakerTimeout: 120000,    // 2 minutes recovery time
      ...config
    };

    // Initialize token bucket
    this.tokens = this.config.tokensPerMinute;
    this.lastRefill = Date.now();
    this.tokenRefillRate = this.config.tokensPerMinute / (60 * 1000); // tokens per ms

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retryCount: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      averageLatency: 0,
      currentTokens: this.tokens
    };

    console.log(`🛡️ Rate Limited OpenAI Client initialized:`);
    console.log(`   🪣 Token bucket: ${this.config.tokensPerMinute} tokens/minute`);
    console.log(`   🔄 Max concurrent: ${this.config.maxConcurrentRequests} requests`);
    console.log(`   🔁 Max retries: ${this.config.maxRetries}`);
    console.log(`   ⚡ Circuit breaker: ${(this.config.circuitBreakerThreshold * 100).toFixed(0)}% failure threshold`);
  }

  /**
   * Generate embeddings with production-grade resilience
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    this.metrics.totalRequests++;
    
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is OPEN - too many recent failures');
    }

    // Acquire resources (token + concurrency slot)
    await this.acquireResources();

    const startTime = Date.now();

    try {
      const embedding = await this.makeRequest(text);
      
      // Record success
      this.recordSuccess(Date.now() - startTime);
      this.updateCircuitBreaker(true);
      
      return embedding;
    } catch (error) {
      // Record failure
      this.recordFailure(Date.now() - startTime);
      this.updateCircuitBreaker(false);
      
      throw error;
    } finally {
      // Always release concurrency slot
      this.releaseRequest();
    }
  }

  /**
   * Make embedding request with intelligent retry logic
   */
  private async makeRequest(text: string, attempt: number = 1): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ERDBuilder-RAG-Client/1.0'
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-large',     // Latest OpenAI model with 1536D embeddings
          dimensions: 1536                     // Specify enterprise-grade dimensions
        })
      });

      // Handle different HTTP status codes
      if (response.ok) {
        // Process rate limit headers for adaptive rate limiting
        this.processRateLimitHeaders(response);
        
        const data = await response.json();
        return data.data[0].embedding;
      }

      // Handle rate limiting (429)
      if (response.status === 429) {
        this.metrics.rateLimitHits++;
        
        if (attempt <= this.config.maxRetries) {
          const retryAfter = this.getRetryAfterDelay(response, attempt);
          console.log(`   🚦 Rate limited (attempt ${attempt}/${this.config.maxRetries}), retrying in ${retryAfter}ms`);
          
          await this.delay(retryAfter);
          this.metrics.retryCount++;
          return this.makeRequest(text, attempt + 1);
        }
      }

      // Handle other client/server errors
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`OpenAI API client error: ${response.status} ${response.statusText}`);
      }

      if (response.status >= 500) {
        if (attempt <= this.config.maxRetries) {
          const retryDelay = this.calculateExponentialBackoff(attempt);
          console.log(`   🔄 Server error ${response.status}, retrying in ${retryDelay}ms (attempt ${attempt}/${this.config.maxRetries})`);
          
          await this.delay(retryDelay);
          this.metrics.retryCount++;
          return this.makeRequest(text, attempt + 1);
        }
      }

      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);

    } catch (error) {
      // Handle network errors
      if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        if (attempt <= this.config.maxRetries) {
          const retryDelay = this.calculateExponentialBackoff(attempt);
          console.log(`   🌐 Network error, retrying in ${retryDelay}ms (attempt ${attempt}/${this.config.maxRetries})`);
          
          await this.delay(retryDelay);
          this.metrics.retryCount++;
          return this.makeRequest(text, attempt + 1);
        }
      }

      throw error;
    }
  }

  /**
   * Acquire both token bucket token and concurrency slot
   */
  private async acquireResources(): Promise<void> {
    // Wait for concurrency slot
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      await new Promise<void>(resolve => {
        this.requestQueue.push(resolve);
      });
    }

    // Acquire token
    await this.acquireToken();
    
    // Reserve concurrency slot
    this.activeRequests++;
  }

  /**
   * Enhanced token bucket implementation for rate limiting
   */
  private async acquireToken(): Promise<void> {
    const now = Date.now();
    
    // Refill tokens based on elapsed time
    const timeSinceRefill = now - this.lastRefill;
    const tokensToAdd = timeSinceRefill * this.tokenRefillRate;
    
    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.config.tokensPerMinute, this.tokens + Math.floor(tokensToAdd));
      this.lastRefill = now;
    }

    // Wait if no tokens available
    if (this.tokens < 1) {
      // Calculate more precise wait time based on refill rate
      const waitTime = Math.ceil((1 - this.tokens) / this.tokenRefillRate);
      console.log(`   🚦 Rate limit queue: waiting ${waitTime}ms for token (${Math.floor(this.tokens)} tokens remaining)`);
      await this.delay(waitTime);
      return this.acquireToken();
    }

    // Consume token
    this.tokens--;
    this.metrics.currentTokens = this.tokens;
  }

  /**
   * Release concurrency slot and notify queue
   */
  private releaseRequest(): void {
    this.activeRequests--;
    
    if (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
      const nextResolve = this.requestQueue.shift();
      if (nextResolve) {
        nextResolve();
      }
    }
  }

  /**
   * Get retry delay from Rate-Limit headers or calculate default
   */
  private getRetryAfterDelay(response: Response, attempt: number): number {
    // Check for Retry-After header
    const retryAfterHeader = response.headers.get('Retry-After');
    if (retryAfterHeader) {
      const retryAfter = parseInt(retryAfterHeader, 10) * 1000; // Convert to ms
      if (!isNaN(retryAfter)) {
        return this.addJitter(retryAfter);
      }
    }

    // Fallback to exponential backoff
    return this.calculateExponentialBackoff(attempt);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateExponentialBackoff(attempt: number): number {
    const delay = Math.min(
      this.config.baseRetryDelay * Math.pow(2, attempt - 1),
      this.config.maxRetryDelay
    );
    
    return this.addJitter(delay);
  }

  /**
   * Add jitter to prevent thundering herd
   */
  private addJitter(delay: number): number {
    if (!this.config.jitterEnabled) {
      return delay;
    }

    // Add up to 25% jitter
    const jitter = delay * 0.25 * Math.random();
    return Math.floor(delay + jitter);
  }

  /**
   * Process OpenAI rate limit headers for adaptive rate limiting
   */
  private processRateLimitHeaders(response: Response): void {
    // OpenAI provides rate limit information in headers
    const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
    const resetRequests = response.headers.get('x-ratelimit-reset-requests');
    const remainingTokens = response.headers.get('x-ratelimit-remaining-tokens');
    const resetTokens = response.headers.get('x-ratelimit-reset-tokens');

    if (remainingRequests && parseInt(remainingRequests) < 10) {
      console.log(`   ⚠️ Low API quota: ${remainingRequests} requests remaining`);
    }

    if (remainingTokens && parseInt(remainingTokens) < 1000) {
      console.log(`   ⚠️ Low token quota: ${remainingTokens} tokens remaining`);
    }

    // Adaptive rate limiting: slow down if we're close to limits
    if (remainingRequests && parseInt(remainingRequests) < 50) {
      // Temporarily reduce our rate when approaching limits
      this.tokens = Math.min(this.tokens, Math.floor(this.config.tokensPerMinute * 0.1));
      console.log(`   📉 Reduced local rate limit due to API quota (${remainingRequests} requests left)`);
    }
  }

  /**
   * Circuit breaker logic
   */
  private isCircuitOpen(): boolean {
    const now = Date.now();
    
    switch (this.circuitState) {
      case 'OPEN':
        if (now - this.circuitOpenTime >= this.config.circuitBreakerTimeout) {
          console.log('   🔄 Circuit breaker transitioning to HALF_OPEN');
          this.circuitState = 'HALF_OPEN';
          return false;
        }
        return true;
      
      case 'HALF_OPEN':
        // Allow one request to test if service is recovered
        return false;
      
      case 'CLOSED':
      default:
        return false;
    }
  }

  /**
   * Update circuit breaker state based on request result
   */
  private updateCircuitBreaker(success: boolean): void {
    const now = Date.now();
    
    // Clean old failures (older than 60 seconds)
    this.recentFailures = this.recentFailures.filter(time => now - time < 60000);
    
    if (!success) {
      this.recentFailures.push(now);
    }

    // Calculate recent failure rate
    const totalRecentRequests = this.recentFailures.length + (success ? 1 : 0);
    const failureRate = this.recentFailures.length / Math.max(totalRecentRequests, 1);

    switch (this.circuitState) {
      case 'CLOSED':
        if (failureRate >= this.config.circuitBreakerThreshold && totalRecentRequests >= 5) {
          console.warn(`⚡ Circuit breaker OPEN: ${(failureRate * 100).toFixed(1)}% failure rate`);
          this.circuitState = 'OPEN';
          this.circuitOpenTime = now;
          this.metrics.circuitBreakerTrips++;
        }
        break;
      
      case 'HALF_OPEN':
        if (success) {
          console.log('✅ Circuit breaker CLOSED: Service recovered');
          this.circuitState = 'CLOSED';
          this.recentFailures = []; // Reset failure tracking
        } else {
          console.warn('❌ Circuit breaker OPEN: Service still failing');
          this.circuitState = 'OPEN';
          this.circuitOpenTime = now;
          this.metrics.circuitBreakerTrips++;
        }
        break;
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(latency: number): void {
    this.metrics.successfulRequests++;
    this.latencies.push(latency);
    this.updateAverageLatency();
  }

  /**
   * Record failed request
   */
  private recordFailure(latency: number): void {
    this.metrics.failedRequests++;
    this.latencies.push(latency);
    this.updateAverageLatency();
  }

  /**
   * Update average latency calculation
   */
  private updateAverageLatency(): void {
    // Keep only last 100 latencies for rolling average
    if (this.latencies.length > 100) {
      this.latencies = this.latencies.slice(-100);
    }
    
    this.metrics.averageLatency = this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length;
  }

  /**
   * Get current metrics
   */
  public getMetrics(): RequestMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing)
   */
  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retryCount: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      averageLatency: 0,
      currentTokens: this.tokens
    };
    this.latencies = [];
    this.recentFailures = [];
  }

  /**
   * Force circuit breaker state (useful for testing)
   */
  public setCircuitBreakerState(state: CircuitState): void {
    this.circuitState = state;
    if (state === 'OPEN') {
      this.circuitOpenTime = Date.now();
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}