import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  Table,
  Columns,
  Key,
  Link,
  Lightbulb
} from 'lucide-react';
import { type ExcelSheet, type ColumnMappings, type MappingFormState, type StepValidation } from './types';

interface ColumnMapperProps {
  sheets: ExcelSheet[];
  mappings: MappingFormState;
  onMappingsChange: (mappings: MappingFormState) => void;
  onValidationChange: (validation: StepValidation) => void;
  suggestions?: {
    suggestedTableSheet?: string;
    suggestedColumnSheet?: string;
    confidence: number;
  };
  className?: string;
}

const ColumnMapper: React.FC<ColumnMapperProps> = ({
  sheets,
  mappings,
  onMappingsChange,
  onValidationChange,
  suggestions,
  className = ""
}) => {

  // Update mappings with suggestions when component mounts
  useEffect(() => {
    if (suggestions && suggestions.confidence > 0.5) {
      const updatedMappings = { ...mappings };
      let hasChanges = false;

      if (suggestions.suggestedTableSheet && !mappings.tableSheet) {
        updatedMappings.tableSheet = suggestions.suggestedTableSheet;
        hasChanges = true;
      }

      if (suggestions.suggestedColumnSheet && !mappings.columnSheet) {
        updatedMappings.columnSheet = suggestions.suggestedColumnSheet;
        hasChanges = true;
      }

      if (hasChanges) {
        onMappingsChange(updatedMappings);
      }
    }
  }, [suggestions, mappings, onMappingsChange]);

  // Validate current mappings
  useEffect(() => {
    const validation = validateMappings();
    onValidationChange(validation);
  }, [mappings, sheets, onValidationChange]);

  const validateMappings = (): StepValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!mappings.tableSheet) {
      errors.push('Table sheet is required');
    } else {
      const tableSheet = sheets.find(s => s.name === mappings.tableSheet);
      if (!tableSheet) {
        errors.push('Selected table sheet not found');
      } else {
        if (!mappings.tableNameColumn) {
          errors.push('Table name column is required');
        } else if (!tableSheet.columns.includes(mappings.tableNameColumn)) {
          errors.push(`Column "${mappings.tableNameColumn}" not found in table sheet`);
        }
      }
    }

    if (!mappings.columnSheet) {
      errors.push('Column sheet is required');
    } else {
      const columnSheet = sheets.find(s => s.name === mappings.columnSheet);
      if (!columnSheet) {
        errors.push('Selected column sheet not found');
      } else {
        // Check required column mappings
        const requiredMappings = [
          { key: 'columnTableNameColumn', label: 'Table name column' },
          { key: 'columnNameColumn', label: 'Column name column' },
          { key: 'columnTypeColumn', label: 'Column type column' },
        ];

        for (const mapping of requiredMappings) {
          const value = mappings[mapping.key as keyof MappingFormState];
          if (!value) {
            errors.push(`${mapping.label} is required`);
          } else if (!columnSheet.columns.includes(value)) {
            errors.push(`Column "${value}" not found in column sheet`);
          }
        }

        // Check optional mappings
        const optionalMappings = [
          { key: 'primaryKeyColumn', label: 'Primary key column' },
          { key: 'foreignKeyTableColumn', label: 'Foreign key table column' },
          { key: 'foreignKeyColumnColumn', label: 'Foreign key column column' },
        ];

        for (const mapping of optionalMappings) {
          const value = mappings[mapping.key as keyof MappingFormState];
          if (value && !columnSheet.columns.includes(value)) {
            warnings.push(`Optional column "${value}" not found in column sheet`);
          }
        }
      }
    }

    return {
      canProceed: errors.length === 0,
      errors,
      warnings
    };
  };

  const handleMappingChange = (key: keyof MappingFormState, value: string) => {
    onMappingsChange({
      ...mappings,
      [key]: value
    });
  };

  const getSheetColumns = (sheetName: string): string[] => {
    const sheet = sheets.find(s => s.name === sheetName);
    return sheet ? sheet.columns : [];
  };

  const renderSheetSelector = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    description?: string
  ) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a sheet..." />
        </SelectTrigger>
        <SelectContent>
          {sheets.map((sheet) => (
            <SelectItem key={sheet.name} value={sheet.name}>
              <div className="flex items-center justify-between w-full">
                <span>{sheet.name}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                  <span>{sheet.columns.length} cols</span>
                  <span>{sheet.rowCount} rows</span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderColumnSelector = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    sheetName: string,
    required: boolean = false,
    description?: string
  ) => {
    const columns = getSheetColumns(sheetName);
    
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        <Select value={value} onValueChange={onChange} disabled={!sheetName || columns.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder={!sheetName ? "Select sheet first" : "Select a column..."} />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column} value={column}>
                {column}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const validation = validateMappings();

  return (
    <div className={`space-y-6 ${className}`}>

      {/* Suggestions Alert */}
      {suggestions && suggestions.confidence > 0.5 && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            Smart suggestions applied based on Excel structure analysis (confidence: {Math.round(suggestions.confidence * 100)}%)
          </AlertDescription>
        </Alert>
      )}

      {/* Table Mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table className="h-5 w-5 text-blue-600" />
            Table Mapping
          </CardTitle>
          <CardDescription>
            Configure which sheet contains your table definitions and which column contains table names.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSheetSelector(
            "Table Sheet",
            mappings.tableSheet,
            (value) => handleMappingChange('tableSheet', value),
            "The sheet that contains table definitions"
          )}

          {mappings.tableSheet && (
            <>
              {renderColumnSelector(
                "Table Name Column",
                mappings.tableNameColumn,
                (value) => handleMappingChange('tableNameColumn', value),
                mappings.tableSheet,
                true,
                "Column containing table names"
              )}

              {renderColumnSelector(
                "Table Type Column (Optional)",
                mappings.tableTypeColumn,
                (value) => handleMappingChange('tableTypeColumn', value),
                mappings.tableSheet,
                false,
                "Column indicating table types (e.g., 'entity', 'table')"
              )}
            </>
          )}

          {mappings.tableSheet && mappings.tableNameColumn && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Table mapping configured</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5 text-green-600" />
            Column Mapping
          </CardTitle>
          <CardDescription>
            Configure which sheet contains your column definitions and map the required fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSheetSelector(
            "Column Sheet",
            mappings.columnSheet,
            (value) => handleMappingChange('columnSheet', value),
            "The sheet that contains column/attribute definitions"
          )}

          {mappings.columnSheet && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderColumnSelector(
                  "Table Name Column",
                  mappings.columnTableNameColumn,
                  (value) => handleMappingChange('columnTableNameColumn', value),
                  mappings.columnSheet,
                  true,
                  "Column linking columns to their parent tables"
                )}

                {renderColumnSelector(
                  "Column Name Column",
                  mappings.columnNameColumn,
                  (value) => handleMappingChange('columnNameColumn', value),
                  mappings.columnSheet,
                  true,
                  "Column containing column/attribute names"
                )}

                {renderColumnSelector(
                  "Column Type Column",
                  mappings.columnTypeColumn,
                  (value) => handleMappingChange('columnTypeColumn', value),
                  mappings.columnSheet,
                  true,
                  "Column containing data types (varchar, int, etc.)"
                )}
              </div>

              {/* Optional Mappings */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Key className="h-4 w-4 text-yellow-600" />
                  Optional: Key Mappings
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderColumnSelector(
                    "Primary Key Column",
                    mappings.primaryKeyColumn,
                    (value) => handleMappingChange('primaryKeyColumn', value),
                    mappings.columnSheet,
                    false,
                    "Column indicating primary keys"
                  )}

                  {renderColumnSelector(
                    "Foreign Key Table Column",
                    mappings.foreignKeyTableColumn,
                    (value) => handleMappingChange('foreignKeyTableColumn', value),
                    mappings.columnSheet,
                    false,
                    "Column containing foreign key target tables"
                  )}

                  {renderColumnSelector(
                    "Foreign Key Column Column",
                    mappings.foreignKeyColumnColumn,
                    (value) => handleMappingChange('foreignKeyColumnColumn', value),
                    mappings.columnSheet,
                    false,
                    "Column containing foreign key target columns"
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Validation Results */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="space-y-2">
          {validation.errors.map((error, index) => (
            <Alert key={`error-${index}`} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ))}
          
          {validation.warnings.map((warning, index) => (
            <Alert key={`warning-${index}`}>
              <Info className="h-4 w-4" />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Success State */}
      {validation.canProceed && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-green-700 font-medium">Mapping configuration complete!</span>
            </div>
            <p className="text-sm text-green-600 mt-1">
              Ready to parse Excel file with your custom mappings.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default ColumnMapper;