import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  AlertCircle, 
  Info,
  Table,
  Columns,
  ArrowRight,
  Eye,
  Edit,
  Database,
  Link2
} from 'lucide-react';
import { type ParseResult, type ColumnMappings } from './types';

interface MappingPreviewProps {
  parseResult: ParseResult;
  mappings: ColumnMappings;
  onEditMappings: () => void;
  onConfirm: () => void;
  className?: string;
}

const MappingPreview: React.FC<MappingPreviewProps> = ({
  parseResult,
  mappings,
  onEditMappings,
  onConfirm,
  className = ""
}) => {
  const { tables, relationships, errors, summary } = parseResult;

  const renderMappingSummary = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="h-5 w-5 text-blue-600" />
          Mapping Configuration
        </CardTitle>
        <CardDescription>
          Review your column mappings before generating the ERD
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Table Mappings */}
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Table className="h-4 w-4 text-green-600" />
            Table Mappings
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Sheet:</span>
              <Badge variant="outline">{mappings.tableSheet}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Table Name Column:</span>
              <Badge variant="secondary">{mappings.tableNameColumn}</Badge>
            </div>
            {mappings.tableTypeColumn && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Table Type Column:</span>
                <Badge variant="secondary">{mappings.tableTypeColumn}</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Column Mappings */}
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Columns className="h-4 w-4 text-blue-600" />
            Column Mappings
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Sheet:</span>
              <Badge variant="outline">{mappings.columnSheet}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Table Name:</span>
                <Badge variant="secondary">{mappings.columnTableNameColumn}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Column Name:</span>
                <Badge variant="secondary">{mappings.columnNameColumn}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Column Type:</span>
                <Badge variant="secondary">{mappings.columnTypeColumn}</Badge>
              </div>
              {mappings.primaryKeyColumn && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Primary Key:</span>
                  <Badge variant="secondary">{mappings.primaryKeyColumn}</Badge>
                </div>
              )}
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );

  const renderSummaryStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-md">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{summary.tablesFound}</div>
              <div className="text-sm text-muted-foreground">Tables Found</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-md">
              <Columns className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{summary.columnsFound}</div>
              <div className="text-sm text-muted-foreground">Columns Found</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-md">
              <Link2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{summary.relationshipsFound}</div>
              <div className="text-sm text-muted-foreground">Relationships Found</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderTablesPreview = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-600" />
          Detected Tables
        </CardTitle>
        <CardDescription>
          Tables found in your Excel file with their columns
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tables.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No tables found. Check your mappings.
          </div>
        ) : (
          <div className="space-y-4">
            {tables.slice(0, 5).map((table, index) => (
              <div key={index} className="border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{table.name}</h4>
                  <Badge variant="outline">
                    {table.columns.length} columns
                  </Badge>
                </div>
                <div className="space-y-1">
                  {table.columns.slice(0, 5).map((column, colIndex) => (
                    <div key={colIndex} className="flex items-center gap-2 text-sm">
                      <span className="font-mono">{column.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {column.type}
                      </Badge>
                      {column.isPrimaryKey && (
                        <Badge variant="default" className="text-xs">
                          PK
                        </Badge>
                      )}
                      {column.isForeignKey && (
                        <Badge variant="outline" className="text-xs">
                          FK → {column.references?.table}.{column.references?.column}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {table.columns.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                      +{table.columns.length - 5} more columns...
                    </div>
                  )}
                </div>
              </div>
            ))}
            {tables.length > 5 && (
              <div className="text-center text-sm text-muted-foreground">
                +{tables.length - 5} more tables...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderRelationshipsPreview = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-purple-600" />
          Detected Relationships
        </CardTitle>
        <CardDescription>
          Foreign key relationships found between tables
        </CardDescription>
      </CardHeader>
      <CardContent>
        {relationships.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No relationships found. This is normal if your data dictionary doesn't include foreign key information.
          </div>
        ) : (
          <div className="space-y-3">
            {relationships.slice(0, 10).map((relationship, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                <Badge variant="outline">{relationship.sourceTable}</Badge>
                <span className="text-sm text-muted-foreground">{relationship.sourceColumn}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline">{relationship.targetTable}</Badge>
                <span className="text-sm text-muted-foreground">{relationship.targetColumn}</span>
              </div>
            ))}
            {relationships.length > 10 && (
              <div className="text-center text-sm text-muted-foreground">
                +{relationships.length - 10} more relationships...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((error, index) => (
            <Alert key={index} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {renderSummaryStats()}

      {/* Mapping Configuration */}
      {renderMappingSummary()}

      {/* Results Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderTablesPreview()}
        {renderRelationshipsPreview()}
      </div>

    </div>
  );
};

export default MappingPreview;