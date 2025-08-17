import React, { useState, useRef, useEffect, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ChatMessage } from './ChatMessage';
import { useERDChat } from '@/hooks/useERDChat';
import { 
  Send, 
  Bot, 
  MessageCircle, 
  Database, 
  BarChart3, 
  Trash2, 
  AlertCircle,
  Lightbulb,
  Sparkles,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

interface ERDChatProps {
  mermaidCode: string;
  projectId?: string;
  isDarkMode?: boolean;
  onSQLGenerated?: (sql: string) => void;
  onTableMentioned?: (tables: string[]) => void;
  onRelationshipClick?: (sourceTable: string, targetTable: string) => void;
  className?: string;
  currentDomain?: string;
}

const PRESET_QUESTIONS = [
  {
    icon: MessageCircle,
    label: "Explain Schema",
    question: "What are the main entities and relationships in this schema?",
    type: "explanation" as const
  },
  {
    icon: Database,
    label: "Find Junction Tables",
    question: "Identify all junction tables and explain their purpose",
    type: "pattern-analysis" as const
  },
  {
    icon: BarChart3,
    label: "Analyze Patterns",
    question: "Analyze the database design patterns in this schema",
    type: "pattern-analysis" as const
  },
  {
    icon: Sparkles,
    label: "Generate Query",
    question: "Generate a SQL query to find all active records with their relationships",
    type: "sql-generation" as const
  }
];

export const ERDChat: React.FC<ERDChatProps> = ({
  mermaidCode,
  projectId,
  isDarkMode = false,
  onSQLGenerated,
  onTableMentioned,
  onRelationshipClick,
  className = '',
  currentDomain = 'overview'
}) => {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    sessionId,
    error,
    isLLMAvailable,
    sendMessage,
    generateSQL,
    explainRelationship,
    analyzePatterns,
    clearChat,
    getSuggestedQuestions
  } = useERDChat({
    mermaidCode,
    projectId,
    onSQLGenerated,
    onTableMentioned,
    currentDomain
  });

  // Check if user is at bottom of scroll area
  const checkIfAtBottom = useCallback(() => {
    if (!messagesContainerRef.current) return true;
    
    const container = messagesContainerRef.current;
    const threshold = 50; // 50px threshold for "at bottom"
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    
    setIsAtBottom(isNearBottom);
    return isNearBottom;
  }, []);

  // Handle scroll events to track user position
  const handleScroll = useCallback(() => {
    checkIfAtBottom();
  }, [checkIfAtBottom]);

  // Smart auto-scroll: only scroll if user is at bottom or explicitly enabled
  useEffect(() => {
    if (shouldAutoScroll && isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, shouldAutoScroll, isAtBottom]);

  // Reset auto-scroll when new messages arrive and user was at bottom
  useEffect(() => {
    if (messages.length > 0) {
      const wasAtBottom = checkIfAtBottom();
      if (wasAtBottom) {
        setShouldAutoScroll(true);
      }
    }
  }, [messages.length, checkIfAtBottom]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');

    // Check if it's a SQL generation request
    if (message.toLowerCase().includes('generate') || message.toLowerCase().includes('sql')) {
      await generateSQL(message);
    } else {
      await sendMessage(message);
    }
  };

  const handlePresetQuestion = async (question: string, type: string) => {
    setInput('');
    
    switch (type) {
      case 'sql-generation':
        await generateSQL(question);
        break;
      case 'pattern-analysis':
        await analyzePatterns();
        break;
      default:
        await sendMessage(question);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTableClick = (tableName: string) => {
    const question = `Tell me about the ${tableName} table and its relationships`;
    sendMessage(question);
  };

  const handleClearChat = () => {
    clearChat();
    setInput('');
  };

  const scrollToBottom = () => {
    setShouldAutoScroll(true);
    setIsAtBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const suggestedQuestions = getSuggestedQuestions();

  if (!isLLMAvailable) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            ERD Assistant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              LLM service is not available. Please configure an API key to use the AI assistant.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              ERD Assistant
            </CardTitle>
            <CardDescription>
              Ask questions about your database schema
            </CardDescription>
          </div>
          
          {sessionId && messages.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {messages.length} messages
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearChat}
                className="h-8 w-8 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Preset Questions */}
        {messages.length === 0 && (
          <>
            <Separator className="my-3" />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Quick Start</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {PRESET_QUESTIONS.map((preset, index) => {
                  const Icon = preset.icon;
                  return (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetQuestion(preset.question, preset.type)}
                      disabled={isLoading}
                      className="justify-start text-left h-auto p-3 min-h-[60px]"
                    >
                      <div className="flex items-start gap-2 w-full">
                        <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs truncate">{preset.label}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {preset.question}
                          </div>
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 space-y-4 overflow-y-auto min-h-0 px-1"
          onScroll={handleScroll}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isDarkMode={isDarkMode}
              onSQLCopy={onSQLGenerated}
              onTableClick={handleTableClick}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {!isAtBottom && messages.length > 2 && (
          <div className="flex justify-center py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={scrollToBottom}
              className="flex items-center gap-2 rounded-full h-8 px-3"
            >
              <ChevronDown className="h-3 w-3" />
              <span className="text-xs">New messages</span>
            </Button>
          </div>
        )}

        {/* Suggested Questions (after conversation starts) */}
        {messages.length > 0 && suggestedQuestions.length > 0 && !isLoading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Suggested questions:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {suggestedQuestions.slice(0, 3).map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={() => sendMessage(question)}
                  className="h-auto p-2 text-xs text-left whitespace-normal"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <TextareaAutosize
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your ERD... (e.g., 'Explain the relationship between User and Organization')"
              disabled={isLoading}
              className="w-full p-3 pr-12 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 text-sm"
              minRows={1}
              maxRows={4}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 h-8 w-8 p-0"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Press Enter to send, Shift+Enter for new line</span>
            {sessionId && (
              <span>Session: {sessionId.slice(-8)}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};