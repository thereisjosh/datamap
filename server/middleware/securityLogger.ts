import { Request, Response, NextFunction } from 'express';
import { getDb } from '../../lib/db';
import { SecurityEvent, securityEventSchema } from '@shared/validation-schemas';

interface SecurityLogEntry {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  path: string;
  method: string;
  statusCode?: number;
  details: Record<string, any>;
  timestamp: Date;
}

interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  highEvents: number;
  topEventTypes: Array<{ type: string; count: number }>;
  topIPs: Array<{ ip: string; count: number }>;
  recentEvents: SecurityLogEntry[];
}

class SecurityLogger {
  private events: SecurityLogEntry[] = [];
  private maxInMemoryEvents = 1000;
  private alertThresholds = {
    criticalEvents: 5, // Alert after 5 critical events in 1 hour
    rateLimitViolations: 10, // Alert after 10 rate limit violations in 1 hour
    failedLogins: 5, // Alert after 5 failed logins in 5 minutes
    suspiciousFiles: 3 // Alert after 3 suspicious file uploads in 1 hour
  };

  constructor() {
    // Cleanup old events every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  public async logEvent(event: Partial<SecurityLogEntry>): Promise<void> {
    try {
      const logEntry: SecurityLogEntry = {
        eventType: event.eventType || 'unknown',
        severity: event.severity || 'low',
        userId: event.userId,
        organizationId: event.organizationId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        path: event.path || '',
        method: event.method || '',
        statusCode: event.statusCode,
        details: event.details || {},
        timestamp: new Date()
      };

      // Add to in-memory storage
      this.events.push(logEntry);

      // Keep only recent events in memory
      if (this.events.length > this.maxInMemoryEvents) {
        this.events = this.events.slice(-this.maxInMemoryEvents);
      }

      // Log to console with appropriate level
      const logMessage = this.formatLogMessage(logEntry);
      
      switch (logEntry.severity) {
        case 'critical':
          console.error('🚨 CRITICAL SECURITY EVENT:', logMessage);
          break;
        case 'high':
          console.warn('🔴 HIGH SECURITY EVENT:', logMessage);
          break;
        case 'medium':
          console.warn('🟡 MEDIUM SECURITY EVENT:', logMessage);
          break;
        case 'low':
          console.log('🔵 SECURITY EVENT:', logMessage);
          break;
      }

      // Check for alert conditions
      await this.checkAlertConditions(logEntry);

      // Persist to database if available (non-blocking)
      this.persistToDatabase(logEntry).catch(error => {
        console.error('❌ Failed to persist security event to database:', error);
      });

    } catch (error) {
      console.error('❌ Security logging error:', error);
    }
  }

  private formatLogMessage(event: SecurityLogEntry): object {
    return {
      type: event.eventType,
      severity: event.severity,
      user: event.userId,
      ip: event.ipAddress,
      path: event.path,
      details: event.details,
      timestamp: event.timestamp.toISOString()
    };
  }

  private async checkAlertConditions(newEvent: SecurityLogEntry): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Count critical events in the last hour
    const criticalEventsLastHour = this.events.filter(
      event => event.severity === 'critical' && event.timestamp > oneHourAgo
    ).length;

    if (criticalEventsLastHour >= this.alertThresholds.criticalEvents) {
      await this.triggerAlert('critical_event_threshold', {
        count: criticalEventsLastHour,
        threshold: this.alertThresholds.criticalEvents,
        timeWindow: '1 hour'
      });
    }

    // Check for rate limit violations
    if (newEvent.eventType === 'rate_limit_exceeded') {
      const rateLimitViolations = this.events.filter(
        event => event.eventType === 'rate_limit_exceeded' && 
                event.timestamp > oneHourAgo &&
                event.ipAddress === newEvent.ipAddress
      ).length;

      if (rateLimitViolations >= this.alertThresholds.rateLimitViolations) {
        await this.triggerAlert('rate_limit_abuse', {
          ip: newEvent.ipAddress,
          count: rateLimitViolations,
          threshold: this.alertThresholds.rateLimitViolations
        });
      }
    }

