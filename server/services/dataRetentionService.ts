import { getDb } from '../../lib/db';
import { uploadSessions, securityEvents } from '@shared/schema';
import { lt } from 'drizzle-orm';

interface RetentionStats {
  uploadSessionsDeleted: number;
  securityEventsDeleted: number;
  lastCleanup: Date;
}

export class DataRetentionService {
  private isRunning = false;
  private stats: RetentionStats = {
    uploadSessionsDeleted: 0,
    securityEventsDeleted: 0,
    lastCleanup: new Date()
  };

  constructor() {
    // Run cleanup every 24 hours
    setInterval(() => this.runDailyCleanup(), 24 * 60 * 60 * 1000);
    
    // Run initial cleanup after 5 minutes of startup
    setTimeout(() => this.runDailyCleanup(), 5 * 60 * 1000);
  }

  public async runDailyCleanup(): Promise<RetentionStats> {
    if (this.isRunning) {
      console.log('📅 Data retention cleanup already running, skipping...');
      return this.stats;
    }

    this.isRunning = true;
    console.log('📅 Starting daily data retention cleanup...');

    try {
      const db = await getDb();
      if (!db) {
        console.warn('⚠️ Database not available for data retention cleanup');
        return this.stats;
      }

      // Calculate retention cutoff dates
      const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
      const threeYearsAgo = new Date(Date.now() - (3 * 365 * 24 * 60 * 60 * 1000));

      let uploadSessionsDeleted = 0;
      let securityEventsDeleted = 0;

      // Clean up upload sessions older than 30 days
      try {
        const uploadSessionResult = await db
          .delete(uploadSessions)
          .where(lt(uploadSessions.createdAt, thirtyDaysAgo));
        
        uploadSessionsDeleted = uploadSessionResult.rowCount || 0;
        
        if (uploadSessionsDeleted > 0) {
          console.log(`🗑️ Deleted ${uploadSessionsDeleted} upload sessions older than 30 days`);
        }
      } catch (error) {
        console.error('❌ Failed to clean up upload sessions:', error);
      }

      // Clean up security events older than 3 years
      try {
        const securityEventResult = await db
          .delete(securityEvents)
          .where(lt(securityEvents.createdAt, threeYearsAgo));
        
        securityEventsDeleted = securityEventResult.rowCount || 0;
        
        if (securityEventsDeleted > 0) {
          console.log(`🗑️ Deleted ${securityEventsDeleted} security events older than 3 years`);
        }
      } catch (error) {
        console.error('❌ Failed to clean up security events:', error);
      }

      // Update stats
      this.stats = {
        uploadSessionsDeleted,
        securityEventsDeleted,
        lastCleanup: new Date()
      };

      console.log('✅ Data retention cleanup completed successfully');
      return this.stats;

    } catch (error) {
      console.error('❌ Data retention cleanup failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  public async getUploadSessionsOlderThan(days: number): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;

      const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      const result = await db
        .select({ count: uploadSessions.id })
        .from(uploadSessions)
        .where(lt(uploadSessions.createdAt, cutoffDate));

      return result.length;
    } catch (error) {
      console.error('❌ Failed to count old upload sessions:', error);
      return 0;
    }
  }

  public async getSecurityEventsOlderThan(days: number): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;

      const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      const result = await db
        .select({ count: securityEvents.id })
        .from(securityEvents)
        .where(lt(securityEvents.createdAt, cutoffDate));

      return result.length;
    } catch (error) {
      console.error('❌ Failed to count old security events:', error);
      return 0;
    }
  }

  public getLastCleanupStats(): RetentionStats {
    return { ...this.stats };
  }

  public async manualCleanup(): Promise<RetentionStats> {
    console.log('🔧 Manual data retention cleanup triggered');
    return await this.runDailyCleanup();
  }

  // Health check for monitoring
  public getHealthStatus(): {
    isRunning: boolean;
    lastCleanup: Date;
    timeSinceLastCleanup: number;
    isStale: boolean;
  } {
    const now = Date.now();
    const timeSinceLastCleanup = now - this.stats.lastCleanup.getTime();
    const isStale = timeSinceLastCleanup > (25 * 60 * 60 * 1000); // More than 25 hours

    return {
      isRunning: this.isRunning,
      lastCleanup: this.stats.lastCleanup,
      timeSinceLastCleanup,
      isStale
    };
  }
}

// Global instance
export const dataRetentionService = new DataRetentionService();