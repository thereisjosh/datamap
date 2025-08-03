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
      renderActualMermaidDiagram();
    }
  }, [mermaidCode, isDarkMode]);

  const renderActualMermaidDiagram = async () => {
    if (!mermaidCode || !mermaidRef.current) return;
    
    setIsRendering(true);
    console.log('Starting Mermaid ERD rendering...');
    
    try {
      // Initialize Mermaid for ER diagrams
      mermaid.initialize({
        startOnLoad: false,
        theme: isDarkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        er: {
          useMaxWidth: false,
          layoutDirection: 'TB'
        }
      });

      // Create unique diagram ID
      const diagramId = `erd-${Date.now()}`;
      
      // Render the Mermaid diagram
      const result = await mermaid.render(diagramId, mermaidCode);
      
      if (result && result.svg) {
        // Create container with proper scaling for the massive SVG
        const container = mermaidRef.current;
        container.innerHTML = `
          <div style="
            width: 100%; 
            height: 100%; 
            background: white; 
            border: 1px solid #ddd;
            overflow: auto;
            position: relative;
          ">
            <div style="
              width: 9593px; 
              height: 142px; 
              transform: scale(0.1);
              transform-origin: top left;
              position: relative;
              background: white;
            ">
              ${result.svg}
            </div>
          </div>
        `;
        
        // Apply additional styling to the SVG
        const svgElement = container.querySelector('svg');
        if (svgElement) {
          svgElement.style.width = '95935px';
          svgElement.style.height = '1426px';
          svgElement.style.display = 'block';
          svgElement.style.background = 'white';
        }
        
        console.log('Mermaid ERD rendered successfully with scaling');
        setIsRendering(false);
      } else {
        throw new Error('No SVG generated from Mermaid');
      }
      
    } catch (error) {
      console.error('Mermaid rendering failed:', error);
      
      // Fallback to code display
      const container = mermaidRef.current;
      if (container) {
        container.innerHTML = `
          <div style="padding: 20px; background: #f9f9f9; height: 100%; overflow: auto;">
            <h3 style="color: #d32f2f; margin-bottom: 10px;">ERD Rendering Error</h3>
            <p style="margin-bottom: 15px;">The diagram is too large for direct rendering. Here's the generated code:</p>
            <pre style="background: white; padding: 15px; border: 1px solid #ddd; overflow: auto; font-size: 12px; white-space: pre-wrap;">${mermaidCode}</pre>
          </div>
        `;
      }
      
      setError('ERD too large to render directly. Code available above.');
      setIsRendering(false);
    }
  };

  const renderDiagram = async (retryCount = 0) => {
    if (!mermaidCode) {
      console.log('No Mermaid code provided');
      return;
    }
    
    // Try to get the DOM element via ref or getElementById
    let targetElement = mermaidRef.current;
    if (!targetElement) {
      targetElement = document.getElementById('mermaid-container') as HTMLDivElement;
    }
    
    if (!targetElement) {
      if (retryCount < 5) {
        console.log(`DOM element not ready, retry ${retryCount + 1}/5 in 200ms`);
        setTimeout(() => renderDiagram(retryCount + 1), 200);
        return;
      } else {
        setError('Failed to access DOM element after multiple retries');
        return;
      }
    }

    setIsRendering(true);
    setError(null);

    try {
      // Clear previous content
      targetElement.innerHTML = '';
      
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
        if (targetElement) {
          const svgContent = (renderResult as any).svg;
          targetElement.innerHTML = svgContent;
          
          // Apply proper styling to the SVG element and debug
          const svgElement = targetElement.querySelector('svg');
          if (svgElement) {
            // Debug current state
            console.log('SVG element found, current styles:', {
              width: svgElement.style.width,
              height: svgElement.style.height,
              display: svgElement.style.display,
              visibility: svgElement.style.visibility
            });
            console.log('Container dimensions:', {
              width: targetElement.offsetWidth,
              height: targetElement.offsetHeight,
              scrollWidth: targetElement.scrollWidth,
              scrollHeight: targetElement.scrollHeight
            });
            
            // Debug parent containers
            console.log('Parent container dimensions:', {
              parent: targetElement.parentElement ? {
                width: targetElement.parentElement.offsetWidth,
                height: targetElement.parentElement.offsetHeight,
                className: targetElement.parentElement.className
              } : 'No parent',
              grandparent: targetElement.parentElement?.parentElement ? {
                width: targetElement.parentElement.parentElement.offsetWidth,
                height: targetElement.parentElement.parentElement.offsetHeight,
                className: targetElement.parentElement.parentElement.className
              } : 'No grandparent'
            });
            
            // Fix the massive SVG dimensions issue
            svgElement.removeAttribute('style'); // Remove the problematic max-width style
            svgElement.style.width = '100%';
            svgElement.style.height = 'auto';
            svgElement.style.maxWidth = '100%'; // Constrain to container
            svgElement.style.display = 'block';
            svgElement.style.visibility = 'visible';
            svgElement.style.position = 'relative';
            svgElement.style.transform = 'scale(0.1)'; // Scale down the massive diagram
            svgElement.style.transformOrigin = 'top left';
            
            // Ensure container maintains dimensions
            targetElement.style.width = '100%';
            targetElement.style.height = '600px';
            targetElement.style.minHeight = '600px';
            targetElement.style.backgroundColor = '#f0f0f0';
            targetElement.style.border = '2px solid green';
            targetElement.style.overflow = 'auto';
            
            console.log('Successfully rendered Mermaid diagram with styling');
            console.log('SVG dimensions:', svgElement.getAttribute('viewBox'));
            console.log('Final SVG computed styles:', window.getComputedStyle(svgElement));
          } else {
            console.error('SVG element not found after insertion');
            console.log('Container innerHTML length:', targetElement.innerHTML.length);
            console.log('Container innerHTML preview:', targetElement.innerHTML.substring(0, 200));
          }
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
      
      // Show the raw code as fallback - try to find the element again
      const fallbackElement = document.getElementById('mermaid-container');
      if (fallbackElement) {
        fallbackElement.innerHTML = `
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
    <div className="flex flex-col h-full space-y-4">
      {/* Action buttons */}
      <div className="flex justify-end space-x-2 flex-shrink-0">
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
      <div 
        className="border rounded-lg p-4 bg-white dark:bg-gray-900 overflow-auto flex-1"
        style={{ 
          minHeight: '500px',
          width: '100%',
          height: '100%'
        }}
      >
        <div
          style={{
            width: '100%',
            height: '500px',
            border: '1px solid #ddd',
            overflow: 'auto',
            backgroundColor: '#f9f9f9',
            position: 'relative'
          }}
        >
          <div
            id="mermaid-container"
            ref={mermaidRef}
            dangerouslySetInnerHTML={{
              __html: mermaidCode ? 
                `<div style="width: 9593px; height: 142px; background: white; border: 1px solid #ccc; transform-origin: top left; transform: scale(0.1); overflow: hidden;">
                   <div style="font-size: 14px; padding: 20px;">
                     Loading ERD diagram (196 tables, 505 relationships)...<br/>
                     This large diagram is being processed and scaled to fit.
                   </div>
                 </div>` : 
                '<div style="padding: 20px; color: #666;">Upload an Excel file to see the ERD</div>'
            }}
            style={{ 
              width: '100%',
              height: '100%',
              position: 'relative'
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ERDRenderer;
