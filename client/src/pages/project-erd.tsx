import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { AppHeader } from '@/components/layout/AppHeader';
import ERDRenderer from '@/components/ERDRenderer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import UnifiedSearchComponent from '@/components/search/UnifiedSearchComponent';
import { ChatPanel } from '@/components/erd/ChatPanel';
import { useToast } from '@/hooks/use-toast';
import { api, type ProjectResponse, type Table, type Relationship } from '@/lib/api';
import { 
  ArrowLeft, 
  Eye, 
  Settings, 
  Share, 
  Download, 
  Search, 
  X,
  Upload,
  Edit3,
  Save,
  Bot
} from 'lucide-react';
import { useLocation, useRoute } from 'wouter';

interface ProjectERDProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const ProjectERD = ({ isDarkMode = false, setIsDarkMode }: ProjectERDProps) => {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/projects/:projectId/erd');
  const { toast } = useToast();

  // State management
  const [searchQuery, setSearchQuery] = useState('');
  
  // Initialize selectedDomain from URL parameter or default to 'overview'
  const getInitialDomain = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('domain') || 'overview';
  };
  const [selectedDomain, setSelectedDomain] = useState(getInitialDomain());
  const [searchResults, setSearchResults] = useState<{
    tables: string[];
    columns: Array<{name: string, table: string, type: string, isPK: boolean, isFK: boolean}>;
    relationships: string[];
  }>({ tables: [], columns: [], relationships: [] });
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [pendingTableSelection, setPendingTableSelection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Project data state
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [mermaidCode, setMermaidCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Domain data state
  const [domainResults, setDomainResults] = useState<Record<string, any>>({});
  const [isDomainLoading, setIsDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const projectId = params?.projectId || '';

  // Load project data on component mount
  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectId) {
        setError('No project ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await api.getProjectData(projectId);
        
        setProject(data.project);
        setTables(data.tables);
        setRelationships(data.relationships);
        setMermaidCode(data.mermaidCode);
        
        
        // Generate domain views after loading project data
        await generateDomainViews(data.tables, data.relationships);
      } catch (err) {
        console.error('Failed to load project data:', err);
        setError('Failed to load project data. Please try again.');
        toast({
          title: "Error Loading Project",
          description: "Failed to load project data. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProjectData();
  }, [projectId, toast]);

  // Generate domain views based on project data
  const generateDomainViews = async (projectTables: Table[], projectRelationships: Relationship[]) => {
    // Validate input data
    if (!Array.isArray(projectTables) || !Array.isArray(projectRelationships)) {
      console.error('Invalid data format: tables or relationships is not an array');
      setDomainResults({
        overview: {
          diagram: mermaidCode,
          metadata: { tables_count: 0, relationships_count: 0 }
        }
      });
      return;
    }

    if (projectTables.length === 0) {
      // If no tables, just show overview
      setDomainResults({
        overview: {
          diagram: mermaidCode,
          metadata: { 
            tables_count: 0, 
            relationships_count: 0 
          }
        }
      });
      return;
    }

    try {
      setIsDomainLoading(true);
      setDomainError(null);
      
      // Transform database Table format to API-expected format
      // Database has 'attributes', API expects 'columns'
      const transformedTables = projectTables.map(table => {
        // Handle both database format (attributes) and API format (columns)
        const columns = table.columns || table.attributes || [];
        
        // Ensure columns is an array and has the right structure
        const normalizedColumns = Array.isArray(columns) ? columns.map(col => {
          // Handle different column formats
          if (typeof col === 'object' && col !== null) {
            const columnData = {
              name: col.name || '',
              type: col.type || 'text',
              isPrimaryKey: col.isPrimaryKey || false,
              isForeignKey: col.isForeignKey || false,
            };
            
            // Handle references field - must be either undefined or a valid object
            if (col.references && typeof col.references === 'object' && col.references.table && col.references.column) {
              columnData.references = {
                table: String(col.references.table),
                column: String(col.references.column)
              };
            }
            // If references is null/invalid, we omit it entirely (undefined is allowed by schema)
            
            return columnData;
          }
          return {
            name: String(col),
            type: 'text',
            isPrimaryKey: false,
            isForeignKey: false,
            // No references field - omitted entirely
          };
        }) : [];
        
        return {
          name: table.name || 'Unknown Table',
          columns: normalizedColumns
        };
      });
      
      
      // Call the domain generation API with correct parameters (not an object)
      const response = await api.generateDomainMermaid(
        transformedTables, 
        projectRelationships
      );
      
      // Server returns {domains: {...}, metadata: {...}} format
      if (response.domains) {
        setDomainResults(response.domains);
        
        // Validate selected domain from URL parameter
        const domains = Object.keys(response.domains);
        if (domains.length > 0 && !domains.includes(selectedDomain)) {
          // If URL domain is invalid, fallback to overview or first available domain
          const fallbackDomain = domains.includes('overview') ? 'overview' : domains[0];
          setSelectedDomain(fallbackDomain);
          
          // Update URL to reflect the valid domain
          const url = new URL(window.location.href);
          if (fallbackDomain === 'overview') {
            url.searchParams.delete('domain');
          } else {
            url.searchParams.set('domain', fallbackDomain);
          }
          window.history.replaceState({}, '', url.toString());
        }
      } else {
        throw new Error('Server response missing domains field');
      }
    } catch (err) {
      console.error('Failed to generate domain views:', err);
      
      // Extract more specific error message
      let errorMessage = 'Failed to generate domain views';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setDomainError(errorMessage);
      
      // Fallback to overview only
      const fallbackResults = {
        overview: {
          diagram: mermaidCode,
          metadata: { 
            tables_count: projectTables.length, 
            relationships_count: projectRelationships.length 
          }
        }
      };
      setDomainResults(fallbackResults);
      
      // Ensure selectedDomain is valid and update URL
      if (selectedDomain !== 'overview') {
        setSelectedDomain('overview');
        
        // Update URL to reflect fallback to overview
        const url = new URL(window.location.href);
        url.searchParams.delete('domain');
        window.history.replaceState({}, '', url.toString());
      }
      
      toast({
        title: "Domain Generation Warning",
        description: "Could not generate domain-specific views. Showing overview only.",
        variant: "destructive",
      });
    } finally {
      setIsDomainLoading(false);
    }
  };

  // Domain results are now managed by state (removed hardcoded object)

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearchActive(query.length > 0);
    
    if (query.length > 0) {
      const lowercaseQuery = query.toLowerCase();
      
      // Search through real table names
      const matchingTables = tables
        .map(table => table.name)
        .filter(tableName => 
          tableName.toLowerCase().includes(lowercaseQuery)
        );
      
      // Search through real column names with table context
      const matchingColumns = [];
      tables.forEach(table => {
        const columns = table.columns || table.attributes || [];
        if (Array.isArray(columns)) {
          columns.forEach(col => {
            const columnName = (typeof col === 'object' && col?.name) ? col.name : String(col);
            if (columnName.toLowerCase().includes(lowercaseQuery)) {
              matchingColumns.push({
                name: columnName,
                table: table.name,
                type: (typeof col === 'object' && col?.type) ? col.type : 'text',
                isPK: (typeof col === 'object' && col?.isPrimaryKey) ? col.isPrimaryKey : false,
                isFK: (typeof col === 'object' && col?.isForeignKey) ? col.isForeignKey : false
              });
            }
          });
        }
      });
      
      // Search through real relationships
      const matchingRelationships = relationships
        .map(rel => `${rel.sourceTable}-${rel.targetTable}`)
        .filter(relName => 
          relName.toLowerCase().includes(lowercaseQuery)
        );
      
      // Remove duplicates (for columns, dedupe by table.column combination)
      const uniqueColumns = matchingColumns.filter((col, index, arr) => 
        index === arr.findIndex(c => c.table === col.table && c.name === col.name)
      );
      
      setSearchResults({
        tables: [...new Set(matchingTables)],
        columns: uniqueColumns,
        relationships: [...new Set(matchingRelationships)]
      });
    } else {
      setSearchResults({ tables: [], columns: [], relationships: [] });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearchActive(false);
    setSearchResults({ tables: [], columns: [], relationships: [] });
  };

  const handleSearchResultClick = (type: string, item: string, domain?: string) => {
    
    if (type === 'table') {
      // Use provided domain or find which domain contains this table
      const targetDomain = domain || findDomainForTable(item);
      
      if (targetDomain && targetDomain !== selectedDomain) {
        // Cross-domain navigation needed
        console.log(`🌐 Cross-domain search: switching to "${targetDomain}" for table "${item}"`);
        handleDomainSwitchForTable(targetDomain, item);
      } else {
        // Same domain - highlight the table with enhanced feedback
        console.log(`🎯 Same domain search: highlighting table "${item}" in domain "${targetDomain}"`);
        setPendingTableSelection(item);
        
        // Additional feedback: briefly flash or highlight the current domain selector
        console.log(`📍 Table "${item}" is visible in current domain view`);
      }
    } else if (type === 'column') {
      // For enhanced column objects, we already have the table information
      const columnObj = typeof item === 'object' ? item : null;
      const containingTable = columnObj ? columnObj.table : null;
      
      if (containingTable) {
        console.log(`📋 Column search: found "${columnObj.name}" in table "${containingTable}"`);
        const targetDomain = findDomainForTable(containingTable);
        
        if (targetDomain && targetDomain !== selectedDomain) {
          // Cross-domain navigation for column
          console.log(`🌐 Cross-domain column search: switching to "${targetDomain}" for table "${containingTable}"`);
          handleDomainSwitchForTable(targetDomain, containingTable);
        } else {
          // Same domain - highlight the containing table
          setPendingTableSelection(containingTable);
        }
      }
    } else if (type === 'relationship') {
      // For relationships, extract table names and highlight both
      const relationshipParts = item.split('-');
      if (relationshipParts.length >= 2) {
        const sourceTable = relationshipParts[0];
        const targetTable = relationshipParts[1];
        
        // Find domain for the first table (we'll switch to that domain)
        const targetDomain = findDomainForTable(sourceTable);
        
        if (targetDomain && targetDomain !== selectedDomain) {
          console.log(`🌐 Cross-domain relationship search: switching to "${targetDomain}" for relationship "${item}"`);
          handleDomainSwitchForTable(targetDomain, sourceTable);
        } else {
          // Same domain - highlight the source table
          setPendingTableSelection(sourceTable);
        }
      }
    }
    
    handleClearSearch();
  };

  const handleTableSelectionComplete = () => {
    setPendingTableSelection(null);
  };

  const handleDomainChange = (domain: string) => {
    setSelectedDomain(domain);
    
    // Update URL parameter without page reload
    const url = new URL(window.location.href);
    if (domain === 'overview') {
      url.searchParams.delete('domain');
    } else {
      url.searchParams.set('domain', domain);
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Helper function to find all domains that contain a specific table
  const findDomainsForTable = (tableName: string): string[] => {
    const domains: string[] = [];
    
    for (const [domainName, domainData] of Object.entries(domainResults)) {
      if (domainData?.diagram) {
        const diagram = domainData.diagram;
        const lines = diagram.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // Check for table definition: "TableName {" or relationship references
          if (trimmedLine.startsWith(tableName + ' {') || 
              trimmedLine.includes(tableName + ' ||') ||
              trimmedLine.includes('|| ' + tableName) ||
              trimmedLine.includes(tableName + ' }')) {
            domains.push(domainName);
            break; // Found in this domain, move to next domain
          }
        }
      }
    }
    
    return domains.length > 0 ? domains : ['overview'];
  };

  // Helper function to find the primary domain for a table (for backward compatibility)
  const findDomainForTable = (tableName: string): string | null => {
    for (const [domainName, domainData] of Object.entries(domainResults)) {
      if (domainData?.diagram) {
        const diagram = domainData.diagram;
        const lines = diagram.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // Check for table definition: "TableName {" or relationship references
          if (trimmedLine.startsWith(tableName + ' {') || 
              trimmedLine.includes(tableName + ' ||') ||
              trimmedLine.includes('|| ' + tableName) ||
              trimmedLine.includes(tableName + ' }')) {
            return domainName;
          }
        }
      }
    }
    
    // Fallback to overview if not found in specific domains
    if (domainResults.overview) {
      return 'overview';
    }
    
    return null;
  };

  const handleDomainSwitchForTable = (targetDomain: string, tableName: string) => {
    console.log(`🔄 Switching domain from "${selectedDomain}" to "${targetDomain}" for table "${tableName}"`);
    
    // Switch to the target domain
    setSelectedDomain(targetDomain);
    
    // Queue the table selection for after domain switch completes
    // The ERDRenderer will automatically handle the table selection via selectedTableFromSearch
    setPendingTableSelection(tableName);
  };

  const handleFullPreview = () => {
    navigate(`/projects/${projectId}/preview`);
  };

  const handleEditProject = () => {
    navigate(`/projects/${projectId}/upload`);
  };

  const handleShareProject = () => {
    toast({
      title: "Share Project",
      description: "Sharing functionality coming soon!",
    });
  };

  const handleDownloadERD = () => {
    toast({
      title: "Download ERD",
      description: "Download functionality coming soon!",
    });
  };

  // Chat handlers
  const handleChatToggle = () => {
    setIsChatOpen(!isChatOpen);
  };

  const handleSQLGenerated = (sql: string) => {
    toast({
      title: "SQL Generated",
      description: "SQL query has been generated and copied to clipboard.",
    });
  };

  const handleTableMentioned = (tables: string[]) => {
    // Find the first table and highlight it
    if (tables.length > 0) {
      const tableName = tables[0];
      const targetDomain = findDomainForTable(tableName);
      
      if (targetDomain && targetDomain !== selectedDomain) {
        handleDomainSwitchForTable(targetDomain, tableName);
      } else {
        setPendingTableSelection(tableName);
      }
    }
  };

  const handleRelationshipClick = (sourceTable: string, targetTable: string) => {
    // Find domain that contains both tables or fallback to the source table's domain
    const sourceDomain = findDomainForTable(sourceTable);
    const targetDomain = findDomainForTable(targetTable);
    
    // Prefer domain that contains both tables, otherwise use source table's domain
    const finalDomain = sourceDomain === targetDomain ? sourceDomain : sourceDomain;
    
    if (finalDomain && finalDomain !== selectedDomain) {
      handleDomainSwitchForTable(finalDomain, sourceTable);
    } else {
      setPendingTableSelection(sourceTable);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
        <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading project data...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error || !project) {
    return (
      <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
        <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Error Loading Project</h2>
              <p className="text-muted-foreground mb-4">{error || 'Project not found'}</p>
              <Button onClick={() => navigate('/projects')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Projects
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Project Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/projects')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{project.name}</h1>
              </div>
              <p className="text-muted-foreground">{project.description}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleChatToggle}>
              <Bot className="h-4 w-4 mr-1" />
              AI Assistant
            </Button>
            <Button variant="outline" size="sm" onClick={handleShareProject}>
              <Share className="h-4 w-4 mr-1" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadERD}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleEditProject}>
              <Edit3 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button size="sm" onClick={handleFullPreview}>
              <Eye className="h-4 w-4 mr-1" />
              Full Preview
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Sidebar - Controls */}
          <div className="lg:col-span-1">
            <div className="space-y-6 sticky top-8 z-10">
              {/* Search */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Search ERD</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <UnifiedSearchComponent
                    tables={tables}
                    relationships={relationships}
                    onSearchResultClick={handleSearchResultClick}
                    findDomainsForTable={findDomainsForTable}
                    placeholder="Search tables, columns, relationships..."
                    layout="card"
                  />
                </CardContent>
              </Card>

              {/* Domain Filter */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Domain View</CardTitle>
                  {isDomainLoading && (
                    <CardDescription className="text-xs">
                      Generating domain views...
                    </CardDescription>
                  )}
                  {domainError && (
                    <CardDescription className="text-xs text-destructive">
                      {domainError}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <Select 
                    value={selectedDomain} 
                    onValueChange={handleDomainChange}
                    disabled={isDomainLoading || Object.keys(domainResults).length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isDomainLoading ? "Loading domains..." : "Select domain"} />
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
                      {Object.keys(domainResults).length === 0 && !isDomainLoading && (
                        <SelectItem value="none" disabled>
                          No domains available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Main Content - ERD Diagram */}
          <div className="lg:col-span-3">
            <Card>
              <CardContent className="p-6">
                <div className="min-h-[700px]">
                  <ERDRenderer
                    mermaidCode={domainResults[selectedDomain]?.diagram || mermaidCode}
                    isDarkMode={isDarkMode}
                    isLoading={isLoading || isDomainLoading}
                    domain={selectedDomain}
                    selectedTableFromSearch={pendingTableSelection}
                    onTableSelectionComplete={handleTableSelectionComplete}
                    onDomainSwitch={handleDomainSwitchForTable}
                    domainResults={domainResults}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Floating Chat Widget - Fixed to Viewport */}
      <ChatPanel
        mermaidCode={domainResults[selectedDomain]?.diagram || mermaidCode}
        projectId={projectId}
        isDarkMode={isDarkMode}
        isOpen={isChatOpen}
        onToggle={handleChatToggle}
        onSQLGenerated={handleSQLGenerated}
        onTableMentioned={handleTableMentioned}
        onRelationshipClick={handleRelationshipClick}
        currentDomain={selectedDomain}
      />
    </div>
  );
};

export default ProjectERD;