import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  FileSpreadsheet, 
  CheckCircle, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  Table,
  Columns,
  Key,
  Link,
  BookOpen,
  Lightbulb
} from 'lucide-react';

interface PrerequisitesGuideProps {
  className?: string;
}

export const PrerequisitesGuide: React.FC<PrerequisitesGuideProps> = ({ className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className={`border-blue-200/50 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/20 ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-blue-600" />
          Preparing Your Excel File
        </CardTitle>
        <CardDescription>
          Before uploading, make sure your Excel file meets these requirements for successful ERD generation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Essential Requirements */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            Essential Requirements
          </h3>
          
          <div className="grid md:grid-cols-2 gap-3">
            <Alert>
              <Table className="h-4 w-4" />
              <AlertDescription>
                <strong>Tables Sheet:</strong> One sheet listing all your database tables with their names
              </AlertDescription>
            </Alert>
            
            <Alert>
              <Columns className="h-4 w-4" />
              <AlertDescription>
                <strong>Columns Sheet:</strong> One sheet listing all columns with their table names and data types
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {/* Minimum Data Requirements */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            Minimum Data Needed
          </h3>
          
          <div className="bg-card p-3 rounded-md border space-y-2">
            <div className="text-sm">
              <strong>For Tables Sheet:</strong>
              <ul className="list-disc list-inside ml-2 text-muted-foreground">
                <li>At least 2 table names</li>
                <li>Table names should be in one column</li>
              </ul>
            </div>
            
            <div className="text-sm">
              <strong>For Columns Sheet:</strong>
              <ul className="list-disc list-inside ml-2 text-muted-foreground">
                <li>Table names (linking to your tables)</li>
                <li>Column names</li>
                <li>Data types (varchar, int, date, etc.)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Information */}
        <div>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Hide Advanced Options
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show Advanced Options & Tips
              </>
            )}
          </Button>
          
          {isExpanded && (
            <div className="space-y-4 mt-4">
            {/* Optional Enhancements */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4 text-purple-600" />
                Optional Enhancements
              </h3>
              
              <div className="grid md:grid-cols-2 gap-3">
                <Alert variant="default">
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Primary Keys:</strong> Mark which columns are primary keys for better table structure
                  </AlertDescription>
                </Alert>
                
                <Alert variant="default">
                  <Link className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Foreign Keys:</strong> Define relationships between tables for connected diagrams
                  </AlertDescription>
                </Alert>
              </div>
            </div>

            {/* Best Practices */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-orange-600" />
                Best Practices
              </h3>
              
              <div className="bg-orange-50/50 dark:bg-orange-900/20 p-3 rounded-md border border-orange-200/50 dark:border-orange-800/50">
                <ul className="text-sm space-y-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 mt-1 text-green-600 shrink-0" />
                    <span>Use clear, consistent table and column names</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 mt-1 text-green-600 shrink-0" />
                    <span>Keep data types consistent (e.g., "VARCHAR(50)" not just "text")</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 mt-1 text-green-600 shrink-0" />
                    <span>Include at least 3-5 tables for meaningful domain organization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 mt-1 text-green-600 shrink-0" />
                    <span>Add foreign key relationships to create connected diagrams</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Common Mistakes */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Common Mistakes to Avoid
              </h3>
              
              <div className="bg-red-50/50 dark:bg-red-900/20 p-3 rounded-md border border-red-200/50 dark:border-red-800/50">
                <ul className="text-sm space-y-1">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-1 text-red-600 shrink-0" />
                    <span>Missing table names in the columns sheet</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-1 text-red-600 shrink-0" />
                    <span>Inconsistent table name spelling across sheets</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-1 text-red-600 shrink-0" />
                    <span>Empty or merged cells in critical columns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-1 text-red-600 shrink-0" />
                    <span>Only having one table (need at least 2 for relationships)</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Example Structure */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                Example Excel Structure
              </h3>
              
              <div className="bg-blue-50/50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-200/50 dark:border-blue-800/50 space-y-3">
                <div>
                  <p className="text-sm font-medium">Sheet 1: "Tables" or "Table_List"</p>
                  <div className="mt-1 text-xs font-mono bg-card p-2 rounded border">
                    | Table_Name | Table_Type |<br/>
                    | Customer   | Entity     |<br/>
                    | Order      | Entity     |<br/>
                    | Product    | Entity     |
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium">Sheet 2: "Columns" or "Field_Details"</p>
                  <div className="mt-1 text-xs font-mono bg-card p-2 rounded border">
                    | Table_Name | Column_Name | Data_Type    | Primary_Key |<br/>
                    | Customer   | CustomerID  | INT          | Yes         |<br/>
                    | Customer   | Name        | VARCHAR(100) | No          |<br/>
                    | Order      | OrderID     | INT          | Yes         |<br/>
                    | Order      | CustomerID  | INT          | No          |
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}
        </div>

        {/* Quick Start */}
        <Alert className="bg-green-50/50 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <strong>Quick Start:</strong> Have your tables and columns in separate sheets with clear names? You're ready to upload! 
            Our smart detection will help map the fields automatically.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default PrerequisitesGuide;