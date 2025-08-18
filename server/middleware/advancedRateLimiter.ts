import { Request, Response, NextFunction } from 'express';

interface AdvancedRateLimitInfo {
  count: number;
  resetTime: number;
  windowStart: number;
  violations: number; // Track repeated violations for progressive penalties
  lastViolation: number; // Timestamp of last violation
  penaltyMultiplier: number; // Current penalty multiplier
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  message?: string;
  progressivePenalty?: {
    enabled: boolean;
    maxMultiplier: number;
    decayTime: number; // Time for penalty to decay
  };
}

export class AdvancedRateLimiter {
  private requests = new Map<string, AdvancedRateLimitInfo>();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator.bind(this),
      message: config.message || 'Too many requests',
      progressivePenalty: {
        enabled: true,
        maxMultiplier: 3,
        decayTime: 60 * 60 * 1000, // 1 hour
        ...config.progressivePenalty
      }
    };

    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private defaultKeyGenerator(req: Request): string {
    // Prefer user ID if available for authenticated requests
    const context = (req as any).rateLimitContext;
    if (context?.userId) {
      return `user:${context.userId}`;
    }
    
    // Fall back to IP address
    return `ip:${req.ip}`;
  }

  private calculateEffectiveLimit(info: AdvancedRateLimitInfo): number {
    if (!this.config.progressivePenalty.enabled) {
      return this.config.maxRequests;
    }

    // Apply penalty multiplier to reduce allowed requests
    const penalizedLimit = Math.floor(this.config.maxRequests / info.penaltyMultiplier);
    return Math.max(1, penalizedLimit); // Ensure at least 1 request is allowed
  }

  private updateViolations(info: AdvancedRateLimitInfo): void {
    if (!this.config.progressivePenalty.enabled) return;

    const now = Date.now();
    
    // Check if violations should decay
    if (info.lastViolation && 
        (now - info.lastViolation) > this.config.progressivePenalty.decayTime) {
      info.violations = Math.max(0, info.violations - 1);
      info.penaltyMultiplier = Math.max(1, info.penaltyMultiplier - 0.5);
    }

    // Increment violations and penalty
    info.violations++;
    info.lastViolation = now;
    info.penaltyMultiplier = Math.min(
      this.config.progressivePenalty.maxMultiplier,
      1 + (info.violations * 0.5)
    );
  }

  public createMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const key = this.config.keyGenerator(req);
        const now = Date.now();
        const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
        const resetTime = windowStart + this.config.windowMs;

        let rateLimitInfo = this.requests.get(key);

        // Reset counter if we're in a new window
        if (!rateLimitInfo || rateLimitInfo.windowStart !== windowStart) {
          rateLimitInfo = {
            count: 0,
            resetTime,
            windowStart,
            violations: rateLimitInfo?.violations || 0,
            lastViolation: rateLimitInfo?.lastViolation || 0,
            penaltyMultiplier: rateLimitInfo?.penaltyMultiplier || 1
          };
        }

        const effectiveLimit = this.calculateEffectiveLimit(rateLimitInfo);

        // Check if limit exceeded
        if (rateLimitInfo.count >= effectiveLimit) {
          this.updateViolations(rateLimitInfo);
          this.requests.set(key, rateLimitInfo);

          const retryAfter = Math.ceil((resetTime - now) / 1000);
          
          // Set rate limit headers
          res.set({
            'X-RateLimit-Limit': this.config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
            'X-RateLimit-Penalty-Multiplier': rateLimitInfo.penaltyMultiplier.toString(),
            'Retry-After': retryAfter.toString()
          });

          console.warn('🚫 Advanced rate limit exceeded:', {
            key,
            count: rateLimitInfo.count,
            limit: effectiveLimit,
            originalLimit: this.config.maxRequests,
            violations: rateLimitInfo.violations,
            penaltyMultiplier: rateLimitInfo.penaltyMultiplier,
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
          });

          return res.status(429).json({
            success: false,
            error: this.config.message,
            details: {
              limit: effectiveLimit,
              remaining: 0,
              resetTime: new Date(resetTime).toISOString(),
              retryAfter,
              penaltyActive: rateLimitInfo.penaltyMultiplier > 1
            },
            timestamp: new Date().toISOString()
          });
        }

        // Increment counter
        rateLimitInfo.count++;
        this.requests.set(key, rateLimitInfo);

        // Set rate limit headers for successful requests
        res.set({
          'X-RateLimit-Limit': this.config.maxRequests.toString(),
          'X-RateLimit-Remaining': Math.max(0, effectiveLimit - rateLimitInfo.count).toString(),
          'X-RateLimit-Reset': resetTime.toString()
        });

        // Track successful requests for monitoring
        if (rateLimitInfo.count === 1) {
          console.log('📊 Rate limit window started:', {
            key,
            limit: effectiveLimit,
            originalLimit: this.config.maxRequests,
            penaltyMultiplier: rateLimitInfo.penaltyMultiplier
          });
        }

        next();
      } catch (error) {
        console.error('❌ Advanced rate limiting error:', error);
        // Don't block on rate limiter errors
        next();
      }
    };
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    const keysToDelete: string[] = [];
    this.requests.forEach((info, key) => {
      // Remove expired entries
      if (info.resetTime < now) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.requests.delete(key);
      cleanedCount++;
    });

    if (cleanedCount > 0) {
      console.log(`🧹 Advanced rate limiter cleaned ${cleanedCount} expired entries`);
    }
  }

  public getStats(): {
    totalKeys: number;
    penalizedKeys: number;
    highViolationKeys: number;
  } {
    let penalizedKeys = 0;
    let highViolationKeys = 0;

    this.requests.forEach(info => {
      if (info.penaltyMultiplier > 1) penalizedKeys++;
      if (info.violations >= 3) highViolationKeys++;
    });

    return {
      totalKeys: this.requests.size,
      penalizedKeys,
      highViolationKeys
    };
  }

  public resetUserLimit(userId: string): boolean {
    const key = `user:${userId}`;
    const deleted = this.requests.delete(key);
    if (deleted) {
      console.log(`🔄 Rate limit reset for user: ${userId}`);
    }
    return deleted;
  }
}

