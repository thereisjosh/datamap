import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Test if mermaid is properly imported
console.log('Mermaid version:', (mermaid as any).version || 'unknown');
console.log('Mermaid object:', mermaid);
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Download, Copy, AlertCircle } from 'lucide-react';

interface ERDRendererProps {
  mermaidCode?: string;
  isDarkMode?: boolean;
  isLoading?: boolean;
}

const ERDRenderer: React.FC<ERDRendererProps> = ({
  mermaidCode = '',
  isDarkMode = false,
  isLoading = false,
}) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    // Initialize Mermaid with basic configuration
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDarkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'Arial, sans-serif',
        er: {
          layoutDirection: 'TB',
        },
      });
    } catch (err) {
      console.error('Mermaid initialization error:', err);
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (mermaidCode && mermaidRef.current) {
      renderDiagram();
    }
  }, [mermaidCode, isDarkMode]);

  const renderDiagram = async () => {
    if (!mermaidCode) {
      console.log('No Mermaid code provided');
      return;
    }
    
    if (!mermaidRef.current) {
      console.log('DOM element not ready, retrying in 100ms');
      setTimeout(renderDiagram, 100);
      return;
    }

    setIsRendering(true);
    setError(null);

    try {
      // Clear previous content
      mermaidRef.current.innerHTML = '';
      
      // Validate and clean the Mermaid code
      const cleanedCode = mermaidCode.trim();
      console.log('Attempting to render Mermaid code:', cleanedCode);
      
      if (!cleanedCode.startsWith('erDiagram')) {
        throw new Error('Invalid ERD diagram format');
      }
      
      // Create a unique ID for this diagram
      const diagramId = `mermaid-${Date.now()}`;
      
      // Test with simplified Mermaid config
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
      
      // Render the diagram with timeout
      const renderPromise = mermaid.render(diagramId, cleanedCode);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Mermaid render timeout')), 10000)
      );
      
      const renderResult = await Promise.race([renderPromise, timeoutPromise]);
      console.log('Mermaid render result:', renderResult);
      
      // Insert the SVG with proper DOM check
      if (renderResult && (renderResult as any).svg) {
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = (renderResult as any).svg;
          console.log('Successfully rendered Mermaid diagram');
        } else {
          throw new Error('DOM element not available for SVG insertion');
        }
      } else {
        throw new Error('No SVG generated from Mermaid');
      }
      
    } catch (err) {
      console.error('Mermaid rendering error:', err);
      console.error('Failed Mermaid code:', mermaidCode);
      
      // Try to show a more helpful error message
      let errorMessage = 'Failed to render ERD diagram.';
      if (err instanceof Error) {
        errorMessage += ` Error: ${err.message}`;
      }
      
      setError(errorMessage);
      
      // Show the raw code as fallback
      if (mermaidRef.current) {
        mermaidRef.current.innerHTML = `
          <div class="p-4 bg-gray-100 dark:bg-gray-800 rounded border">
            <h4 class="font-medium mb-2 text-red-600">Rendering Failed - Raw Mermaid Code:</h4>
            <pre class="text-sm overflow-auto max-h-64 whitespace-pre-wrap bg-white p-2 rounded border font-mono">${mermaidCode}</pre>
            <p class="text-sm text-gray-600 mt-2">Error: ${err instanceof Error ? err.message : 'Unknown error'}</p>
          </div>
        `;
      }
    } finally {
      setIsRendering(false);
    }
  };

  const handleDownloadSVG = () => {
    if (!mermaidRef.current) return;

    const svgElement = mermaidRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erd-diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMermaidCode = async () => {
    if (!mermaidCode) return;

    try {
      await navigator.clipboard.writeText(mermaidCode);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (isLoading || isRendering) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'Rendering diagram...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!mermaidCode) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-4 mx-auto">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload and process an Excel file to see the ERD
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyMermaidCode}
          className="flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          Copy Code
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadSVG}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download SVG
        </Button>
      </div>

      {/* Diagram container */}
      <div className="border rounded-lg p-4 bg-white dark:bg-gray-900 overflow-auto">
        <div
          ref={mermaidRef}
          className="flex justify-center items-center min-h-64"
        />
      </div>
    </div>
  );
};

export default ERDRenderer;
