import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { erdAnalyzer } from '../services/erdAnalyzer.js';
import { llmService } from '../services/llmService.js';
import { queryGenerator } from '../services/queryGenerator.js';
import {
  ChatRequestSchema,
  SQLGenerationRequestSchema,
  RelationshipExplanationRequestSchema,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  SQLGenerationRequest,
  RelationshipExplanationRequest,
  LLMServiceError,
  ERDAnalysisError
} from '../../shared/llm-types.js';

const router = Router();

// In-memory chat session storage (replace with database in production)
const chatSessions = new Map<string, {
  id: string;
  projectId?: string;
  userId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}>();

/**
 * POST /api/erd/chat
 * Main chat endpoint for ERD questions and interactions
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    console.log('🗨️ Chat request received:', req.body);

    // Validate request body
    const validationResult = ChatRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: validationResult.error.issues
      });
    }

    const chatRequest = validationResult.data;

    // Parse ERD from Mermaid code
    const parsedERD = erdAnalyzer.parseMermaidERD(chatRequest.mermaidCode);
    
    // Get or create chat session
    let sessionId = chatRequest.sessionId || randomUUID();
    let session = chatSessions.get(sessionId);
    
    if (!session) {
      session = {
        id: sessionId,
        projectId: chatRequest.projectId,
        userId: (req as any).user?.id, // Assuming auth middleware sets req.user
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      chatSessions.set(sessionId, session);
    }

    // Add user message to session
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: chatRequest.message,
      timestamp: new Date()
    };
    session.messages.push(userMessage);

    // Get recent conversation history for context (last 10 messages)
    const recentMessages = session.messages.slice(-10);

    // Build context for LLM with conversation history
    const erdContext = {
      tables: parsedERD.tables,
      relationships: parsedERD.relationships,
      patterns: parsedERD.patterns,
      userQuestion: chatRequest.message,
      domainContext: 'general',
      conversationHistory: recentMessages
    };

    // Generate LLM response with conversation context
    const llmResponse = await llmService.answerQuestion(chatRequest.message, erdContext);

    // Create assistant message
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: llmResponse.content,
      timestamp: new Date(),
      metadata: {
        confidence: llmResponse.confidence,
        sqlCode: llmResponse.sqlCode,
        messageType: llmResponse.sqlCode ? 'sql-generation' : 'explanation'
      }
    };
    session.messages.push(assistantMessage);

    // Update session
    session.updatedAt = new Date();

    // Prepare response
    const response: ChatResponse = {
      message: assistantMessage,
      sessionId,
      suggestedQuestions: llmResponse.relatedQuestions,
      confidence: llmResponse.confidence
    };

    console.log('✅ Chat response generated:', {
      sessionId,
      messageLength: assistantMessage.content.length,
      confidence: llmResponse.confidence,
      hasSql: !!llmResponse.sqlCode
    });

    res.json(response);

  } catch (error) {
    console.error('❌ Chat request failed:', error);

    if (error instanceof ERDAnalysisError) {
      return res.status(400).json({
        error: 'Failed to analyze ERD',
        message: error.message,
        code: error.code
      });
    }

    if (error instanceof LLMServiceError) {
      return res.status(502).json({
        error: 'LLM service error',
        message: error.message,
        provider: error.provider
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/erd/generate-sql
 * Generate SQL queries from natural language
 */