// Pre-configured rate limiters for different endpoint types
export const fileUploadLimiter = new AdvancedRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: 'Too many file uploads. Please try again later.',
  progressivePenalty: {
    enabled: true,
    maxMultiplier: 5,
    decayTime: 2 * 60 * 60 * 1000 // 2 hours
  }
});

export const chatLimiter = new AdvancedRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50,
  message: 'Too many chat messages. Please slow down.',
  progressivePenalty: {
    enabled: true,
    maxMultiplier: 3,
    decayTime: 30 * 60 * 1000 // 30 minutes
  }
});

export const sqlGenerationLimiter = new AdvancedRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,
  message: 'Too many SQL generation requests. Please try again later.',
  progressivePenalty: {
    enabled: true,
    maxMultiplier: 4,
    decayTime: 60 * 60 * 1000 // 1 hour
  }
});

export const analysisLimiter = new AdvancedRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 30,
  message: 'Too many analysis requests. Please try again later.',
  progressivePenalty: {
    enabled: true,
    maxMultiplier: 3,
    decayTime: 45 * 60 * 1000 // 45 minutes
  }
});

export const adminLimiter = new AdvancedRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
  message: 'Too many admin operations. Please try again later.',
  keyGenerator: (req: Request) => {
    const context = (req as any).rateLimitContext;
    return `admin:${context?.userId || req.ip}`;
  },
  progressivePenalty: {
    enabled: false // Admins don't get progressive penalties
  }
});

// Burst protection limiter (short window, low limit)
export const burstProtectionLimiter = new AdvancedRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many requests in a short time. Please slow down.',
  progressivePenalty: {
    enabled: true,
    maxMultiplier: 2,
    decayTime: 5 * 60 * 1000 // 5 minutes
  }
});

// Export middleware functions
export const fileUploadRateLimit = fileUploadLimiter.createMiddleware();
export const chatRateLimit = chatLimiter.createMiddleware();
export const sqlGenerationRateLimit = sqlGenerationLimiter.createMiddleware();
export const analysisRateLimit = analysisLimiter.createMiddleware();
export const adminRateLimit = adminLimiter.createMiddleware();
export const burstProtection = burstProtectionLimiter.createMiddleware();