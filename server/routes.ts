import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer, { type FileFilterCallback } from "multer";
import cors from "cors";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { excelParserService } from "./services/excelParser";
import { AdvancedDomainBoundaryService } from "./services/AdvancedDomainBoundaryService";
import { coreTableDiscoveryService } from "./services/coreTableDiscoveryService";
import { generateMermaidRequestSchema, projectSchema, insertProjectSchema, insertProjectFileSchema, member, organization, user } from "@shared/schema";
import { getAuth } from "./auth.ts";
import { emailService } from "./services/emailService.ts";
import { getDb } from "../lib/db.ts";
import { eq, and, sql } from "drizzle-orm";
import { registerOrganizationAPI } from "./organization-api";
import flexibleParserRouter from "./routes/flexibleParser";
import erdChatRouter from "./routes/erdChat.js";
import { chatRateLimit, standardRateLimit } from "./middleware/rateLimiter.js";

// Import new security middleware
import { 
  validateSchema, 
  validateFileUpload, 
  sanitizeInput, 
  validateRequestSize,
  extractRateLimitContext,
  secureApiResponse 
} from "./middleware/validation";
import { 
  fileUploadRateLimit, 
  projectRateLimit,
  burstProtection 
} from "./middleware/advancedRateLimiter";
import { 
  logSecurityEvent, 
  logResponseSecurity, 
  logFileUploadSecurity,
  securityLogger 
} from "./middleware/securityLogger";
import { 
  parseExcelRequestSchema,
  projectCreateSchema,
  projectUpdateSchema,
  projectDataSaveSchema,
  organizationCreateSchema,
  invitationCreateSchema,
  profileUpdateSchema,
  projectIdParamSchema,
  organizationIdParamSchema,
  tokenParamSchema
} from "@shared/validation-schemas";

/**
 * Select the dominant hub from merged domains based on original community size
 * This ensures that when domains are consolidated, the hub with the most original 
 * community tables in the merged domain becomes the primary hub.
 */
function selectDominantHub(hubTables: string[], domainTables: string[], originalHubs: string[]): string {
  if (!hubTables || hubTables.length === 0) {
    return domainTables?.[0] || 'Unknown';
  }
  
  // If only one hub, return it
  if (hubTables.length === 1) {
    return hubTables[0];
  }
  
  // For multiple hubs, use heuristics to find the dominant one
  let dominantHub = hubTables[0]; // fallback to first
  let maxScore = 0;
  
  for (const hub of hubTables) {
    let score = 0;
    
    // Score based on hub-related tables in domain
    const hubRelatedTables = domainTables.filter(tableName => {
      // Check if table name starts with or contains hub name
      const hubLower = hub.toLowerCase();
      const tableLower = tableName.toLowerCase();
      
      // Direct prefix match (e.g., Campaign -> CampaignDonation)
      if (tableLower.startsWith(hubLower)) {
        return true;
      }
      
      // Contains hub name (e.g., Campaign -> DonationCampaign)
      if (tableLower.includes(hubLower)) {
        return true;
      }
      
      return false;
    });
    
    score = hubRelatedTables.length;
    
    // Boost score if this hub is in the original hub list
    if (originalHubs.includes(hub)) {
      score += 0.5;
    }
    
    // Boost score if the hub table itself is in the domain
    if (domainTables.includes(hub)) {
      score += 1;
    }
    
    console.log(`  🎯 Hub ${hub}: ${hubRelatedTables.length} related tables, total score: ${score} (tables: [${hubRelatedTables.slice(0, 3).join(', ')}${hubRelatedTables.length > 3 ? '...' : ''}])`);
    
    if (score > maxScore) {
      maxScore = score;
      dominantHub = hub;
    }
  }
  
  console.log(`  ✅ Selected dominant hub: ${dominantHub} (score: ${maxScore})`);
  return dominantHub;
}

