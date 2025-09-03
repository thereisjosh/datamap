import { TableInfo, Relationship } from '../../../shared/schema';
import { Logger } from '../../utils/logger';

const logger = new Logger('StructuralDomainClusteringService');

/**
 * Input data for structural domain clustering
 */
export interface ClusteringInput {
  tables: TableInfo[];
  relationships: Relationship[];
  hubTables: string[];
  spectralClusters: Array<{ id: string; tables: string[] }>;
}

/**
 * Final domain result with core tables and referenced hubs
 */
export interface DomainResult {
  id: string;
  name: string;
  coreTables: string[];     // Non-hub tables that define the domain
  referencedHubs: string[]; // Hub tables referenced by foreign keys
  masterHub?: string;       // If this domain owns a hub table
  totalTables: string[];    // All tables in domain (core + referenced)
  confidence: number;       // Confidence score based on structural cohesion
}

/**
 * Hub ownership information
 */
export interface HubOwnership {
  hubTable: string;
  ownerDomain: string;
  relatedTables: string[];  // Tables that structurally belong to this hub
  dependencyScore: number;  // How strongly related tables depend on this hub
}

/**
 * Service for performing structural domain clustering that respects hub relationships
 * and foreign key dependencies without linguistic assumptions
 */
export class StructuralDomainClusteringService {

  /**
   * Main entry point for structural domain clustering
   */
  async performStructuralClustering(input: ClusteringInput): Promise<DomainResult[]> {
    logger.info('🏗️ STRUCTURAL DOMAIN CLUSTERING - Starting Analysis', {
      totalTables: input.tables.length,
      hubTables: input.hubTables.length,
      spectralClusters: input.spectralClusters.length,
      relationships: input.relationships.length
    });

    // Log spectral cluster details
    input.spectralClusters.forEach((cluster, idx) => {
      logger.info(`📊 Input Spectral Cluster ${cluster.id}`, {
        size: cluster.tables.length,
        sampleTables: cluster.tables.slice(0, 5),
        hasMore: cluster.tables.length > 5
      });
    });

    logger.info('🎯 Hub Tables Detected for Structural Analysis', {
      hubs: input.hubTables.slice(0, 10),
      totalHubs: input.hubTables.length,
      hasMoreHubs: input.hubTables.length > 10
    });

    // Step 1: Identify which domain owns each hub based on structural analysis
    logger.info('🔍 STEP 1: Identifying Hub Ownership');
    const hubOwnership = this.identifyHubOwnership(
      input.hubTables,
      input.spectralClusters,
      input.relationships
    );

    // Step 2: Create domain seeds from spectral clusters (exclude hubs)
    logger.info('🌱 STEP 2: Creating Domain Seeds');
    const domainSeeds = this.createDomainSeeds(input.spectralClusters, input.hubTables);

    // Step 3: Find which hubs each domain references via foreign keys
    logger.info('🔗 STEP 3: Assigning Hub References');
    let domains = this.assignHubReferences(
      domainSeeds,
      input.hubTables,
      input.relationships,
      input.tables
    );

    // Step 4: Assign hub ownership (hub + related tables go to owner domain)
    logger.info('👑 STEP 4: Assigning Hub Ownership');
    domains = this.assignHubOwnership(domains, hubOwnership);

    // Step 5: Calculate confidence scores
    logger.info('📈 STEP 5: Calculating Domain Confidence');
    const finalDomains = this.calculateDomainConfidence(domains, input.relationships);

    logger.info('Structural domain clustering complete', {
      finalDomainCount: finalDomains.length,
      avgDomainSize: finalDomains.reduce((sum, d) => sum + d.totalTables.length, 0) / finalDomains.length,
      hubsWithOwners: hubOwnership.size
    });

    return finalDomains;
  }

