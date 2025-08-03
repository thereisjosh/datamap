import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Copy } from 'lucide-react';
import ERDRenderer from '@/components/ERDRenderer';

const ERDPreview = () => {
  const [, navigate] = useLocation();
  const locationState = history?.state || {};
  const { tables = [], mermaidCode = '' } = locationState;

  const handleBack = () => {
    navigate('/');
  };

  const handleCopyCode = async () => {
    if (mermaidCode) {
      try {
        await navigator.clipboard.writeText(mermaidCode);
        // Could add toast notification here
      } catch (err) {
        console.error('Failed to copy code:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={handleBack}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Editor
              </Button>
              <div>
                <h1 className="text-xl font-semibold">ERD Full Preview</h1>
                <p className="text-sm text-muted-foreground">
                  {tables.length} tables found
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCode}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy Mermaid Code
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-border p-6">
          <ERDRenderer mermaidCode={mermaidCode} />
        </div>

        {/* Code Display */}
        {mermaidCode && (
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold mb-4">Generated Mermaid Code</h2>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto text-sm font-mono">
              <code>{mermaidCode}</code>
            </pre>
          </div>
        )}
      </main>
    </div>
  );
};

export default ERDPreview;
