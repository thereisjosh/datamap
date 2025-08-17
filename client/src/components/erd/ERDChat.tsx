import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  ChevronDown,
  MessageSquarePlus
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

export const ERDChat = forwardRef<any, ERDChatProps>(({
  mermaidCode,
  projectId,
  isDarkMode = false,
  onSQLGenerated,
  onTableMentioned,
  onRelationshipClick,
  className = '',
  currentDomain = 'overview'
}, ref) => {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
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
  const handleScroll = useCallback((e: React.UIEvent) => {
    e.stopPropagation(); // Prevent event bubbling to document
    checkIfAtBottom();
  }, [checkIfAtBottom]);

  // Document-level wheel event capture to handle chat scrolling before any interference
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleWheelCapture = (e: WheelEvent) => {
      // Check if the wheel event is targeting our chat container
      if (!container.contains(e.target as Node)) return;

      const { deltaY } = e;
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      // Check if we're at scroll boundaries
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
      
      // Only prevent page scroll when chat would overflow its boundaries
      if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      // Allow natural browser scrolling within chat, just prevent bubbling to page
      e.stopPropagation();
      
      // Update our scroll position tracking (let browser handle the actual scrolling)
      setTimeout(() => checkIfAtBottom(), 0);
    };

    // Attach to document with capture phase to intercept before any other handlers
    document.addEventListener('wheel', handleWheelCapture, { 
      passive: false,
      capture: true 
    });
    
    return () => {
      document.removeEventListener('wheel', handleWheelCapture, { capture: true });
    };
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

  // Enable focus management for keyboard navigation
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.setAttribute('tabindex', '-1');
    }
  }, []);

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

  const handleClearChatInternal = () => {
    setShowClearConfirmation(true);
  };

  const confirmClearChat = () => {
    clearChat();
    setInput('');
    setShowClearConfirmation(false);
  };

  const cancelClearChat = () => {
    setShowClearConfirmation(false);
  };

  const handleNewChatInternal = () => {
    clearChat();
    setInput('');
  };

  // Helper function to get conversation age
  const getConversationAge = () => {
    if (messages.length === 0) return null;
    
    const firstMessage = messages[0];
    const startTime = new Date(firstMessage.timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just started';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      // Force scroll to absolute bottom with extra offset
      container.scrollTop = container.scrollHeight + 100;
      // Update state immediately
      setIsAtBottom(true);
      setShouldAutoScroll(true);
      // Force recheck after scroll completes
      setTimeout(() => {
        checkIfAtBottom();
      }, 100);
    }
  };



  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    handleNewChat: () => {
      console.log('handleNewChat called from ChatPanel');
      handleNewChatInternal();
    },
    handleClearChat: () => {
      console.log('handleClearChat called from ChatPanel');
      handleClearChatInternal();
    }
  }));

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
    <>
      <style>{`
        .chat-messages-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .chat-messages-container::-webkit-scrollbar {
          width: 8px;
        }
        .chat-messages-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-messages-container::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 4px;
        }
        .chat-messages-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.8);
        }
      `}</style>
      <Card className={className}>
        {/* Preset Questions - Only when no messages */}
        {messages.length === 0 && (
          <CardHeader className="pb-3">
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
          </CardHeader>
        )}

      <CardContent className="h-full flex flex-col relative">
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
          className="chat-messages-container flex-1 space-y-4 overflow-y-auto overflow-hidden px-1"
          style={{
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            WebkitOverflowScrolling: 'touch',
            scrollBehavior: 'smooth',
            minHeight: 0
          }}
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

        {/* Floating Scroll to Bottom Button - Industry Standard */}
        {!isAtBottom && messages.length > 2 && (
          <div className="absolute bottom-20 right-4 z-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={scrollToBottom}
              className="rounded-full h-10 w-10 p-0 shadow-xl bg-white/80 dark:bg-gray-800/80 hover:bg-white/90 dark:hover:bg-gray-800/90 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50"
              title="Scroll to bottom"
            >
              <ChevronDown className="h-4 w-4 text-gray-700 dark:text-gray-300" />
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
        <form onSubmit={handleSubmit} className="space-y-3 flex-shrink-0 mt-auto">
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

        {/* Clear Chat Confirmation Dialog - Inside Chat Container */}
        {showClearConfirmation && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background border rounded-lg shadow-lg p-6 max-w-md mx-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">Clear Conversation</h2>
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to clear this conversation? This will permanently delete {messages.length} messages and cannot be undone.
                  </p>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={cancelClearChat}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={confirmClearChat}
                  >
                    Clear Chat
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
});