import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Download, Copy } from 'lucide-react';
import ERDRenderer from '@/components/ERDRenderer';

const ERDPreview = () => {
  const [, navigate] = useLocation();
  const locationState = history?.state || {};
  const { 
    tables = [], 
    mermaidCode: initialMermaidCode = '',
    domainResults = {},
    selectedDomain: initialSelectedDomain = 'overview'
  } = locationState;
  
  // State for current domain selection and mermaid code
  const [currentMermaidCode, setCurrentMermaidCode] = useState(initialMermaidCode);
  const [selectedDomain, setSelectedDomain] = useState(initialSelectedDomain);

  const handleBack = () => {
    navigate('/');
  };

  const handleDomainChange = (domain: string) => {
    setSelectedDomain(domain);
    const domainData = domainResults[domain];
    if (domainData && domainData.diagram) {
      setCurrentMermaidCode(domainData.diagram);
      console.log(`📊 Full preview switched to ${domain} domain: ${domainData.metadata.tables_count} tables, ${domainData.metadata.relationships_count} relationships`);
    }
  };

  const handleCopyCode = async () => {
    if (currentMermaidCode) {
      try {
        await navigator.clipboard.writeText(currentMermaidCode);
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
                  {Object.keys(domainResults).length > 0 && domainResults[selectedDomain] && (
                    <span className="ml-2">
                      • <span className="capitalize font-medium">{selectedDomain.replace('-', ' ')}</span> domain 
                      ({domainResults[selectedDomain].metadata.tables_count} tables, {domainResults[selectedDomain].metadata.relationships_count} relationships)
                    </span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Domain Selector */}
              {Object.keys(domainResults).length > 0 && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Domain:
                  </label>
                  <Select
                    value={selectedDomain}
                    onValueChange={handleDomainChange}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select a domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(domainResults).map(([domain, result]: [string, any]) => (
                        <SelectItem key={domain} value={domain}>
                          <div className="flex flex-col">
                            <span className="font-medium capitalize">
                              {domain.replace('-', ' ')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {result.metadata.tables_count} tables, {result.metadata.relationships_count} relationships
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
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
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-border p-6" 
             style={{ minHeight: '80vh' }}>
          <ERDRenderer mermaidCode={currentMermaidCode} />
        </div>

        {/* Code Display */}
        {currentMermaidCode && (
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-lg border border-border p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Generated Mermaid Code</h2>
              {Object.keys(domainResults).length > 0 && domainResults[selectedDomain] && (
                <span className="text-sm text-muted-foreground">
                  <span className="capitalize font-medium">{selectedDomain.replace('-', ' ')}</span> domain
                </span>
              )}
            </div>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto text-sm font-mono">
              <code>{currentMermaidCode}</code>
            </pre>
          </div>
        )}
      </main>
    </div>
  );
};

export default ERDPreview;