    // Check for failed login attempts
    if (newEvent.eventType === 'auth_failure') {
      const failedLogins = this.events.filter(
        event => event.eventType === 'auth_failure' && 
                event.timestamp > fiveMinutesAgo &&
                event.ipAddress === newEvent.ipAddress
      ).length;

      if (failedLogins >= this.alertThresholds.failedLogins) {
        await this.triggerAlert('brute_force_attempt', {
          ip: newEvent.ipAddress,
          count: failedLogins,
          threshold: this.alertThresholds.failedLogins,
          timeWindow: '5 minutes'
        });
      }
    }
  }

  private async triggerAlert(alertType: string, details: Record<string, any>): Promise<void> {
    console.error('🚨 SECURITY ALERT TRIGGERED:', {
      alertType,
      details,
      timestamp: new Date().toISOString()
    });

    // Log the alert as a critical security event
    await this.logEvent({
      eventType: 'security_alert',
      severity: 'critical',
      details: { alertType, ...details },
      path: 'system',
      method: 'ALERT'
    });

    // TODO: Implement external alerting (email, Slack, etc.)
    // await this.sendExternalAlert(alertType, details);
  }

  private async persistToDatabase(event: SecurityLogEntry): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn('⚠️ Database not available, security event not persisted');
        return;
      }

      // TODO: Create security_events table in schema and implement persistence
      // await db.insert(securityEvents).values(event);
      
    } catch (error) {
      console.error('❌ Database persistence error:', error);
    }
  }

  public getMetrics(): SecurityMetrics {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = this.events.filter(event => event.timestamp > oneHourAgo);

    // Count events by type
    const eventTypeCounts = new Map<string, number>();
    const ipCounts = new Map<string, number>();

    recentEvents.forEach(event => {
      eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) || 0) + 1);
      if (event.ipAddress) {
        ipCounts.set(event.ipAddress, (ipCounts.get(event.ipAddress) || 0) + 1);
      }
    });

    return {
      totalEvents: recentEvents.length,
      criticalEvents: recentEvents.filter(e => e.severity === 'critical').length,
      highEvents: recentEvents.filter(e => e.severity === 'high').length,
      topEventTypes: Array.from(eventTypeCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topIPs: Array.from(ipCounts.entries())
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      recentEvents: this.events.slice(-50) // Last 50 events
    };
  }

  private cleanup(): void {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const originalLength = this.events.length;
    
    this.events = this.events.filter(event => event.timestamp > twentyFourHoursAgo);
    
    const cleanedCount = originalLength - this.events.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Security logger cleaned ${cleanedCount} old events`);
    }
  }
}

// Global security logger instance
export const securityLogger = new SecurityLogger();

// Middleware to log security events
export function logSecurityEvent(eventType: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = (req as any).rateLimitContext || {};
      
      await securityLogger.logEvent({
        eventType,
        severity,
        userId: context.userId,
        organizationId: context.organizationId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        details: {
          body: req.body,
          query: req.query,
          params: req.params
        }
      });

      next();
    } catch (error) {
      console.error('❌ Security event logging error:', error);
      next();
    }
  };
}

// Middleware to log response codes and detect suspicious patterns
export function logResponseSecurity() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function(body) {
      logResponseEvent(req, res, body);
      return originalSend.call(this, body);
    };

    res.json = function(body) {
      logResponseEvent(req, res, body);
      return originalJson.call(this, body);
    };

    next();
  };
}

async function logResponseEvent(req: Request, res: Response, body: any) {
  try {
    const context = (req as any).rateLimitContext || {};
    let eventType = 'api_response';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Determine event type and severity based on status code
    if (res.statusCode >= 400) {
      if (res.statusCode === 401) {
        eventType = 'auth_failure';
        severity = 'medium';
      } else if (res.statusCode === 403) {
        eventType = 'authorization_failure';
        severity = 'medium';
      } else if (res.statusCode === 429) {
        eventType = 'rate_limit_exceeded';
        severity = 'high';
      } else if (res.statusCode >= 500) {
        eventType = 'server_error';
        severity = 'high';
      } else {
        eventType = 'client_error';
        severity = 'low';
      }

      await securityLogger.logEvent({
        eventType,
        severity,
        userId: context.userId,
        organizationId: context.organizationId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        details: {
          requestBody: req.body,
          responseBody: typeof body === 'string' ? body.substring(0, 200) : body
        }
      });
    }
  } catch (error) {
    console.error('❌ Response security logging error:', error);
  }
}

// Middleware to detect and log suspicious file uploads
export function logFileUploadSecurity() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.file) {
      const context = (req as any).rateLimitContext || {};
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      let eventType = 'file_upload';

      // Check for suspicious file characteristics
      const suspiciousIndicators = [];

      if (req.file.size > 5 * 1024 * 1024) { // > 5MB
        suspiciousIndicators.push('large_file');
        severity = 'medium';
      }

      if (req.file.originalname.includes('..') || req.file.originalname.includes('/')) {
        suspiciousIndicators.push('path_traversal_attempt');
        severity = 'high';
        eventType = 'suspicious_file_upload';
      }

      if (/[<>:"/\\|?*\x00-\x1f]/.test(req.file.originalname)) {
        suspiciousIndicators.push('invalid_filename_chars');
        severity = 'medium';
        eventType = 'suspicious_file_upload';
      }

      await securityLogger.logEvent({
        eventType,
        severity,
        userId: context.userId,
        organizationId: context.organizationId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        details: {
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          suspiciousIndicators
        }
      });
    }

    next();
  };
}