import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ERDChat } from './ERDChat';
import { 
  Bot,
  X
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
  const handleClose = () => {
    onToggle?.();
  };

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
    <>
      {/* Click-outside detector (invisible) */}
      <div 
        className="fixed inset-0 z-[998] pointer-events-auto"
        onClick={onToggle}
      />
      
      {/* Chat Widget Container */}
      <div className="fixed bottom-6 right-6 z-[1000] 
                      w-[480px] h-[700px] max-h-[calc(100vh-3rem)]
                      lg:w-[480px] lg:h-[700px] lg:bottom-6 lg:right-6
                      md:w-[420px] md:h-[600px] md:bottom-4 md:right-4
                      sm:w-[calc(100vw-32px)] sm:h-[70vh] sm:bottom-4 sm:right-4 sm:left-4
                      animate-in slide-in-from-bottom-4 duration-300">
        <Card className="h-full flex flex-col shadow-2xl border-2 bg-background">
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
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
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
    </>
  );
};