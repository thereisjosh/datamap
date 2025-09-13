import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppHeader } from "@/components/layout/AppHeader";
import { OrganizationInfo } from "@/components/organizations/OrganizationSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Search, X, Plus, FileSpreadsheet, Users, Activity } from "lucide-react";
import UploadPanel from "@/components/UploadPanel";
import MetadataPreview from "@/components/MetadataPreview";
import ERDRenderer from "@/components/ERDRenderer";
import { api, type ParseExcelResponse, type Table } from "@/lib/api";

interface HomeProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

const Home = ({ isDarkMode = false, setIsDarkMode }: HomeProps) => {
  const [, navigate] = useLocation();
  const { user, profile, activeOrganization } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [mermaidCode, setMermaidCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("upload");
  
  // Domain management state
  const [domainResults, setDomainResults] = useState<any>({});
  const [selectedDomain, setSelectedDomain] = useState<string>("overview");
  
  // Search and filtering state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{
    tables: string[];
    columns: string[];
    relationships: string[];
  }>({ tables: [], columns: [], relationships: [] });
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [pendingTableSelection, setPendingTableSelection] = useState<string | null>(null);

  const handleFileUpload = async (data: ParseExcelResponse) => {
    setTables(data.tables);
    setActiveTab("metadata");
    setError(null);

    try {
      // Generate domain-specific Mermaid diagrams from the parsed data
      const domainResult = await api.generateDomainMermaid(
        data.tables,
        data.relationships || []
      );
      
      // Store all domain results for switching
      setDomainResults(domainResult.domains);
      setSelectedDomain("overview"); // Reset to overview
      
      // Use the overview diagram as the default
      const overviewDiagram = domainResult.domains.overview?.diagram;
      if (overviewDiagram) {
        setMermaidCode(overviewDiagram);
      } else {
        // Fallback to simple diagram if domain generation fails
        const fallbackDiagram = generateSimpleMermaidCode(data.tables);
        setMermaidCode(fallbackDiagram);
      }
      
      console.log('Generated domain diagrams:', Object.keys(domainResult.domains));
      Object.entries(domainResult.domains).forEach(([domain, result]) => {
        console.log(`${domain}: ${result.metadata.tables_count} tables, ${result.metadata.relationships_count} relationships`);
      });
      
    } catch (err) {
      console.error('Failed to generate domain Mermaid code:', err);
      // Don't set error here as the tables still loaded successfully
      // Just use a fallback diagram generation
      const fallbackDiagram = generateSimpleMermaidCode(data.tables);
      setMermaidCode(fallbackDiagram);
    }
  };

  // Fallback function to generate simple Mermaid code on the client side
  const generateSimpleMermaidCode = (tables: Table[]): string => {
    let code = "erDiagram\n";

    for (const table of tables) {
      code += `  ${table.name} {\n`;
      for (const column of table.columns) {
        const keyIndicator = column.isPrimaryKey
          ? " PK"
          : column.isForeignKey
            ? " FK"
            : "";
        code += `    ${column.type} ${column.name}${keyIndicator}\n`;
      }
      code += "  }\n";

      // Add relationships
      for (const column of table.columns) {
        if (column.isForeignKey && column.references) {
          code += `  ${table.name} }o--|| ${column.references.table} : references\n`;
        }
      }
    }

    return code;
  };

  const handleDomainChange = (domain: string) => {
    setSelectedDomain(domain);
    const domainData = domainResults[domain];
    if (domainData && domainData.diagram) {
      setMermaidCode(domainData.diagram);
      console.log(`📊 Switched to ${domain} domain: ${domainData.metadata.tables_count} tables, ${domainData.metadata.relationships_count} relationships`);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTables([]);
    setMermaidCode("");
    setDomainResults({});
  };


  // Search functionality
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearchActive(query.trim().length > 0);
    
    if (query.trim().length === 0) {
      setSearchResults({ tables: [], columns: [], relationships: [] });
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const results = {
      tables: [] as string[],
      columns: [] as string[], 
      relationships: [] as string[]
    };
    
    // Search through tables
    tables.forEach(table => {
      // Search table names
      if (table.name.toLowerCase().includes(lowerQuery)) {
        results.tables.push(table.name);
      }
      
      // Search column names
      table.columns.forEach(column => {
        if (column.name.toLowerCase().includes(lowerQuery)) {
          results.columns.push(`${table.name}.${column.name}`);
        }
        
        // Search column types
        if (column.type.toLowerCase().includes(lowerQuery)) {
          results.columns.push(`${table.name}.${column.name} (${column.type})`);
        }
      });
    });
    
    // Search through relationships (if available from current domain results)
    Object.values(domainResults).forEach((domain: any) => {
      if (domain.diagram) {
        const lines = domain.diagram.split('\n');
        lines.forEach((line: string) => {
          if (line.includes('--') && (line.includes('FK') || line.includes('Cross-Domain'))) {
            if (line.toLowerCase().includes(lowerQuery)) {
              results.relationships.push(line.trim());
            }
          }
        });
      }
    });
    
    setSearchResults(results);
    console.log(`🔍 Search results for "${query}":`, results);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setIsSearchActive(false);
    setSearchResults({ tables: [], columns: [], relationships: [] });
  };

  const handleSearchResultClick = (resultType: string, result: string) => {
    console.log(`🎯 FIXED SEARCH RESULT CLICK: ${resultType} - ${result}`);
    
    if (resultType === 'table') {
      // FIXED: Proper table-to-domain detection instead of unreliable string matching
      let targetDomain = null;
      let tableFoundInCurrentDomain = false;
      
      // First, check if table exists in current domain (prefer staying in current domain)
      if (selectedDomain && domainResults[selectedDomain]) {
        const currentDomainData = domainResults[selectedDomain];
        // Use more precise matching - check for table name as entity definition
        const entityPattern = new RegExp(`^\\s*${result}\\s*\\{`, 'm');
        if (currentDomainData.diagram && entityPattern.test(currentDomainData.diagram)) {
          tableFoundInCurrentDomain = true;
          targetDomain = selectedDomain;
          console.log(`✅ Table "${result}" found in current domain "${selectedDomain}" - staying here`);
        }
      }
      
      // If not in current domain, find the primary domain that owns this table
      if (!tableFoundInCurrentDomain) {
        const domainEntries = Object.entries(domainResults);
        
        // Sort by domain priority to ensure consistent domain assignment
        const domainPriority = ['user-management', 'donations-payments', 'opportunities', 'campaigns', 'system'];
        const sortedEntries = domainEntries.sort(([a], [b]) => {
          const aPriority = domainPriority.indexOf(a);
          const bPriority = domainPriority.indexOf(b);
          return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
        });
        
        for (const [domainId, domainData] of sortedEntries) {
          if (domainData && (domainData as any).diagram) {
            // Precise matching: look for table as entity definition, not just substring
            const entityPattern = new RegExp(`^\\s*${result}\\s*\\{`, 'm');
            if (entityPattern.test((domainData as any).diagram)) {
              targetDomain = domainId;
              console.log(`📊 Table "${result}" primary domain found: "${domainId}"`);
              break;
            }
          }
        }
      }
      
      if (targetDomain) {
        console.log(`🎯 Switching to domain "${targetDomain}" for table "${result}"`);
        handleDomainChange(targetDomain);
        setPendingTableSelection(result);
      } else {
        console.warn(`⚠️ Table "${result}" not found in any domain - staying in current domain`);
        setPendingTableSelection(result);
      }
      
      // Clear search with small delay for better UX
      setTimeout(() => {
        setSearchQuery("");
        setIsSearchActive(false);
        setSearchResults({ tables: [], columns: [], relationships: [] });
      }, 100);
    }
  };


  const handleDomainSwitchForTable = (targetDomain: string, tableName: string) => {
    console.log(`🎯 Domain switch requested: ${targetDomain} for table: ${tableName}`);
    
    // Switch to the target domain
    handleDomainChange(targetDomain);
    
    // Set the table to be selected after domain switch completes
    setPendingTableSelection(tableName);
  };

  const handleTableSelectionComplete = (tableName: string) => {
    console.log(`✅ Table selection completed for: ${tableName}, clearing pendingTableSelection`);
    setPendingTableSelection(null);
  };

  const handlePreviewERD = () => {
    navigate("/erd-preview", {
      state: {
        tables,
        mermaidCode,
        domainResults,
        selectedDomain,
      },
    });
  };

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      {/* App Header */}
      <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      {/* Dashboard Header */}
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Welcome back, {profile?.name?.split(' ')[0] || 'User'}!
              </h1>
              <p className="text-muted-foreground">
                Create and manage your ERD projects with your team
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-6 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>0 Projects</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Users className="h-4 w-4" />
                  <span>Team Member</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Activity className="h-4 w-4" />
                  <span>Active</span>
                </div>
              </div>
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>New Project</span>
              </Button>
            </div>
          </div>
          
          {/* Organization Info */}
          {activeOrganization && (
            <div className="mt-6">
              <OrganizationInfo showMemberCount />
            </div>
          )}
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Quick Actions */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid lg:grid-cols-2 gap-8 h-[800px]">
                {/* Left Column: Upload Section */}
                <div className="flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-2">Create New ERD</h2>
                    <p className="text-sm text-muted-foreground">Upload and process your data dictionary</p>
                  </div>
                  
                  <div className="flex-1">
                    <Tabs
                      value={activeTab}
                      onValueChange={setActiveTab}
                      className="h-full flex flex-col"
                    >
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="upload">Upload File</TabsTrigger>
                        <TabsTrigger value="metadata" disabled={tables.length === 0}>
                          Review Data
                        </TabsTrigger>
                      </TabsList>
                      <div className="flex-1">
                        <TabsContent value="upload" className="h-full">
                          <UploadPanel
                            onFileUpload={handleFileUpload}
                            isLoading={isLoading}
                            error={error}
                            onError={handleError}
                          />
                        </TabsContent>
                        <TabsContent value="metadata" className="h-full">
                          <MetadataPreview tables={tables} />
                        </TabsContent>
                      </div>
                    </Tabs>
                  </div>
                </div>

                {/* Right Column: ERD Preview with Proper Hierarchy */}
                <div className="flex flex-col h-full">
                  {/* Header Section - Fixed height */}
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-border">
                    <h2 className="text-xl font-semibold">ERD Preview</h2>
                    {(tables.length > 0 || mermaidCode) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviewERD}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Full Preview
                      </Button>
                    )}
                  </div>
                  
                  {/* Controls Section - Compact and grouped */}
                  {tables.length > 0 && (
                    <div className="mb-6 space-y-4">
                      {/* Search Control */}
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">
                          Search Tables & Columns:
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                          <input
                            type="text"
                            placeholder="Search tables, columns, relationships..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="w-full pl-10 pr-10 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          />
                          {searchQuery && (
                            <button
                              onClick={handleClearSearch}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        
                        {/* Search Results */}
                        {isSearchActive && (
                          <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-md bg-background/95 backdrop-blur-sm">
                            {searchResults.tables.length > 0 && (
                              <div className="p-2 border-b border-border">
                                <div className="text-xs font-medium text-muted-foreground mb-1">Tables ({searchResults.tables.length})</div>
                                {searchResults.tables.slice(0, 5).map((table, index) => (
                                  <div
                                    key={`table-${index}`}
                                    onClick={() => handleSearchResultClick('table', table)}
                                    className="px-2 py-1 text-sm hover:bg-muted cursor-pointer rounded flex items-center gap-2"
                                  >
                                    <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                                    {table}
                                  </div>
                                ))}
                                {searchResults.tables.length > 5 && (
                                  <div className="px-2 py-1 text-xs text-muted-foreground">
                                    +{searchResults.tables.length - 5} more tables...
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {searchResults.columns.length > 0 && (
                              <div className="p-2 border-b border-border">
                                <div className="text-xs font-medium text-muted-foreground mb-1">Columns ({searchResults.columns.length})</div>
                                {searchResults.columns.slice(0, 5).map((column, index) => (
                                  <div
                                    key={`column-${index}`}
                                    onClick={() => handleSearchResultClick('column', column)}
                                    className="px-2 py-1 text-sm hover:bg-muted cursor-pointer rounded flex items-center gap-2"
                                  >
                                    <div className="w-2 h-2 bg-green-500 rounded-sm"></div>
                                    {column}
                                  </div>
                                ))}
                                {searchResults.columns.length > 5 && (
                                  <div className="px-2 py-1 text-xs text-muted-foreground">
                                    +{searchResults.columns.length - 5} more columns...
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {searchResults.relationships.length > 0 && (
                              <div className="p-2">
                                <div className="text-xs font-medium text-muted-foreground mb-1">Relationships ({searchResults.relationships.length})</div>
                                {searchResults.relationships.slice(0, 3).map((rel, index) => (
                                  <div
                                    key={`rel-${index}`}
                                    onClick={() => handleSearchResultClick('relationship', rel)}
                                    className="px-2 py-1 text-sm hover:bg-muted cursor-pointer rounded flex items-center gap-2"
                                  >
                                    <div className="w-2 h-2 bg-purple-500 rounded-sm"></div>
                                    <span className="truncate">{rel}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {searchResults.tables.length === 0 && searchResults.columns.length === 0 && searchResults.relationships.length === 0 && (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No results found for "{searchQuery}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Domain Control */}
                      {Object.keys(domainResults).length > 0 && (
                        <div className="flex items-end gap-4">
                          <div className="flex-1">
                            <label className="text-sm font-medium text-muted-foreground mb-2 block">
                              Domain View:
                            </label>
                            <Select
                              value={selectedDomain}
                              onValueChange={handleDomainChange}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a domain" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(domainResults).map(([domain, result]: [string, any]) => (
                                  <SelectItem key={domain} value={domain}>
                                    <div className="flex flex-col">
                                      <span className="font-medium">
                                        {result?.displayName || domain.replace('-', ' ')}
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
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Main Content Section - Takes remaining space */}
                  <div className="flex-1 min-h-[500px]">
                    <ERDRenderer
                      mermaidCode={mermaidCode}
                      isDarkMode={isDarkMode}
                      isLoading={isLoading}
                      domain={selectedDomain}
                      selectedTableFromSearch={pendingTableSelection}
                      domainResults={domainResults}
                      onExternalTableClick={handleDomainSwitchForTable}
                      onTableSelectionComplete={handleTableSelectionComplete}
                    />
                  </div>
                </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-muted/50 mt-16 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} ERDify. All rights reserved.
            </p>
            <div className="flex items-center space-x-4 mt-2 md:mt-0">
              <span className="text-xs text-muted-foreground">
                Powered by {activeOrganization?.name || 'Your Organization'}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