router.post('/generate-sql', async (req: Request, res: Response) => {
  try {
    console.log('🔧 SQL generation request received:', req.body);

    // Validate request
    const validationResult = SQLGenerationRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: validationResult.error.issues
      });
    }

    const sqlRequest = validationResult.data;

    // Parse ERD
    const parsedERD = erdAnalyzer.parseMermaidERD(sqlRequest.mermaidCode);
    
    // Build ERD context
    const erdContext = {
      tables: parsedERD.tables,
      relationships: parsedERD.relationships,
      patterns: parsedERD.patterns,
      userQuestion: sqlRequest.naturalLanguageQuery
    };

    // Create SQL generation request
    const llmSqlRequest: SQLGenerationRequest = {
      naturalLanguageQuery: sqlRequest.naturalLanguageQuery,
      erdContext,
      sqlDialect: sqlRequest.sqlDialect || 'postgresql',
      includeExplanation: sqlRequest.includeExplanation || true
    };

    // Generate SQL using LLM service
    const sqlResponse = await llmService.generateSQL(llmSqlRequest);

    console.log('✅ SQL generated successfully:', {
      queryLength: sqlResponse.sql.length,
      confidence: sqlResponse.confidence,
      performance: sqlResponse.estimatedPerformance
    });

    res.json(sqlResponse);

  } catch (error) {
    console.error('❌ SQL generation failed:', error);

    if (error instanceof ERDAnalysisError) {
      return res.status(400).json({
        error: 'Failed to analyze ERD',
        message: error.message
      });
    }

    if (error instanceof LLMServiceError) {
      return res.status(502).json({
        error: 'Failed to generate SQL',
        message: error.message,
        provider: error.provider
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/erd/explain-relationship
 * Explain relationships between tables
 */
router.post('/explain-relationship', async (req: Request, res: Response) => {
  try {
    console.log('🔗 Relationship explanation request received:', req.body);

    // Validate request
    const validationResult = RelationshipExplanationRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: validationResult.error.issues
      });
    }

    const relationshipRequest = validationResult.data;

    // Parse ERD
    const parsedERD = erdAnalyzer.parseMermaidERD(relationshipRequest.mermaidCode);

    // Validate that both tables exist
    const sourceTable = parsedERD.tables.find(t => t.name === relationshipRequest.sourceTable);
    const targetTable = parsedERD.tables.find(t => t.name === relationshipRequest.targetTable);

    if (!sourceTable) {
      return res.status(404).json({
        error: 'Source table not found',
        table: relationshipRequest.sourceTable
      });
    }

    if (!targetTable) {
      return res.status(404).json({
        error: 'Target table not found',
        table: relationshipRequest.targetTable
      });
    }

    // Build ERD context
    const erdContext = {
      tables: parsedERD.tables,
      relationships: parsedERD.relationships,
      patterns: parsedERD.patterns,
      userQuestion: `Explain the relationship between ${relationshipRequest.sourceTable} and ${relationshipRequest.targetTable}`
    };

    // Create relationship explanation request
    const llmRelationshipRequest: RelationshipExplanationRequest = {
      sourceTable: relationshipRequest.sourceTable,
      targetTable: relationshipRequest.targetTable,
      erdContext,
      includeSQL: relationshipRequest.includeSQL || true
    };

    // Generate explanation using LLM service
    const explanationResponse = await llmService.explainRelationship(llmRelationshipRequest);

    console.log('✅ Relationship explanation generated:', {
      sourceTable: relationshipRequest.sourceTable,
      targetTable: relationshipRequest.targetTable,
      explanationLength: explanationResponse.explanation.length,
      sqlExamples: explanationResponse.sqlExamples.length
    });

    res.json(explanationResponse);

  } catch (error) {
    console.error('❌ Relationship explanation failed:', error);

    if (error instanceof ERDAnalysisError) {
      return res.status(400).json({
        error: 'Failed to analyze ERD',
        message: error.message
      });
    }

    if (error instanceof LLMServiceError) {
      return res.status(502).json({
        error: 'Failed to generate explanation',
        message: error.message,
        provider: error.provider
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/erd/analyze-patterns
 * Analyze schema patterns and provide recommendations
 */
router.post('/analyze-patterns', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Pattern analysis request received');

    const { mermaidCode } = req.body;
    if (!mermaidCode || typeof mermaidCode !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'mermaidCode is required and must be a string'
      });
    }

    // Parse ERD
    const parsedERD = erdAnalyzer.parseMermaidERD(mermaidCode);

    // Generate pattern analysis using LLM
    const analysisResponse = await llmService.analyzePatterns(parsedERD);

    // Add detected patterns from analyzer
    const response = {
      ...analysisResponse,
      detectedPatterns: parsedERD.patterns,
      metadata: parsedERD.metadata,
      recommendations: analysisResponse.suggestions || []
    };

    console.log('✅ Pattern analysis completed:', {
      patternsDetected: parsedERD.patterns.length,
      complexity: parsedERD.metadata.complexity,
      recommendations: response.recommendations.length
    });

    res.json(response);

  } catch (error) {
    console.error('❌ Pattern analysis failed:', error);

    if (error instanceof ERDAnalysisError) {
      return res.status(400).json({
        error: 'Failed to analyze ERD',
        message: error.message
      });
    }

    if (error instanceof LLMServiceError) {
      return res.status(502).json({
        error: 'Failed to analyze patterns',
        message: error.message,
        provider: error.provider
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/erd/chat/:sessionId/history
 * Get chat history for a session
 */
router.get('/chat/:sessionId/history', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = chatSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Chat session not found',
        sessionId
      });
    }

    res.json({
      sessionId: session.id,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });

  } catch (error) {
    console.error('❌ Failed to get chat history:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/erd/chat/:sessionId
 * Clear chat session
 */
router.delete('/chat/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const deleted = chatSessions.delete(sessionId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Chat session not found',
        sessionId
      });
    }

    console.log('🗑️ Chat session deleted:', sessionId);
    res.json({
      message: 'Chat session deleted successfully',
      sessionId
    });

  } catch (error) {
    console.error('❌ Failed to delete chat session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/erd/optimize-query
 * Optimize SQL query using query generator
 */
router.post('/optimize-query', async (req: Request, res: Response) => {
  try {
    const { sql, mermaidCode, dialect = 'postgresql' } = req.body;

    if (!sql || !mermaidCode) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'sql and mermaidCode are required'
      });
    }

    // Parse ERD for context
    const parsedERD = erdAnalyzer.parseMermaidERD(mermaidCode);

    // For now, return optimization tips (full SQL parsing would require more complex logic)
    const optimizationTips = [
      'Consider adding indexes on frequently used columns',
      'Use specific column names instead of SELECT *',
      'Add appropriate WHERE clauses to limit result sets',
      'Consider query execution plan for complex joins'
    ];

    const response = {
      originalSql: sql,
      optimizationTips,
      estimatedPerformance: 'medium',
      suggestions: [
        'Add LIMIT clause if not returning all rows',
        'Consider using EXISTS instead of IN for subqueries',
        'Use appropriate join types (INNER vs LEFT)'
      ]
    };

    console.log('✅ Query optimization tips provided');
    res.json(response);

  } catch (error) {
    console.error('❌ Query optimization failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/erd/health
 * Enhanced health check for ERD services with API key validation
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Get detailed LLM service health
    const llmHealth = await llmService.checkHealth();
    const llmStats = llmService.getUsageStats();
    
    // Determine overall status based on LLM health
    const overallStatus = llmHealth.status === 'healthy' ? 'healthy' : 
                         llmHealth.status === 'degraded' ? 'degraded' : 'unhealthy';

    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        erdAnalyzer: 'operational',
        llmService: llmHealth.status,
        queryGenerator: 'operational'
      },
      llmDetails: {
        provider: llmHealth.provider,
        model: llmHealth.model,
        apiKeyValid: llmHealth.apiKeyValid,
        lastTestedAt: llmHealth.lastTestedAt,
        details: llmHealth.details,
        usage: {
          totalRequests: llmStats.requestCount,
          errorCount: llmStats.errorCount,
          successRate: llmStats.requestCount > 0 ? 
            ((llmStats.requestCount - llmStats.errorCount) / llmStats.requestCount * 100).toFixed(1) + '%' : 'N/A',
          avgResponseTime: llmStats.avgResponseTime ? Math.round(llmStats.avgResponseTime) + 'ms' : 'N/A',
          lastRequest: llmStats.lastRequest
        }
      },
      activeSessions: chatSessions.size,
      environment: {
        llmProvider: process.env.LLM_PROVIDER || 'not configured',
        llmModel: process.env.LLM_MODEL || 'not configured',
        nodeEnv: process.env.NODE_ENV || 'development',
        enableLLMFeatures: process.env.ENABLE_LLM_FEATURES || 'true'
      },
      security: {
        apiKeyConfigured: !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY,
        providerSupported: ['openai', 'anthropic'].includes(process.env.LLM_PROVIDER || 'openai')
      },
      recommendations: []
    };

    // Add recommendations based on health status
    if (!health.llmDetails.apiKeyValid) {
      health.recommendations.push('Configure a valid API key for your chosen LLM provider');
    }
    
    if (health.llmDetails.usage.errorCount > 0) {
      const errorRate = (health.llmDetails.usage.errorCount / llmStats.requestCount) * 100;
      if (errorRate > 10) {
        health.recommendations.push('High error rate detected - check API key permissions and quotas');
      }
    }

    if (!health.security.apiKeyConfigured) {
      health.recommendations.push('No API key configured - LLM features will not work');
    }

    // Set HTTP status based on overall health - use 200 for degraded to reduce alert noise
    const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

    // Only log unhealthy status as warning in production to reduce noise
    if (overallStatus === 'unhealthy' && process.env.NODE_ENV === 'production') {
      console.warn('⚠️ ERD Chat service is unhealthy:', llmHealth.details);
    } else if (overallStatus === 'degraded') {
      console.log('📊 ERD Chat service is degraded:', llmHealth.details);
    }

    res.status(httpStatus).json(health);
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        erdAnalyzer: 'unknown',
        llmService: 'unhealthy',
        queryGenerator: 'unknown'
      }
    });
  }
});

export default router;