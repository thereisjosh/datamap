import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  FileSpreadsheet,
  Table,
  Hash
} from 'lucide-react';
import { type ExcelSheet } from './types';

interface SheetExplorerProps {
  sheets: ExcelSheet[];
  onSheetSelect?: (sheetName: string) => void;
  selectedSheet?: string;
  className?: string;
}

const SheetExplorer: React.FC<SheetExplorerProps> = ({
  sheets,
  onSheetSelect,
  selectedSheet,
  className = ""
}) => {
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSheet = (sheetName: string) => {
    const newExpanded = new Set(expandedSheets);
    if (newExpanded.has(sheetName)) {
      newExpanded.delete(sheetName);
    } else {
      newExpanded.add(sheetName);
    }
    setExpandedSheets(newExpanded);
  };

  const handleSheetClick = (sheetName: string) => {
    if (onSheetSelect) {
      onSheetSelect(sheetName);
    }
    // Auto-expand when selected
    if (!expandedSheets.has(sheetName)) {
      toggleSheet(sheetName);
    }
  };

  // Filter sheets based on search query
  const filteredSheets = sheets.filter(sheet =>
    sheet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sheet.columns.some(col => col.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return String(value);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-medium">Excel Structure</h3>
          <Badge variant="outline">
            {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        
        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search sheets and columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Sheets */}
      <div className="space-y-3">
        {filteredSheets.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? (
                  <>No sheets match "{searchQuery}"</>
                ) : (
                  <>No sheets found in Excel file</>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredSheets.map((sheet) => {
            const isExpanded = expandedSheets.has(sheet.name);
            const isSelected = selectedSheet === sheet.name;
            
            return (
              <Card 
                key={sheet.name} 
                className={`transition-all ${isSelected ? 'ring-2 ring-blue-500 border-blue-200' : 'hover:shadow-md'}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex items-center gap-3 cursor-pointer flex-1"
                      onClick={() => handleSheetClick(sheet.name)}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSheet(sheet.name);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <div className="flex-1">
                        <CardTitle className="text-base font-medium flex items-center gap-2">
                          <Table className="h-4 w-4 text-green-600" />
                          {sheet.name}
                          {isSelected && (
                            <Badge variant="default" className="text-xs">
                              Selected
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {sheet.columns.length} columns
                          </span>
                          <span>{sheet.rowCount} rows</span>
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    {/* Column List */}
                    <div className="mb-4">
                      <h4 className="font-medium text-sm mb-2 text-muted-foreground">Columns</h4>
                      <div className="flex flex-wrap gap-1">
                        {sheet.columns.map((column, index) => (
                          <Badge 
                            key={index} 
                            variant="secondary" 
                            className="text-xs"
                          >
                            {column}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Data Preview */}
                    {sheet.preview.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2 text-muted-foreground">Data Preview</h4>
                        <div className="border rounded-md overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50">
                                {sheet.preview[0]?.map((header, index) => (
                                  <th 
                                    key={index} 
                                    className="px-2 py-1 text-left border-r last:border-r-0 font-medium"
                                  >
                                    {formatCellValue(header)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sheet.preview.slice(1, 4).map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-t">
                                  {row?.map((cell, cellIndex) => (
                                    <td 
                                      key={cellIndex}
                                      className="px-2 py-1 border-r last:border-r-0 text-muted-foreground"
                                    >
                                      {formatCellValue(cell)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {sheet.rowCount > 3 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Showing first 3 rows of {sheet.rowCount} total rows
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Summary */}
      {filteredSheets.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Total: {filteredSheets.reduce((sum, sheet) => sum + sheet.columns.length, 0)} columns 
                across {filteredSheets.length} sheets
              </span>
              <span className="text-muted-foreground">
                {filteredSheets.reduce((sum, sheet) => sum + sheet.rowCount, 0)} total rows
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SheetExplorer;