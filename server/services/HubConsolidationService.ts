import { TableInfo, Relationship } from '../../shared/schema';
import { Logger } from '../utils/logger';
import { TableVector } from './semanticVectorService';

const logger = new Logger('HubConsolidationService');

export interface HubRelationship {
  sourceHub: string;
  targetHub: string;
  relationshipType: 'depends_on' | 'bidirectional' | 'references';
  fkCount: number;
  semanticSimilarity: number;
  shouldMerge: boolean;
}

export interface ConsolidatedDomain {
  primaryHub: string;
  mergedHubs: string[];
  allTables: string[];
  domainName: string;
  confidence: number;
}

export interface HubConsolidationResult {
  consolidatedDomains: ConsolidatedDomain[];
  hubRelationships: HubRelationship[];
  originalHubCount: number;
  consolidatedHubCount: number;
  mergedHubPairs: string[][];
}

export class HubConsolidationService {
  
  /**
   * Main method to consolidate related hubs based on FK relationships and semantic similarity
   */
  public consolidateHubs(
    hubTables: string[],
    allTables: TableInfo[],
    relationships: Relationship[],
    semanticVectors?: TableVector[]
  ): HubConsolidationResult {
    
    logger.info('🔗 Starting hub consolidation analysis', {
      hubCount: hubTables.length,
      hubTables: hubTables.slice(0, 5).concat(hubTables.length > 5 ? ['...'] : [])
    });

    // Step 1: Analyze FK relationships between hubs
    const hubRelationships = this.analyzeHubRelationships(hubTables, relationships, semanticVectors);
    
    // Step 2: Identify mergeable hub pairs
    const mergeableHubs = hubRelationships.filter(rel => rel.shouldMerge);
    logger.info('🔍 Mergeable hub relationships found', {
      count: mergeableHubs.length,
      relationships: mergeableHubs.map(rel => `${rel.sourceHub} ↔ ${rel.targetHub}`)
    });

    // Step 3: Create consolidated domains
    const consolidatedDomains = this.createConsolidatedDomains(hubTables, mergeableHubs);
    
    logger.info('🏗️ Hub consolidation complete', {
      originalHubs: hubTables.length,
      consolidatedDomains: consolidatedDomains.length,
      totalMergedHubs: consolidatedDomains.reduce((sum, domain) => sum + domain.mergedHubs.length, 0)
    });

    return {
      consolidatedDomains,
      hubRelationships,
      originalHubCount: hubTables.length,
      consolidatedHubCount: consolidatedDomains.length,
      mergedHubPairs: mergeableHubs.map(rel => [rel.sourceHub, rel.targetHub])
    };
  }

