import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Download, Copy, Search, X } from 'lucide-react';
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
  
  // Search and filtering state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{
    tables: string[];
    columns: string[];
    relationships: string[];
  }>({ tables: [], columns: [], relationships: [] });
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [pendingTableSelection, setPendingTableSelection] = useState<string | null>(null);

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
    tables.forEach((table: any) => {
      // Search table names
      if (table.name.toLowerCase().includes(lowerQuery)) {
        results.tables.push(table.name);
      }
      
      // Search column names
      table.columns.forEach((column: any) => {
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
    console.log(`🎯 Search result clicked: ${resultType} - ${result}`);
    
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
          if (domainData && domainData.diagram) {
            // Precise matching: look for table as entity definition, not just substring
            const entityPattern = new RegExp(`^\\s*${result}\\s*\\{`, 'm');
            if (entityPattern.test(domainData.diagram)) {
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

  const handleTableSelectionComplete = () => {
    // Clear pending selection after ERDRenderer processes it
    setPendingTableSelection(null);
  };

  const handleDomainSwitchForTable = (targetDomain: string, tableName: string) => {
    console.log(`🎯 Domain switch requested: ${targetDomain} for table: ${tableName}`);
    
    // Switch to the target domain
    handleDomainChange(targetDomain);
    
    // Set the table to be selected after domain switch completes
    setPendingTableSelection(tableName);
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
            
            <div className="flex items-center space-x-4">
              {/* Smart Search Component */}
              {tables.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search tables & columns..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-64 pl-10 pr-10 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
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
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto border border-border rounded-md bg-background/95 backdrop-blur-sm shadow-lg z-50">
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
              )}

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
          <ERDRenderer 
            mermaidCode={currentMermaidCode} 
            domain={selectedDomain}
            selectedTableFromSearch={pendingTableSelection}
            onTableSelectionComplete={handleTableSelectionComplete}
            onDomainSwitch={handleDomainSwitchForTable}
          />
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
