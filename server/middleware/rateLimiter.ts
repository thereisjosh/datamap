import { Request, Response, NextFunction } from 'express';
import { RateLimitConfig } from '../../shared/llm-types.js';

interface RateLimitInfo {
  count: number;
  resetTime: number;
  windowStart: number;
}

export class RateLimiter {
  private requests = new Map<string, RateLimitInfo>();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequestsPerHour: parseInt(process.env.LLM_RATE_LIMIT_PER_USER || '100'),
      maxRequestsPerMinute: parseInt(process.env.LLM_RATE_LIMIT_PER_MINUTE || '10'),
      enablePerUserLimiting: process.env.ENABLE_PER_USER_LIMITING !== 'false',
      enablePerProjectLimiting: process.env.ENABLE_PER_PROJECT_LIMITING !== 'false',
      ...config
    };

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create rate limit middleware for Express
   */
  public createMiddleware(windowMs: number = 60 * 60 * 1000, maxRequests?: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.generateKey(req);
        const limit = maxRequests || this.config.maxRequestsPerHour;
        
        if (!this.config.enablePerUserLimiting && key.startsWith('user:')) {
          return next(); // Skip user-based limiting if disabled
        }

        if (!this.config.enablePerProjectLimiting && key.startsWith('project:')) {
          return next(); // Skip project-based limiting if disabled
        }

        const now = Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;
        const resetTime = windowStart + windowMs;

        let rateLimitInfo = this.requests.get(key);

        // Reset counter if we're in a new window
        if (!rateLimitInfo || rateLimitInfo.windowStart !== windowStart) {
          rateLimitInfo = {
            count: 0,
            resetTime,
            windowStart
          };
        }

        // Check if limit exceeded
        if (rateLimitInfo.count >= limit) {
          const retryAfter = Math.ceil((resetTime - now) / 1000);
          
          res.set({
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
            'Retry-After': retryAfter.toString()
          });

          console.warn(`🚫 Rate limit exceeded for ${key}: ${rateLimitInfo.count}/${limit} requests`);

          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. Limit: ${limit} requests per ${windowMs / 1000 / 60} minutes`,
            retryAfter,
            resetTime: new Date(resetTime).toISOString()
          });
        }

        // Increment counter
        rateLimitInfo.count++;
        this.requests.set(key, rateLimitInfo);

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': Math.max(0, limit - rateLimitInfo.count).toString(),
          'X-RateLimit-Reset': resetTime.toString()
        });

        console.log(`✅ Rate limit check passed for ${key}: ${rateLimitInfo.count}/${limit} requests`);
        next();

      } catch (error) {
        console.error('❌ Rate limiting error:', error);
        // Don't block on rate limiter errors
        next();
      }
    };
  }

  /**
   * Generate unique key for rate limiting
   */
  private generateKey(req: Request): string {
    // Prefer user ID if available (from auth middleware)
    const user = (req as any).user;
    if (user?.id) {
      return `user:${user.id}`;
    }

    // Fall back to project ID if available
    const projectId = req.body?.projectId || req.params?.projectId || req.query?.projectId;
    if (projectId) {
      return `project:${projectId}`;
    }

    // Fall back to IP address
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    return `ip:${ip}`;
  }

  /**
   * Check current rate limit status for a key
   */
  public checkLimit(key: string, windowMs: number = 60 * 60 * 1000, maxRequests: number = this.config.maxRequestsPerHour): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetTime = windowStart + windowMs;

    let rateLimitInfo = this.requests.get(key);

    if (!rateLimitInfo || rateLimitInfo.windowStart !== windowStart) {
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime
      };
    }

    const allowed = rateLimitInfo.count < maxRequests;
    const remaining = Math.max(0, maxRequests - rateLimitInfo.count);
    const retryAfter = allowed ? undefined : Math.ceil((resetTime - now) / 1000);

    return {
      allowed,
      remaining,
      resetTime,
      retryAfter
    };
  }

  /**
   * Manually increment counter (for testing or special cases)
   */
  public incrementCounter(key: string, windowMs: number = 60 * 60 * 1000): void {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetTime = windowStart + windowMs;

    let rateLimitInfo = this.requests.get(key);

    if (!rateLimitInfo || rateLimitInfo.windowStart !== windowStart) {
      rateLimitInfo = {
        count: 0,
        resetTime,
        windowStart
      };
    }

    rateLimitInfo.count++;
    this.requests.set(key, rateLimitInfo);
  }

  /**
   * Reset rate limit for a specific key
   */
  public resetLimit(key: string): void {
    this.requests.delete(key);
    console.log(`🔄 Rate limit reset for ${key}`);
  }

  /**
   * Get current statistics
   */
  public getStats(): {
    totalKeys: number;
    activeUsers: number;
    activeProjects: number;
    activeIPs: number;
  } {
    const keys = Array.from(this.requests.keys());
    
    return {
      totalKeys: keys.length,
      activeUsers: keys.filter(k => k.startsWith('user:')).length,
      activeProjects: keys.filter(k => k.startsWith('project:')).length,
      activeIPs: keys.filter(k => k.startsWith('ip:')).length
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    const keysToDelete: string[] = [];
    this.requests.forEach((info, key) => {
      if (info.resetTime < now) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.requests.delete(key);
      cleanedCount++;
    });

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }
}

// Create middleware instances for different limits
export const rateLimiter = new RateLimiter();

// Standard rate limiting middleware (100 requests per hour)
export const standardRateLimit = rateLimiter.createMiddleware(60 * 60 * 1000, 100);

// Strict rate limiting for expensive operations (10 requests per hour)
export const strictRateLimit = rateLimiter.createMiddleware(60 * 60 * 1000, 10);

// Per-minute rate limiting for chat (10 requests per minute)
export const chatRateLimit = rateLimiter.createMiddleware(60 * 1000, 10);

// SQL generation rate limiting (20 requests per hour)
export const sqlGenerationRateLimit = rateLimiter.createMiddleware(60 * 60 * 1000, 20);

/**
 * Custom rate limit middleware factory
 */
export function createCustomRateLimit(
  windowMs: number,
  maxRequests: number,
  message?: string
) {
  const customLimiter = new RateLimiter();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const middleware = customLimiter.createMiddleware(windowMs, maxRequests);
    
    // Override error message if provided
    const originalJson = res.json;
    res.json = function(body: any) {
      if (res.statusCode === 429 && message) {
        body.message = message;
      }
      return originalJson.call(this, body);
    };
    
    return middleware(req, res, next);
  };
}

/**
 * Rate limit bypass middleware for testing or admin users
 */
export function bypassRateLimit(condition: (req: Request) => boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (condition(req)) {
      console.log('🎭 Rate limit bypassed for request');
      return next();
    }
    return standardRateLimit(req, res, next);
  };
}

export default rateLimiter;