  /**
   * Analyze FK relationships between hub tables
   */
  private analyzeHubRelationships(
    hubTables: string[],
    relationships: Relationship[],
    semanticVectors?: TableVector[]
  ): HubRelationship[] {
    
    const hubRelationships: HubRelationship[] = [];
    const semanticSimilarityMap = this.buildSemanticSimilarityMap(semanticVectors);

    // Check each pair of hub tables
    for (let i = 0; i < hubTables.length; i++) {
      for (let j = i + 1; j < hubTables.length; j++) {
        const hub1 = hubTables[i];
        const hub2 = hubTables[j];

        // Count FK relationships in both directions
        const fkFrom1To2 = relationships.filter(rel => 
          rel.sourceTable === hub1 && rel.targetTable === hub2
        ).length;
        
        const fkFrom2To1 = relationships.filter(rel => 
          rel.sourceTable === hub2 && rel.targetTable === hub1
        ).length;

        const totalFkCount = fkFrom1To2 + fkFrom2To1;
        
        // Skip if no FK relationship exists
        if (totalFkCount === 0) continue;

        // Get semantic similarity
        const semanticSimilarity = this.getSemanticSimilarity(hub1, hub2, semanticSimilarityMap);

        // Determine relationship type and dependency direction
        let relationshipType: 'depends_on' | 'bidirectional' | 'references';
        let dependentHub: string;
        let primaryHub: string;
        
        if (fkFrom1To2 > 0 && fkFrom2To1 > 0) {
          relationshipType = 'bidirectional';
          // For bidirectional, choose primary based on FK dependency analysis
          primaryHub = this.determinePrimaryFromBidirectional(hub1, hub2, relationships);
          dependentHub = primaryHub === hub1 ? hub2 : hub1;
        } else if (fkFrom1To2 > 0) {
          relationshipType = 'depends_on'; // hub1 depends on hub2
          dependentHub = hub1;
          primaryHub = hub2;
        } else {
          relationshipType = 'depends_on'; // hub2 depends on hub1  
          dependentHub = hub2;
          primaryHub = hub1;
        }

        // Determine if should merge based on criteria
        const shouldMerge = this.shouldMergeHubs(
          hub1, hub2, relationshipType, totalFkCount, semanticSimilarity
        );

        hubRelationships.push({
          sourceHub: dependentHub,
          targetHub: primaryHub,
          relationshipType,
          fkCount: totalFkCount,
          semanticSimilarity,
          shouldMerge
        });

        logger.info('🔗 Hub relationship analyzed', {
          relationship: `${dependentHub} → ${primaryHub}`,
          type: relationshipType,
          fkCount: totalFkCount,
          semanticSimilarity: semanticSimilarity.toFixed(3),
          primaryHub,
          shouldMerge
        });
      }
    }

    return hubRelationships;
  }

  /**
   * Determine primary hub from bidirectional relationship based on FK dependency analysis
   * Uses actual FK relationship patterns to identify base entity vs derived entity
   */
  private determinePrimaryFromBidirectional(hub1: string, hub2: string, relationships: Relationship[]): string {
    // Count incoming FK relationships (tables that depend on each hub)
    const hub1IncomingFKs = relationships.filter(rel => rel.targetTable === hub1).length;
    const hub2IncomingFKs = relationships.filter(rel => rel.targetTable === hub2).length;
    
    // Count outgoing FK relationships (dependencies of each hub)
    const hub1OutgoingFKs = relationships.filter(rel => rel.sourceTable === hub1).length;
    const hub2OutgoingFKs = relationships.filter(rel => rel.sourceTable === hub2).length;
    
    // Primary hub = more incoming FKs (more tables depend on it) and fewer outgoing FKs (fewer dependencies)
    const hub1Score = hub1IncomingFKs - (hub1OutgoingFKs * 0.5); // Favor tables with more dependents, fewer dependencies
    const hub2Score = hub2IncomingFKs - (hub2OutgoingFKs * 0.5);
    
    if (hub1Score > hub2Score) {
      logger.info(`🎯 Primary hub selection: ${hub1} (score: ${hub1Score.toFixed(1)}, incoming: ${hub1IncomingFKs}, outgoing: ${hub1OutgoingFKs}) over ${hub2} (score: ${hub2Score.toFixed(1)}, incoming: ${hub2IncomingFKs}, outgoing: ${hub2OutgoingFKs})`);
      return hub1;
    } else {
      logger.info(`🎯 Primary hub selection: ${hub2} (score: ${hub2Score.toFixed(1)}, incoming: ${hub2IncomingFKs}, outgoing: ${hub2OutgoingFKs}) over ${hub1} (score: ${hub1Score.toFixed(1)}, incoming: ${hub1IncomingFKs}, outgoing: ${hub1OutgoingFKs})`);
      return hub2;
    }
  }

