import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import ERDRenderer from '@/components/ERDRenderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api, type ProjectResponse, type Table, type Relationship } from '@/lib/api';
import { ChatPanel } from '@/components/erd/ChatPanel';
import { 
  ArrowLeft, 
  Search, 
  X, 
  Download, 
  Share, 
  Settings,
  Maximize,
  Home,
  Bot
} from 'lucide-react';
import { useLocation, useRoute } from 'wouter';

interface ProjectPreviewProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const ProjectPreview = ({ isDarkMode = false, setIsDarkMode }: ProjectPreviewProps) => {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/projects/:projectId/preview');
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
  const [showControls, setShowControls] = useState(true);
  
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
        
        console.log('Loaded project data for preview:', {
          project: data.project.name,
          tables: data.tables.length,
          relationships: data.relationships.length,
          mermaidCode: data.mermaidCode.length
        });
        
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

  // Generate domain views based on project data (copied from project-erd.tsx)
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
      const transformedTables = projectTables.map(table => {
        const columns = table.columns || table.attributes || [];
        
        const normalizedColumns = Array.isArray(columns) ? columns.map(col => {
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
            
            return columnData;
          }
          return {
            name: String(col),
            type: 'text',
            isPrimaryKey: false,
            isForeignKey: false,
          };
        }) : [];
        
        return {
          name: table.name || 'Unknown Table',
          columns: normalizedColumns
        };
      });
      
      console.log('Transformed tables for preview API:', transformedTables);
      
      // Call the domain generation API with correct parameters
      const response = await api.generateDomainMermaid(
        transformedTables, 
        projectRelationships
      );
      
      // Server returns {domains: {...}, metadata: {...}} format
      if (response.domains) {
        setDomainResults(response.domains);
        console.log('Generated preview domain results:', Object.keys(response.domains));
        console.log('Preview domain metadata:', response.metadata);
        
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
      console.error('Failed to generate preview domain views:', err);
      
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
    } finally {
      setIsDomainLoading(false);
    }
  };

  // All data is now loaded from state - mock data removed

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearchActive(query.length > 0);
    
    if (query.length > 0) {
      const lowercaseQuery = query.toLowerCase();
      
      // Search through real table names and create separate entries per domain
      const matchingTableEntries = [];
      const matchingTableNames = tables
        .map(table => table.name)
        .filter(tableName => 
          tableName.toLowerCase().includes(lowercaseQuery)
        );
      
      // For each matching table, create separate entries for each domain it appears in
      matchingTableNames.forEach(tableName => {
        const domains = findDomainsForTable(tableName);
        domains.forEach(domain => {
          matchingTableEntries.push({
            name: tableName,
            domain: domain
          });
        });
      });
      
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
        tables: matchingTableEntries,
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
    console.log(`🔍 Search result clicked: ${type} - ${item} (domain: ${domain || 'auto-detect'})`);
    
    if (type === 'table') {
      // Use provided domain or find which domain contains this table
      const targetDomain = domain || findDomainForTable(item);
      
      if (targetDomain && targetDomain !== selectedDomain) {
        // Cross-domain navigation needed
        console.log(`🌐 Cross-domain search: switching to "${targetDomain}" for table "${item}"`);
        handleDomainSwitchForTable(targetDomain, item);
      } else {
        // Same domain - just highlight the table
        console.log(`🎯 Same domain search: highlighting table "${item}"`);
        setPendingTableSelection(item);
        console.log(`📤 State update: setPendingTableSelection("${item}") called`);
        
        // Add a slight delay to confirm state propagation
        setTimeout(() => {
          console.log(`🔄 State check: pendingTableSelection is now "${item}" (should trigger ERDRenderer)`);
        }, 10);
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
    console.log(`🧹 handleTableSelectionComplete called - clearing pendingTableSelection`);
    setPendingTableSelection(null);
    console.log(`🧹 Cleared pendingTableSelection`);
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
    const domains = findDomainsForTable(tableName);
    return domains.length > 0 ? domains[0] : null;
  };

  const handleDomainSwitchForTable = (targetDomain: string, tableName: string) => {
    console.log(`🔄 Switching domain from "${selectedDomain}" to "${targetDomain}" for table "${tableName}"`);
    
    // Switch to the target domain
    setSelectedDomain(targetDomain);
    
    // Queue the table selection for after domain switch completes
    setPendingTableSelection(tableName);
  };

  const handleDownloadERD = () => {
    toast({
      title: "Download ERD",
      description: "Download functionality coming soon!",
    });
  };

  const handleShareProject = () => {
    toast({
      title: "Share Project",
      description: "Sharing functionality coming soon!",
    });
  };

  const toggleControls = () => {
    setShowControls(!showControls);
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
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading project preview...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !project) {
    return (
      <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Error Loading Project</h2>
            <p className="text-muted-foreground mb-4">{error || 'Project not found'}</p>
            <Button onClick={() => navigate('/projects')}>
              <Home className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      {/* Floating Header */}
      <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${showControls ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="bg-background/90 backdrop-blur-md border border-border rounded-lg shadow-lg px-4 py-2">
          <div className="flex items-center gap-4">
            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/projects')}
                className="flex items-center gap-1"
              >
                <Home className="h-4 w-4" />
                Projects
              </Button>
              <span className="text-muted-foreground">/</span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate(`/projects/${projectId}/erd`)}
                className="flex items-center gap-1"
              >
                {project.name}
              </Button>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search tables, columns, relationships..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-[500px] pl-10 pr-10 h-8"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              
              {/* Search Results Dropdown */}
              {isSearchActive && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-border rounded-md bg-background shadow-lg z-10">
                  {searchResults.tables.length > 0 && (
                    <div className="p-2 border-b border-border">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Tables</div>
                      {searchResults.tables.map((tableEntry, index) => {
                        const domainText = tableEntry.domain?.replace('-', ' ') || 'overview';
                        
                        return (
                          <div
                            key={`${tableEntry.name}-${tableEntry.domain}-${index}`}
                            onClick={() => handleSearchResultClick('table', tableEntry.name, tableEntry.domain)}
                            className="px-2 py-1 text-sm hover:bg-muted cursor-pointer rounded flex items-center gap-2"
                          >
                            <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                            <div className="flex items-center justify-between flex-1 min-w-0">
                              <span className="font-medium text-foreground truncate">{tableEntry.name}</span>
                              <span className="text-xs text-muted-foreground ml-2 capitalize shrink-0">
                                ({domainText})
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {searchResults.columns.length > 0 && (
                    <div className="p-2 border-b border-border">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Columns</div>
                      {searchResults.columns.map((column, index) => (
                        <div
                          key={index}
                          onClick={() => handleSearchResultClick('column', column)}
                          className="px-2 py-1 text-sm hover:bg-muted cursor-pointer rounded flex items-center gap-2"
                        >
                          <div className="w-2 h-2 bg-green-500 rounded-sm"></div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-medium text-foreground">
                              {column.table}.{column.name}
                            </span>
                            <div className="flex items-center gap-1">
                              {column.isPK && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                  PK
                                </span>
                              )}
                              {column.isFK && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                  FK
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {column.type}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {searchResults.relationships.length > 0 && (
                    <div className="p-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Relationships</div>
                      {searchResults.relationships.map((rel, index) => {
                        const [sourceTable, targetTable] = rel.split('-');
                        const sourceDomains = findDomainsForTable(sourceTable);
                        const targetDomains = findDomainsForTable(targetTable);
                        
                        // Determine if it's a cross-domain relationship
                        const isCrossDomain = !sourceDomains.some(domain => targetDomains.includes(domain));
                        const domainText = isCrossDomain 
                          ? 'cross-domain' 
                          : sourceDomains[0]?.replace('-', ' ') || 'overview';
                        
                        return (
                          <div
                            key={index}
                            onClick={() => handleSearchResultClick('relationship', rel)}
                            className="px-2 py-1 text-sm hover:bg-muted cursor-pointer rounded flex items-center gap-2"
                          >
                            <div className={`w-2 h-2 rounded-sm ${isCrossDomain ? 'bg-orange-500' : 'bg-purple-500'}`}></div>
                            <div className="flex items-center justify-between flex-1 min-w-0">
                              <span className="font-medium text-foreground truncate">
                                {sourceTable} → {targetTable}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2 capitalize shrink-0">
                                ({domainText})
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {searchResults.tables.length === 0 && searchResults.columns.length === 0 && searchResults.relationships.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No results found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Domain Selector */}
            <Select 
              value={selectedDomain} 
              onValueChange={handleDomainChange}
              disabled={isDomainLoading || Object.keys(domainResults).length === 0}
            >
              <SelectTrigger className="w-64 h-8">
                <SelectValue placeholder={isDomainLoading ? "Loading..." : "Select domain"}>
                  {selectedDomain && (
                    <span className="capitalize truncate">
                      {selectedDomain.replace('-', ' ')}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-64">
                {Object.entries(domainResults).map(([domain, result]: [string, any]) => (
                  <SelectItem key={domain} value={domain}>
                    <div className="flex flex-col">
                      <span className="font-medium capitalize">
                        {domain.replace('-', ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {result.metadata?.tables_count || 0} tables, {result.metadata?.relationships_count || 0} relationships
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

            <div className="h-4 w-px bg-border" />

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={handleChatToggle}>
                <Bot className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleShareProject}>
                <Share className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownloadERD}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleControls}>
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Controls Button (when hidden) */}
      {!showControls && (
        <Button
          variant="outline"
          size="sm"
          onClick={toggleControls}
          className="fixed top-4 right-4 z-50 bg-background/90 backdrop-blur-md"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}

      {/* Full Screen ERD */}
      <div className="h-screen w-full">
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

export default ProjectPreview;