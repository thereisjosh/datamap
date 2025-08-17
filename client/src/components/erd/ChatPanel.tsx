import React, { useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ERDChat } from './ERDChat';
import { 
  Bot,
  X,
  MessageSquarePlus,
  Trash2,
  ChevronDown,
  MessageCircle
} from 'lucide-react';

interface ChatPanelProps {
  mermaidCode: string;
  projectId?: string;
  isDarkMode?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onSQLGenerated?: (sql: string) => void;
  onTableMentioned?: (tables: string[]) => void;
  onRelationshipClick?: (sourceTable: string, targetTable: string) => void;
  className?: string;
  currentDomain?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  mermaidCode,
  projectId,
  isDarkMode = false,
  isOpen = false,
  onToggle,
  onSQLGenerated,
  onTableMentioned,
  onRelationshipClick,
  className = '',
  currentDomain = 'overview'
}) => {
  const chatWidgetRef = useRef<HTMLDivElement>(null);
  const erdChatRef = useRef<any>(null);

  const handleClose = () => {
    onToggle?.();
  };

  // Targeted click-outside detection using refs instead of global overlay
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (chatWidgetRef.current && !chatWidgetRef.current.contains(e.target as Node)) {
      onToggle?.();
    }
  }, [onToggle]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  // Handle Escape key to close chat widget
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Floating Action Button (collapsed state)
  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-[1000]">
        <Button
          onClick={onToggle}
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          size="sm"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  // Chat Widget Modal (expanded state)
  return (
    <div 
      ref={chatWidgetRef}
      className="fixed bottom-6 right-6 z-[1000] 
                 w-[480px] h-[700px] max-h-[calc(100vh-3rem)]
                 lg:w-[480px] lg:h-[700px] lg:bottom-6 lg:right-6
                 md:w-[420px] md:h-[600px] md:bottom-4 md:right-4
                 sm:w-[calc(100vw-32px)] sm:h-[70vh] sm:bottom-4 sm:right-4 sm:left-4
                 animate-in slide-in-from-bottom-4 duration-300"
      style={{ pointerEvents: 'auto' }}
    >
        <Card 
          className="h-full flex flex-col shadow-2xl border-2 bg-background"
          style={{
            overscrollBehavior: 'contain',
            touchAction: 'pan-y'
          }}
        >
        {/* Header */}
        <CardHeader className="pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div className="flex flex-col">
                <CardTitle className="text-base">ERD Assistant</CardTitle>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant="secondary" className="text-xs">
                    AI
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {currentDomain.replace('-', ' ')}
                  </Badge>
                  {/* Conversation History Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs flex items-center gap-1"
                        onClick={(e) => {
                          console.log('Dropdown trigger clicked');
                          e.stopPropagation();
                        }}
                      >
                        <MessageCircle className="h-3 w-3" />
                        <span>Main Chat</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="start" 
                      className="w-48 z-[1100]"
                      side="bottom"
                      sideOffset={4}
                    >
                      <DropdownMenuItem 
                        className="flex items-center gap-2"
                        onClick={(e) => {
                          console.log('Main Chat selected');
                          e.stopPropagation();
                        }}
                      >
                        <MessageCircle className="h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">Main Chat</span>
                          <span className="text-xs text-muted-foreground">Current conversation</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-xs text-muted-foreground justify-center"
                        onClick={(e) => {
                          console.log('Create new conversation');
                          e.stopPropagation();
                          erdChatRef.current?.handleNewChat?.();
                        }}
                      >
                        + Start New Conversation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {/* Chat Controls */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('New Chat button clicked, erdChatRef:', erdChatRef.current);
                  console.log('handleNewChat method:', erdChatRef.current?.handleNewChat);
                  if (erdChatRef.current?.handleNewChat) {
                    console.log('Calling handleNewChat...');
                    erdChatRef.current.handleNewChat();
                  } else {
                    console.error('handleNewChat method not found on ref');
                  }
                }}
                className="h-8 w-8 p-0"
                title="Start new conversation"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('Clear Chat button clicked, erdChatRef:', erdChatRef.current);
                  console.log('handleClearChat method:', erdChatRef.current?.handleClearChat);
                  if (erdChatRef.current?.handleClearChat) {
                    console.log('Calling handleClearChat...');
                    erdChatRef.current.handleClearChat();
                  } else {
                    console.error('handleClearChat method not found on ref');
                  }
                }}
                className="h-8 w-8 p-0"
                title="Clear current conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {/* Close button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="flex-1 overflow-hidden p-0">
          <ERDChat
            ref={erdChatRef}
            mermaidCode={mermaidCode}
            projectId={projectId}
            isDarkMode={isDarkMode}
            onSQLGenerated={onSQLGenerated}
            onTableMentioned={onTableMentioned}
            onRelationshipClick={onRelationshipClick}
            currentDomain={currentDomain}
            className="h-full border-0 shadow-none"
          />
        </CardContent>
        </Card>
    </div>
  );
};