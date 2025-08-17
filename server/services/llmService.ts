import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  LLMResponse,
  ERDContext,
  SQLGenerationRequest,
  SQLGenerationResponse,
  RelationshipExplanationRequest,
  RelationshipExplanationResponse,
  LLMConfig,
  LLMServiceError,
  ParsedERD,
  TableDefinition,
  RelationshipDefinition,
  LLM_MODELS
} from '../../shared/llm-types.js';

export class LLMService {
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = {
      provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
      apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
      timeout: parseInt(process.env.LLM_TIMEOUT || '30000'),
      ...config
    };

    this.initializeClients();
  }

  private initializeClients(): void {
    if (this.config.provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️ OpenAI API key not configured. LLM features will not work until API key is provided.');
        return;
      }
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: this.config.timeout
      });
      console.log(`🤖 LLM Service initialized with OpenAI (${this.config.model})`);
    } else if (this.config.provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ Anthropic API key not configured. LLM features will not work until API key is provided.');
        return;
      }
      this.anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        timeout: this.config.timeout
      });
      console.log(`🤖 LLM Service initialized with Anthropic (${this.config.model})`);
    } else {
      throw new LLMServiceError(`Unsupported LLM provider: ${this.config.provider}`, this.config.provider);
    }
  }

  /**
   * Check if LLM service is available and API keys are valid
   */
  public async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    provider: string;
    model: string;
    apiKeyValid: boolean;
    lastTestedAt: Date;
    details?: string;
  }> {
    const healthCheck = {
      status: 'unhealthy' as const,
      provider: this.config.provider,
      model: this.config.model,
      apiKeyValid: false,
      lastTestedAt: new Date(),
      details: ''
    };

    try {
      if (!this.config.apiKey) {
        healthCheck.details = 'API key not configured';
        return healthCheck;
      }

      // Test API key with a simple request
      if (this.config.provider === 'openai' && this.openaiClient) {
        try {
          await this.openaiClient.chat.completions.create({
            model: this.config.model,
            messages: [{ role: 'user', content: 'Test' }],
            max_tokens: 1,
            temperature: 0
          });
          healthCheck.apiKeyValid = true;
          healthCheck.status = 'healthy';
          healthCheck.details = 'OpenAI API key valid and service operational';
        } catch (error: any) {
          if (error?.status === 401) {
            healthCheck.details = 'Invalid OpenAI API key';
          } else if (error?.status === 429) {
            healthCheck.status = 'degraded';
            healthCheck.apiKeyValid = true;
            healthCheck.details = 'OpenAI API rate limit reached';
          } else {
            healthCheck.details = `OpenAI API error: ${error?.message || 'Unknown error'}`;
          }
        }
      } else if (this.config.provider === 'anthropic' && this.anthropicClient) {
        try {
          await this.anthropicClient.messages.create({
            model: this.config.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Test' }]
          });
          healthCheck.apiKeyValid = true;
          healthCheck.status = 'healthy';
          healthCheck.details = 'Anthropic API key valid and service operational';
        } catch (error: any) {
          if (error?.status === 401) {
            healthCheck.details = 'Invalid Anthropic API key';
          } else if (error?.status === 429) {
            healthCheck.status = 'degraded';
            healthCheck.apiKeyValid = true;
            healthCheck.details = 'Anthropic API rate limit reached';
          } else {
            healthCheck.details = `Anthropic API error: ${error?.message || 'Unknown error'}`;
          }
        }
      } else {
        healthCheck.details = `No client initialized for provider: ${this.config.provider}`;
      }
    } catch (error) {
      healthCheck.details = `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return healthCheck;
  }

  /**
   * Get usage statistics and monitoring information
   */
  public getUsageStats(): {
    provider: string;
    model: string;
    requestCount: number;
    errorCount: number;
    lastRequest?: Date;
    avgResponseTime?: number;
  } {
    return {
      provider: this.config.provider,
      model: this.config.model,
      requestCount: this.requestCount || 0,
      errorCount: this.errorCount || 0,
      lastRequest: this.lastRequestTime,
      avgResponseTime: this.avgResponseTime
    };
  }

  /**
   * Initialize usage tracking properties
   */
  private requestCount = 0;
  private errorCount = 0;
  private lastRequestTime?: Date;
  private responseTimeSum = 0;
  private avgResponseTime?: number;

  /**
   * Track API usage for monitoring
   */
  private trackUsage(startTime: number, success: boolean): void {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    this.requestCount++;
    this.lastRequestTime = new Date();
    this.responseTimeSum += responseTime;
    this.avgResponseTime = this.responseTimeSum / this.requestCount;
    
    if (!success) {
      this.errorCount++;
    }

    // Log usage for monitoring
    console.log(`📊 LLM Usage: ${this.config.provider} | ${success ? '✅' : '❌'} | ${responseTime}ms | Total: ${this.requestCount}`);
  }

  /**
   * Generate a response to a user question about the ERD
   */
  public async answerQuestion(question: string, context: ERDContext): Promise<LLMResponse> {
    const startTime = Date.now();
    let success = false;
    
    try {
      const prompt = this.buildQuestionPrompt(question, context);
      const response = await this.callLLM(prompt);
      
      // Parse response to extract SQL code if present
      const sqlMatch = response.match(/```sql\n([\s\S]*?)\n```/);
      const sqlCode = sqlMatch ? sqlMatch[1].trim() : undefined;

      success = true;
      this.trackUsage(startTime, success);

      return {
        content: response,
        confidence: this.calculateConfidence(response, question),
        sqlCode,
        suggestions: this.extractSuggestions(response),
        relatedQuestions: this.generateRelatedQuestions(question, context)
      };
    } catch (error) {
      this.trackUsage(startTime, success);
      console.error('❌ Failed to answer question:', error);
      throw new LLMServiceError(
        `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.config.provider,
        500,
        { question, context }
      );
    }
  }

  /**
   * Generate SQL from natural language query
   */
  public async generateSQL(request: SQLGenerationRequest): Promise<SQLGenerationResponse> {
    const startTime = Date.now();
    let success = false;
    
    try {
      const prompt = this.buildSQLGenerationPrompt(request);
      const response = await this.callLLM(prompt);
      
      // Extract SQL from response
      const sqlMatch = response.match(/```sql\n([\s\S]*?)\n```/);
      if (!sqlMatch) {
        throw new LLMServiceError('No SQL code found in response', this.config.provider);
      }

      const sql = sqlMatch[1].trim();
      const explanation = response.replace(/```sql[\s\S]*?```/g, '').trim();

      success = true;
      this.trackUsage(startTime, success);

      return {
        sql,
        explanation,
        confidence: this.calculateSQLConfidence(sql, request.naturalLanguageQuery),
        estimatedPerformance: this.estimateQueryPerformance(sql),
        optimizationTips: this.generateOptimizationTips(sql),
        alternativeQueries: []
      };
    } catch (error) {
      this.trackUsage(startTime, success);
      console.error('❌ Failed to generate SQL:', error);
      throw new LLMServiceError(
        `Failed to generate SQL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.config.provider,
        500,
        { request }
      );
    }
  }

  /**
   * Explain relationship between two tables
   */
  public async explainRelationship(request: RelationshipExplanationRequest): Promise<RelationshipExplanationResponse> {
    try {
      const prompt = this.buildRelationshipPrompt(request);
      const response = await this.callLLM(prompt);

      const sqlExamples = this.extractSQLExamples(response);
      
      return {
        explanation: response,
        businessLogic: this.extractBusinessLogic(response),
        technicalDetails: this.extractTechnicalDetails(response),
        sqlExamples,
        bestPractices: this.extractBestPractices(response)
      };
    } catch (error) {
      console.error('❌ Failed to explain relationship:', error);
      throw new LLMServiceError(
        `Failed to explain relationship: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.config.provider,
        500,
        { request }
      );
    }
  }

  /**
   * Analyze schema patterns and provide recommendations
   */
  public async analyzePatterns(parsedERD: ParsedERD): Promise<LLMResponse> {
    try {
      const prompt = this.buildPatternAnalysisPrompt(parsedERD);
      const response = await this.callLLM(prompt);

      return {
        content: response,
        confidence: 0.9, // Pattern analysis is generally high confidence
        suggestions: this.extractSuggestions(response)
      };
    } catch (error) {
      console.error('❌ Failed to analyze patterns:', error);
      throw new LLMServiceError(
        `Failed to analyze patterns: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.config.provider,
        500,
        { parsedERD }
      );
    }
  }

  /**
   * Build prompt for general questions about ERD
   */
  private buildQuestionPrompt(question: string, context: ERDContext): string {
    const conversationContext = this.serializeConversationHistory(context.conversationHistory);
    
    return `You are an expert database architect and ERD specialist. Help users understand their database schema by answering questions clearly and providing practical examples.

SCHEMA CONTEXT:
${this.serializeERDContext(context)}

${conversationContext ? `CONVERSATION HISTORY:
${conversationContext}

` : ''}CURRENT USER QUESTION: ${question}

INSTRUCTIONS:
1. Consider the conversation history to provide contextual, follow-up responses
2. Build upon previous exchanges when answering clarification questions
3. Provide clear, helpful answers that explain database concepts
4. If relevant, include SQL examples using proper formatting with \`\`\`sql code blocks
5. Focus on practical implications and best practices
6. If you detect relationships between tables mentioned in the question, explain them clearly
7. If the question involves data retrieval, provide the SQL query needed

RESPONSE FORMAT:
- Start with a direct answer that acknowledges conversation context when relevant
- Provide technical details and context
- Include SQL examples when relevant (use \`\`\`sql blocks)
- End with any recommendations or best practices

Remember: This is a ${context.domainContext || 'general'} schema. Keep explanations practical and actionable. Be conversational and build upon previous messages when appropriate.`;
  }

  /**
   * Build prompt for SQL generation
   */
  private buildSQLGenerationPrompt(request: SQLGenerationRequest): string {
    return `You are an expert SQL developer. Generate accurate, efficient SQL queries based on natural language requests.

SCHEMA CONTEXT:
${this.serializeERDContext(request.erdContext)}

NATURAL LANGUAGE QUERY: ${request.naturalLanguageQuery}

SQL DIALECT: ${request.sqlDialect || 'postgresql'}

INSTRUCTIONS:
1. Generate syntactically correct SQL for the specified dialect
2. Use proper table and column names from the schema
3. Include necessary JOINs based on the relationships
4. Optimize for performance when possible
5. Add comments in the SQL for clarity
6. Handle edge cases (NULL values, etc.)

RESPONSE FORMAT:
\`\`\`sql
-- Your SQL query here with comments
SELECT ...
FROM ...
WHERE ...
\`\`\`

Then provide an explanation of:
- What the query does
- Why specific JOINs were chosen
- Any performance considerations
- Potential modifications or improvements`;
  }

  /**
   * Build prompt for relationship explanation
   */
  private buildRelationshipPrompt(request: RelationshipExplanationRequest): string {
    return `You are a database design expert. Explain the relationship between two tables in detail.

SCHEMA CONTEXT:
${this.serializeERDContext(request.erdContext)}

RELATIONSHIP TO EXPLAIN: ${request.sourceTable} ↔ ${request.targetTable}

INSTRUCTIONS:
1. Explain the business logic behind this relationship
2. Describe the technical implementation (foreign keys, junction tables, etc.)
3. Provide SQL examples for common operations
4. Mention any design patterns or best practices
5. Identify potential issues or improvements

RESPONSE FORMAT:
**Business Logic:** What this relationship represents in real-world terms

**Technical Details:** How it's implemented (foreign keys, cardinality, etc.)

**SQL Examples:** Common queries for this relationship

**Best Practices:** Recommendations for this relationship pattern

${request.includeSQL ? 'Include practical SQL examples with explanations.' : ''}`;
  }

  /**
   * Build prompt for pattern analysis
   */
  private buildPatternAnalysisPrompt(parsedERD: ParsedERD): string {
    const patternSummary = parsedERD.patterns.map(p => 
      `- ${p.type}: ${p.tables.join(', ')} - ${p.description}`
    ).join('\n');

    return `You are a database architecture expert. Analyze this schema and provide insights about design patterns, potential improvements, and best practices.

SCHEMA OVERVIEW:
- Tables: ${parsedERD.tables.length}
- Relationships: ${parsedERD.relationships.length}
- Complexity: ${parsedERD.metadata.complexity}

DETECTED PATTERNS:
${patternSummary}

SCHEMA DETAILS:
${this.serializeSchemaForAnalysis(parsedERD)}

INSTRUCTIONS:
1. Analyze the overall schema design and architecture
2. Identify strengths and potential improvements
3. Comment on normalization and design patterns
4. Suggest performance optimizations
5. Recommend indexing strategies
6. Point out any anti-patterns or concerns

RESPONSE FORMAT:
**Schema Analysis:** Overall assessment of the design

**Patterns Identified:** Explanation of detected patterns and their benefits

**Recommendations:** Specific suggestions for improvements

**Performance Considerations:** Indexing and optimization advice

**Best Practices:** General database design recommendations`;
  }

  /**
   * Serialize ERD context for LLM prompts
   */
  private serializeERDContext(context: ERDContext): string {
    let output = 'TABLES:\n';
    
    for (const table of context.tables) {
      output += `\n${table.name} {\n`;
      for (const column of table.columns) {
        const keyType = column.isPrimaryKey ? ' PK' : column.isForeignKey ? ' FK' : '';
        const ref = column.references ? ` -> ${column.references.table}.${column.references.column}` : '';
        output += `  ${column.name} ${column.type}${keyType}${ref}\n`;
      }
      output += '}\n';
    }

    if (context.relationships.length > 0) {
      output += '\nRELATIONSHIPS:\n';
      for (const rel of context.relationships) {
        output += `${rel.sourceTable}.${rel.sourceColumn} -> ${rel.targetTable}.${rel.targetColumn} (${rel.cardinality})\n`;
      }
    }

    return output;
  }

  /**
   * Serialize schema for pattern analysis
   */
  private serializeSchemaForAnalysis(parsedERD: ParsedERD): string {
    let output = this.serializeERDContext({
      tables: parsedERD.tables,
      relationships: parsedERD.relationships,
      patterns: parsedERD.patterns,
      userQuestion: ''
    });

    if (parsedERD.metadata.junctionTables.length > 0) {
      output += `\nJUNCTION TABLES: ${parsedERD.metadata.junctionTables.join(', ')}`;
    }

    if (parsedERD.metadata.orphanedTables.length > 0) {
      output += `\nORPHANED TABLES: ${parsedERD.metadata.orphanedTables.join(', ')}`;
    }

    return output;
  }

  /**
   * Serialize conversation history for LLM context
   */
  private serializeConversationHistory(messages?: any[]): string {
    if (!messages || messages.length === 0) return '';

    const recentMessages = messages.slice(-8); // Last 8 messages for context
    let output = '';

    for (const message of recentMessages) {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      const content = message.content.substring(0, 300); // Limit length
      output += `${role}: ${content}\n`;
    }

    return output.trim();
  }

  /**
   * Call LLM API based on configured provider
   */
  private async callLLM(prompt: string): Promise<string> {
    try {
      if (this.config.provider === 'openai') {
        return await this.callOpenAI(prompt);
      } else if (this.config.provider === 'anthropic') {
        return await this.callAnthropic(prompt);
      } else {
        throw new LLMServiceError(`Unsupported provider: ${this.config.provider}`, this.config.provider);
      }
    } catch (error) {
      console.error(`❌ LLM API call failed (${this.config.provider}):`, error);
      if (error instanceof LLMServiceError) {
        throw error;
      }
      throw new LLMServiceError(
        `LLM API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.config.provider,
        500,
        { prompt: prompt.substring(0, 200) + '...' }
      );
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    if (!this.openaiClient) {
      throw new LLMServiceError('OpenAI client not initialized. Please configure OPENAI_API_KEY.', 'openai', 401);
    }

    const completion = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert database architect and SQL developer. Provide clear, accurate, and helpful responses about database schemas and SQL queries.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new LLMServiceError('Empty response from OpenAI', 'openai');
    }

    return response;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string): Promise<string> {
    if (!this.anthropicClient) {
      throw new LLMServiceError('Anthropic client not initialized. Please configure ANTHROPIC_API_KEY.', 'anthropic', 401);
    }

    const message = await this.anthropicClient.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const response = message.content[0];
    if (response.type !== 'text' || !response.text) {
      throw new LLMServiceError('Invalid response format from Anthropic', 'anthropic');
    }

    return response.text;
  }

  /**
   * Calculate confidence score for responses
   */
  private calculateConfidence(response: string, question: string): number {
    let confidence = 0.7; // Base confidence

    // Increase confidence for structured responses
    if (response.includes('```sql')) confidence += 0.1;
    if (response.includes('**') || response.includes('##')) confidence += 0.05;
    
    // Increase confidence for longer, detailed responses
    if (response.length > 500) confidence += 0.1;
    
    // Decrease confidence for uncertain language
    if (response.toLowerCase().includes('might') || response.toLowerCase().includes('possibly')) {
      confidence -= 0.1;
    }

    return Math.min(0.95, Math.max(0.3, confidence));
  }

  /**
   * Calculate confidence score for SQL queries
   */
  private calculateSQLConfidence(sql: string, query: string): number {
    let confidence = 0.8; // Base confidence for SQL

    // Check for basic SQL structure
    if (sql.toLowerCase().includes('select') && sql.toLowerCase().includes('from')) {
      confidence += 0.1;
    }

    // Check for JOIN statements (indicates understanding of relationships)
    if (sql.toLowerCase().includes('join')) confidence += 0.1;

    // Check for WHERE clauses (indicates filtering)
    if (sql.toLowerCase().includes('where')) confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  /**
   * Estimate query performance based on SQL patterns
   */
  private estimateQueryPerformance(sql: string): 'fast' | 'medium' | 'slow' {
    const sqlLower = sql.toLowerCase();
    
    // Performance indicators
    const hasJoins = (sqlLower.match(/join/g) || []).length;
    const hasSubqueries = (sqlLower.match(/\(select/g) || []).length;
    const hasAggregates = /count|sum|avg|max|min/.test(sqlLower);
    
    if (hasJoins > 3 || hasSubqueries > 1) return 'slow';
    if (hasJoins > 1 || hasSubqueries > 0 || hasAggregates) return 'medium';
    return 'fast';
  }

  /**
   * Generate optimization tips for SQL queries
   */
  private generateOptimizationTips(sql: string): string[] {
    const tips: string[] = [];
    const sqlLower = sql.toLowerCase();

    if (sqlLower.includes('select *')) {
      tips.push('Consider selecting only needed columns instead of using SELECT *');
    }

    if ((sqlLower.match(/join/g) || []).length > 2) {
      tips.push('Consider adding indexes on join columns for better performance');
    }

    if (sqlLower.includes('where') && !sqlLower.includes('index')) {
      tips.push('Ensure WHERE clause columns have appropriate indexes');
    }

    return tips;
  }

  /**
   * Extract suggestions from LLM responses
   */
  private extractSuggestions(response: string): string[] {
    const suggestions: string[] = [];
    
    // Look for numbered lists or bullet points
    const lines = response.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^\d+\./) || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        suggestions.push(trimmed.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''));
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Generate related questions based on context
   */
  private generateRelatedQuestions(question: string, context: ERDContext): string[] {
    const questions: string[] = [];

    // Add questions based on detected patterns
    if (context.patterns.some(p => p.type === 'junction-table')) {
      questions.push('How do junction tables work in this schema?');
    }

    if (context.patterns.some(p => p.type === 'audit-trail')) {
      questions.push('What audit information is tracked in this schema?');
    }

    // Add questions based on relationships
    if (context.relationships.length > 0) {
      questions.push('What are the key relationships in this schema?');
      questions.push('How should I join these tables efficiently?');
    }

    return questions.slice(0, 3);
  }

  /**
   * Extract SQL examples from response text
   */
  private extractSQLExamples(response: string): string[] {
    const sqlBlocks = response.match(/```sql\n([\s\S]*?)\n```/g) || [];
    return sqlBlocks.map(block => 
      block.replace(/```sql\n/, '').replace(/\n```/, '').trim()
    );
  }

  /**
   * Extract business logic section from response
   */
  private extractBusinessLogic(response: string): string {
    const match = response.match(/\*\*Business Logic:\*\*([\s\S]*?)(?:\*\*|$)/);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract technical details section from response
   */
  private extractTechnicalDetails(response: string): string {
    const match = response.match(/\*\*Technical Details:\*\*([\s\S]*?)(?:\*\*|$)/);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract best practices section from response
   */
  private extractBestPractices(response: string): string[] {
    const match = response.match(/\*\*Best Practices:\*\*([\s\S]*?)(?:\*\*|$)/);
    if (!match) return [];

    const practices = match[1].trim().split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./)))
      .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, ''));

    return practices;
  }
}

// Export singleton instance (lazy initialization)
let _llmServiceInstance: LLMService | null = null;

export const llmService = new Proxy({} as LLMService, {
  get(target, prop) {
    if (!_llmServiceInstance) {
      console.log('🤖 Initializing LLM Service after environment loading...');
      _llmServiceInstance = new LLMService();
    }
    return _llmServiceInstance[prop as keyof LLMService];
  }
});