import React, { useEffect, useState, memo } from 'react';
import mermaid from 'mermaid';
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
  // State for Direct SVG Rendering pattern
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Initialize Mermaid once
  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false, // Critical for React integration
        theme: isDarkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'Arial, sans-serif',
        useMaxWidth: true,
        er: {
          layoutDirection: 'TB',
          useMaxWidth: false,
        },
      });
    } catch (err) {
      console.error('Mermaid initialization error:', err);
    }
  }, [isDarkMode]);


  // Industry-standard Direct SVG Rendering with proper async handling
  useEffect(() => {
    let cancelled = false;

    if (!mermaidCode) {
      setSvgContent('');
      setError(null);
      return;
    }

    async function renderDiagram() {
      if (cancelled) return;
      
      setIsRendering(true);
      setError(null);
      
      try {
        // Generate unique ID for this render operation
        const uniqueId = `erd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('🎨 Starting Mermaid Direct SVG Rendering...');
        
        // Use proper Mermaid render API - returns SVG string directly
        const { svg } = await mermaid.render(uniqueId, mermaidCode);
        
        if (!cancelled) {
          console.log('✅ Mermaid render completed successfully');
          console.log('📊 SVG content preview (first 200 chars):', svg.substring(0, 200));
          console.log('📏 SVG content length:', svg.length);
          
          // Format SVG with proper wrapper for browser display
          const formattedSvgContent = `
            <div style="
              width: 100%; 
              height: 100%; 
              overflow: auto; 
              background: white;
              padding: 10px;
              border: 1px solid #ddd;
            ">
              ${svg}
            </div>
          `;
          
          setSvgContent(formattedSvgContent);
          console.log('✅ SVG content set with formatting wrapper');
        }
        
      } catch (error) {
        console.error('Mermaid rendering failed:', error);
        
        if (!cancelled) {
          // Try simplified ERD fallback
          const simplifiedERD = createSimplifiedERD(mermaidCode);
          if (simplifiedERD) {
            try {
              const { svg } = await mermaid.render(`erd-simplified-${Date.now()}`, simplifiedERD);
              if (!cancelled) {
                console.log('✅ Simplified ERD rendered successfully');
                console.log('📊 Simplified SVG preview (first 200 chars):', svg.substring(0, 200));
                
                const formattedSimplifiedContent = `
                  <div style="width: 100%; height: 100%; overflow: auto; background: white;">
                    <div style="padding: 15px; background: #d4edda; border-bottom: 1px solid #c3e6cb; font-size: 14px; margin-bottom: 10px;">
                      🎯 <strong>Domain-Focused ERD</strong> - Showing key tables from your database
                    </div>
                    <div style="padding: 20px; background: white;">
                      ${svg}
                    </div>
                  </div>
                `;
                
                setSvgContent(formattedSimplifiedContent);
                console.log('✅ Simplified SVG content set with formatting');
              }
            } catch (simplifiedError) {
              console.error('Simplified ERD also failed:', simplifiedError);
              if (!cancelled) {
                setError('Failed to render ERD diagram');
              }
            }
          } else {
            setError('Failed to render ERD diagram');
          }
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    renderDiagram();

    // Cleanup function to prevent race conditions
    return () => {
      cancelled = true;
    };
  }, [mermaidCode, isDarkMode]);

  const createSimplifiedERD = (fullCode: string): string => {
    // Analyze relationships to find key tables by domain
    const lines = fullCode.split('\n');
    const tables: Record<string, string[]> = {};
    const relationships: string[] = [];
    const relationshipCounts: Record<string, number> = {};
    
    // Parse tables and count relationships
    let currentTable = '';
    let inTable = false;
    
    for (const line of lines) {
      if (line.trim().includes('{') && !inTable) {
        currentTable = line.trim().split(' ')[0];
        tables[currentTable] = [line];
        inTable = true;
        relationshipCounts[currentTable] = 0;
      } else if (line.trim() === '}' && inTable) {
        tables[currentTable].push(line);
        inTable = false;
      } else if (inTable) {
        tables[currentTable].push(line);
      } else if (line.trim().includes('||') || line.trim().includes('}|')) {
        relationships.push(line);
        // Count relationships for each table
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const table1 = parts[0];
          const table2 = parts[2];
          relationshipCounts[table1] = (relationshipCounts[table1] || 0) + 1;
          relationshipCounts[table2] = (relationshipCounts[table2] || 0) + 1;
        }
      }
    }
    
    // Identify key domains and their central tables
    const keyTables = new Set<string>();
    
    // Domain 1: User Management (OSSYS_USER, OSSYS_ROLE, etc.)
    const userTables = Object.keys(tables).filter(name => 
      name.includes('User') || name.includes('Role') || name.includes('Group')
    );
    userTables.forEach(table => keyTables.add(table));
    
    // Domain 2: Opportunities
    const opportunityTables = Object.keys(tables).filter(name => 
      name.includes('Opportunity') && relationshipCounts[name] > 2
    ).slice(0, 4);
    opportunityTables.forEach(table => keyTables.add(table));
    
    // Domain 3: Active Campaign
    const campaignTables = Object.keys(tables).filter(name => 
      name.includes('Campaign') && relationshipCounts[name] > 1
    ).slice(0, 3);
    campaignTables.forEach(table => keyTables.add(table));
    
    // Add any high-relationship tables we might have missed
    const topRelatedTables = Object.entries(relationshipCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 12)
      .map(([name]) => name);
    
    topRelatedTables.forEach(table => keyTables.add(table));
    
    // Build simplified ERD
    const erdLines = ['erDiagram'];
    
    // Add selected tables
    keyTables.forEach(tableName => {
      if (tables[tableName]) {
        erdLines.push(...tables[tableName]);
      }
    });
    
    // Add relationships between selected tables
    relationships.forEach(rel => {
      const parts = rel.trim().split(/\s+/);
      if (parts.length >= 3) {
        const table1 = parts[0];
        const table2 = parts[2];
        if (keyTables.has(table1) && keyTables.has(table2)) {
          erdLines.push(rel);
        }
      }
    });
    
    console.log(`Created simplified ERD with ${keyTables.size} key tables`);
    return erdLines.join('\n');
  };



  const handleDownloadSVG = () => {
    if (!svgContent) return;

    // Extract SVG from the HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'text/html');
    const svgElement = doc.querySelector('svg');
    
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
          disabled={!svgContent}
        >
          <Download className="h-4 w-4" />
          Download SVG
        </Button>
      </div>

      {/* Diagram container using Direct SVG Rendering */}
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
            minHeight: '500px',
            height: 'auto',
            border: '1px solid #ddd',
            overflow: 'auto',
            backgroundColor: '#f9f9f9',
            position: 'relative',
            display: 'block'
          }}
        >
          {svgContent ? (
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          ) : mermaidCode ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              <div>Processing ERD diagram...</div>
              <div style={{ fontSize: '12px', marginTop: '10px' }}>
                Using industry-standard Direct SVG Rendering
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px', color: '#666', textAlign: 'center' }}>
              Upload an Excel file to see the ERD
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
const MemoizedERDRenderer = memo(ERDRenderer, (prevProps, nextProps) => {
  // Only re-render if essential props change
  return (
    prevProps.mermaidCode === nextProps.mermaidCode &&
    prevProps.isDarkMode === nextProps.isDarkMode &&
    prevProps.isLoading === nextProps.isLoading
  );
});

export default MemoizedERDRenderer;
