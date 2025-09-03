import type { TableData, Relationship } from '@shared/schema';
import { connectivityAnalysisService } from './connectivityAnalysisService';
// import { connectivityBasedClusteringService } from './connectivityBasedClusteringService'; // Removed - using hybrid clustering instead

// TableInfo interface for our connectivity-based analysis
export interface TableInfo {
  name: string;
  columns: { name: string; type: string }[];
  foreignKeys: { column: string; referencedTable: string; referencedColumn: string }[];
  primaryKeys: string[];
}

export interface ConnectivityBasedCoreResult {
  domainClusters: any[]; // DomainCluster[] from clustering service
  coreTables: string[];  // Flattened list of core tables for compatibility
  analysisMetrics: {
    totalTables: number;
    mostConnectedCount: number;
    domainCount: number;
    connectivityThreshold: number;
    clusteringEfficiency: number;
    processingTime: number;
  };
  clusteringQuality: {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  };
}

export class CoreTableDiscoveryService {

  /**
   * NEW APPROACH: Discover domain clusters using connectivity-based analysis
   * This replaces the old business-process guessing with objective relationship analysis
   */
  public async discoverCoreTablesUsingConnectivity(
    tables: TableInfo[],
    relationships: Relationship[]
  ): Promise<ConnectivityBasedCoreResult> {
    const startTime = Date.now();
    console.log(`🔗 Starting connectivity-based core table discovery for ${tables.length} tables`);

    try {
      // Step 1: Build connectivity matrix
      console.log(`   📊 Step 1: Analyzing table connectivity...`);
      const connectivityMatrix = connectivityAnalysisService.buildConnectivityMatrix(
        tables, 
        relationships,
        {
          minConnections: 8,  // Tables must have at least 8 connections to be "most connected"
          maxTables: 20       // Limit to top 20 most connected tables
        }
      );

      // Step 2: Cluster most connected tables based on cross-connectivity
      console.log(`   🧩 Step 2: Using simplified clustering (hybrid clustering handles this now)...`);
      // Simplified approach - just use the most connected tables as core tables
      const coreTables = mostConnected.map(item => item.table);

      const processingTime = Date.now() - startTime;

      console.log(`🎯 Connectivity-based discovery completed in ${processingTime}ms:`);
      console.log(`   📊 Found ${connectivityMatrix.mostConnectedTables.length} most connected tables`);
      console.log(`   🎯 Extracted ${coreTables.length} core tables: [${coreTables.join(', ')}]`);

      return {
        domainClusters: [], // Hybrid clustering will handle actual clustering
        coreTables,
        analysisMetrics: {
          totalTables: tables.length,
          mostConnectedCount: connectivityMatrix.mostConnectedTables.length,
          domainCount: 0, // Will be determined by hybrid clustering
          connectivityThreshold: connectivityMatrix.connectivityThreshold,
          clusteringEfficiency: 0, // Will be calculated by hybrid clustering
          processingTime
        },
        clusteringQuality: {
          isValid: true,
          issues: [],
          recommendations: []
        }
      };

    } catch (error) {
      console.error(`❌ Connectivity-based core discovery failed: ${error.message}`);
      
      // Fallback to simple high-connectivity approach
      return this.fallbackToSimpleConnectivity(tables, relationships, startTime);
    }
  }

  /**
   * DEPRECATED: Legacy business-process-based core table discovery
   * Keeping for compatibility - but this approach is superseded by connectivity-based
   */
  public async discoverCoreTables(
    tables: TableInfo[],
    relationships: Relationship[]
  ): Promise<{ coreTables: string[] }> {
    console.log(`⚠️ Using legacy core table discovery - consider switching to discoverCoreTablesUsingConnectivity()`);
    
    // Use new connectivity-based approach as default
    const result = await this.discoverCoreTablesUsingConnectivity(tables, relationships);
    return { coreTables: result.coreTables };
  }

  /**
   * Extract core tables from domain clusters for compatibility
   */
  private extractCoreTablesFromClusters(domainClusters: any[]): string[] {
    const coreTables: string[] = [];
    
    domainClusters.forEach(cluster => {
      // Add primary core table
      coreTables.push(cluster.coreTable);
      
      // Add related core tables (if any)
      if (cluster.relatedCoreTables && cluster.relatedCoreTables.length > 0) {
        coreTables.push(...cluster.relatedCoreTables);
      }
    });

    // Remove duplicates and return
    return [...new Set(coreTables)];
  }

