import React from 'react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SQLViewer } from './SQLViewer';
import { 
  Bot, 
  User, 
  Clock, 
  Database, 
  MessageCircle, 
  BarChart3,
  Brain,
  Loader2
} from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/hooks/useERDChat';

interface ChatMessageProps {
  message: ChatMessageType;
  isDarkMode?: boolean;
  onSQLCopy?: (sql: string) => void;
  onTableClick?: (tableName: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isDarkMode = false,
  onSQLCopy,
  onTableClick
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isLoading = message.metadata?.loading;

  const getMessageTypeIcon = () => {
    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
    
    switch (message.metadata?.messageType) {
      case 'sql-generation':
        return <Database className="h-4 w-4" />;
      case 'pattern-analysis':
        return <BarChart3 className="h-4 w-4" />;
      case 'explanation':
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getMessageTypeLabel = () => {
    switch (message.metadata?.messageType) {
      case 'sql-generation':
        return 'SQL Generation';
      case 'pattern-analysis':
        return 'Pattern Analysis';
      case 'explanation':
        return 'Relationship Explanation';
      default:
        return 'General Response';
    }
  };

  const extractSQLFromContent = (content: string): string | null => {
    const sqlMatch = content.match(/```sql\n([\s\S]*?)\n```/);
    return sqlMatch ? sqlMatch[1].trim() : null;
  };

  const removeSQL = (content: string): string => {
    return content.replace(/```sql\n[\s\S]*?\n```/g, '').trim();
  };

  const sqlCode = message.metadata?.sqlCode || extractSQLFromContent(message.content);
  const contentWithoutSQL = sqlCode ? removeSQL(message.content) : message.content;

  // Custom markdown components to handle table mentions
  const markdownComponents = {
    p: ({ children }: any) => (
      <p className="mb-2 last:mb-0">{children}</p>
    ),
    strong: ({ children }: any) => (
      <span className="font-semibold text-foreground">{children}</span>
    ),
    code: ({ children }: any) => {
      const text = String(children);
      // Check if this looks like a table name (CamelCase or has common table patterns)
      const isTableName = /^[A-Z][a-zA-Z]*$/.test(text) || 
                         /^[a-z_]+_[a-z_]+$/.test(text) ||
                         message.metadata?.relatedTables?.includes(text);
      
      if (isTableName && onTableClick) {
        return (
          <button
            onClick={() => onTableClick(text)}
            className="inline-flex items-center px-1 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
          >
            {children}
          </button>
        );
      }
      
      return (
        <code className="px-1 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground">
          {children}
        </code>
      );
    },
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside space-y-1 mb-2">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-sm">{children}</li>
    ),
    h1: ({ children }: any) => (
      <h1 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>
    ),
  };

  // Special handling for system messages
  if (isSystem) {
    return (
      <div className="flex justify-center mb-4">
        <div className="max-w-[90%] bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <div className="text-xs text-blue-600 text-center">
            <ReactMarkdown components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {/* Avatar (only for assistant) */}
      {!isUser && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message content */}
      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        <Card className={`${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/50'}`}>
          <CardContent className="p-3">
            {/* Message header (only for assistant) */}
            {!isUser && (
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getMessageTypeIcon()}
                  <span className="text-xs font-medium text-muted-foreground">
                    {getMessageTypeLabel()}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {message.metadata?.confidence && (
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(message.metadata.confidence * 100)}%
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(message.timestamp, 'HH:mm')}
                  </span>
                </div>
              </div>
            )}

            {/* Message content */}
            <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              ) : (
                <ReactMarkdown components={markdownComponents}>
                  {contentWithoutSQL}
                </ReactMarkdown>
              )}
            </div>

            {/* User message timestamp */}
            {isUser && (
              <div className="flex justify-end mt-2">
                <span className="text-xs opacity-70 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(message.timestamp, 'HH:mm')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SQL Code Display (outside the main message card) */}
        {sqlCode && !isLoading && (
          <div className="mt-3">
            <SQLViewer
              sql={sqlCode}
              isDarkMode={isDarkMode}
              title="Generated SQL"
              showActions={true}
              confidence={message.metadata?.confidence}
              onExecute={onSQLCopy}
            />
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-secondary">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};