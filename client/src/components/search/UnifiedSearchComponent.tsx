import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchResult {
  tables: Array<{
    name: string;
    domain: string;
  }>;
  columns: Array<{
    name: string;
    table: string;
    type: string;
    isPK: boolean;
    isFK: boolean;
  }>;
  relationships: string[];
}

interface UnifiedSearchComponentProps {
  tables: any[];
  relationships: any[];
  onSearchResultClick: (type: string, item: string | object, domain?: string) => void;
  findDomainsForTable: (tableName: string) => string[];
  domainResults?: Record<string, any>; // For displaying proper domain names
  className?: string;
  placeholder?: string;
  layout?: 'floating' | 'card'; // floating for preview page, card for ERD page
}

export const UnifiedSearchComponent: React.FC<UnifiedSearchComponentProps> = ({
  tables,
  relationships,
  onSearchResultClick,
  findDomainsForTable,
  domainResults = {},
  className = '',
  placeholder = 'Search tables, columns, relationships...',
  layout = 'floating'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult>({
    tables: [],
    columns: [],
    relationships: []
  });

  // Debounce timer ref
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Pre-computed search indices for better performance
  const searchIndices = useMemo(() => {
    // Create searchable table entries with domains
    const tableEntries: Array<{ name: string; domain: string; searchKey: string }> = [];
    tables.forEach(table => {
      const tableName = table.name;
      const domains = findDomainsForTable(tableName);
      domains.forEach(domain => {
        tableEntries.push({
          name: tableName,
          domain: domain,
          searchKey: tableName.toLowerCase()
        });
      });
    });

    // Create searchable column entries
    const columnEntries: Array<{
      name: string;
      table: string;
      type: string;
      isPK: boolean;
      isFK: boolean;
      searchKey: string;
    }> = [];
    tables.forEach(table => {
      const columns = table.columns || table.attributes || [];
      if (Array.isArray(columns)) {
        columns.forEach(col => {
          const columnName = (typeof col === 'object' && col?.name) ? col.name : String(col);
          columnEntries.push({
            name: columnName,
            table: table.name,
            type: (typeof col === 'object' && col?.type) ? col.type : 'text',
            isPK: (typeof col === 'object' && col?.isPrimaryKey) ? col.isPrimaryKey : false,
            isFK: (typeof col === 'object' && col?.isForeignKey) ? col.isForeignKey : false,
            searchKey: columnName.toLowerCase()
          });
        });
      }
    });

    // Create searchable relationship entries
    const relationshipEntries = relationships.map(rel => ({
      name: `${rel.sourceTable}-${rel.targetTable}`,
      searchKey: `${rel.sourceTable}-${rel.targetTable}`.toLowerCase()
    }));

    return {
      tables: tableEntries,
      columns: columnEntries,
      relationships: relationshipEntries
    };
  }, [tables, relationships, findDomainsForTable]);

  // Optimized search function with pre-computed indices
  const performSearch = useCallback((query: string) => {
    if (query.length === 0) {
      setSearchResults({ tables: [], columns: [], relationships: [] });
      return;
    }

    const lowercaseQuery = query.toLowerCase();
      
    // Fast search through pre-computed indices
    const matchingTableEntries = searchIndices.tables.filter(entry => 
      entry.searchKey.includes(lowercaseQuery)
    ).map(entry => ({ name: entry.name, domain: entry.domain }));
    
    const matchingColumns = searchIndices.columns.filter(entry => 
      entry.searchKey.includes(lowercaseQuery)
    ).map(entry => ({
      name: entry.name,
      table: entry.table,
      type: entry.type,
      isPK: entry.isPK,
      isFK: entry.isFK
    }));
    
    const matchingRelationships = searchIndices.relationships
      .filter(entry => entry.searchKey.includes(lowercaseQuery))
      .map(entry => entry.name);
      
    // Remove duplicates (for columns, dedupe by table.column combination)
    const uniqueColumns = matchingColumns.filter((col, index, arr) => 
      index === arr.findIndex(c => c.table === col.table && c.name === col.name)
    );
      
    setSearchResults({
      tables: matchingTableEntries,
      columns: uniqueColumns,
      relationships: [...new Set(matchingRelationships)]
    });
  }, [searchIndices]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearchActive(query.length > 0);
    
    // Clear existing debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    if (query.length > 0) {
      // Debounce search to avoid excessive processing
      debounceTimer.current = setTimeout(() => {
        performSearch(query);
      }, 150); // 150ms debounce - fast enough for real-time, slow enough to avoid spam
    } else {
      performSearch(query); // Immediate clear for empty query
    }
  };

  const handleClearSearch = () => {
    // Clear debounce timer if active
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    setSearchQuery('');
    setIsSearchActive(false);
    setSearchResults({ tables: [], columns: [], relationships: [] });
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const handleResultClick = (type: string, item: string | object, domain?: string) => {
    onSearchResultClick(type, item, domain);
    handleClearSearch(); // Clear search after selection
  };

  const containerClass = layout === 'floating' 
    ? "absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-border rounded-md bg-background shadow-lg z-10"
    : "max-h-48 overflow-y-auto border border-border rounded-md bg-background shadow-lg";

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10 pr-10"
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
        <div className={containerClass}>
          {searchResults.tables.length > 0 && (
            <div className="p-2 border-b border-border">
              <div className="text-xs font-medium text-muted-foreground mb-1">Tables</div>
              {searchResults.tables.map((tableEntry, index) => {
                // Get proper domain display name from domain results
                const getDomainDisplayName = (domainId: string) => {
                  if (domainId === 'overview') return 'Overview';
                  return domainResults[domainId]?.displayName || domainId.replace(/[-_]/g, ' ');
                };
                const domainText = getDomainDisplayName(tableEntry.domain || 'overview');
                
                return (
                  <div
                    key={`${tableEntry.name}-${tableEntry.domain}-${index}`}
                    onClick={() => handleResultClick('table', tableEntry.name, tableEntry.domain)}
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
                  onClick={() => handleResultClick('column', column)}
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
                    onClick={() => handleResultClick('relationship', rel)}
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
  );
};

export default UnifiedSearchComponent;