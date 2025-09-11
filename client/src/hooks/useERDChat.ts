import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    confidence?: number;
    sqlCode?: string;
    relatedTables?: string[];
    messageType?: 'explanation' | 'sql-generation' | 'pattern-analysis' | 'general';
    loading?: boolean;
  };
}

export interface ChatSession {
  id: string;
  projectId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface UseERDChatProps {
  mermaidCode: string;
  projectId?: string;
  onSQLGenerated?: (sql: string) => void;
  onTableMentioned?: (tables: string[]) => void;
  currentDomain?: string;
}

interface UseERDChatReturn {
  // State
  messages: ChatMessage[];
  isLoading: boolean;
  sessionId: string | null;
  error: string | null;
  isLLMAvailable: boolean;
  
  // Actions
  sendMessage: (content: string) => Promise<void>;
  generateSQL: (query: string) => Promise<void>;
  explainRelationship: (sourceTable: string, targetTable: string) => Promise<void>;
  analyzePatterns: () => Promise<void>;
  clearChat: () => void;
  
  // Utils
  getLastSQLCode: () => string | null;
  getSuggestedQuestions: () => string[];
}

export const useERDChat = ({
  mermaidCode,
  projectId,
  onSQLGenerated,
  onTableMentioned,
  currentDomain = 'overview'
}: UseERDChatProps): UseERDChatReturn => {
  // Generate storage key for project+domain scoped persistence
  const getStorageKey = useCallback(() => {
    return `erd-chat-${projectId}-${currentDomain}`;
  }, [projectId, currentDomain]);

  // Initialize state with persistent storage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const storageKey = `erd-chat-${projectId}-${currentDomain}`;
      const stored = sessionStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load stored chat messages:', error);
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const storageKey = `erd-chat-${projectId}-${currentDomain}`;
      return sessionStorage.getItem(`${storageKey}-session`) || null;
    } catch (error) {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [isLLMAvailable, setIsLLMAvailable] = useState(true);
  const [lastDomain, setLastDomain] = useState<string>(currentDomain);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check LLM service availability on mount
  useEffect(() => {
    checkLLMAvailability();
  }, []);

  // Auto-save messages to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getStorageKey();
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (error) {
      console.warn('Failed to save chat messages:', error);
    }
  }, [messages, getStorageKey]);

  // Auto-save sessionId to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getStorageKey();
      if (sessionId) {
        sessionStorage.setItem(`${storageKey}-session`, sessionId);
      } else {
        sessionStorage.removeItem(`${storageKey}-session`);
      }
    } catch (error) {
      console.warn('Failed to save session ID:', error);
    }
  }, [sessionId, getStorageKey]);

  // Handle domain changes: load stored messages for new domain
  useEffect(() => {
    if (currentDomain !== lastDomain) {
      // Load messages for the new domain
      if (typeof window !== 'undefined') {
        try {
          const newStorageKey = `erd-chat-${projectId}-${currentDomain}`;
          const storedMessages = sessionStorage.getItem(newStorageKey);
          const storedSessionId = sessionStorage.getItem(`${newStorageKey}-session`);
          
          const parsedMessages = storedMessages ? JSON.parse(storedMessages) : [];
          
          // If there are existing messages for this domain, load them
          setMessages(parsedMessages);
          setSessionId(storedSessionId);
          
          // Add domain switch notification only if we had previous messages and now switching domains
          if (lastDomain && parsedMessages.length === 0 && messages.length > 0) {
            const systemMessage: ChatMessage = {
              id: Math.random().toString(36).substr(2, 9),
              role: 'system',
              content: `🔄 **Domain Context Changed**\n\nSwitched from "${lastDomain.replace(/[-_]/g, ' ')}" to "${currentDomain.replace(/[-_]/g, ' ')}" domain.\n\nThe AI assistant now has access to ${currentDomain === 'overview' ? 'the complete schema' : `tables and relationships specific to the ${currentDomain.replace(/[-_]/g, ' ')} domain`}.`,
              timestamp: new Date(),
              metadata: {
                messageType: 'general'
              }
            };
            
            setMessages([systemMessage]);
          }
        } catch (error) {
          console.warn('Failed to load messages for new domain:', error);
          setMessages([]);
          setSessionId(null);
        }
      }
      
      setLastDomain(currentDomain);
    }
  }, [currentDomain, lastDomain, projectId]);

  const checkLLMAvailability = async () => {
    try {
      const response = await fetch('/api/erd/health');
      const health = await response.json();
      setIsLLMAvailable(response.ok && health.status === 'healthy');
    } catch (error) {
      console.warn('LLM service health check failed:', error);
      setIsLLMAvailable(false);
    }
  };

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message
    const userMessage = addMessage({
      role: 'user',
      content: content.trim()
    });

    // Add loading assistant message
    const loadingMessage = addMessage({
      role: 'assistant',
      content: '...',
      metadata: { loading: true }
    });

    try {
      const response = await api.sendChatMessage({
        message: content.trim(),
        sessionId: sessionId || undefined,
        projectId,
        mermaidCode,
        includeSQL: true
      });

      // Update session ID if new
      if (!sessionId) {
        setSessionId(response.sessionId);
      }

      // Update loading message with actual response
      updateMessage(loadingMessage.id, {
        content: response.message.content,
        metadata: {
          ...response.message.metadata,
          loading: false
        }
      });

      // Trigger callbacks if SQL or tables mentioned
      if (response.message.metadata?.sqlCode && onSQLGenerated) {
        onSQLGenerated(response.message.metadata.sqlCode);
      }

      if (response.message.metadata?.relatedTables && onTableMentioned) {
        onTableMentioned(response.message.metadata.relatedTables);
      }

    } catch (err) {
      console.error('Chat message failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      
      // Update loading message with error
      updateMessage(loadingMessage.id, {
        content: `❌ **Error**: ${errorMessage}`,
        metadata: { loading: false }
      });
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, sessionId, projectId, mermaidCode, addMessage, updateMessage, onSQLGenerated, onTableMentioned]);

  const generateSQL = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // Add user message for SQL generation
    addMessage({
      role: 'user',
      content: `Generate SQL: ${query.trim()}`
    });

    // Add loading message
    const loadingMessage = addMessage({
      role: 'assistant',
      content: 'Generating SQL query...',
      metadata: { loading: true, messageType: 'sql-generation' }
    });

    try {
      const response = await api.generateSQL({
        naturalLanguageQuery: query.trim(),
        mermaidCode,
        sqlDialect: 'postgresql',
        includeExplanation: true
      });

      // Format response with SQL code
      const formattedContent = `${response.explanation}\n\n\`\`\`sql\n${response.sql}\n\`\`\``;

      updateMessage(loadingMessage.id, {
        content: formattedContent,
        metadata: {
          confidence: response.confidence,
          sqlCode: response.sql,
          messageType: 'sql-generation',
          loading: false
        }
      });

      if (onSQLGenerated) {
        onSQLGenerated(response.sql);
      }

    } catch (err) {
      console.error('SQL generation failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate SQL';
      
      updateMessage(loadingMessage.id, {
        content: `❌ **SQL Generation Error**: ${errorMessage}`,
        metadata: { loading: false }
      });
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, mermaidCode, addMessage, updateMessage, onSQLGenerated]);

  const explainRelationship = useCallback(async (sourceTable: string, targetTable: string) => {
    setError(null);
    setIsLoading(true);

    // Add user message
    addMessage({
      role: 'user',
      content: `Explain the relationship between ${sourceTable} and ${targetTable}`
    });

    // Add loading message
    const loadingMessage = addMessage({
      role: 'assistant',
      content: 'Analyzing relationship...',
      metadata: { loading: true, messageType: 'explanation' }
    });

    try {
      const response = await api.explainRelationship({
        sourceTable,
        targetTable,
        mermaidCode,
        includeSQL: true
      });

      // Format comprehensive response
      let formattedContent = `## Relationship: ${sourceTable} ↔ ${targetTable}\n\n`;
      formattedContent += `**Business Logic:**\n${response.businessLogic}\n\n`;
      formattedContent += `**Technical Details:**\n${response.technicalDetails}\n\n`;
      
      if (response.sqlExamples.length > 0) {
        formattedContent += `**SQL Examples:**\n\n`;
        response.sqlExamples.forEach((sql, index) => {
          formattedContent += `\`\`\`sql\n${sql}\n\`\`\`\n\n`;
        });
      }

      if (response.bestPractices.length > 0) {
        formattedContent += `**Best Practices:**\n`;
        response.bestPractices.forEach(practice => {
          formattedContent += `- ${practice}\n`;
        });
      }

      updateMessage(loadingMessage.id, {
        content: formattedContent,
        metadata: {
          confidence: 0.9,
          relatedTables: [sourceTable, targetTable],
          sqlCode: response.sqlExamples[0],
          messageType: 'explanation',
          loading: false
        }
      });

      if (onTableMentioned) {
        onTableMentioned([sourceTable, targetTable]);
      }

    } catch (err) {
      console.error('Relationship explanation failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to explain relationship';
      
      updateMessage(loadingMessage.id, {
        content: `❌ **Explanation Error**: ${errorMessage}`,
        metadata: { loading: false }
      });
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [mermaidCode, addMessage, updateMessage, onTableMentioned]);

  const analyzePatterns = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    // Add user message
    addMessage({
      role: 'user',
      content: 'Analyze the patterns in this schema'
    });

    // Add loading message
    const loadingMessage = addMessage({
      role: 'assistant',
      content: 'Analyzing schema patterns...',
      metadata: { loading: true, messageType: 'pattern-analysis' }
    });

    try {
      const response = await api.analyzePatterns(mermaidCode);

      updateMessage(loadingMessage.id, {
        content: response.content,
        metadata: {
          confidence: response.confidence,
          messageType: 'pattern-analysis',
          loading: false
        }
      });

    } catch (err) {
      console.error('Pattern analysis failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze patterns';
      
      updateMessage(loadingMessage.id, {
        content: `❌ **Pattern Analysis Error**: ${errorMessage}`,
        metadata: { loading: false }
      });
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [mermaidCode, addMessage, updateMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  const getLastSQLCode = useCallback((): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const sqlCode = messages[i].metadata?.sqlCode;
      if (sqlCode) return sqlCode;
    }
    return null;
  }, [messages]);

  const getSuggestedQuestions = useCallback((): string[] => {
    const baseQuestions = [
      "What are the main entities in this schema?",
      "Explain the key relationships",
      "Show me the junction tables",
      "What audit patterns do you see?",
      "Generate a query to find all active records"
    ];

    // Add context-specific questions based on schema complexity
    const suggestions = [...baseQuestions];
    
    if (mermaidCode.includes('OpportunityVacancy')) {
      suggestions.push("How does OpportunityVacancy work with positions and timeslots?");
    }
    
    if (mermaidCode.includes('User') && mermaidCode.includes('Organization')) {
      suggestions.push("How are users related to organizations?");
    }

    return suggestions;
  }, [mermaidCode]);

  return {
    // State
    messages,
    isLoading,
    sessionId,
    error,
    isLLMAvailable,
    
    // Actions
    sendMessage,
    generateSQL,
    explainRelationship,
    analyzePatterns,
    clearChat,
    
    // Utils
    getLastSQLCode,
    getSuggestedQuestions
  };
};