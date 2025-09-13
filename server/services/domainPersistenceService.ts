import { getDb } from '../../lib/db';
import { projects, projectDomains, projectDomainTables, tableEmbeddings } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { VectorClusteringResult, VectorCluster, TableEmbedding } from './vectorClusteringService';

export interface StoredDomainInfo {
  id: string;
  projectId: string;
  domainName: string;
  displayName: string;
  purpose: string | null;
  confidenceScore: string | null;
  businessMetrics: any;
  aiEnhanced: boolean;
  clusteringMethod: string;
  modelVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredDomainTable {
  id: string;
  domainId: string;
  tableName: string;
  relevanceScore: number;
  isJunctionTable: boolean;
  businessJustification: string | null;
}

export interface StoredTableEmbedding {
  id: string;
  projectId: string;
  tableName: string;
  embedding: number[];
  embeddingModel: string;
  metadata: any;
  createdAt: Date;
}

export interface ProjectDomainSummary {
  domains: StoredDomainInfo[];
  tables: { [domainId: string]: StoredDomainTable[] };
  embeddings: StoredTableEmbedding[];
  totalTables: number;
  lastComputedAt: Date;
}

export class DomainPersistenceService {
  
  public async storeDomainClustering(
    projectId: string,
    clusteringResult: VectorClusteringResult,
    embeddings: TableEmbedding[]
  ): Promise<void> {
    console.log(`Storing domain clustering for project ${projectId}...`);

    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Get organization ID from project for RLS compliance
    const projectResult = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (projectResult.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const organizationId = projectResult[0].organizationId;

    try {
      // Start transaction
      await db.transaction(async (tx) => {
        // 1. Clear existing domains for this project
        await tx.delete(projectDomains).where(eq(projectDomains.projectId, projectId));
        await tx.delete(tableEmbeddings).where(eq(tableEmbeddings.projectId, projectId));

        // 2. Store table embeddings
        for (const embedding of embeddings) {
          await tx.insert(tableEmbeddings).values({
            projectId,
            organizationId,
            tableName: embedding.tableName,
            embedding: JSON.stringify(embedding.embedding),
            embeddingModel: clusteringResult.modelUsed,
            metadata: embedding.metadata,
          });
        }

        // 3. Store domains and their tables
        for (let i = 0; i < clusteringResult.clusters.length; i++) {
          const cluster = clusteringResult.clusters[i];
          
          // Insert domain
          const domainResult = await tx.insert(projectDomains).values({
            projectId,
            organizationId,
            domainName: this.sanitizeDomainName(cluster.businessDomain || cluster.name || 'unnamed_domain'),
            displayName: cluster.businessDomain || cluster.name || 'Unnamed Domain',
            purpose: cluster.businessPurpose,
            confidenceScore: (cluster.coherenceScore ?? cluster.coherence ?? 0).toFixed(3),
            businessMetrics: {
              tableCount: cluster.tables.length,
              avgCoherence: cluster.coherenceScore,
              embeddingDimensions: clusteringResult.embeddingDimensions,
              processingTimeMs: clusteringResult.processingTime,
            },
            aiEnhanced: true,
            clusteringMethod: 'vector-kmeans',
            modelVersion: clusteringResult.modelUsed,
          }).returning();

          const domainId = domainResult[0].id;

          // Insert domain tables
          for (const tableName of cluster.tables) {
            // Skip if table name is null or undefined
            if (!tableName) {
              console.warn(`Skipping null/undefined table in cluster ${cluster.clusterId}`);
              continue;
            }
            
            await tx.insert(projectDomainTables).values({
              domainId,
              organizationId,
              tableName: tableName,
              relevanceScore: cluster.coherenceScore ?? 0,
              isJunctionTable: cluster.junctionTables?.includes(tableName) || false,
              businessJustification: `Clustered based on semantic similarity (${(cluster.coherenceScore ?? 0).toFixed(3)} coherence)`,
            });
          }
        }
      });

      console.log(`Successfully stored ${clusteringResult.clusters.length} domains for project ${projectId}`);
    } catch (error) {
      console.error('Failed to store domain clustering:', error);
      throw new Error(`Failed to persist domain clustering: ${error.message}`);
    }
  }

  public async getStoredDomains(projectId: string): Promise<ProjectDomainSummary | null> {
    const db = await getDb();
    if (!db) return null;
    
    try {
      // Get domains
      const domains = await db.select().from(projectDomains)
        .where(eq(projectDomains.projectId, projectId))
        .orderBy(projectDomains.createdAt);

      if (domains.length === 0) {
        return null; // No stored domains
      }

      // Get domain tables
      const allTables: { [domainId: string]: StoredDomainTable[] } = {};
      let totalTables = 0;

      for (const domain of domains) {
        const domainTables = await db.select().from(projectDomainTables)
          .where(eq(projectDomainTables.domainId, domain.id));
        
        allTables[domain.id] = domainTables.map(dt => ({
          id: dt.id,
          domainId: dt.domainId,
          tableName: dt.tableName,
          relevanceScore: dt.relevanceScore,
          isJunctionTable: dt.isJunctionTable,
          businessJustification: dt.businessJustification,
        }));
        
        totalTables += domainTables.length;
      }

      // Get embeddings
      const embeddingRecords = await db.select().from(tableEmbeddings)
        .where(eq(tableEmbeddings.projectId, projectId));

      const embeddings: StoredTableEmbedding[] = embeddingRecords.map(er => ({
        id: er.id,
        projectId: er.projectId,
        tableName: er.tableName,
        embedding: JSON.parse(er.embedding),
        embeddingModel: er.embeddingModel,
        metadata: er.metadata,
        createdAt: er.createdAt,
      }));

      const lastComputedAt = domains.reduce((latest, domain) => 
        domain.createdAt > latest ? domain.createdAt : latest, 
        new Date(0)
      );

      return {
        domains: domains.map(d => ({
          id: d.id,
          projectId: d.projectId,
          domainName: d.domainName,
          displayName: d.displayName,
          purpose: d.purpose,
          confidenceScore: d.confidenceScore,
          businessMetrics: d.businessMetrics,
          aiEnhanced: d.aiEnhanced,
          clusteringMethod: d.clusteringMethod,
          modelVersion: d.modelVersion,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        tables: allTables,
        embeddings,
        totalTables,
        lastComputedAt,
      };
    } catch (error) {
      console.error('Failed to retrieve stored domains:', error);
      return null;
    }
  }

  public async shouldRecomputeDomains(projectId: string): Promise<boolean> {
    const stored = await this.getStoredDomains(projectId);
    
    if (!stored) {
      return true; // No domains stored, need to compute
    }

    // Check if domains are older than 7 days (configurable threshold)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const needsRecompute = stored.lastComputedAt < sevenDaysAgo;
    
    if (needsRecompute) {
      console.log(`Domains for project ${projectId} are older than 7 days, recommending recomputation`);
    }

    return needsRecompute;
  }

  public async invalidateProjectDomains(projectId: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    
    try {
      await db.delete(projectDomains).where(eq(projectDomains.projectId, projectId));
      await db.delete(tableEmbeddings).where(eq(tableEmbeddings.projectId, projectId));
      console.log(`Invalidated cached domains for project ${projectId}`);
    } catch (error) {
      console.error('Failed to invalidate project domains:', error);
      throw error;
    }
  }

  public async getProjectDomainStats(projectId: string): Promise<{
    domainCount: number;
    totalTables: number;
    aiEnhanced: boolean;
    clusteringMethod: string;
    lastUpdated: Date | null;
  }> {
    const stored = await this.getStoredDomains(projectId);
    
    if (!stored) {
      return {
        domainCount: 0,
        totalTables: 0,
        aiEnhanced: false,
        clusteringMethod: 'none',
        lastUpdated: null,
      };
    }

    return {
      domainCount: stored.domains.length,
      totalTables: stored.totalTables,
      aiEnhanced: stored.domains.some(d => d.aiEnhanced),
      clusteringMethod: stored.domains[0]?.clusteringMethod || 'unknown',
      lastUpdated: stored.lastComputedAt,
    };
  }

  public async convertStoredToAdvancedClusters(
    stored: ProjectDomainSummary
  ): Promise<any[]> {
    // Convert stored domains back to AdvancedTableCluster format for ERD generation
    const clusters = [];

    for (const domain of stored.domains) {
      const domainTables = stored.tables[domain.id] || [];
      
      if (domainTables.length === 0) continue;

      const tableNames = domainTables.map(dt => dt.tableName);
      
      const cluster = {
        id: domain.domainName,
        name: domain.displayName,
        tables: tableNames,
        tableNames: new Set(tableNames),
        confidence: parseFloat(domain.confidenceScore || '0.5'),
        aiEnhanced: domain.aiEnhanced,
        explanation: domain.purpose || 'Vector-based clustering',
        businessMetrics: domain.businessMetrics,
        junctionTables: domainTables
          .filter(dt => dt.isJunctionTable)
          .map(dt => dt.tableName),
        contextualTables: domainTables
          .filter(dt => !dt.isJunctionTable && dt.relevanceScore > 0.7)
          .map(dt => dt.tableName),
      };

      clusters.push(cluster);
    }

    return clusters;
  }

  private sanitizeDomainName(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  private isJunctionTable(table: TableEmbedding): boolean {
    if (!table || !table.tableName) return false;
    const name = table.tableName.toLowerCase();
    const metadata = table.metadata || {};
    
    // Heuristic: junction tables typically have:
    // 1. Multiple foreign keys
    // 2. Few non-FK columns
    // 3. Names suggesting relationships
    const hasManyFKs = (metadata.foreignKeys?.length || 0) >= 2;
    const fewColumns = (metadata.columnCount || 0) <= 5;
    const hasJunctionName = /_(has_|to_|rel_|link_|map_|assoc_)/.test(name) || 
                           name.includes('_to_') || 
                           name.includes('_has_') ||
                           name.endsWith('_rel') ||
                           name.endsWith('_link');

    return hasManyFKs && (fewColumns || hasJunctionName);
  }
}

export const domainPersistenceService = new DomainPersistenceService();