  /**
   * Fallback to simple connectivity-based selection if clustering fails
   */
  private fallbackToSimpleConnectivity(
    tables: TableInfo[],
    relationships: Relationship[],
    startTime: number
  ): ConnectivityBasedCoreResult {
    console.log(`🔄 Using fallback simple connectivity approach...`);

    // Simple approach: get tables with highest connectivity
    const connectivity = connectivityAnalysisService.analyzeTableConnectivity(tables, relationships);
    const mostConnected = connectivity
      .filter(conn => conn.totalConnections >= 10) // Minimum threshold
      .slice(0, 8) // Max 8 core tables
      .map(conn => conn.tableName);

    const processingTime = Date.now() - startTime;

    // Create mock clusters for each table
    const mockClusters = mostConnected.map((tableName, index) => ({
      clusterId: `fallback_${index}`,
      clusterName: `${tableName} Domain`,
      coreTable: tableName,
      relatedCoreTables: [],
      clusterStrength: 0.6,
      totalConnections: connectivity.find(c => c.tableName === tableName)?.totalConnections || 0,
      businessPurpose: `Business processes centered around ${tableName}`,
      isolationScore: 1.0
    }));

    return {
      domainClusters: mockClusters,
      coreTables: mostConnected,
      analysisMetrics: {
        totalTables: tables.length,
        mostConnectedCount: mostConnected.length,
        domainCount: mockClusters.length,
        connectivityThreshold: 10,
        clusteringEfficiency: mostConnected.length / Math.min(tables.length, 20),
        processingTime
      },
      clusteringQuality: {
        isValid: mostConnected.length >= 3,
        issues: mostConnected.length < 5 ? ['Too few core tables identified'] : [],
        recommendations: ['Consider investigating connectivity patterns for better clustering']
      }
    };
  }

  /**
   * Utility: Convert TableData to TableInfo format
   */
  public convertTableDataToTableInfo(tableData: TableData[]): TableInfo[] {
    return tableData.map(table => ({
      name: table.name,
      columns: table.columns.map(col => ({
        name: col.name,
        type: col.type
      })),
      foreignKeys: table.foreignKeys || [],
      primaryKeys: table.primaryKeys || ['id'] // Default assumption
    }));
  }

  /**
   * Get summary of connectivity-based discovery for debugging
   */
  public getConnectivitySummary(result: ConnectivityBasedCoreResult): string {
    const { analysisMetrics, domainClusters, clusteringQuality } = result;
    
    let summary = `CONNECTIVITY-BASED DOMAIN DISCOVERY SUMMARY:\n`;
    summary += `- Total tables analyzed: ${analysisMetrics.totalTables}\n`;
    summary += `- Most connected tables identified: ${analysisMetrics.mostConnectedCount}\n`;
    summary += `- Domain clusters created: ${analysisMetrics.domainCount}\n`;
    summary += `- Clustering efficiency: ${(analysisMetrics.clusteringEfficiency * 100).toFixed(1)}%\n`;
    summary += `- Processing time: ${analysisMetrics.processingTime}ms\n\n`;
    
    summary += `DOMAIN CLUSTERS:\n`;
    domainClusters.forEach((cluster, i) => {
      summary += `${i + 1}. ${cluster.clusterName}\n`;
      summary += `   Core: ${cluster.coreTable}\n`;
      if (cluster.relatedCoreTables.length > 0) {
        summary += `   Related: ${cluster.relatedCoreTables.join(', ')}\n`;
      }
      summary += `   Strength: ${cluster.clusterStrength.toFixed(2)}\n`;
      summary += `   Purpose: ${cluster.businessPurpose}\n\n`;
    });
    
    if (!clusteringQuality.isValid) {
      summary += `QUALITY ISSUES:\n`;
      clusteringQuality.issues.forEach(issue => {
        summary += `- ${issue}\n`;
      });
      summary += `\n`;
    }
    
    if (clusteringQuality.recommendations.length > 0) {
      summary += `RECOMMENDATIONS:\n`;
      clusteringQuality.recommendations.forEach(rec => {
        summary += `- ${rec}\n`;
      });
    }
    
    return summary;
  }
}

export const coreTableDiscoveryService = new CoreTableDiscoveryService();