  /**
   * Identify hub ownership based on structural relationships
   */
  private identifyHubOwnership(
    hubTables: string[],
    spectralClusters: Array<{ id: string; tables: string[] }>,
    relationships: Relationship[]
  ): Map<string, HubOwnership> {
    
    const hubOwnership = new Map<string, HubOwnership>();
    
    for (const hub of hubTables) {
      let bestCluster: string | null = null;
      let maxRelatedTables = 0;
      let bestDependencyScore = 0;
      
      for (const cluster of spectralClusters) {
        // Count and identify tables structurally related to hub
        const relatedInfo = this.findStructurallyRelatedTables(hub, cluster.tables, relationships);
        
        if (relatedInfo.tables.length > maxRelatedTables) {
          maxRelatedTables = relatedInfo.tables.length;
          bestCluster = cluster.id;
          bestDependencyScore = relatedInfo.avgDependencyScore;
        }
      }
      
      if (bestCluster && maxRelatedTables > 0) {
        const bestClusterTables = spectralClusters.find(c => c.id === bestCluster)!.tables;
        const relatedInfo = this.findStructurallyRelatedTables(hub, bestClusterTables, relationships);
        
        hubOwnership.set(hub, {
          hubTable: hub,
          ownerDomain: bestCluster,
          relatedTables: relatedInfo.tables,
          dependencyScore: relatedInfo.avgDependencyScore
        });

        logger.info('Hub ownership identified', {
          hub,
          ownerDomain: bestCluster,
          relatedTableCount: relatedInfo.tables.length,
          dependencyScore: relatedInfo.avgDependencyScore.toFixed(3)
        });
      }
    }
    
    return hubOwnership;
  }

  /**
   * Find tables structurally related to a hub (no linguistic assumptions)
   */
  private findStructurallyRelatedTables(
    hubTable: string,
    clusterTables: string[],
    relationships: Relationship[]
  ): { tables: string[]; avgDependencyScore: number } {
    
    const relatedTables: string[] = [];
    let totalDependencyScore = 0;
    let analyzedTables = 0;
    
    for (const table of clusterTables) {
      if (table === hubTable) continue;
      
      // Check if table has direct foreign key relationship to hub
      const hasDirectRelation = relationships.some(rel => 
        (rel.sourceTable === hubTable && rel.targetTable === table) ||
        (rel.sourceTable === table && rel.targetTable === hubTable)
      );
      
      if (hasDirectRelation) {
        // Calculate structural dependency on hub
        const dependencyScore = this.calculateStructuralDependency(table, hubTable, relationships);
        totalDependencyScore += dependencyScore;
        analyzedTables++;
        
        // If table is highly dependent on hub (>60% of its foreign keys involve hub ecosystem)
        if (dependencyScore > 0.6) {
          relatedTables.push(table);
        }
      }
    }
    
    const avgDependencyScore = analyzedTables > 0 ? totalDependencyScore / analyzedTables : 0;
    
    return {
      tables: relatedTables,
      avgDependencyScore
    };
  }

  /**
   * Calculate how structurally dependent a table is on a hub
   */
  private calculateStructuralDependency(
    table: string,
    hubTable: string,
    relationships: Relationship[]
  ): number {
    
    // Count total foreign key relationships from this table
    const tableFKs = relationships.filter(rel => rel.sourceTable === table);
    if (tableFKs.length === 0) return 0;
    
    // Count relationships that involve hub or hub-related tables
    let hubRelatedFKs = 0;
    
    for (const fk of tableFKs) {
      if (fk.targetTable === hubTable) {
        hubRelatedFKs++;
      } else {
        // Check if target is hub-related (has strong connection to hub)
        const isHubRelated = this.isTableHubRelated(fk.targetTable, hubTable, relationships);
        if (isHubRelated) {
          hubRelatedFKs += 0.5; // Partial credit for indirect hub relationship
        }
      }
    }
    
    return hubRelatedFKs / tableFKs.length;
  }

  /**
   * Check if a table is structurally related to a hub
   */
  private isTableHubRelated(
    candidateTable: string,
    hubTable: string,
    relationships: Relationship[]
  ): boolean {
    
    // Direct relationship to hub
    return relationships.some(rel => 
      (rel.sourceTable === hubTable && rel.targetTable === candidateTable) ||
      (rel.sourceTable === candidateTable && rel.targetTable === hubTable)
    );
  }

  /**
   * Create domain seeds by removing hub tables from spectral clusters
   */
  private createDomainSeeds(
    spectralClusters: Array<{ id: string; tables: string[] }>,
    hubTables: string[]
  ): Map<string, string[]> {
    
    const domainSeeds = new Map<string, string[]>();
    const hubSet = new Set(hubTables);
    
    for (const cluster of spectralClusters) {
      // Filter out hub tables to get core domain tables
      const coreTables = cluster.tables.filter(table => !hubSet.has(table));
      
      if (coreTables.length > 0) {
        domainSeeds.set(cluster.id, coreTables);
      }
    }
    
    logger.info('Domain seeds created', {
      totalSeeds: domainSeeds.size,
      avgSeedSize: Array.from(domainSeeds.values()).reduce((sum, tables) => sum + tables.length, 0) / domainSeeds.size
    });
    
    return domainSeeds;
  }

