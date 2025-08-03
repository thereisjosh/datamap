import React, { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface Column {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

interface Table {
  name: string;
  columns: Column[];
}

interface MetadataPreviewProps {
  tables?: Table[];
  errors?: string[];
}

const MetadataPreview = ({
  tables = [],
  errors = [],
}: MetadataPreviewProps) => {
  const [expandedTables, setExpandedTables] = useState<string[]>([]);

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) =>
      prev.includes(tableName)
        ? prev.filter((name) => name !== tableName)
        : [...prev, tableName],
    );
  };

  if (tables.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-6 shadow-sm w-full">
        <p className="text-gray-500 text-center">
          No metadata available. Please upload an Excel file.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm w-full">
      <h2 className="text-xl font-medium mb-4">Metadata Preview</h2>

      {errors.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc pl-5">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-2">
        <Badge variant="outline" className="mr-2">
          Tables: {tables.length}
        </Badge>
        <Badge variant="outline">
          Columns:{" "}
          {tables.reduce((acc, table) => acc + table.columns.length, 0)}
        </Badge>
      </div>

      <Accordion type="multiple" value={expandedTables} className="w-full">
        {tables.map((table) => (
          <AccordionItem key={table.name} value={table.name}>
            <AccordionTrigger
              onClick={() => toggleTable(table.name)}
              className="hover:bg-gray-50 px-3 rounded-md"
            >
              <div className="flex items-center justify-between w-full pr-4">
                <span className="font-medium">{table.name}</span>
                <Badge variant="secondary" className="ml-2">
                  {table.columns.length} columns
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2 text-left">Column</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Keys</th>
                      <th className="px-4 py-2 text-left">References</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.columns.map((column) => (
                      <tr
                        key={column.name}
                        className="border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">
                          <span
                            className={`${column.isPrimaryKey ? "font-medium" : ""}`}
                          >
                            {column.name}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {column.type}
                        </td>
                        <td className="px-4 py-2">
                          {column.isPrimaryKey && (
                            <span
                              className="inline-flex items-center mr-2"
                              title="Primary Key"
                            >
                              <span className="text-green-600">✅</span>
                            </span>
                          )}
                          {column.isForeignKey && (
                            <span
                              className="inline-flex items-center"
                              title="Foreign Key"
                            >
                              <span className="text-blue-600">🔗</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {column.isForeignKey && column.references && (
                            <span className="text-sm text-blue-600">
                              {column.references.table}.
                              {column.references.column}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default MetadataPreview;
