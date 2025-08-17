import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Copy, 
  Check, 
  AlertCircle, 
  TrendingUp,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SQLViewerProps {
  sql: string;
  explanation?: string;
  confidence?: number;
  performance?: 'fast' | 'medium' | 'slow';
  optimizationTips?: string[];
  warnings?: string[];
  title?: string;
  isDarkMode?: boolean;
  showActions?: boolean;
}

export const SQLViewer: React.FC<SQLViewerProps> = ({
  sql,
  explanation,
  confidence,
  performance,
  optimizationTips = [],
  warnings = [],
  title = "Generated SQL",
  isDarkMode = false,
  showActions = true
}) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    toast({
      title: "Copied to clipboard",
      description: "SQL query has been copied to your clipboard",
    });
  };


  const getPerformanceBadge = () => {
    if (!performance) return null;

    const variants = {
      fast: { variant: 'default' as const, color: 'text-green-600', icon: TrendingUp },
      medium: { variant: 'secondary' as const, color: 'text-yellow-600', icon: TrendingUp },
      slow: { variant: 'destructive' as const, color: 'text-red-600', icon: AlertCircle }
    };

    const config = variants[performance];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {performance} query
      </Badge>
    );
  };

  const getConfidenceBadge = () => {
    if (confidence === undefined) return null;

    const percentage = Math.round(confidence * 100);
    const variant = percentage >= 80 ? 'default' : percentage >= 60 ? 'secondary' : 'destructive';

    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Info className="h-3 w-3" />
        {percentage}% confidence
      </Badge>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {getConfidenceBadge()}
            {getPerformanceBadge()}
          </div>
        </div>
        
        {explanation && (
          <p className="text-sm text-muted-foreground">{explanation}</p>
        )}
        
        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((warning, index) => (
              <div key={index} className="flex items-start gap-2 text-sm text-yellow-600">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* SQL Code */}
        <div className="relative">
          <SyntaxHighlighter
            language="sql"
            style={isDarkMode ? oneDark : oneLight}
            className="rounded-md text-sm"
            showLineNumbers
            wrapLines
            customStyle={{
              margin: 0,
              padding: '1rem',
              fontSize: '0.875rem',
              lineHeight: '1.5'
            }}
          >
            {sql}
          </SyntaxHighlighter>
          
          {/* Copy button overlay */}
          {showActions && (
            <div className="absolute top-2 right-2 z-10">
              <CopyToClipboard text={sql} onCopy={handleCopy}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm border"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </CopyToClipboard>
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <CopyToClipboard text={sql} onCopy={handleCopy}>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy SQL'}
              </Button>
            </CopyToClipboard>
            
          </div>
        )}

        {/* Optimization Tips */}
        {optimizationTips.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Optimization Tips:</h4>
            <ul className="space-y-1">
              {optimizationTips.map((tip, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                  <TrendingUp className="h-3 w-3 mt-0.5 flex-shrink-0 text-blue-600" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};