  /**
   * Assign hub references to domains based on foreign key analysis
   */
  private assignHubReferences(
    domainSeeds: Map<string, string[]>,
    hubTables: string[],
    relationships: Relationship[],
    tables: TableInfo[]
  ): Map<string, DomainResult> {
    
    const domains = new Map<string, DomainResult>();
    
    for (const [domainId, coreTables] of domainSeeds) {
      const referencedHubs = this.findReferencedHubs(coreTables, hubTables, relationships);
      
      domains.set(domainId, {
        id: domainId,
        name: `Domain_${domainId}`,
        coreTables,
        referencedHubs,
        masterHub: undefined,
        totalTables: [...coreTables, ...referencedHubs],
        confidence: 0 // Will be calculated later
      });
    }
    
    return domains;
  }

  /**
   * Find which hub tables are referenced by domain's core tables
   */
  private findReferencedHubs(
    coreTables: string[],
    hubTables: string[],
    relationships: Relationship[]
  ): string[] {
    
    const referencedHubs = new Set<string>();
    const coreTableSet = new Set(coreTables);
    const hubSet = new Set(hubTables);
    
    for (const rel of relationships) {
      // If a core table has a foreign key to a hub table
      if (coreTableSet.has(rel.sourceTable) && hubSet.has(rel.targetTable)) {
        referencedHubs.add(rel.targetTable);
      }
    }
    
    return Array.from(referencedHubs);
  }

  /**
   * Assign hub ownership to domains (hub + related tables join owner domain)
   */
  private assignHubOwnership(
    domains: Map<string, DomainResult>,
    hubOwnership: Map<string, HubOwnership>
  ): Map<string, DomainResult> {
    
    for (const [hubTable, ownership] of hubOwnership) {
      const ownerDomain = domains.get(ownership.ownerDomain);
      if (ownerDomain) {
        // Set this domain as the master of this hub
        ownerDomain.masterHub = hubTable;
        
        // Add hub and its related tables to core tables
        ownerDomain.coreTables.push(hubTable);
        ownerDomain.coreTables.push(...ownership.relatedTables);
        
        // Update total tables
        ownerDomain.totalTables = [
          ...new Set([...ownerDomain.coreTables, ...ownerDomain.referencedHubs])
        ];
        
        logger.info('Hub ownership assigned', {
          hub: hubTable,
          domain: ownership.ownerDomain,
          relatedTables: ownership.relatedTables.length,
          domainTotalTables: ownerDomain.totalTables.length
        });
      }
    }
    
    return domains;
  }

  /**
   * Calculate confidence scores for domains based on structural cohesion
   */
  private calculateDomainConfidence(
    domains: Map<string, DomainResult>,
    relationships: Relationship[]
  ): DomainResult[] {
    
    const finalDomains: DomainResult[] = [];
    
    for (const domain of domains.values()) {
      // Calculate internal connectivity ratio
      const internalConnections = this.countInternalConnections(domain.totalTables, relationships);
      const totalPossibleConnections = domain.totalTables.length * (domain.totalTables.length - 1) / 2;
      
      const connectivityRatio = totalPossibleConnections > 0 ? internalConnections / totalPossibleConnections : 0;
      
      // Calculate size appropriateness (penalty for very large or very small domains)
      const sizeScore = this.calculateSizeScore(domain.totalTables.length);
      
      // Combine metrics for confidence score
      domain.confidence = (connectivityRatio * 0.7) + (sizeScore * 0.3);
      
      finalDomains.push(domain);
    }
    
    // FIXED: Preserve original hub community order instead of sorting by confidence  
    // Confidence-based sorting scrambles the meaningful hub community sequence (0-6)
    // finalDomains.sort((a, b) => b.confidence - a.confidence); // DISABLED: Causes domain index misalignment
    
    return finalDomains;
  }

  /**
   * Count internal connections within a domain
   */
  private countInternalConnections(tables: string[], relationships: Relationship[]): number {
    const tableSet = new Set(tables);
    
    return relationships.filter(rel => 
      tableSet.has(rel.sourceTable) && tableSet.has(rel.targetTable)
    ).length;
  }

  /**
   * Calculate size appropriateness score (prefers 5-30 table domains)
   */
  private calculateSizeScore(tableCount: number): number {
    if (tableCount >= 5 && tableCount <= 30) {
      return 1.0; // Ideal size
    } else if (tableCount >= 3 && tableCount <= 50) {
      return 0.8; // Acceptable size
    } else if (tableCount >= 2 && tableCount <= 60) {
      return 0.6; // Marginal size
    } else {
      return 0.3; // Poor size (too small or too large)
    }
  }
}

export const structuralDomainClusteringService = new StructuralDomainClusteringService();