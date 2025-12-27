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
  Lightbulb,
  Database,
  Plus,
  Trash2
} from 'lucide-react';
import { type ExcelSheet, type ColumnMappings, type MappingFormState, type StepValidation, type CodemasterSheetMapping, type CodemasterConfiguration, type CodemasterType } from './types';

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
      errors.push('Please select which sheet contains your table information');
    } else {
      const tableSheet = sheets.find(s => s.name === mappings.tableSheet);
      if (!tableSheet) {
        errors.push('The selected table sheet could not be found in your Excel file');
      } else {
        if (!mappings.tableNameColumn) {
          errors.push('Please tell us which column has your table names');
        } else if (!tableSheet.columns.includes(mappings.tableNameColumn)) {
          errors.push(`We couldn't find a column named "${mappings.tableNameColumn}" in your table sheet`);
        }
      }
    }

    if (!mappings.columnSheet) {
      errors.push('Please select which sheet contains your column information');
    } else {
      const columnSheet = sheets.find(s => s.name === mappings.columnSheet);
      if (!columnSheet) {
        errors.push('The selected column sheet could not be found in your Excel file');
      } else {
        // Check required column mappings
        const requiredMappings = [
          { key: 'columnTableNameColumn', label: 'Please tell us which column links columns to their tables' },
          { key: 'columnNameColumn', label: 'Please tell us which column has the column names' },
          { key: 'columnTypeColumn', label: 'Please tell us which column has the data types' },
        ];

        for (const mapping of requiredMappings) {
          const value = mappings[mapping.key as keyof MappingFormState];
          if (!value) {
            errors.push(mapping.label);
          } else if (!columnSheet.columns.includes(value)) {
            errors.push(`We couldn't find a column named "${value}" in your column sheet`);
          }
        }

        // Check optional mappings
        const optionalMappings = [
          { key: 'primaryKeyColumn', label: 'primary key indicator' },
          { key: 'foreignKeyTableColumn', label: 'referenced table name' },
          { key: 'foreignKeyColumnColumn', label: 'referenced column name' },
        ];

        for (const mapping of optionalMappings) {
          const value = mappings[mapping.key as keyof MappingFormState];
          if (value && !columnSheet.columns.includes(value)) {
            warnings.push(`The optional ${mapping.label} column "${value}" wasn't found in your column sheet. You can leave this blank if you don't have this information.`);
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

  const handleMappingChange = (key: keyof MappingFormState, value: string | string[] | CodemasterSheetMapping[]) => {
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

      {/* Table Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table className="h-5 w-5 text-blue-600" />
            Tables
          </CardTitle>
          <CardDescription>
            Tell us where to find your table names in the Excel file. This sheet should list all the database tables you want in your ERD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSheetSelector(
            "Table Sheet",
            mappings.tableSheet,
            (value) => handleMappingChange('tableSheet', value),
            "Select the sheet that lists all your database tables. Examples: 'Tables', 'Table_List', 'Entities'"
          )}

          {mappings.tableSheet && (
            <>
              {renderColumnSelector(
                "Table Name Column",
                mappings.tableNameColumn,
                (value) => handleMappingChange('tableNameColumn', value),
                mappings.tableSheet,
                true,
                "Column containing your table names. Examples: 'Table_Name', 'Entity', 'TableName'"
              )}

              {renderColumnSelector(
                "Table Type Column (Optional)",
                mappings.tableTypeColumn,
                (value) => handleMappingChange('tableTypeColumn', value),
                mappings.tableSheet,
                false,
                "Column indicating table types or categories, if you have one"
              )}
            </>
          )}

          {mappings.tableSheet && mappings.tableNameColumn && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">✓ Table information configured successfully</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5 text-green-600" />
            Columns
          </CardTitle>
          <CardDescription>
            Tell us where to find your column details. This sheet should list all table columns with their names, data types, and which table they belong to.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSheetSelector(
            "Column Sheet",
            mappings.columnSheet,
            (value) => handleMappingChange('columnSheet', value),
            "Sheet that details all your columns. Examples: 'Columns', 'Fields', 'Attributes'"
          )}

          {mappings.columnSheet && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderColumnSelector(
                  "Parent Table Column",
                  mappings.columnTableNameColumn,
                  (value) => handleMappingChange('columnTableNameColumn', value),
                  mappings.columnSheet,
                  true,
                  "Links each column back to its table. Examples: 'Table_Name', 'Entity', 'Parent_Table'"
                )}

                {renderColumnSelector(
                  "Column Name",
                  mappings.columnNameColumn,
                  (value) => handleMappingChange('columnNameColumn', value),
                  mappings.columnSheet,
                  true,
                  "Contains the actual field names. Examples: 'Column_Name', 'Field_Name', 'Attribute'"
                )}

                {renderColumnSelector(
                  "Data Type Column",
                  mappings.columnTypeColumn,
                  (value) => handleMappingChange('columnTypeColumn', value),
                  mappings.columnSheet,
                  true,
                  "Contains data types like VARCHAR, INT, DATE, etc. Examples: 'Data_Type', 'Type', 'Format'"
                )}
              </div>

              {/* Optional Mappings */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Key className="h-4 w-4 text-yellow-600" />
                  Keys & Relationships (Optional)
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Help create better table structures and connected diagrams. Skip if your Excel doesn't have this information.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderColumnSelector(
                    "Primary Key Column",
                    mappings.primaryKeyColumn,
                    (value) => handleMappingChange('primaryKeyColumn', value),
                    mappings.columnSheet,
                    false,
                    "Column with TRUE/FALSE values indicating primary keys. Examples: 'Is_Primary_Key', 'PK' (values: TRUE/FALSE, Yes/No, 1/0)"
                  )}

                  {renderColumnSelector(
                    "Foreign Key Table",
                    mappings.foreignKeyTableColumn,
                    (value) => handleMappingChange('foreignKeyTableColumn', value),
                    mappings.columnSheet,
                    false,
                    "For foreign keys, which table they point to. Examples: 'Referenced_Table', 'FK_Table'"
                  )}

                  {renderColumnSelector(
                    "Foreign Key Column",
                    mappings.foreignKeyColumnColumn,
                    (value) => handleMappingChange('foreignKeyColumnColumn', value),
                    mappings.columnSheet,
                    false,
                    "For foreign keys, which column in the other table. Examples: 'Referenced_Column', 'FK_Column'"
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Lookup Tables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-purple-600" />
            Lookup Data (Optional)
          </CardTitle>
          <CardDescription>
            If your Excel has lookup tables with dropdown values or reference data (like status codes, categories, etc.), configure them here to enhance your ERD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Lookup Table Configuration */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Reference Data Configurations</Label>
              <p className="text-xs text-muted-foreground">Configure sheets that contain lookup values, dropdown options, or reference codes.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const newConfig: CodemasterConfiguration = {
                  selectedSheet: '',
                  type: 'field_enums',
                  codeColumn: '',
                  descriptionColumn: '',
                  targetFields: []
                };
                const currentConfigs = mappings.codemasterConfigurations ?? [];
                handleMappingChange('codemasterConfigurations', [...currentConfigs, newConfig]);
              }}
              className="h-8"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Lookup Table
            </Button>
          </div>

          {/* Codemaster Configuration Cards */}
          {(mappings.codemasterConfigurations ?? []).map((config, index) => {
            const sheet = sheets.find(s => s.name === config.selectedSheet);
            
            const updateConfig = (updates: Partial<CodemasterConfiguration>) => {
              const currentConfigs = mappings.codemasterConfigurations ?? [];
              const newConfigs = [...currentConfigs];
              newConfigs[index] = { ...config, ...updates };
              handleMappingChange('codemasterConfigurations', newConfigs);
            };

            const removeConfig = () => {
              const currentConfigs = mappings.codemasterConfigurations ?? [];
              const newConfigs = currentConfigs.filter((_, i) => i !== index);
              handleMappingChange('codemasterConfigurations', newConfigs);
            };

            return (
              <Card key={index} className="bg-purple-50/50 border-purple-200">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Database className="h-4 w-4 text-purple-600" />
                      Lookup Table {index + 1}
                    </CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeConfig}
                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Sheet Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Lookup Sheet</Label>
                    <Select
                      value={config.selectedSheet}
                      onValueChange={(value) => updateConfig({ selectedSheet: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sheet containing reference data or dropdown values" />
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

                  {/* Lookup Type Selection */}
                  {config.selectedSheet && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Lookup Table Type</Label>
                      <Select
                        value={config.type}
                        onValueChange={(value: CodemasterType) => updateConfig({ type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="field_enums">
                            <div className="space-y-1">
                              <div className="font-medium">Field Dropdown Values</div>
                              <div className="text-xs text-muted-foreground">
                                Values for specific fields (e.g., Status: Active/Inactive)
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="entity_tables">
                            <div className="space-y-1">
                              <div className="font-medium">Table-Based Lookups</div>
                              <div className="text-xs text-muted-foreground">
                                Reference values organized by table categories
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="mixed">
                            <div className="space-y-1">
                              <div className="font-medium">Mixed Reference Data</div>
                              <div className="text-xs text-muted-foreground">
                                Multiple types of lookup values in one sheet
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Column Mappings */}
                  {config.selectedSheet && sheet && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {renderColumnSelector(
                          "Code Column",
                          config.codeColumn,
                          (value) => updateConfig({ codeColumn: value }),
                          config.selectedSheet,
                          true,
                          "Contains the actual values/codes. Examples: 'A', 'ACTIVE', '01'"
                        )}

                        {renderColumnSelector(
                          "Description Column",
                          config.descriptionColumn,
                          (value) => updateConfig({ descriptionColumn: value }),
                          config.selectedSheet,
                          true,
                          "Contains readable descriptions. Examples: 'Active', 'Pending', 'Completed'"
                        )}

                        {renderColumnSelector(
                          "Status Column (Optional)",
                          config.statusColumn || '',
                          (value) => updateConfig({ statusColumn: value }),
                          config.selectedSheet,
                          false,
                          "Shows if the value is still active/valid"
                        )}

                        {/* Type-specific columns */}
                        {config.type === 'entity_tables' && renderColumnSelector(
                          "Entity Column",
                          config.entityColumn || '',
                          (value) => updateConfig({ entityColumn: value }),
                          config.selectedSheet,
                          true,
                          "Shows which table these values belong to"
                        )}

                        {config.type === 'field_enums' && renderColumnSelector(
                          "Field Column",
                          config.fieldColumn || '',
                          (value) => updateConfig({ fieldColumn: value }),
                          config.selectedSheet,
                          true,
                          "Shows which field these values are for"
                        )}

                        {config.type === 'mixed' && renderColumnSelector(
                          "Category Column",
                          config.categoryColumn || '',
                          (value) => updateConfig({ categoryColumn: value }),
                          config.selectedSheet,
                          true,
                          "Shows the category or type of lookup data"
                        )}
                      </div>

                      {/* Configuration Status */}
                      {config.codeColumn && config.descriptionColumn && (
                        <div className="flex items-center gap-2 p-2 bg-purple-100 border border-purple-200 rounded-md">
                          <CheckCircle className="h-4 w-4 text-purple-600" />
                          <span className="text-sm text-purple-700">
                            ✓ Lookup table configured for "{config.selectedSheet}"
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Empty State */}
          {(mappings.codemasterConfigurations ?? []).length === 0 && (
            <div className="text-center py-6 text-muted-foreground border-2 border-dashed border-gray-200 rounded-lg">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No lookup tables configured</p>
              <p className="text-xs">This is optional - only add if you have reference data sheets</p>
            </div>
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
              <span className="text-green-700 font-medium">✓ Configuration complete!</span>
            </div>
            <p className="text-sm text-green-600 mt-1">
              All required fields are mapped. Ready to generate your ERD!
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default ColumnMapper;