import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  X, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Database, 
  Hash,
  Filter,
  Copy,
  ExternalLink
} from 'lucide-react';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

// Import types from excel types
import type { CodemasterMapping, CodeValue } from '@/components/excel/types';

interface CodemasterPanelProps {
  selectedTable?: string | null;
  selectedField?: string | null;
  codemasterMappings: CodemasterMapping[];
  isVisible: boolean;
  onClose: () => void;
  onFieldClick?: (tableName: string, fieldName: string) => void;
  className?: string;
}

const CodemasterPanel: React.FC<CodemasterPanelProps> = ({
  selectedTable,
  selectedField,
  codemasterMappings,
  isVisible,
  onClose,
  onFieldClick,
  className = ""
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMappings, setExpandedMappings] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Filter mappings based on selected table/field and search query
  const filteredMappings = codemasterMappings.filter(mapping => {
    // If a specific field is selected, only show that mapping
    if (selectedTable && selectedField) {
      return mapping.tableName === selectedTable && mapping.fieldName === selectedField;
    }
    
    // If only table is selected, show all mappings for that table
    if (selectedTable) {
      return mapping.tableName === selectedTable;
    }
    
    // Otherwise show all mappings that match search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        mapping.tableName.toLowerCase().includes(query) ||
        mapping.fieldName.toLowerCase().includes(query) ||
        mapping.sheetName.toLowerCase().includes(query) ||
        mapping.codeValues.some(cv => 
          cv.code.toString().toLowerCase().includes(query) ||
          cv.description.toLowerCase().includes(query)
        )
      );
    }
    
    return true;
  });

  // Auto-expand relevant mappings when field is selected
  useEffect(() => {
    if (selectedTable && selectedField) {
      const mappingId = `${selectedTable}-${selectedField}`;
      setExpandedMappings(new Set([mappingId]));
    }
  }, [selectedTable, selectedField]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose]);

  const toggleMapping = (mappingId: string) => {
    const newExpanded = new Set(expandedMappings);
    if (newExpanded.has(mappingId)) {
      newExpanded.delete(mappingId);
    } else {
      newExpanded.add(mappingId);
    }
    setExpandedMappings(newExpanded);
  };

  const handleCopyCodeValues = (mapping: CodemasterMapping) => {
    const codeText = mapping.codeValues
      .map(cv => `${cv.code}\t${cv.description}`)
      .join('\n');
    
    navigator.clipboard.writeText(`${mapping.tableName}.${mapping.fieldName} Code Values:\n${codeText}`);
  };

  const formatCodeValue = (value: string | number): string => {
    return value.toString();
  };

  if (!isVisible) return null;

  return (
    <div 
      ref={panelRef}
      className={`fixed right-4 top-20 w-96 max-h-[calc(100vh-120px)] bg-background border border-border rounded-lg shadow-xl z-[15] flex flex-col ${className}`}
      style={{
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease-in-out'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-600" />
          <h3 className="font-semibold text-sm">Code Values</h3>
          {filteredMappings.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {filteredMappings.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      {!selectedField && (
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search code values..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-8 text-sm"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {selectedTable && selectedField && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1">Selected Field</div>
            <div className="font-medium text-sm">
              {selectedTable}.{selectedField}
            </div>
          </div>
        )}

        {filteredMappings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <div className="text-sm">
              {selectedTable 
                ? `No code values found for "${selectedTable}" table`
                : "No code values detected"
              }
            </div>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {filteredMappings.map((mapping) => {
              const mappingId = `${mapping.tableName}-${mapping.fieldName}`;
              const isExpanded = expandedMappings.has(mappingId);
              
              return (
                <AccordionItem 
                  key={mappingId} 
                  value={mappingId}
                  className="border border-border rounded-md"
                >
                  <AccordionTrigger 
                    className="px-3 py-2 hover:no-underline"
                    onClick={() => toggleMapping(mappingId)}
                  >
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="flex items-center gap-2">
                        <Hash className="h-3 w-3 text-blue-500" />
                        <div className="text-left">
                          <div className="font-medium text-sm">
                            {mapping.tableName}.{mapping.fieldName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {mapping.codeValues.length} values from {mapping.sheetName}
                          </div>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  
                  <AccordionContent className="px-3 pb-3">
                    <div className="space-y-2">
                      {/* Code values table */}
                      <div className="border border-border rounded-sm overflow-hidden">
                        <div className="bg-muted/50 px-2 py-1 text-xs font-medium border-b">
                          <div className="grid grid-cols-5 gap-2">
                            <span className="col-span-2">Code</span>
                            <span className="col-span-3">Description</span>
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {mapping.codeValues.map((codeValue, index) => (
                            <div 
                              key={index}
                              className="px-2 py-1 text-xs border-b last:border-b-0 hover:bg-muted/30"
                            >
                              <div className="grid grid-cols-5 gap-2 items-center">
                                <span className="col-span-2 font-mono font-medium">
                                  {formatCodeValue(codeValue.code)}
                                </span>
                                <span className="col-span-3 text-muted-foreground">
                                  {codeValue.description}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="text-xs text-muted-foreground">
                          Total: {mapping.totalRecords} records
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyCodeValues(mapping)}
                            className="h-6 px-2 text-xs"
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                          {onFieldClick && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onFieldClick(mapping.tableName, mapping.fieldName)}
                              className="h-6 px-2 text-xs"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>

      {/* Footer */}
      {filteredMappings.length > 0 && (
        <div className="border-t border-border p-3">
          <div className="text-xs text-muted-foreground text-center">
            {selectedTable && selectedField 
              ? `Code values for ${selectedTable}.${selectedField}`
              : selectedTable
              ? `${filteredMappings.length} coded fields in ${selectedTable}`
              : `${filteredMappings.length} coded fields found`
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default CodemasterPanel;