  /**
   * Determine if two hubs should be merged based on relationship strength
   */
  private shouldMergeHubs(
    hub1: string,
    hub2: string,
    relationshipType: string,
    fkCount: number,
    semanticSimilarity: number
  ): boolean {
    
    // High confidence merging criteria
    if (fkCount >= 2 && semanticSimilarity > 0.7) {
      return true;
    }

    // Bidirectional relationships with decent similarity
    if (relationshipType === 'bidirectional' && semanticSimilarity > 0.6) {
      return true;
    }

    // Known business domain pairs with strong semantic similarity
    const knownPairs = [
      ['EntityGroup', 'EntityGroupUser'],
      ['Campaign', 'CampaignDonation'], 
      ['Opportunity', 'OpportunityRegistration']
    ];
    
    const isKnownPair = knownPairs.some(pair => 
      (pair[0] === hub1 && pair[1] === hub2) || 
      (pair[0] === hub2 && pair[1] === hub1)
    );
    
    if (isKnownPair && fkCount > 0 && semanticSimilarity > 0.5) {
      return true;
    }

    return false;
  }

  /**
   * Create consolidated domains from mergeable hub relationships
   */
  private createConsolidatedDomains(
    hubTables: string[],
    mergeableHubs: HubRelationship[]
  ): ConsolidatedDomain[] {
    
    const consolidatedDomains: ConsolidatedDomain[] = [];
    const processedHubs = new Set<string>();

    // Create merged domains
    for (const relationship of mergeableHubs) {
      const { sourceHub, targetHub, semanticSimilarity } = relationship;
      
      // Skip if already processed
      if (processedHubs.has(sourceHub) || processedHubs.has(targetHub)) {
        continue;
      }

      // Use dependency analysis: targetHub is primary (what sourceHub depends on)
      const primaryHub = targetHub;   // Primary entity (Campaign, EntityGroup)
      const secondaryHub = sourceHub; // Dependent entity (CampaignDonation, EntityGroupUser)

      const domain: ConsolidatedDomain = {
        primaryHub,
        mergedHubs: [secondaryHub],
        allTables: [primaryHub, secondaryHub],
        domainName: this.generateDomainName(primaryHub),
        confidence: semanticSimilarity
      };

      consolidatedDomains.push(domain);
      processedHubs.add(sourceHub);
      processedHubs.add(targetHub);

      logger.info('🔗 Created consolidated domain', {
        domainName: domain.domainName,
        primaryHub,
        mergedHubs: domain.mergedHubs,
        confidence: domain.confidence.toFixed(3)
      });
    }

    // Add remaining individual hubs as standalone domains
    for (const hub of hubTables) {
      if (!processedHubs.has(hub)) {
        const domain: ConsolidatedDomain = {
          primaryHub: hub,
          mergedHubs: [],
          allTables: [hub],
          domainName: this.generateDomainName(hub),
          confidence: 1.0
        };
        consolidatedDomains.push(domain);
      }
    }

    return consolidatedDomains;
  }

  /**
   * Build semantic similarity map from vectors
   */
  private buildSemanticSimilarityMap(semanticVectors?: TableVector[]): Map<string, number> {
    const similarityMap = new Map<string, number>();
    
    if (!semanticVectors || semanticVectors.length === 0) {
      return similarityMap;
    }

    // Calculate cosine similarities between all pairs
    for (let i = 0; i < semanticVectors.length; i++) {
      for (let j = i + 1; j < semanticVectors.length; j++) {
        const table1 = semanticVectors[i].tableName;
        const table2 = semanticVectors[j].tableName;
        const vector1 = semanticVectors[i].embedding;
        const vector2 = semanticVectors[j].embedding;
        
        const similarity = this.calculateCosineSimilarity(vector1, vector2);
        const key = `${table1}:${table2}`;
        similarityMap.set(key, similarity);
      }
    }

    return similarityMap;
  }

  /**
   * Get semantic similarity between two tables
   */
  private getSemanticSimilarity(
    table1: string, 
    table2: string, 
    similarityMap: Map<string, number>
  ): number {
    const key1 = `${table1}:${table2}`;
    const key2 = `${table2}:${table1}`;
    return similarityMap.get(key1) || similarityMap.get(key2) || 0;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Generate domain name from hub table name
   */
  private generateDomainName(hubTable: string): string {
    // Simple domain name generation - can be enhanced
    return hubTable.replace(/([A-Z])/g, ' $1').trim();
  }
}