// Utility function to sanitize and validate table data
function sanitizeTableData(tables: any[]): any[] {
  if (!Array.isArray(tables)) {
    console.warn('⚠️ Tables input is not an array:', typeof tables);
    return [];
  }

  const sanitizedTables = [];
  
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    
    // Skip null, undefined, or non-object entries
    if (!table || typeof table !== 'object') {
      console.warn(`⚠️ Skipped non-object table at index ${i}:`, table);
      continue;
    }
    
    // Skip tables with invalid names
    if (!table.name || typeof table.name !== 'string' || table.name.trim() === '') {
      console.warn(`⚠️ Skipped table with invalid name at index ${i}:`, table);
      continue;
    }
    
    // Ensure columns array exists and is valid
    let columns = table.columns;
    let attributes = table.attributes;
    
    // Check if we have attributes but no columns (frontend sends attributes)
    if (!Array.isArray(columns) && Array.isArray(attributes)) {
      console.log(`   📋 Converting attributes to columns for ${table.name}`);
      columns = attributes.map((attr: any) => ({
        name: attr.name || '',
        type: attr.type || 'string',
        isPrimaryKey: attr.isPrimaryKey || false,
        isForeignKey: attr.isForeignKey || false,
        nullable: attr.nullable,
        unique: attr.unique,
        references: attr.references
      }));
      // Clear attributes since we've converted to columns
      attributes = undefined;
    } else if (!Array.isArray(columns)) {
      // Create minimal column structure if none exists
      console.warn(`   ⚠️ Table ${table.name} has no columns or attributes, creating minimal structure`);
      columns = [
        { name: 'id', type: 'integer', isPrimaryKey: true, isForeignKey: false }
      ];
    }
    
    // Sanitize the table object - only include columns, not attributes
    const sanitizedTable = {
      name: table.name.trim(),
      columns: columns,
      // Don't include attributes to avoid confusion
      primaryKeys: table.primaryKeys || ['id'],
      foreignKeys: table.foreignKeys || [],
      relationships: table.relationships || []
    };
    
    sanitizedTables.push(sanitizedTable);
  }
  
  console.log(`🧹 Table sanitization complete: ${tables.length} → ${sanitizedTables.length} valid tables`);
  return sanitizedTables;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Only allow Excel files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Canonical domain redirect - redirect www to non-www
  app.use((req, res, next) => {
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    
    // Only redirect in production and if host starts with www.
    if (process.env.NODE_ENV === 'production' && host && host.startsWith('www.')) {
      const canonicalHost = host.replace(/^www\./, '');
      const canonicalUrl = `${protocol}://${canonicalHost}${req.originalUrl}`;
      
      console.log(`🔄 Redirecting www to canonical domain: ${host} → ${canonicalHost}`);
      return res.redirect(301, canonicalUrl);
    }
    
    next();
  });

  // Configure CORS
  app.use(cors({
    origin: true, // Allow all origins in development
    credentials: true,
  }));

  // Apply security middleware to all API routes
  app.use("/api", [
    extractRateLimitContext(),
    secureApiResponse(),
    logResponseSecurity(),
    burstProtection,
    validateRequestSize(),
    sanitizeInput()
  ]);

  // Mount flexible parser routes
  app.use("/api/flexible-parser", flexibleParserRouter);

  // Mount ERD chat routes with rate limiting
  app.use("/api/erd", standardRateLimit, erdChatRouter);

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const uptime = process.uptime();
      const uptimeString = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime: uptimeString,
        services: {
          excel_parser: "operational",
          mermaid_generator: "operational"
        }
      });
    } catch (error) {
      res.status(500).json({
        error: "Health check failed",
        code: 500
      });
    }
  });

  // Security monitoring endpoint (protected)
  app.get("/api/security/metrics", [
    logSecurityEvent('security_metrics_access', 'low')
  ], async (req, res) => {
    try {
      // TODO: Add authentication/authorization check here
      // For now, basic IP-based access control
      const allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      if (!allowedIPs.includes(req.ip)) {
        await securityLogger.logEvent({
          eventType: 'unauthorized_security_access',
          severity: 'high',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          details: { reason: 'IP not in allowed list' }
        });
        
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          timestamp: new Date().toISOString()
        });
      }

      const metrics = securityLogger.getMetrics();
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Security metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security metrics',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Parse Excel endpoint with enhanced security
  app.post("/api/parse-excel", [
    fileUploadRateLimit,
    logSecurityEvent('file_upload', 'medium'),
    upload.single('file'),
    validateFileUpload({ required: true }),
    logFileUploadSecurity(),
    validateSchema(parseExcelRequestSchema)
  ], async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded",
          code: 400
        });
      }

      // Create upload session
      const session = await storage.createUploadSession({
        filename: req.file.originalname,
        status: "processing",
        tablesCount: null,
        relationshipsCount: null,
        errors: null
      });

      // Parse the Excel file
      const parseResult = await excelParserService.parseExcelFile(req.file.buffer);

      if (parseResult.errors.length > 0) {
        await storage.updateUploadSession(session.id, {
          status: "failed",
          errors: parseResult.errors
        });

        return res.status(422).json({
          error: "Failed to parse Excel file",
          code: 422,
          details: parseResult.errors
        });
      }

      // Get optional projectId from request body or query params (for logging/session tracking only)
      const projectId = req.body.projectId || req.query.projectId || null;
      
      console.log(`📋 Parsed Excel data for project: ${projectId || 'no project'} - ${parseResult.tables.length} tables, ${parseResult.relationships.length} relationships`);

      // NOTE: We no longer store data to database during upload
      // Data will only be stored when the user saves the project
      // This prevents duplicate storage and ensures proper organization_id assignment

      // Update session status
      await storage.updateUploadSession(session.id, {
        status: "completed",
        tablesCount: parseResult.tables.length.toString(),
        relationshipsCount: parseResult.relationships.length.toString()
      });

      // Format response to match frontend expectations
      const formattedTables = parseResult.tables.map(table => ({
        name: table.name,
        columns: table.attributes.map(attr => ({
          name: attr.name,
          type: attr.type,
          isPrimaryKey: attr.isPrimaryKey,
          isForeignKey: attr.isForeignKey,
          references: attr.references
        }))
      }));

      res.json({
        tables: formattedTables,
        relationships: parseResult.relationships,
        sessionId: session.id,
        filename: req.file.originalname, // Include actual filename for project save
        metadata: {
          tables_count: parseResult.tables.length,
          relationships_count: parseResult.relationships.length
        }
      });

    } catch (error) {
      console.error('Parse Excel error:', error);
      
      const multError = error as any;
      if (multError && multError.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: "File size exceeds 5MB limit",
          code: 413,
          details: {
            max_size: "5MB",
            received_size: (req as any).file ? `${((req as any).file.size / 1024 / 1024).toFixed(1)}MB` : "unknown"
          }
        });
      }

      res.status(500).json({
        error: "Internal server error during file parsing",
        code: 500,
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Generate domain-specific Mermaid diagrams endpoint - SIMPLIFIED VERSION
  app.post("/api/generate-domain-mermaid", async (req, res) => {
    try {
      // Validate request body
      const validatedData = generateMermaidRequestSchema.parse(req.body);
      
      const { tables, relationships = [], options = {}, projectId } = validatedData;

      console.log('🚀 AI-Enhanced Domain Clustering Pipeline Started');
      console.log(`  📊 Tables: ${tables.length}, Relationships: ${relationships.length}`);
      console.log(`  🤖 Features: 1536D Semantic Vectors + Multiplicative Scoring + Dependency Analysis`);

      // Sanitize and validate table data early (before cache check)
      const sanitizedTables = sanitizeTableData(tables);

      // Convert relationships to the correct format
      const formattedRelationships = relationships.map(rel => ({
        id: '',
        sourceTable: rel.sourceTable,
        sourceColumn: rel.sourceColumn,
        targetTable: rel.targetTable,
        targetColumn: rel.targetColumn,
        createdAt: new Date(),
        projectId: null,
        organizationId: null
      }));

      // Check for cached domains if projectId provided
      if (projectId) {
        try {
          const domainPersistenceService = new (await import('./services/domainPersistenceService')).DomainPersistenceService();
          const cachedDomains = await domainPersistenceService.getStoredDomains(projectId);
          
          if (cachedDomains && cachedDomains.domains.length > 0 && !options.forceRefresh) {
            console.log(`📦 [DOMAIN DEBUG] Using cached domains for project ${projectId} (${cachedDomains.domains.length} domains) - RETURNING EARLY`);
            
            // Transform cached domains to response format
            const { transformHybridClustersToDomainsResponse } = await import('./utils/domainTransformer');
            
            // Convert cached domains back to hybrid cluster format for transformer
            const hybridClusters = cachedDomains.domains.map((domain, index) => ({
              clusterId: domain.id,
              clusterName: domain.displayName,
              coreTable: cachedDomains.tables[domain.id]?.[0]?.tableName || `table_${index}`,
              tables: cachedDomains.tables[domain.id]?.map(t => t.tableName) || [],
              businessDomain: domain.domainName,
              confidenceScore: parseFloat(domain.confidenceScore || '0.5'),
              coherenceScore: domain.businessMetrics?.coherence || 0.5,
              isolationScore: domain.businessMetrics?.isolation || 0.5,
              hybridScore: parseFloat(domain.confidenceScore || '0.5'),
              connectivityScore: 0.5,
              semanticScore: 0.5,
              clusterType: 'cached' as const,
              coreTables: [],
              supportingTables: [],
              decisionReasons: ['Loaded from cache']
            }));
            
            const domainResults = transformHybridClustersToDomainsResponse(
              hybridClusters,
              sanitizedTables,
              formattedRelationships
            );
            
            return res.json({
              domains: domainResults,
              metadata: {
                total_domains: cachedDomains.domains.length,
                total_tables: tables.length,
                total_relationships: formattedRelationships.length,
                cached: true,
                cachedAt: cachedDomains.lastComputedAt
              }
            });
          }
        } catch (error) {
          console.warn('⚠️ [DOMAIN DEBUG] Could not load cached domains:', error);
          // Continue with clustering if cache fails
        }
      }

      // Convert TableData to TableInfo format for hybrid clustering
      const tableInfoList = coreTableDiscoveryService.convertTableDataToTableInfo(sanitizedTables);

      // Call advanced domain boundary service (AI-enhanced approach)
      console.log('🤖 Calling enhanced AI domain boundary service...');
      const advancedDomainService = new AdvancedDomainBoundaryService();
      const advancedResult = await advancedDomainService.detectAdvancedDomainBoundaries(
        tableInfoList,
        formattedRelationships,
        {
          algorithm: 'auto',                      // Auto-select optimal algorithm (Louvain/Dependency/Spectral)
          targetClusterCount: 15,                 // Target 15 meaningful business domains
          minClusterSize: 2,                      // Min 2 tables per domain (conservative)
          maxClusterSize: 20,                     // Max 20 tables per domain (enterprise-appropriate)
          
          // AI-Enhanced Semantic Analysis
          enableSemanticAnalysis: true,           // Enable 1536D OpenAI embeddings
          semanticWeight: 0.4,                    // Balanced semantic influence (40%)
          structuralWeight: 0.6,                  // Structure-first approach (60%)
          scoringMethod: 'multiplicative',        // Conservative multiplicative scoring
          conservativeMode: true,                 // Require both structural AND semantic strength
          
          // Dependency-Driven Domain Detection
          enableDependencyAnalysis: true,         // Enable hub-centric domain formation
          includeTransitiveDeps: false,           // Direct dependencies only (conservative)
          businessWeighting: 0.3,                 // Business naming pattern influence
          
          // Quality & Validation
          enableValidation: true,                 // Enable comprehensive validation
          performanceMode: 'accuracy',            // Prioritize quality over speed
          batchProcessing: true,                  // Enable batch processing for semantic vectors
          cachingEnabled: true                    // Enable result caching
        }
      );

      console.log(`✅ AI-enhanced clustering completed - found ${advancedResult.domains.length} domains`);
      console.log(`   📊 Algorithm selected: ${advancedResult.louvainClustering ? 'Louvain' : advancedResult.dependencyAnalysis ? 'Dependency' : 'Spectral'}`);
      console.log(`   🎯 Quality score: ${advancedResult.validation.overallQuality.overallScore.toFixed(3)}`);
      console.log(`   🤖 Semantic analysis: ${advancedResult.semanticAnalysis ? `${advancedResult.semanticAnalysis.vectorCount} vectors (${advancedResult.semanticAnalysis.embeddingDimensions}D)` : 'disabled'}`);
      console.log(`   🏗️ Dependency analysis: ${advancedResult.dependencyAnalysis ? `${advancedResult.dependencyAnalysis.domains.length} hub domains` : 'disabled'}`);
      console.log(`   ⚡ Processing time: ${advancedResult.performance?.totalProcessingTime?.toFixed(1) || '0'}ms`);

      // Transform AI-enhanced domains to legacy format for frontend compatibility  
      const hybridResult = {
        hybridClusters: advancedResult.domains.map(domain => {
          // Use smart hub selection to preserve original community hubs
          const actualHubTable = selectDominantHub(domain.hubTables || [], domain.tables, advancedResult.hubDetection?.hubTables || []);
          
          console.log(`🎯 Domain "${domain.name}": Hub table set to "${actualHubTable}" (from hubTables: [${domain.hubTables?.join(', ') || 'none'}])`);
          
          return {
            clusterId: domain.id,
            clusterName: domain.name,
            tables: domain.tables,
            coreTable: actualHubTable, // Use actual hub table
            confidenceScore: domain.confidence,
            coherenceScore: domain.coherenceScore,
            businessDomain: domain.businessContext || domain.name,
            algorithmUsed: domain.algorithmUsed || 'AI-enhanced',
            hubTables: domain.hubTables,
            // AI enhancement indicators
            aiEnhanced: true,
            semanticScore: advancedResult.semanticAnalysis?.averageSimilarity || 0,
            dependencyDriven: !!advancedResult.dependencyAnalysis
          };
        }),
        clusteringMetrics: {
          averageQuality: advancedResult.validation.overallQuality.overallScore,
          totalProcessingTime: advancedResult.performance?.totalProcessingTime || 0,
          algorithmUsed: advancedResult.louvainClustering ? 'Louvain' : advancedResult.dependencyAnalysis ? 'Dependency-Driven' : 'Spectral',
          hubCount: advancedResult.hubDetection.statistics.hubCount,
          isolatedHubs: advancedResult.hubAssignment.isolatedHubs.length,
          // AI-enhanced metrics
          semanticCoverage: advancedResult.semanticAnalysis?.semanticCoverage || 0,
          embeddingDimensions: advancedResult.semanticAnalysis?.embeddingDimensions || 0,
          dependencyDomains: advancedResult.dependencyAnalysis?.domains.length || 0,
          aiEnhanced: true
        }
      };

      // Generate simple domain names using hub table pattern
      console.log('📝 Generating domain names using [Hub Name] Domain pattern...');
      
      hybridResult.hybridClusters.forEach((cluster, index) => {
        // Use the hub table (coreTable) to create domain name
        const hubTableName = cluster.coreTable || 'Unknown';
        const domainName = `${hubTableName} Domain`;
        
        cluster.clusterName = domainName;
        cluster.businessDomain = domainName;
        
        console.log(`  ✨ Domain ${index + 1}: "${domainName}" (hub: ${hubTableName})`);
      });
      
      console.log(`✅ Generated ${hybridResult.hybridClusters.length} domain names successfully`);

      // Import transformer function
      const { transformHybridClustersToDomainsResponse } = await import('./utils/domainTransformer');
      
      console.log(`🔄 [DOMAIN DEBUG] Processing FRESH domains - generating ${hybridResult.hybridClusters.length} domains`);
      
      // Transform hybrid clusters to frontend domain format
      const domainResults = transformHybridClustersToDomainsResponse(
        hybridResult.hybridClusters,
        sanitizedTables,
        formattedRelationships
      );

      // Log the generated diagrams for debugging
      console.log('📊 Generated domain diagrams:', Object.keys(domainResults));
      Object.entries(domainResults).forEach(([domain, result]) => {
        console.log(`  ${domain}: ${result.metadata.tables_count} tables, ${result.metadata.relationships_count} relationships`);
      });

      // Store domains in database for future use
      if (projectId && hybridResult.hybridClusters.length > 0) {
        try {
          const domainPersistenceService = new (await import('./services/domainPersistenceService')).DomainPersistenceService();
          
          // Convert hybrid clusters to vector clustering format for storage
          const vectorClusteringResult = {
            clusters: hybridResult.hybridClusters.map(cluster => ({
              id: cluster.clusterId,
              name: cluster.clusterName,
              tables: cluster.tables,
              coreTable: cluster.coreTable,
              confidence: cluster.confidenceScore,
              coherence: cluster.coherenceScore,
              businessDomain: cluster.businessDomain || cluster.clusterName,
              purpose: cluster.llmMetadata?.description || `Domain containing ${cluster.coreTable} and related entities`,
              // Store LLM metadata for enhanced domain information
              llmEnhanced: !!cluster.llmMetadata,
              llmConfidence: cluster.llmMetadata?.confidence,
              llmReasoning: cluster.llmMetadata?.reasoning
            })),
            overallMetrics: {
              clusterCount: hybridResult.hybridClusters.length,
              averageCoherence: hybridResult.clusteringMetrics?.averageQuality || 0.5,
              coverage: 1.0
            }
          };
          
          await domainPersistenceService.storeDomainClustering(
            projectId,
            vectorClusteringResult,
            [] // Empty embeddings since we're using hybrid clustering
          );
          
          console.log(`💾 Stored ${hybridResult.hybridClusters.length} domains for project ${projectId}`);
        } catch (error) {
          console.warn('⚠️ Could not store domains:', error);
          // Don't fail the request if storage fails
        }
      }

      res.json({
        domains: domainResults,
        metadata: {
          total_domains: Object.keys(domainResults).length,
          total_tables: tables.length,
          total_relationships: formattedRelationships.length,
          clustering_metrics: hybridResult.clusteringMetrics,
          processing_time_ms: hybridResult.clusteringMetrics.totalProcessingTime,
          // AI enhancement metadata
          ai_enhanced: true,
          features_enabled: {
            semantic_analysis: !!advancedResult.semanticAnalysis,
            dependency_analysis: !!advancedResult.dependencyAnalysis,
            multiplicative_scoring: true,
            quality_validation: true
          },
          semantic_info: advancedResult.semanticAnalysis ? {
            vector_count: advancedResult.semanticAnalysis.vectorCount,
            embedding_dimensions: advancedResult.semanticAnalysis.embeddingDimensions,
            coverage_percentage: Math.round(advancedResult.semanticAnalysis.semanticCoverage * 100),
            average_similarity: advancedResult.semanticAnalysis.averageSimilarity.toFixed(3)
          } : null
        }
      });

    } catch (error) {
      console.error('Generate domain Mermaid error:', error);
      
      res.status(400).json({
        error: "Invalid request data for domain Mermaid generation",
        code: 400,
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });



  // Get parsed tables (for frontend integration)
  app.get("/api/tables", async (req, res) => {
    try {
      // Get user's organization for multi-tenant security
      const auth = await getAuth();
      let organizationId = 'default'; // Fallback for development
      
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          const db = await getDb();
          if (db) {
            // Get user's first organization membership
            const userMembership = await db.select({
              organizationId: member.organizationId
            })
              .from(member)
              .where(eq(member.userId, sessionData.user.id))
              .limit(1);
            
            if (userMembership.length > 0) {
              organizationId = userMembership[0].organizationId;
            }
          }
        }
      } catch (authError) {
        console.log('Auth extraction failed, using default organization for tables endpoint');
      }

      // Filter data by organizationId for security
      const tables = await storage.getTables(organizationId);
      const relationships = await storage.getRelationships(organizationId);

      // Format for frontend compatibility
      const formattedTables = tables.map(table => ({
        name: table.name,
        columns: Array.isArray(table.attributes) ? table.attributes.map((attr: any) => ({
          name: attr.name,
          type: attr.type,
          isPrimaryKey: attr.isPrimaryKey || false,
          isForeignKey: attr.isForeignKey || false,
          references: attr.references
        })) : []
      }));

      res.json({
        tables: formattedTables,
        relationships: relationships.map(rel => ({
          sourceTable: rel.sourceTable,
          sourceColumn: rel.sourceColumn,
          targetTable: rel.targetTable,
          targetColumn: rel.targetColumn
        }))
      });

    } catch (error) {
      console.error('Get tables error:', error);
      res.status(500).json({
        error: "Failed to retrieve tables",
        code: 500
      });
    }
  });

  // Test endpoint for simple Mermaid diagram
  app.get("/api/test-mermaid", (req, res) => {
    const testDiagram = `erDiagram
  Customer {
    int id PK
    string name
    string email
  }
  Order {
    int id PK
    int customer_id FK
    date order_date
  }
  Customer ||--o{ Order : places`;

    res.json({ 
      diagram: testDiagram,
      metadata: { tables_count: 2, relationships_count: 1 }
    });
  });

  // ====== PROJECT API ENDPOINTS ======

  // Get all projects for the current user's organization
  app.get("/api/projects", async (req, res) => {
    console.log('📍 GET /api/projects called');
    try {
      // Extract user ID from BetterAuth session
      const auth = await getAuth();
      let userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // Real user ID as fallback
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for project list, using fallback user');
      }
      console.log('Using default user ID for testing:', userId);

      const projects = await storage.getProjectsByOrganization(userId);
      console.log('Found projects:', projects.length);

      // Enhance projects with actual table/relationship counts
      const enhancedProjects = await Promise.all(
        projects.map(async (project) => {
          try {
            const stats = await storage.getProjectStatistics(project.id);
            return {
              ...project,
              tables_count: stats.tables_count,
              relationships_count: stats.relationships_count
            };
          } catch (error) {
            console.error(`Failed to get stats for project ${project.id}:`, error);
            return {
              ...project,
              tables_count: 0,
              relationships_count: 0
            };
          }
        })
      );

      console.log('Enhanced projects with statistics:', enhancedProjects.map(p => ({
        id: p.id,
        name: p.name,
        tables: p.tables_count,
        relationships: p.relationships_count
      })));
      
      res.json({ projects: enhancedProjects });
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({
        error: "Failed to retrieve projects",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create a new project
  app.post("/api/projects", [
    projectRateLimit,
    logSecurityEvent('project_create', 'low'),
    validateSchema(projectCreateSchema, 'body')
  ], async (req, res) => {
    console.log('📍 POST /api/projects called');
    try {
      // Extract user ID from BetterAuth session
      const auth = await getAuth();
      let userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // Real user ID as fallback
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        console.log('Session data for project creation:', sessionData?.user?.id ? 'User found' : 'No user in session');
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
          console.log('Using authenticated user ID:', userId);
        } else {
          console.log('No authenticated user found, falling back to default-user');
        }
      } catch (authError: any) {
        console.log('Auth extraction failed for project creation:', authError?.message || 'Unknown auth error');
      }
      console.log('Creating project for user:', userId);

      const validatedData = projectSchema.parse(req.body);
      console.log('Validated project data:', validatedData);
      
      // Get user's organizations
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database connection not available" });
      }
      
      const userOrganizations = await db.select({
        organizationId: member.organizationId,
        role: member.role
      })
      .from(member)
      .where(eq(member.userId, userId));
      
      if (userOrganizations.length === 0) {
        return res.status(403).json({ error: "You must be a member of an organization to create projects" });
      }
      
      // Use the first organization or the one specified in the request
      const organizationId = (validatedData as any).organizationId || userOrganizations[0].organizationId;
      
      // Verify user has access to this organization
      const hasAccess = userOrganizations.some(org => org.organizationId === organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: "You don't have access to this organization" });
      }
      
      const project = await storage.createProject({
        name: validatedData.name,
        description: validatedData.description || null,
        organizationId: organizationId,
        ownerId: userId,
        settings: validatedData.settings || {}
      });

      console.log('Created project:', project.id);
      res.status(201).json({ project });
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({
        error: "Failed to create project",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get a specific project
  app.get("/api/projects/:projectId", [
    validateSchema(projectIdParamSchema, 'params')
  ], async (req, res) => {
    try {
      const auth = await getAuth();
      let userId = 'default-user';
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed, using default user');
      }

      const project = await storage.getProject(req.params.projectId, userId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json({ project });
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({
        error: "Failed to retrieve project",
        code: 500
      });
    }
  });

  // Get project data (tables, relationships, ERD)
  app.get("/api/projects/:projectId/data", [
    validateSchema(projectIdParamSchema, 'params')
  ], async (req, res) => {
    console.log('📍 GET /api/projects/:projectId/data called for project:', req.params.projectId);
    try {
      // Extract user ID from BetterAuth session
      const auth = await getAuth();
      let userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // Real user ID as fallback
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for project data, using fallback user');
      }
      console.log('Using default user for project data request');

      const project = await storage.getProject(req.params.projectId, userId);
      if (!project) {
        console.log('Project not found:', req.params.projectId);
        return res.status(404).json({ error: "Project not found" });
      }

      console.log('Found project:', project.name);

      // Get project files (contains the actual ERD data)
      const projectFiles = await storage.getProjectFiles(req.params.projectId);
      console.log('Found project files:', projectFiles.length);

      let tables = [];
      let relationships = [];
      let mermaidCode = '';

      if (projectFiles.length > 0) {
        // Use the most recent project file
        const latestFile = projectFiles.sort((a, b) => 
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        )[0];

        console.log('Using latest project file:', latestFile.id);
        
        // Extract data from the project file
        if (latestFile.erdData && typeof latestFile.erdData === 'object') {
          const erdData = latestFile.erdData as any;
          tables = erdData.tables || [];
          relationships = erdData.relationships || [];
        }
        
        mermaidCode = latestFile.mermaidCode || '';
      } else {
        console.log('No project files found, checking legacy tables/relationships storage');
        // Fallback to legacy storage if no project files exist
        const storedTables = await storage.getTables();
        const storedRelationships = await storage.getRelationships();
        
        // Filter by project ID if available
        tables = storedTables.filter(t => t.projectId === req.params.projectId);
        relationships = storedRelationships.filter(r => r.projectId === req.params.projectId);
      }

      console.log('Returning project data:', {
        tables: tables.length,
        relationships: relationships.length,
        mermaidCode: mermaidCode.length
      });

      // Debug: Check if codemaster data exists in tables
      console.log('🔍 [CODEMASTER DEBUG] Checking tables for codemaster data...');
      tables.forEach((table, index) => {
        if (index < 3) { // Only log first 3 tables to avoid spam
          console.log(`🔍 [CODEMASTER DEBUG] Table ${table.name}:`, {
            hasAttributes: !!table.attributes,
            attributesType: typeof table.attributes,
            attributesKeys: table.attributes ? Object.keys(table.attributes) : [],
            hasCodemasterValues: table.attributes && typeof table.attributes === 'object' && 
              Object.values(table.attributes).some((col: any) => col?.codemasterValues),
            hasColumns: !!table.columns,
            columnCount: table.columns ? table.columns.length : 0,
            sampleColumn: table.columns && table.columns[0] ? {
              name: table.columns[0].name,
              hasCodemaster: !!table.columns[0].codemasterValues,
              codemasterLength: table.columns[0].codemasterValues?.length || 0
            } : null,
            fullTableStructure: JSON.stringify(table).substring(0, 500)
          });
        }
      });

      // Extract codemaster mappings from table column data
      const codemasterMappings: any[] = [];
      tables.forEach(table => {
        // Check both table.attributes (legacy format) and table.columns (current format)
        
        // Method 1: Check table.attributes
        if (table.attributes && typeof table.attributes === 'object') {
          Object.entries(table.attributes).forEach(([columnName, columnData]: [string, any]) => {
            if (columnData?.codemasterValues && Array.isArray(columnData.codemasterValues)) {
              codemasterMappings.push({
                tableName: table.name,
                fieldName: columnName,
                sheetName: columnData.codemasterSource || 'unknown',
                codeValues: columnData.codemasterValues,
                totalRecords: columnData.codemasterValues.length
              });
            }
          });
        }
        
        // Method 2: Check table.columns (appears to be the current format)
        if (table.columns && Array.isArray(table.columns)) {
          table.columns.forEach((column: any) => {
            if (column?.codemasterValues && Array.isArray(column.codemasterValues)) {
              codemasterMappings.push({
                tableName: table.name,
                fieldName: column.name,
                sheetName: column.codemasterSource || 'unknown',
                codeValues: column.codemasterValues,
                totalRecords: column.codemasterValues.length
              });
              console.log(`🏷️ [CODEMASTER DEBUG] Found codemaster data: ${table.name}.${column.name} with ${column.codemasterValues.length} values`);
            }
          });
        }
      });

      console.log(`🔍 [CODEMASTER DEBUG] Extracted ${codemasterMappings.length} codemaster mappings from project data`);

      res.json({
        project,
        tables,
        relationships,
        mermaidCode,
        codemasterMappings, // Add the extracted codemaster mappings
        metadata: {
          tables_count: tables.length,
          relationships_count: relationships.length
        }
      });
    } catch (error) {
      console.error('Get project data error:', error);
      res.status(500).json({
        error: "Failed to retrieve project data",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Save project data (tables, relationships, ERD)
  app.post("/api/projects/:projectId/save", [
    validateSchema(projectIdParamSchema, 'params'),
    validateSchema(projectDataSaveSchema, 'body'),
    logSecurityEvent('project_data_save', 'medium')
  ], async (req, res) => {
    try {
      const auth = await getAuth();
      let userId = 'default-user';
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for project save');
      }

      const { tables, relationships, mermaidCode, filename } = req.body;

      // Get project to extract organizationId for multi-tenant security
      const project = await storage.getProject(req.params.projectId, userId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Try to update existing project file, or create new one if none exists
      let projectFile = await storage.updateProjectFile(req.params.projectId, {
        filename: filename || 'uploaded_data.xlsx',
        fileData: null, // Could store original file data if needed
        erdData: { tables, relationships },
        mermaidCode,
        version: '1'
      });

      // If no existing file found, create a new one
      if (!projectFile) {
        projectFile = await storage.saveProjectFile({
          projectId: req.params.projectId,
          filename: filename || 'uploaded_data.xlsx',
          fileData: null, // Could store original file data if needed
          erdData: { tables, relationships },
          mermaidCode,
          version: '1'
        });
      }

      // Replace tables and relationships in the main tables for compatibility with organizationId
      // Use transaction-safe replace operation to avoid duplicates
      if (storage.replaceProjectData) {
        await storage.replaceProjectData(tables, relationships, req.params.projectId, project.organizationId);
      } else {
        // Fallback to clear then store for storage implementations without replaceProjectData
        await storage.clearProjectTables(req.params.projectId);
        await storage.clearProjectRelationships(req.params.projectId);
        await storage.storeTables(tables, req.params.projectId, project.organizationId);
        await storage.storeRelationships(relationships, req.params.projectId, project.organizationId);
      }

      // Domain clustering is handled on-demand by the /api/generate-domain-mermaid endpoint
      // to prevent duplication and ensure consistent results

      res.json({ 
        success: true, 
        projectFile,
        message: "Project saved successfully" 
      });
    } catch (error) {
      console.error('Save project error:', error);
      res.status(500).json({
        error: "Failed to save project",
        code: 500
      });
    }
  });

  // Update project metadata
  app.put("/api/projects/:projectId", [
    projectRateLimit,
    logSecurityEvent('project_update', 'low'),
    validateSchema(projectIdParamSchema, 'params'),
    validateSchema(projectUpdateSchema, 'body')
  ], async (req, res) => {
    try {
      const auth = await getAuth();
      let userId = 'default-user';
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for project update');
      }

      const validatedData = projectSchema.parse(req.body);
      
      const project = await storage.updateProject(req.params.projectId, {
        name: validatedData.name,
        description: validatedData.description || null,
        settings: validatedData.settings || {}
      }, userId);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json({ project });
    } catch (error) {
      console.error('Update project error:', error);
      res.status(500).json({
        error: "Failed to update project",
        code: 500
      });
    }
  });

  // Delete a project
  app.delete("/api/projects/:projectId", [
    projectRateLimit,
    logSecurityEvent('project_delete', 'medium'),
    validateSchema(projectIdParamSchema, 'params')
  ], async (req, res) => {
    try {
      const auth = await getAuth();
      let userId = 'default-user';
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for project delete');
      }

      const success = await storage.deleteProject(req.params.projectId, userId);
      if (!success) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
      console.error('Delete project error:', error);
      res.status(500).json({
        error: "Failed to delete project",
        code: 500
      });
    }
  });

  // Duplicate a project
  app.post("/api/projects/:projectId/duplicate", [
    projectRateLimit,
    logSecurityEvent('project_duplicate', 'low')
  ], async (req, res) => {
    try {
      const auth = await getAuth();
      let userId = 'default-user';
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for project duplicate');
      }

      const originalProject = await storage.getProject(req.params.projectId, userId);
      if (!originalProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Create duplicate project with new name
      const duplicateName = `${originalProject.name} (Copy)`;
      const duplicateProject = await storage.createProject({
        name: duplicateName,
        description: originalProject.description,
        organizationId: originalProject.organizationId,
        ownerId: userId,
        settings: originalProject.settings || {}
      });

      // Copy project files and data
      const projectFiles = await storage.getProjectFiles(req.params.projectId);
      if (projectFiles.length > 0) {
        const latestFile = projectFiles.sort((a, b) => 
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        )[0];

        await storage.saveProjectFile({
          projectId: duplicateProject.id,
          filename: latestFile.filename,
          fileData: latestFile.fileData as any,
          erdData: latestFile.erdData as any,
          mermaidCode: latestFile.mermaidCode,
          version: '1'
        });

        // Copy tables and relationships if they exist in erdData
        if (latestFile.erdData && typeof latestFile.erdData === 'object') {
          const erdData = latestFile.erdData as any;
          const tables = erdData.tables || [];
          const relationships = erdData.relationships || [];
          
          if (tables.length > 0 || relationships.length > 0) {
            // Use transaction-safe replace operation for project duplication
            if (storage.replaceProjectData) {
              await storage.replaceProjectData(tables, relationships, duplicateProject.id, originalProject.organizationId);
            } else {
              // Fallback to separate operations
              if (tables.length > 0) {
                await storage.storeTables(tables, duplicateProject.id, originalProject.organizationId);
              }
              if (relationships.length > 0) {
                await storage.storeRelationships(relationships, duplicateProject.id, originalProject.organizationId);
              }
            }
          }
        }
      }

      res.json({ project: duplicateProject });
    } catch (error) {
      console.error('Duplicate project error:', error);
      res.status(500).json({
        error: "Failed to duplicate project",
        code: 500
      });
    }
  });

  // ====== ORGANIZATION API ENDPOINTS ======
  // Organization endpoints moved to custom API implementation
  // See server/organization-api.ts for current organization management

  // ====== ORGANIZATION MEMBER API ENDPOINTS ======

  // Organization members endpoint moved to organization-api.ts

  // ====== INVITATION API ENDPOINTS ======

  // Send invitation to join organization (custom implementation)
  app.post("/api/organizations/:organizationId/invitations", [
    validateSchema(organizationIdParamSchema, 'params'),
    validateSchema(invitationCreateSchema, 'body'),
    logSecurityEvent('organization_invite', 'medium')
  ], async (req, res) => {
    console.log('📍 POST /api/organizations/:organizationId/invitations called (Custom)');
    try {
      const auth = await getAuth();
      let userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // Real user ID as fallback
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for invitation, using fallback');
      }

      const { email, role = 'member' } = req.body;
      const organizationId = req.params.organizationId;

      // Validate input
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: "Valid email address is required" });
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Check if user has permission to send invitations (admin or owner)
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }
      
      // Query user's membership in the organization directly
      const userMembership = await db.select()
        .from(member)
        .where(and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId)
        ))
        .limit(1);
      
      if (userMembership.length === 0 || (userMembership[0].role !== 'owner' && userMembership[0].role !== 'admin')) {
        return res.status(403).json({ error: "Insufficient permissions to send invitations" });
      }

      // Create invitation using custom storage
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      const invitation = await storage.createInvitation({
        id: randomUUID(),
        organizationId,
        email: email.toLowerCase().trim(),
        role,
        token,
        inviterId: userId,
        expiresAt,
        status: 'pending'
      });

      if (!invitation) {
        return res.status(500).json({ error: "Failed to create invitation" });
      }

      console.log(`✅ Custom invitation created for ${email} to join organization ${organizationId}`);
      
      // Send invitation email
      try {
        // Get organization details for email
        const orgResult = await db.select()
          .from(organization)
          .where(eq(organization.id, organizationId))
          .limit(1);
          
        if (orgResult.length > 0) {
          let inviterName = 'ERDify Team';
          try {
            const auth = await getAuth();
            const sessionData = await auth.api.getSession({ headers: req.headers });
            if (sessionData?.user?.name) {
              inviterName = sessionData.user.name;
            } else if (sessionData?.user?.email) {
              inviterName = sessionData.user.email;
            }
          } catch (authError) {
            console.log('Could not get inviter name, using default');
          }
          
          const emailResult = await emailService.sendInvitationEmail({
            email: invitation.email,
            organizationName: orgResult[0].name,
            inviterName,
            role: invitation.role,
            token: invitation.token,
            expiresAt: invitation.expiresAt
          });
          
          if (emailResult.success) {
            console.log(`📧 Invitation email sent to ${email} (messageId: ${emailResult.messageId})`);
          } else {
            console.error(`📧 Failed to send invitation email: ${emailResult.error}`);
          }
        } else {
          console.error('📧 Could not find organization for email template');
        }
      } catch (emailError) {
        console.error('📧 Email service error:', emailError);
        // Don't fail the invitation creation if email fails
      }
      
      res.json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: 'pending',
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt
        },
        message: "Invitation sent successfully"
      });

    } catch (error) {
      console.error('Custom send invitation error:', error);
      res.status(500).json({
        error: "Failed to send invitation",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get pending invitations for organization
  // Organization invitations endpoint moved to organization-api.ts

  // Resend invitation
  app.post("/api/organizations/:organizationId/invitations/resend", async (req, res) => {
    console.log('📍 POST /api/organizations/:organizationId/invitations/resend called');
    try {
      const auth = await getAuth();
      let userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // Real user ID as fallback
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for invitation resend');
      }

      const { email, role = 'viewer' } = req.body;
      const organizationId = req.params.organizationId;

      // Validate input
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: "Valid email address is required" });
      }

      // Check if user has permission to resend invitations (admin or owner)
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }
      
      // Query user's membership in the organization directly
      const userMembership = await db.select()
        .from(member)
        .where(and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId)
        ))
        .limit(1);
      
      if (userMembership.length === 0 || (userMembership[0].role !== 'owner' && userMembership[0].role !== 'admin')) {
        return res.status(403).json({ error: "Insufficient permissions to resend invitations" });
      }

      // Simply send a new invitation (existing invitation will remain)
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      const invitation = await storage.createInvitation({
        id: randomUUID(),
        organizationId,
        email: email.toLowerCase().trim(),
        role,
        token,
        inviterId: userId,
        expiresAt,
        status: 'pending'
      });

      if (!invitation) {
        return res.status(500).json({ error: "Failed to create invitation" });
      }

      // Send invitation email
      try {
        let inviterName = 'ERDify Team';
        try {
          const auth = await getAuth();
          const sessionData = await auth.api.getSession({ headers: req.headers });
          if (sessionData?.user?.name) {
            inviterName = sessionData.user.name;
          } else if (sessionData?.user?.email) {
            inviterName = sessionData.user.email;
          }
        } catch (authError) {
          console.log('Could not get inviter name, using default');
        }

        // Get organization name for email
        const org = await db.select().from(organization).where(eq(organization.id, organizationId)).limit(1);
        const organizationName = org[0]?.name || 'ERDify';
        
        const emailResult = await emailService.sendInvitationEmail({
          email: invitation.email,
          organizationName,
          inviterName,
          role: invitation.role,
          token: invitation.token,
          expiresAt: invitation.expiresAt
        });

        if (emailResult.success) {
          console.log(`📧 Invitation resent to ${email} (messageId: ${emailResult.messageId})`);
        } else {
          console.error(`📧 Failed to resend invitation email: ${emailResult.error}`);
        }
      } catch (emailError) {
        console.error('📧 Email service error on resend:', emailError);
      }

      console.log(`✅ Invitation resent to ${email}`);

      res.status(201).json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        message: "Invitation resent successfully"
      });

    } catch (error) {
      console.error('Resend invitation error:', error);
      res.status(500).json({
        error: "Failed to resend invitation",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Cancel invitation
  app.delete("/api/organizations/:organizationId/invitations/:invitationId", async (req, res) => {
    console.log('📍 DELETE /api/organizations/:organizationId/invitations/:invitationId called');
    try {
      const auth = await getAuth();
      let userId = '9voeySCv7c2MPy0lRfn0iTPjCxlaW2FO'; // Real user ID as fallback
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        console.log('Auth extraction failed for invitation cancellation');
      }

      const { organizationId, invitationId } = req.params;

      // Check if user has permission to cancel invitations
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }
      
      // Query user's membership in the organization directly
      const userMembership = await db.select()
        .from(member)
        .where(and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId)
        ))
        .limit(1);
      
      if (userMembership.length === 0 || (userMembership[0].role !== 'owner' && userMembership[0].role !== 'admin')) {
        return res.status(403).json({ error: "Insufficient permissions to cancel invitations" });
      }

      const result = await storage.deleteInvitation(invitationId);
      
      if (!result.success) {
        console.log(`❌ Failed to delete invitation ${invitationId}: ${result.error}`);
        return res.status(404).json({ error: result.error || "Invitation not found" });
      }

      console.log(`✅ Invitation ${invitationId} cancelled successfully`);
      res.json({ success: true, message: "Invitation cancelled successfully" });

    } catch (error) {
      console.error('Cancel invitation error:', error);
      res.status(500).json({
        error: "Failed to cancel invitation",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ====== PUBLIC INVITATION ENDPOINTS ======
  
  // Get invitation by token (public endpoint for invitation acceptance)
  app.get("/api/invitations/:token", [
    validateSchema(tokenParamSchema, 'params')
  ], async (req, res) => {
    console.log('📍 GET /api/invitations/:token called');
    try {
      const { token } = req.params;

      // Get invitation by token
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ error: "Invalid invitation" });
      }

      // Check if invitation is expired
      if (new Date() > new Date(invitation.expiresAt)) {
        return res.status(400).json({ error: "Invitation has expired" });
      }

      // Get organization name for display
      const db = await getDb();
      let organizationName = 'Unknown Organization';
      if (db) {
        try {
          const orgResult = await db.select()
            .from(organization)
            .where(eq(organization.id, invitation.organizationId))
            .limit(1);
          if (orgResult.length > 0) {
            organizationName = orgResult[0].name;
          }
        } catch (error) {
          console.warn('Could not fetch organization name:', error);
        }
      }

      // Return invitation data in format expected by frontend
      res.json({
        email: invitation.email,
        organizationId: invitation.organizationId,
        organizationName,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        status: invitation.status
      });

      console.log(`✅ Invitation lookup successful for ${invitation.email}`);

    } catch (error) {
      console.error('❌ Error looking up invitation:', error);
      res.status(500).json({
        error: "Failed to lookup invitation",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Custom invitation endpoints for organization management
  // Handles invitation flows for multi-tenant organizations
  
  // Complete invitation acceptance (after user authentication)
  app.post("/api/invitations/:token/accept", [
    validateSchema(tokenParamSchema, 'params'),
    logSecurityEvent('invitation_accept', 'medium')
  ], async (req, res) => {
    console.log('📍 POST /api/invitations/:token/accept called');
    try {
      const { token } = req.params;
      const auth = await getAuth();
      
      // Get authenticated user
      let userId = null;
      try {
        const sessionData = await auth.api.getSession({ headers: req.headers });
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
        }
      } catch (authError) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get invitation by token
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: "Invitation has already been processed" });
      }

      if (new Date() > new Date(invitation.expiresAt)) {
        return res.status(400).json({ error: "Invitation has expired" });
      }

      // Add user to organization membership
      // Map 'member' role to 'editor' to match database constraints
      const validRole = invitation.role === 'member' ? 'editor' : invitation.role;
      console.log(`🔄 Adding user ${userId} to organization ${invitation.organizationId} with role ${validRole} (mapped from ${invitation.role})`);
      
      const membership = await storage.createOrganizationMembership(
        userId, 
        invitation.organizationId, 
        validRole
      );
      
      if (!membership) {
        return res.status(500).json({ error: "Failed to create organization membership" });
      }

      // Update invitation status to accepted
      const updated = await storage.updateInvitationStatus(invitation.id, 'accepted');
      
      if (!updated) {
        return res.status(500).json({ error: "Failed to update invitation status" });
      }

      // Clean up invitation context if this was an invitation signup
      const invitationUsers = (global as any).invitationUsers || new Map();
      if (invitationUsers.has(userId)) {
        console.log(`🧹 Cleaning up invitation context for user ${userId}`);
        invitationUsers.delete(userId);
      }

      console.log(`✅ Invitation accepted for ${invitation.email} - User added with role: ${membership.role}`);

      res.json({
        success: true,
        message: "Invitation accepted successfully",
        organizationId: invitation.organizationId,
        membership: {
          id: membership.id,
          role: membership.role,
          joinedAt: membership.joinedAt
        }
      });

    } catch (error) {
      console.error('Complete invitation error:', error);
      res.status(500).json({
        error: "Failed to complete invitation acceptance",
        code: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });


  // BetterAuth API routes - handle all auth-related requests
  app.all("/api/auth/*", async (req, res) => {
    try {
      console.log(`🔐 Auth request: ${req.method} ${req.originalUrl}`);
      console.log(`🔐 Auth request body:`, req.body);
      console.log(`🔐 Auth request headers:`, req.headers);
      
      const auth = await getAuth();
      
      if (!auth) {
        console.error('❌ Auth instance not available');
        return res.status(500).json({ error: 'Authentication service unavailable' });
      }
      
      // Create proper Web Request from Express request
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const url = `${protocol}://${req.headers.host}${req.originalUrl}`;
      
      // Handle request body properly
      let body: string | null = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (typeof req.body === 'object' && req.body !== null) {
          body = JSON.stringify(req.body);
        } else if (typeof req.body === 'string') {
          body = req.body;
        }
      }
      
      console.log(`🔐 Creating request: ${req.method} ${url}`);
      
      const webRequest = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body,
      });

      const response = await auth.handler(webRequest);
      
      if (!response) {
        console.warn(`⚠️ No response from auth handler for: ${req.originalUrl}`);
        return res.status(404).json({ error: 'Auth endpoint not found' });
      }
      
      console.log(`✅ Auth response: ${response.status} for ${req.originalUrl}`);
      
      // Set status
      res.status(response.status);
      
      // Set headers
      response.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });
      
      // Send body
      if (response.body) {
        const text = await response.text();
        res.send(text);
      } else {
        res.end();
      }
    } catch (error) {
      console.error('❌ Auth handler error:', error);
      res.status(500).json({ 
        error: 'Authentication error', 
        details: error instanceof Error ? error.message : String(error),
        path: req.originalUrl 
      });
    }
  });

  // Profile update endpoint
  app.put("/api/profile", [
    validateSchema(profileUpdateSchema, 'body'),
    logSecurityEvent('profile_update', 'low')
  ], async (req, res) => {
    try {
      const auth = await getAuth();
      
      // Get authenticated user
      let sessionData;
      try {
        sessionData = await auth.api.getSession({ headers: req.headers });
      } catch (authError) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!sessionData?.user?.id) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const userId = sessionData.user.id;
      const { name, email } = req.body;

      // Validate input
      if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required" });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database connection failed" });
      }

      // Update user profile using better-auth's user table
      const updatedUser = await db
        .update(user)
        .set({
          name: name.trim(),
          email: email.trim(),
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId))
        .returning();

      if (updatedUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`✅ Profile updated for user ${email}: name="${name}"`);

      res.json({
        success: true,
        message: "Profile updated successfully",
        user: {
          id: updatedUser[0].id,
          name: updatedUser[0].name,
          email: updatedUser[0].email,
        }
      });

    } catch (error) {
      console.error('❌ Profile update error:', error);
      res.status(500).json({
        error: "Failed to update profile",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Register organization API endpoints
  registerOrganizationAPI(app);

  const httpServer = createServer(app);
  return httpServer;
}
